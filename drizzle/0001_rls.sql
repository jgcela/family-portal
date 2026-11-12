-- Row-level security: the database-level tenant boundary.
--
-- Runtime requests that act on behalf of a school run inside withTenant(), which
-- executes `SET LOCAL ROLE app_tenant` and `set_config('app.tenant_id', ..., true)`
-- for the duration of one transaction. app_tenant is NOLOGIN, does not own any
-- table and has no BYPASSRLS, so every row it touches is filtered by the
-- policies below. If app.tenant_id is unset, app_current_tenant() is NULL and
-- the policies match nothing (deny by default).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant NOLOGIN NOBYPASSRLS;
  END IF;
  IF NOT pg_has_role(current_user, 'app_tenant', 'SET') THEN
    EXECUTE format('GRANT app_tenant TO %I', current_user);
  END IF;
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO app_tenant;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app_current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.tenant_id', true), '')::uuid
$$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app_current_tenant() TO app_tenant;
--> statement-breakpoint
-- Enables RLS + a single tenant_isolation policy on a tenant-owned table and
-- grants the runtime role full DML on it. Reused by later migrations.
CREATE OR REPLACE FUNCTION app_protect_tenant_table(tbl regclass) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', tbl);
  EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %s', tbl);
  EXECUTE format(
    'CREATE POLICY tenant_isolation ON %s FOR ALL TO app_tenant
       USING (tenant_id = app_current_tenant())
       WITH CHECK (tenant_id = app_current_tenant())', tbl);
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO app_tenant', tbl);
END $$;
--> statement-breakpoint
SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY[
  'school_profiles', 'theme_versions', 'academic_years', 'grades', 'audiences',
  'audience_grades', 'roles', 'role_permissions', 'memberships', 'membership_roles',
  'tenant_modules', 'navigation_items', 'homepage_versions', 'tenant_settings'
]) AS t;
--> statement-breakpoint
-- Platform-owned tables: read-only for the tenant role, own rows only.
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self_read ON tenants FOR SELECT TO app_tenant USING (id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT ON tenants TO app_tenant;
--> statement-breakpoint
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self_read ON tenant_domains FOR SELECT TO app_tenant USING (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT ON tenant_domains TO app_tenant;
--> statement-breakpoint
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self_read ON subscriptions FOR SELECT TO app_tenant USING (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT ON subscriptions TO app_tenant;
--> statement-breakpoint
-- Plan catalog is not tenant data; schools may read it to see what is included.
GRANT SELECT ON plans TO app_tenant;
--> statement-breakpoint
-- Support grants: a school sees and approves/revokes only its own grants.
ALTER TABLE support_grants ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_self ON support_grants FOR ALL TO app_tenant
  USING (tenant_id = app_current_tenant()) WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT ON support_grants TO app_tenant;
--> statement-breakpoint
GRANT UPDATE (approved_by_user_id, approved_at, revoked_at) ON support_grants TO app_tenant;
--> statement-breakpoint
-- Audit log: append-only from tenant context; tenant reads only its own rows.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_read ON audit_logs FOR SELECT TO app_tenant USING (tenant_id = app_current_tenant());
--> statement-breakpoint
CREATE POLICY tenant_append ON audit_logs FOR INSERT TO app_tenant WITH CHECK (tenant_id = app_current_tenant());
--> statement-breakpoint
GRANT SELECT, INSERT ON audit_logs TO app_tenant;
--> statement-breakpoint
GRANT USAGE ON SEQUENCE audit_logs_id_seq TO app_tenant;
--> statement-breakpoint
-- People: a school can read basic identity only for its own members.
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY tenant_members_read ON "user" FOR SELECT TO app_tenant USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = "user".id AND m.tenant_id = app_current_tenant())
);
--> statement-breakpoint
GRANT SELECT (id, name, email, image, two_factor_enabled) ON "user" TO app_tenant;
