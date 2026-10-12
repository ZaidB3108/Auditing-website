ALTER TABLE auditors ADD COLUMN IF NOT EXISTS password_hash TEXT;

UPDATE auditors
SET email = lower(display_name) || '@compass-usa.com',
    password_hash = crypt('AuditTest!2026', gen_salt('bf'))
WHERE email IS NULL;

ALTER TABLE auditors ALTER COLUMN email SET NOT NULL;
ALTER TABLE auditors ALTER COLUMN password_hash SET NOT NULL;

CREATE TABLE IF NOT EXISTS auth_sessions (
  token UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_id UUID NOT NULL REFERENCES auditors(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '12 hours',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS auth_sessions_auditor_id_idx ON auth_sessions(auditor_id);

CREATE OR REPLACE FUNCTION add_approved_auditor() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    INSERT INTO auditors (display_name, email, password_hash)
    VALUES (NEW.display_name, lower(NEW.email), crypt('AuditTest!2026', gen_salt('bf')))
    ON CONFLICT (email) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS proposals_add_approved_auditor ON auditor_proposals;
CREATE TRIGGER proposals_add_approved_auditor
  AFTER UPDATE OF status ON auditor_proposals
  FOR EACH ROW EXECUTE FUNCTION add_approved_auditor();

INSERT INTO locations (area_name, location_name, owner_auditor_id)
SELECT 'Union Food', 'Food Court', a.id
FROM auditors a
WHERE a.display_name = 'Chuck'
ON CONFLICT (area_name, location_name) DO NOTHING;

INSERT INTO binders (location_id, binder_name)
SELECT l.id, 'Binder #1'
FROM locations l
WHERE l.area_name = 'Union Food' AND l.location_name = 'Food Court'
ON CONFLICT (location_id, binder_name) DO NOTHING;
