-- Replace unanimous auditor approvals with direct God Admin management.
ALTER TABLE auditors ADD COLUMN IF NOT EXISTS is_god_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE auditors ADD COLUMN IF NOT EXISTS can_audit BOOLEAN NOT NULL DEFAULT true;

UPDATE auditors
   SET email = CASE display_name
     WHEN 'Chuck' THEN 'charles.weaver@compass-usa.com'
     WHEN 'Ken' THEN 'ken.ohlinger@compass-usa.com'
     WHEN 'Scott' THEN 'scott.maldonado@compass-usa.com'
     WHEN 'Shannon' THEN 'shannon.mohyuddin@compass-usa.com'
     ELSE email
   END,
   is_core_approver = false,
   can_audit = true
 WHERE display_name IN ('Chuck', 'Ken', 'Scott', 'Shannon');

INSERT INTO auditors (display_name, email, password_hash, is_god_admin, can_audit, is_core_approver)
VALUES
  ('Zaid Basri', 'zaid.basri@compass-usa.com', crypt('AuditTest!2026', gen_salt('bf')), true, false, false),
  ('Aansh Salia', 'aansh.salia@compass-usa.com', crypt('AuditTest!2026', gen_salt('bf')), true, false, false),
  ('Lakshmi Ravipati', 'lakshminarasimha.ravipati@compass-usa.com', crypt('AuditTest!2026', gen_salt('bf')), true, false, false)
ON CONFLICT (email) DO UPDATE
  SET display_name = EXCLUDED.display_name,
      is_god_admin = true,
      can_audit = false,
      active = true;

DROP TRIGGER IF EXISTS proposals_add_approved_auditor ON auditor_proposals;
DROP TRIGGER IF EXISTS votes_update_proposal_status ON auditor_proposal_votes;
DROP FUNCTION IF EXISTS add_approved_auditor();
DROP FUNCTION IF EXISTS update_auditor_proposal_status();
DROP TABLE IF EXISTS auditor_proposal_votes;
DROP TABLE IF EXISTS auditor_proposals;
