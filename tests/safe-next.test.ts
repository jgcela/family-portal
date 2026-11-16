import { describe, expect, it } from 'vitest';
import { LOCAL_OR_HTTPS, safeNext } from '@/lib/safe-next';

describe('safeNext', () => {
  it('keeps paths inside the portal', () => {
    expect(safeNext('/s/stmary/admin', '/s/stmary', '/x')).toBe('/s/stmary/admin');
    expect(safeNext('/admin/documents?tab=2', '', '/account')).toBe('/admin/documents?tab=2');
    expect(safeNext('/platform/schools', '/platform', '/platform')).toBe('/platform/schools');
  });

  it('refuses other sites and the tricks browsers turn into one', () => {
    for (const bad of ['//evil.example', '/\\evil.example', '/\t/evil.example', '/\n/evil.example', 'https://evil.example', 'evil.example', '']) {
      expect(safeNext(bad, '', '/account')).toBe('/account');
    }
  });

  it('refuses paths outside the prefix', () => {
    expect(safeNext('/s/other/admin', '/s/stmary', '/s/stmary/account')).toBe('/s/stmary/account');
    expect(safeNext('/platformx', '/platform', '/platform')).toBe('/platform');
  });
});

describe('LOCAL_OR_HTTPS', () => {
  it('accepts site paths and https links only', () => {
    expect(LOCAL_OR_HTTPS.test('/calendar')).toBe(true);
    expect(LOCAL_OR_HTTPS.test('https://school.org/x')).toBe(true);
    expect(LOCAL_OR_HTTPS.test('//evil.example')).toBe(false);
    expect(LOCAL_OR_HTTPS.test('/\\evil.example')).toBe(false);
    expect(LOCAL_OR_HTTPS.test('javascript:alert(1)')).toBe(false);
    expect(LOCAL_OR_HTTPS.test('http://school.org')).toBe(false);
  });
});
