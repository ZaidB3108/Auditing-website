-- The original schema required a comment for any non-current summary result.
-- Remove that legacy rule now that all checklist comments are optional.
ALTER TABLE audit_responses DROP CONSTRAINT IF EXISTS audit_responses_check;
