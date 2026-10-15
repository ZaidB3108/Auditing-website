ALTER TABLE audit_responses DROP CONSTRAINT IF EXISTS audit_responses_result_check;
ALTER TABLE audit_responses ADD CONSTRAINT audit_responses_result_check
  CHECK (result IN ('current', 'past', 'missing', 'not_applicable'));

ALTER TABLE audit_responses DROP CONSTRAINT IF EXISTS audit_responses_selected_results_check;
ALTER TABLE audit_responses ADD CONSTRAINT audit_responses_selected_results_check CHECK (
  selected_results = ARRAY['not_applicable']::TEXT[]
  OR (
    cardinality(selected_results) = 2
    AND selected_results[1] <> selected_results[2]
    AND array_position(selected_results, NULL) IS NULL
    AND selected_results <@ ARRAY['current', 'past', 'missing']::TEXT[]
  )
);
