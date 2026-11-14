import { describe, expect, it } from 'vitest';
import { adjustForContrast, contrastRatio, readableOn } from '@/server/theme/contrast';
import { compileTheme, DEFAULT_THEME, themeTokensSchema, themeToCss, validateTheme } from '@/server/theme/tokens';
import { MODULES, type ModuleDefinition } from '@/server/modules/registry';
import { activeModules, checkModuleChange, entitledModules } from '@/server/modules/rules';
import { resolveHost } from '@/server/tenancy/resolve';
import { ST_MARY_THEME } from '@/server/tenancy/st-mary';

describe('contrast', () => {
  it('matches WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
  });
  it('picks readable text for St. Mary colours', () => {
    expect(readableOn('#16335B')).toBe('#FFFFFF');
    expect(readableOn('#FCBC40')).toBe('#111827');
  });
  it('derives an accessible variant of a light brand colour', () => {
    const v = adjustForContrast('#FCBC40', '#FFFFFF', 4.5);
    expect(contrastRatio(v, '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });
});

describe('theme tokens', () => {
  it('St. Mary theme is valid with no blocking issues', () => {
    expect(themeTokensSchema.parse(ST_MARY_THEME)).toBeTruthy();
    expect(validateTheme(ST_MARY_THEME).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('blocks unreadable text and warns on low-contrast accents', () => {
    const bad = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, text: '#EEEEEE', accent: '#FFFF66' } };
    const issues = validateTheme(bad);
    expect(issues.some((i) => i.level === 'error' && i.field === 'colors.text')).toBe(true);
    expect(issues.some((i) => i.level === 'warning' && i.field === 'colors.accent')).toBe(true);
    // Rendering still falls back to readable text.
    const vars = compileTheme(bad);
    expect(contrastRatio(vars['--color-text']!, bad.colors.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('rejects CSS injection, unknown fonts and non-https images', () => {
    const inject = { ...DEFAULT_THEME, colors: { ...DEFAULT_THEME.colors, primary: 'red;}body{display:none' } };
    expect(themeTokensSchema.safeParse(inject).success).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME, fonts: { heading: 'comic-sans', body: 'inter' } }).success).toBe(false);
    expect(
      themeTokensSchema.safeParse({ ...DEFAULT_THEME, logo: { ...DEFAULT_THEME.logo, primary: 'javascript:alert(1)' } }).success,
    ).toBe(false);
    expect(themeTokensSchema.safeParse({ ...DEFAULT_THEME, extra: 'x' }).success).toBe(false);
  });

  it('compiles to CSS variables only', () => {
    const css = themeToCss(ST_MARY_THEME);
    expect(css).toMatch(/^:root\{--color-primary:#16335B;/);
    expect(css).not.toMatch(/[<>]/);
  });
});

describe('module rules', () => {
  const reg: ModuleDefinition[] = [
    { ...MODULES.find((m) => m.id === 'home')! },
    { ...MODULES.find((m) => m.id === 'documents')!, implemented: true },
    { ...MODULES.find((m) => m.id === 'resources')!, implemented: true },
    { ...MODULES.find((m) => m.id === 'attendance')! },
  ];
  const all = new Set(reg.map((m) => m.id));

  it('requires dependencies before enabling', () => {
    const r = checkModuleChange({ moduleId: 'resources', enable: true, enabledIds: new Set(['home']), entitled: all, registry: reg });
    expect(r).toEqual({ ok: false, reason: 'Enable Documents first.' });
    expect(
      checkModuleChange({ moduleId: 'resources', enable: true, enabledIds: new Set(['documents']), entitled: all, registry: reg }).ok,
    ).toBe(true);
  });

  it('blocks disabling a module others depend on, and required modules', () => {
    expect(
      checkModuleChange({ moduleId: 'documents', enable: false, enabledIds: new Set(['documents', 'resources']), entitled: all, registry: reg }).ok,
    ).toBe(false);
    expect(checkModuleChange({ moduleId: 'home', enable: false, enabledIds: all, entitled: all, registry: reg }).ok).toBe(false);
  });

  it('refuses unimplemented and non-entitled modules', () => {
    expect(checkModuleChange({ moduleId: 'attendance', enable: true, enabledIds: new Set(), entitled: all, registry: reg })).toEqual({
      ok: false,
      reason: 'Attendance is not available yet.',
    });
    expect(
      checkModuleChange({ moduleId: 'documents', enable: true, enabledIds: new Set(), entitled: new Set(['home']), registry: reg }),
    ).toEqual({ ok: false, reason: 'Documents is not included in your plan.' });
  });

  it('entitlements follow the subscription; canceled keeps only required modules', () => {
    const sub = { status: 'active' as const, includedModules: ['calendar'], extraModules: ['forms'] };
    expect([...entitledModules(sub)].sort()).toEqual(['calendar', 'forms', 'home']);
    expect([...entitledModules({ ...sub, status: 'canceled' })]).toEqual(['home']);
    // Enabled + entitled + implemented = active; unimplemented modules never are.
    expect(activeModules(new Set(['calendar', 'forms']), entitledModules(sub)).map((m) => m.id)).toEqual(['home', 'calendar']);
    expect(activeModules(new Set(['calendar']), entitledModules({ ...sub, status: 'canceled' })).map((m) => m.id)).toEqual(['home']);
  });

  it('every module contract is complete and dependencies exist', () => {
    const ids = new Set(MODULES.map((m) => m.id));
    expect(ids.size).toBe(MODULES.length);
    for (const m of MODULES) {
      for (const d of m.dependencies) expect(ids.has(d)).toBe(true);
      expect(m.name && m.description && m.onDisable).toBeTruthy();
    }
  });
});

describe('host resolution', () => {
  it('maps subdomains, root and custom domains', () => {
    expect(resolveHost('stmary.schoolportal.app', 'schoolportal.app')).toEqual({ kind: 'subdomain', slug: 'stmary' });
    expect(resolveHost('STMARY.schoolportal.app:443', 'schoolportal.app')).toEqual({ kind: 'subdomain', slug: 'stmary' });
    expect(resolveHost('schoolportal.app', 'schoolportal.app')).toEqual({ kind: 'root' });
    expect(resolveHost('www.schoolportal.app', 'schoolportal.app')).toEqual({ kind: 'root' });
    expect(resolveHost('admin.schoolportal.app', 'schoolportal.app')).toEqual({ kind: 'root' });
    expect(resolveHost('a.b.schoolportal.app', 'schoolportal.app')).toEqual({ kind: 'root' });
    expect(resolveHost('portal.stmary.org', 'schoolportal.app')).toEqual({ kind: 'custom', hostname: 'portal.stmary.org' });
    expect(resolveHost('stmary.localhost:3000', 'localhost')).toEqual({ kind: 'subdomain', slug: 'stmary' });
    expect(resolveHost('family-portal-git-x.vercel.app', 'schoolportal.app')).toEqual({ kind: 'root' });
  });
});
