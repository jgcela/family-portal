'use client';
import { useActionState, useState } from 'react';
import {
  compileTheme,
  FONT_OPTIONS,
  themeTokensSchema,
  validateTheme,
  type FontId,
  type ThemeIssue,
  type ThemeTokens,
} from '@/server/theme/tokens';
import { isHexColor } from '@/server/theme/contrast';
import type { DesignResult } from '../actions';

type ColorKey = keyof ThemeTokens['colors'];
const COLORS: { key: ColorKey; label: string; hint: string }[] = [
  { key: 'primary', label: 'Primary', hint: 'Header, main buttons and links.' },
  { key: 'secondary', label: 'Secondary', hint: 'Supporting fills and highlights.' },
  { key: 'accent', label: 'Accent', hint: 'Small highlights. Never used for text.' },
  { key: 'background', label: 'Page background', hint: 'Behind everything.' },
  { key: 'surface', label: 'Cards', hint: 'Background of cards and panels.' },
  { key: 'text', label: 'Text', hint: 'Body text. Must be readable on both backgrounds.' },
];

type Props = {
  initial: ThemeTokens;
  hasDraft: boolean;
  canPublish: boolean;
  save: (prev: DesignResult, fd: FormData) => Promise<DesignResult>;
};

export function ThemeEditor({ initial, hasDraft, canPublish, save }: Props) {
  const [tokens, setTokens] = useState<ThemeTokens>(initial);
  // Hex fields keep what the user typed, even half-finished, separately from valid tokens.
  const [hexText, setHexText] = useState<Record<ColorKey, string>>({ ...initial.colors });
  const [state, submit, pending] = useActionState(save, undefined);
  const [dirty, setDirty] = useState(false);
  // When the server sends a different starting point (after discard or restore), start over from it.
  const sig = JSON.stringify(initial);
  const [seen, setSeen] = useState(sig);
  if (sig !== seen) {
    setSeen(sig);
    setTokens(initial);
    setHexText({ ...initial.colors });
    setDirty(false);
  }

  const parsed = themeTokensSchema.safeParse(tokens);
  const issues: ThemeIssue[] = parsed.success ? validateTheme(parsed.data) : [];
  const schemaErrors = parsed.success ? [] : parsed.error.issues.map((i) => i.message);
  const blocking = schemaErrors.length > 0 || issues.some((i) => i.level === 'error');
  const vars = parsed.success ? compileTheme(parsed.data) : null;

  const update = (fn: (t: ThemeTokens) => ThemeTokens) => {
    setTokens(fn);
    setDirty(true);
  };
  const setColor = (key: ColorKey, value: string) => {
    setHexText((h) => ({ ...h, [key]: value }));
    const v = value.trim().startsWith('#') ? value.trim() : `#${value.trim()}`;
    if (isHexColor(v)) update((t) => ({ ...t, colors: { ...t.colors, [key]: v.toUpperCase() } }));
  };
  const fieldIssue = (field: string) => issues.find((i) => i.field === field);

  return (
    <form
      action={(fd) => {
        setDirty(false);
        submit(fd);
      }}
      className="design-layout"
    >
      <input type="hidden" name="tokens" value={JSON.stringify(tokens)} />
      <div className="form">
        {state?.error && (
          <p className="notice notice-error" role="alert">
            {state.error}
          </p>
        )}
        {state?.ok && !dirty && (
          <p className="notice notice-ok" role="status">
            {state.ok}
          </p>
        )}
        <fieldset className="panel">
          <legend className="panel-legend">Colours</legend>
          <div className="panel-body color-grid">
            {COLORS.map((c) => {
              const issue = fieldIssue(`colors.${c.key}`);
              const valid = isHexColor(hexText[c.key].startsWith('#') ? hexText[c.key] : `#${hexText[c.key]}`);
              return (
                <div className="field" key={c.key}>
                  <label htmlFor={`hex-${c.key}`}>{c.label}</label>
                  <div className="color-input">
                    <input
                      type="color"
                      aria-label={`${c.label} colour picker`}
                      value={tokens.colors[c.key].toLowerCase()}
                      onChange={(e) => setColor(c.key, e.target.value)}
                    />
                    <input
                      id={`hex-${c.key}`}
                      value={hexText[c.key]}
                      onChange={(e) => setColor(c.key, e.target.value)}
                      maxLength={7}
                      spellCheck={false}
                      aria-invalid={!valid || issue?.level === 'error'}
                      aria-describedby={`hint-${c.key}`}
                    />
                  </div>
                  <span className="hint" id={`hint-${c.key}`}>
                    {!valid ? 'Use six hex digits, such as #16335B.' : c.hint}
                  </span>
                  {issue && <span className={issue.level === 'error' ? 'field-error' : 'field-warning'}>{issue.message}</span>}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="panel">
          <legend className="panel-legend">Type and shape</legend>
          <div className="panel-body form-row form-row-2">
            {(['heading', 'body'] as const).map((k) => (
              <div className="field" key={k}>
                <label htmlFor={`font-${k}`}>{k === 'heading' ? 'Heading font' : 'Body font'}</label>
                <select
                  id={`font-${k}`}
                  value={tokens.fonts[k]}
                  onChange={(e) => update((t) => ({ ...t, fonts: { ...t.fonts, [k]: e.target.value as FontId } }))}
                >
                  {(Object.keys(FONT_OPTIONS) as FontId[]).map((f) => (
                    <option key={f} value={f}>
                      {FONT_OPTIONS[f].label} ({FONT_OPTIONS[f].kind})
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="field">
              <label htmlFor="radius">Corners</label>
              <select id="radius" value={tokens.radius} onChange={(e) => update((t) => ({ ...t, radius: e.target.value as ThemeTokens['radius'] }))}>
                <option value="sharp">Sharp</option>
                <option value="soft">Soft</option>
                <option value="round">Round</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="header">Header style</label>
              <select id="header" value={tokens.header} onChange={(e) => update((t) => ({ ...t, header: e.target.value as ThemeTokens['header'] }))}>
                <option value="solid">Solid (primary colour)</option>
                <option value="light">Light (card colour)</option>
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="panel">
          <legend className="panel-legend">Logos</legend>
          <div className="panel-body form">
            <p className="hint" style={{ margin: 0 }}>
              Paste an https link to the image for now. Uploading files directly will arrive with the Documents module.
            </p>
            {(
              [
                ['primary', 'Logo for light backgrounds'],
                ['onDark', 'Logo for the solid header (dark background)'],
                ['favicon', 'Browser tab icon'],
              ] as const
            ).map(([k, label]) => (
              <div className="field" key={k}>
                <label htmlFor={`logo-${k}`}>{label}</label>
                <input
                  id={`logo-${k}`}
                  type="url"
                  inputMode="url"
                  placeholder="https://"
                  value={tokens.logo[k] ?? ''}
                  onChange={(e) => update((t) => ({ ...t, logo: { ...t.logo, [k]: e.target.value.trim() || null } }))}
                />
              </div>
            ))}
          </div>
        </fieldset>

        {schemaErrors.length > 0 && (
          <div className="notice notice-error" role="alert">
            {schemaErrors.map((e) => (
              <p key={e}>{e}</p>
            ))}
          </div>
        )}
        <div className="form-actions sticky-actions">
          <button className="btn btn-quiet" type="submit" name="then" value="draft" disabled={pending || schemaErrors.length > 0}>
            Save draft
          </button>
          {canPublish && (
            <button className="btn btn-primary" type="submit" name="then" value="publish" disabled={pending || blocking}>
              Save and publish
            </button>
          )}
          {blocking && <span className="field-error">Fix the problems marked above before publishing.</span>}
          {!blocking && dirty && <span className="muted">Unsaved changes</span>}
          {!dirty && hasDraft && !state?.ok && <span className="muted">Showing your saved draft.</span>}
        </div>
      </div>

      <div className="design-preview-col">
        <p className="label">Live preview</p>
        <div className="theme-preview" style={(vars ?? {}) as React.CSSProperties} aria-label="Preview of the portal with these settings">
          <div className={`tp-header tp-header-${tokens.header}`}>
            <span className="tp-brand">School name</span>
            <span className="tp-nav">Calendar · Updates</span>
          </div>
          <div className="tp-body">
            <h3 className="tp-h">This week</h3>
            <div className="tp-card">
              <p className="tp-date">Mon, Nov 17</p>
              <p>
                Parent-teacher conferences. <a href="#preview">Read more</a>
              </p>
              <p className="tp-muted">8:00 AM to 3:00 PM · Main hall</p>
            </div>
            <div className="tp-actions">
              <span className="tp-btn tp-btn-primary">Primary button</span>
              <span className="tp-btn tp-btn-accent">Accent</span>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
