ALTER TABLE audits
  ADD COLUMN IF NOT EXISTS overall_comment TEXT;
