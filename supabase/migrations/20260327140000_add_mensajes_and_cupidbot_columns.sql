ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS cupidbot_activo BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cupidbot_pausado BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS mensajes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  visitor_id TEXT NOT NULL,
  tipo TEXT NOT NULL,
  bot_tipo TEXT,
  contenido TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mensajes_visitor_id ON mensajes(visitor_id);
CREATE INDEX IF NOT EXISTS idx_mensajes_created_at ON mensajes(created_at);
