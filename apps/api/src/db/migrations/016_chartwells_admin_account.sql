-- Reuse the existing login so its password and audit references are preserved.
UPDATE auditors
   SET display_name = 'Chartwells Admin',
       is_god_admin = true,
       can_audit = false,
       active = true
 WHERE lower(email) = 'zaid.basri@compass-usa.com';

-- Explicitly remove these testing accounts and dependent test records.
CREATE TEMP TABLE removed_test_auditors ON COMMIT DROP AS
SELECT id FROM auditors WHERE lower(email) IN (
  'aansh.salia@compass-usa.com',
  'lakshminarasimha.ravipati@compass-usa.com'
);

-- Removed auditor profiles must not retain locations that cannot be selected.
UPDATE locations SET owner_auditor_id = NULL
 WHERE owner_auditor_id IN (
   SELECT id FROM auditors WHERE lower(email) IN (
     'zaid.basri@compass-usa.com',
     'aansh.salia@compass-usa.com',
     'lakshminarasimha.ravipati@compass-usa.com'
   )
 );

-- Require a fresh login to load the new account name and access flags.
DELETE FROM auth_sessions WHERE auditor_id IN (
  SELECT id FROM auditors WHERE lower(email) IN (
    'zaid.basri@compass-usa.com',
    'aansh.salia@compass-usa.com',
    'lakshminarasimha.ravipati@compass-usa.com'
  )
);

DELETE FROM audit_coverage_requests
 WHERE requested_by IN (SELECT id FROM removed_test_auditors)
    OR requested_to IN (SELECT id FROM removed_test_auditors);

-- Coverage requests for these schedules are removed by their foreign-key cascade.
DELETE FROM audit_schedules
 WHERE assigned_auditor_id IN (SELECT id FROM removed_test_auditors)
    OR created_by IN (SELECT id FROM removed_test_auditors);

DELETE FROM audit_responsibility_transfers
 WHERE requested_by IN (SELECT id FROM removed_test_auditors)
    OR requested_to IN (SELECT id FROM removed_test_auditors);

DELETE FROM auditor_absences
 WHERE auditor_id IN (SELECT id FROM removed_test_auditors);

-- Checklist responses are removed by the audit foreign-key cascade.
DELETE FROM audits
 WHERE auditor_id IN (SELECT id FROM removed_test_auditors);

DELETE FROM auditors WHERE id IN (SELECT id FROM removed_test_auditors);
