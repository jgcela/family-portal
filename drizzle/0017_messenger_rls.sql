-- Tenant isolation for the newsletter archive.
SELECT app_protect_tenant_table('newsletter_issues'::regclass);
