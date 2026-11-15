-- Student directory: every table is confined to its school.
SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY[
  'directory_settings', 'sis_person_links', 'directory_blocks'
]) AS t;
