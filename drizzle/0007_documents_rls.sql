SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY['documents', 'document_versions']) AS t;
--> statement-breakpoint
-- Uploaded versions are history: they can be added or deleted, never edited.
REVOKE UPDATE ON document_versions FROM app_tenant;
