SELECT app_protect_tenant_table('family_grades'::regclass);--> statement-breakpoint
SELECT app_protect_tenant_table('family_requests'::regclass);--> statement-breakpoint
-- Documents limited to groups were staff-only until now; keep them private.
-- They become visible to signed-in families in those groups.
UPDATE documents SET visibility = 'families' WHERE cardinality(audience_ids) > 0;
--> statement-breakpoint
-- The office must see who asked to join (name, email) before they are members.
DROP POLICY IF EXISTS tenant_members_read ON "user";--> statement-breakpoint
CREATE POLICY tenant_members_read ON "user" FOR SELECT TO app_tenant USING (
  EXISTS (SELECT 1 FROM memberships m WHERE m.user_id = "user".id AND m.tenant_id = app_current_tenant())
  OR EXISTS (SELECT 1 FROM family_requests r WHERE r.user_id = "user".id AND r.tenant_id = app_current_tenant())
);
