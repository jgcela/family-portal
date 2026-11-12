// Comprueba que DATABASE_URL conecta con Neon.
// Uso: npm run db:check
import { sql } from '../src/lib/db.js';

try {
  const [row] = await sql`SELECT version()`;
  console.log('Conexión con Neon correcta:', row.version.split(' ').slice(0, 2).join(' '));
} catch (err) {
  console.error('No se pudo conectar con Neon:', err.message);
  process.exit(1);
}
