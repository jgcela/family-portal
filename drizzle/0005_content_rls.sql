SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY['announcements', 'pages', 'page_versions']) AS t;
--> statement-breakpoint
-- Published page snapshots are history: they can be added, never edited.
REVOKE UPDATE ON page_versions FROM app_tenant;
