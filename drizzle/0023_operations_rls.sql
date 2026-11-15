-- Operations: every table is confined to its school.
SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY[
  'students', 'student_guardians', 'inbox_items', 'inbox_events', 'reply_templates',
  'inbox_views', 'attendance_notices', 'workflows'
]) AS t;
