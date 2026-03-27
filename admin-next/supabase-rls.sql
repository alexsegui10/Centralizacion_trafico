-- ============================================================
-- RLS setup para el panel admin Next.js
-- Ejecutar en: Supabase Dashboard → SQL Editor
-- ============================================================

-- 1. Habilitar RLS en todas las tablas relevantes
ALTER TABLE leads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mensajes  ENABLE ROW LEVEL SECURITY;

-- 2. Eliminar políticas antiguas si existen (safe to run multiple times)
DROP POLICY IF EXISTS "anon_read_leads"    ON leads;
DROP POLICY IF EXISTS "anon_read_eventos"  ON eventos;
DROP POLICY IF EXISTS "anon_read_mensajes" ON mensajes;

-- 3. Permitir SELECT a anon (usado por el cliente Supabase para realtime)
--    Las writes siempre van por la API Next.js con service_role_key (bypasea RLS)
CREATE POLICY "anon_read_leads"
  ON leads FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_eventos"
  ON eventos FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_mensajes"
  ON mensajes FOR SELECT TO anon USING (true);

-- 4. Habilitar Realtime en las tablas (necesario para las subscripciones)
--    Ejecutar desde Supabase Dashboard → Database → Replication
--    o con este comando:
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE mensajes;

-- ============================================================
-- VERIFICACIÓN: Confirma que RLS está activo
-- ============================================================
SELECT
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'eventos', 'mensajes');
