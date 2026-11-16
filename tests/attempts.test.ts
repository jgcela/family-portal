import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { allowAttempt } from '@/server/security/attempts';


describe('allowAttempt', () => {
  it('allows up to the limit in a window, then refuses, then resets', async () => {
    const db = undefined;
    const key = `test:${Math.random()}`;
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) expect(await allowAttempt(key, 3, 60, t0 + i * 1000, db)).toBe(true);
    expect(await allowAttempt(key, 3, 60, t0 + 5000, db)).toBe(false);
    expect(await allowAttempt(key, 3, 60, t0 + 61_000, db)).toBe(true);
  });
});
