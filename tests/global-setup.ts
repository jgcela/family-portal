// Creates a fresh test database owned by a NON-superuser role (like Neon's
// neondb_owner), then applies all migrations. Requires a local PostgreSQL;
// set TEST_ADMIN_DATABASE_URL to point at it (defaults to postgres@localhost).
import { Client } from 'pg';
import { runMigrations } from '../scripts/migrate';

const ADMIN_URL = process.env.TEST_ADMIN_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';
const DB_NAME = 'family_portal_test';
const OWNER = 'fp_test_owner';
const OWNER_PW = 'fp_test_owner_pw';

export default async function setup() {
  const admin = new Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${DB_NAME} WITH (FORCE)`);
  const { rowCount } = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = $1`, [OWNER]);
  if (!rowCount) await admin.query(`CREATE ROLE ${OWNER} LOGIN CREATEROLE PASSWORD '${OWNER_PW}'`);
  await admin.query(`CREATE DATABASE ${DB_NAME} OWNER ${OWNER}`);
  // Roles are cluster-wide. If another local database already created
  // app_tenant, let the test owner administer it (on Neon the owner creates it).
  const existing = await admin.query(`SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant'`);
  if (existing.rowCount) await admin.query(`GRANT app_tenant TO ${OWNER} WITH ADMIN OPTION`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.username = OWNER;
  url.password = OWNER_PW;
  url.pathname = `/${DB_NAME}`;
  process.env.DATABASE_URL = url.toString();
  await runMigrations(url.toString());
}
