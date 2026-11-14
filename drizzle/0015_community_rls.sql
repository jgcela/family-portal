-- Tenant isolation for teacher wishlists and staff favorites.
SELECT app_protect_tenant_table('community_items'::regclass);
