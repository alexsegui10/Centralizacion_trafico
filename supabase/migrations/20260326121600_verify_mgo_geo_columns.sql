SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'leads'
  AND column_name IN ('mgo_directo', 'mgo_en_canal', 'pais', 'ciudad')
ORDER BY column_name;

SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'leads'
  AND indexname IN (
    'idx_leads_mgo_directo',
    'idx_leads_mgo_en_canal',
    'idx_leads_pais',
    'idx_leads_ciudad'
  )
ORDER BY indexname;
