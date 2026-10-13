ALTER TABLE auditors
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS initial_password_set_at TIMESTAMPTZ;
