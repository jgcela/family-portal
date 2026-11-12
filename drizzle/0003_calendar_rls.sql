SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY['calendars', 'events', 'calendar_imports']) AS t;
