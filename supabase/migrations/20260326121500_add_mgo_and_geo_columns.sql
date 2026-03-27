ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS mgo_directo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mgo_en_canal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pais TEXT,
  ADD COLUMN IF NOT EXISTS ciudad TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_mgo_directo ON leads(mgo_directo);
CREATE INDEX IF NOT EXISTS idx_leads_mgo_en_canal ON leads(mgo_en_canal);
CREATE INDEX IF NOT EXISTS idx_leads_pais ON leads(pais);
CREATE INDEX IF NOT EXISTS idx_leads_ciudad ON leads(ciudad);
