import { describe, expect, it } from 'vitest';
import { strictSslUrl } from '@/server/db/url';

describe('strictSslUrl', () => {
  it('turns weak sslmodes into verify-full and keeps everything else', () => {
    const out = strictSslUrl('postgresql://neondb_owner:p%40ss%2Fw0rd@ep-x-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require');
    const u = new URL(out);
    expect(u.searchParams.get('sslmode')).toBe('verify-full');
    expect(u.searchParams.get('channel_binding')).toBe('require');
    expect(u.password).toBe('p%40ss%2Fw0rd');
    expect(u.hostname).toBe('ep-x-pooler.us-east-2.aws.neon.tech');
    expect(u.pathname).toBe('/neondb');
  });

  it('leaves local URLs, verify-full and libpq-compat URLs alone', () => {
    for (const url of [
      'postgres://postgres:postgres@localhost:5432/postgres',
      'postgres://u:p@h/db?sslmode=disable',
      'postgres://u:p@h/db?sslmode=verify-full',
      'postgres://u:p@h/db?uselibpqcompat=true&sslmode=require',
    ]) {
      expect(strictSslUrl(url)).toBe(url);
    }
  });
});
