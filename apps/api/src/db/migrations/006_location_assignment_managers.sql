ALTER TABLE auditors ADD COLUMN IF NOT EXISTS is_location_manager BOOLEAN NOT NULL DEFAULT false;

UPDATE auditors
   SET is_location_manager = true
 WHERE lower(email) IN ('charles.weaver@compass-usa.com', 'ken.ohlinger@compass-usa.com');
