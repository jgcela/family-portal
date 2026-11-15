-- Usage counters: a school reads and increments only its own.
SELECT app_protect_tenant_table('usage_counters'::regclass);
