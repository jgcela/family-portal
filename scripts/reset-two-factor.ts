// Recovery: turn off two-step sign-in for someone who lost their phone AND
// their backup codes. Needs DATABASE_URL (production Neon URL) in .env.
// It removes the authenticator, signs the person out everywhere and writes
// an entry in the activity log. They then sign in with their password and,
// if they are a platform admin, the platform asks them to set it up again.
//
// Usage: npm run auth:reset-2fa -- person@example.com "lost phone"
// Only run it after confirming the person's identity outside the app
// (a call or in person): it removes a protection.
import { closeDb } from '../src/server/db/client';
import { resetTwoFactorByEmail } from '../src/server/auth/two-factor';

const [email, ...reasonParts] = process.argv.slice(2);
if (!email || !email.includes('@')) {
  console.error('Usage: npm run auth:reset-2fa -- person@example.com "reason"');
  process.exit(1);
}
try {
  const r = await resetTwoFactorByEmail(email, reasonParts.join(' ') || 'not given');
  console.log(`Two-step sign-in reset for ${email} (user ${r.userId}). All their sessions were ended.`);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
