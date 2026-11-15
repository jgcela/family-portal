-- School Knowledge AI: every table is confined to its school.
SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY[
  'knowledge_sources', 'knowledge_chunks', 'ai_settings', 'ai_questions'
]) AS t;
