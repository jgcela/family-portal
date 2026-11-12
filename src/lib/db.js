import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error('Falta DATABASE_URL. Revisa tu archivo .env (ver .env.example).');
}

// Cliente HTTP de Neon: funciona en Node y en funciones serverless de Vercel.
// Uso: const rows = await sql`SELECT * FROM tabla WHERE id = ${id}`;
export const sql = neon(url);
