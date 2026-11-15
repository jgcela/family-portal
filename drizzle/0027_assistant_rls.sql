-- Family Assistant: every table is confined to its school.
SELECT app_protect_tenant_table(t::regclass) FROM unnest(ARRAY[
  'assistant_conversations', 'assistant_messages', 'assistant_actions'
]) AS t;
