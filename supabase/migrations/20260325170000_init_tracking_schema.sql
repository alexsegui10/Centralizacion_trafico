CREATE TABLE leads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id        TEXT NOT NULL UNIQUE,
  fingerprint_hash  TEXT,
  modelo_id         TEXT NOT NULL,
  utm_source        TEXT,
  idioma            TEXT,
  dispositivo       TEXT,
  user_agent        TEXT,
  ip_hash           TEXT,
  pais              TEXT,
  ciudad            TEXT,
  of_activo         BOOLEAN DEFAULT FALSE,
  telegram_activo   BOOLEAN DEFAULT FALSE,
  mgo_directo       BOOLEAN DEFAULT FALSE,
  mgo_en_canal      BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leads_visitor_id ON leads(visitor_id);
CREATE INDEX idx_leads_fingerprint ON leads(fingerprint_hash);
CREATE INDEX idx_leads_modelo ON leads(modelo_id);
CREATE INDEX idx_leads_mgo_directo ON leads(mgo_directo);
CREATE INDEX idx_leads_mgo_en_canal ON leads(mgo_en_canal);
CREATE INDEX idx_leads_pais ON leads(pais);
CREATE INDEX idx_leads_ciudad ON leads(ciudad);

CREATE TABLE eventos (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       TEXT NOT NULL UNIQUE,
  visitor_id       TEXT NOT NULL,
  modelo_id        TEXT NOT NULL,
  boton_clickado   TEXT NOT NULL,
  utm_source       TEXT,
  idioma           TEXT,
  dispositivo      TEXT,
  user_agent       TEXT,
  fingerprint_hash TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_eventos_visitor ON eventos(visitor_id);
CREATE INDEX idx_eventos_request_id ON eventos(request_id);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
