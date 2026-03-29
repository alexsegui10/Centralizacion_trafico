-- Partial unique index on telegram_user_id (only for non-null values)
-- Prevents duplicate leads from race conditions on simultaneous DM/join events
CREATE UNIQUE INDEX IF NOT EXISTS leads_telegram_user_id_unique
  ON leads (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;
