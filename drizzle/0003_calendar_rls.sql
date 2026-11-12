SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY['calendars', 'events', 'calendar_imports']) AS t;
--> statement-breakpoint
-- Schools created before the calendar existed get the default public calendar.
INSERT INTO calendars (tenant_id, key, name, is_public)
SELECT t.id, 'school', 'School Calendar', true
FROM tenants t
WHERE NOT EXISTS (SELECT 1 FROM calendars c WHERE c.tenant_id = t.id);
