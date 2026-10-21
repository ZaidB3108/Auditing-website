-- Let auditors record only the checklist evidence that applies to the visit.
-- A section may have zero or more distinct statuses, and every comment is optional.
ALTER TABLE audit_responses DROP CONSTRAINT IF EXISTS audit_responses_selected_results_check;
ALTER TABLE audit_responses ADD CONSTRAINT audit_responses_selected_results_check CHECK (
  array_position(selected_results, NULL) IS NULL
  AND selected_results <@ ARRAY['current', 'past', 'missing', 'not_applicable']::TEXT[]
);

-- Chuck remains an auditor and gains the same visibility and management access
-- as the other God Admins.
UPDATE auditors
   SET is_god_admin = true,
       can_audit = true,
       active = true
 WHERE lower(email) = 'charles.weaver@compass-usa.com';
