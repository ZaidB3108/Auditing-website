-- Each checklist section records two distinct evidence statuses.  The legacy
-- result column remains as a compact summary for backwards compatibility.
ALTER TABLE audit_responses ADD COLUMN IF NOT EXISTS selected_results TEXT[];

UPDATE audit_responses
   SET selected_results = CASE
     WHEN result = 'missing' THEN ARRAY['past', 'missing']::TEXT[]
     ELSE ARRAY['current', 'past']::TEXT[]
   END
 WHERE selected_results IS NULL;

ALTER TABLE audit_responses ALTER COLUMN selected_results SET NOT NULL;

ALTER TABLE audit_responses DROP CONSTRAINT IF EXISTS audit_responses_selected_results_check;
ALTER TABLE audit_responses ADD CONSTRAINT audit_responses_selected_results_check CHECK (
  cardinality(selected_results) = 2
  AND selected_results[1] <> selected_results[2]
  AND array_position(selected_results, NULL) IS NULL
  AND selected_results <@ ARRAY['current', 'past', 'missing']::TEXT[]
);
