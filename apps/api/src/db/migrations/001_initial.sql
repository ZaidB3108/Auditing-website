CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE auditors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true,
  is_core_approver BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO auditors (display_name, is_core_approver) VALUES ('Shannon', true), ('Chuck', true), ('Ken', true), ('Scott', true);

CREATE TABLE locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_name TEXT NOT NULL,
  location_name TEXT NOT NULL,
  owner_auditor_id UUID NOT NULL REFERENCES auditors(id),
  active BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (area_name, location_name)
);

CREATE TABLE binders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  binder_name TEXT NOT NULL,
  UNIQUE (location_id, binder_name)
);

CREATE TABLE audit_sections (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  sort_order SMALLINT NOT NULL UNIQUE
);

INSERT INTO audit_sections (id, label, sort_order) VALUES
 ('safety', 'Safety Topic and Sign-off', 1), ('opening', 'Opening Checklist', 2), ('mid', 'Mid Checklist', 3), ('closing', 'Closing Checklist', 4), ('cooler', 'Cooler Temp Logs', 5), ('two-hour', '2 hour food temp logs', 6), ('protein', 'Protein Temp Logs Maintained with MGR Sign-off', 7), ('test', 'Checklist Test Item(s)', 8);

CREATE TABLE audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binder_id UUID NOT NULL REFERENCES binders(id),
  auditor_id UUID NOT NULL REFERENCES auditors(id),
  audit_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'submitted')) DEFAULT 'draft',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (binder_id, audit_date)
);

CREATE FUNCTION prevent_owner_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM binders b
      JOIN locations l ON l.id = b.location_id
     WHERE b.id = NEW.binder_id AND l.owner_auditor_id = NEW.auditor_id
  ) THEN
    RAISE EXCEPTION 'A location owner cannot audit their own location';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audits_prevent_owner_audit
  BEFORE INSERT OR UPDATE OF binder_id, auditor_id ON audits
  FOR EACH ROW EXECUTE FUNCTION prevent_owner_audit();

CREATE TABLE audit_responses (
  audit_id UUID NOT NULL REFERENCES audits(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL REFERENCES audit_sections(id),
  result TEXT NOT NULL CHECK (result IN ('current', 'past', 'missing')),
  comment TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (audit_id, section_id),
  CHECK ((result = 'current') OR length(trim(comment)) > 0)
);

CREATE TABLE auditor_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  proposed_by UUID NOT NULL REFERENCES auditors(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auditor_proposal_votes (
  proposal_id UUID NOT NULL REFERENCES auditor_proposals(id) ON DELETE CASCADE,
  auditor_id UUID NOT NULL REFERENCES auditors(id),
  approved BOOLEAN NOT NULL,
  voted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, auditor_id)
);

CREATE FUNCTION update_auditor_proposal_status() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE core_approvers INTEGER;
DECLARE approvals INTEGER;
BEGIN
  SELECT count(*) INTO core_approvers FROM auditors WHERE active AND is_core_approver;
  SELECT count(*) INTO approvals
    FROM auditor_proposal_votes v JOIN auditors a ON a.id = v.auditor_id
   WHERE v.proposal_id = NEW.proposal_id AND v.approved AND a.active AND a.is_core_approver;
  IF EXISTS (SELECT 1 FROM auditor_proposal_votes WHERE proposal_id = NEW.proposal_id AND NOT approved) THEN
    UPDATE auditor_proposals SET status = 'rejected' WHERE id = NEW.proposal_id;
  ELSIF approvals = core_approvers THEN
    UPDATE auditor_proposals SET status = 'approved' WHERE id = NEW.proposal_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER votes_update_proposal_status
  AFTER INSERT OR UPDATE ON auditor_proposal_votes
  FOR EACH ROW EXECUTE FUNCTION update_auditor_proposal_status();
