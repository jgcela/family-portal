// Authentication (identity only). Authorization lives in src/server/rbac and is
// always evaluated per tenant from memberships, never from the session alone.
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { twoFactor } from 'better-auth/plugins';
import { platformDb } from '../db/client';
import * as schema from '../db/schema';
import { allowedAuthHosts } from '../tenancy/config';

function createAuth() {
  return betterAuth({
    appName: process.env.PLATFORM_NAME ?? 'School Portal',
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: {
      allowedHosts: allowedAuthHosts(),
      protocol: process.env.NODE_ENV === 'production' ? 'https' : 'http',
    },
    database: drizzleAdapter(platformDb(), {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      // No public self sign-up: people join a school by invitation only.
      disableSignUp: process.env.AUTH_ALLOW_SIGNUP !== 'true',
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: true, window: 60, max: 30, storage: 'database' },
    advanced: {
      useSecureCookies: process.env.NODE_ENV === 'production',
      cookiePrefix: 'fp',
    },
    plugins: [twoFactor({ issuer: process.env.PLATFORM_NAME ?? 'School Portal' }), nextCookies()],
  });
}

type Auth = ReturnType<typeof createAuth>;
const g = globalThis as unknown as { __fpAuth?: Auth };

export function auth(): Auth {
  if (!g.__fpAuth) g.__fpAuth = createAuth();
  return g.__fpAuth;
}
