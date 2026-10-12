CREATE TABLE audit_responsibility_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id UUID NOT NULL REFERENCES locations(id),
  requested_by UUID NOT NULL REFERENCES auditors(id),
  requested_to UUID NOT NULL REFERENCES auditors(id),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX one_pending_transfer_per_location
  ON audit_responsibility_transfers(location_id)
  WHERE status = 'pending';
