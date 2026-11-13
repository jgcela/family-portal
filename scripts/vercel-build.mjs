// Vercel runs this instead of `next build` (package.json "vercel-build").
// Production deploys apply pending database migrations first, so nobody has
// to run `npm run db:migrate` by hand after merging. Preview deploys never
// touch the database: they share it with production.
import { execSync } from 'node:child_process';

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

if (process.env.VERCEL_ENV === 'production') {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing in the Vercel production environment.');
  console.log('Applying database migrations…');
  run('npx tsx scripts/migrate.ts');
} else {
  console.log(`Skipping migrations (VERCEL_ENV=${process.env.VERCEL_ENV ?? 'unset'}).`);
}
run('npx next build');
