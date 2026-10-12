CREATE TABLE auditor_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_id UUID NOT NULL REFERENCES auditors(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);

CREATE TABLE audit_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  binder_id UUID NOT NULL REFERENCES binders(id),
  audit_date DATE NOT NULL,
  assigned_auditor_id UUID NOT NULL REFERENCES auditors(id),
  created_by UUID NOT NULL REFERENCES auditors(id),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'covered', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (binder_id, audit_date)
);

CREATE TABLE audit_coverage_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES audit_schedules(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES auditors(id),
  requested_to UUID NOT NULL REFERENCES auditors(id),
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX one_pending_coverage_request_per_schedule
  ON audit_coverage_requests(schedule_id)
  WHERE status = 'pending';
