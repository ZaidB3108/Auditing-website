ALTER TABLE audits
  ADD COLUMN reviewed_at TIMESTAMPTZ,
  ADD COLUMN reviewed_by UUID REFERENCES auditors(id);

ALTER TABLE audits ADD CONSTRAINT audits_review_metadata_check
  CHECK ((reviewed_at IS NULL) = (reviewed_by IS NULL));

CREATE INDEX audits_archive_auditor_date_idx
  ON audits (auditor_id, audit_date DESC, created_at DESC, id)
  WHERE status = 'submitted' AND reviewed_at IS NOT NULL;
