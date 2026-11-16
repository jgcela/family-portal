// Checks that DATABASE_URL connects. Usage: npm run db:check
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Falta DATABASE_URL. Revisa tu archivo .env (ver .env.example).');
  process.exit(1);
}
// Same strict TLS as the app (src/server/db/url.ts): require → verify-full.
const u = new URL(url);
if (['prefer', 'require', 'verify-ca'].includes(u.searchParams.get('sslmode') ?? '')) u.searchParams.set('sslmode', 'verify-full');
const client = new pg.Client({ connectionString: u.toString() });
try {
  await client.connect();
  const { rows } = await client.query('SELECT version()');
  console.log('Conexión correcta:', rows[0].version.split(' ').slice(0, 2).join(' '));
} catch (err) {
  console.error('No se pudo conectar:', err.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
