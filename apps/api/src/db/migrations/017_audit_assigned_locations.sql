-- Assignments now identify the auditor responsible for performing the audit.
-- Past audits remain untouched. Accepted coverage is a temporary assignment.
DROP TRIGGER IF EXISTS audits_prevent_owner_audit ON audits;
DROP FUNCTION IF EXISTS prevent_owner_audit();

CREATE FUNCTION require_audit_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1
    FROM binders b JOIN locations l ON l.id = b.location_id
    JOIN auditors a ON a.id = NEW.auditor_id
   WHERE b.id = NEW.binder_id AND l.active AND a.active AND a.can_audit
     AND (l.owner_auditor_id = NEW.auditor_id OR EXISTS (
       SELECT 1 FROM audit_schedules s
        WHERE s.binder_id = NEW.binder_id AND s.audit_date = NEW.audit_date
          AND s.assigned_auditor_id = NEW.auditor_id AND s.status = 'covered'
     ))
   FOR SHARE OF l, a;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Auditor is not assigned to this location';
  END IF;
  IF EXISTS (
    SELECT 1 FROM audit_schedules s
     WHERE s.binder_id = NEW.binder_id AND s.audit_date = NEW.audit_date
       AND s.status IN ('scheduled', 'covered')
       AND s.assigned_auditor_id <> NEW.auditor_id
  ) THEN
    RAISE EXCEPTION 'Auditor is not assigned to this scheduled audit';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER audits_require_assignment
  BEFORE INSERT OR UPDATE OF binder_id, auditor_id, audit_date ON audits
  FOR EACH ROW EXECUTE FUNCTION require_audit_assignment();

-- Old schedules were made under the opposite eligibility rule. Cancel only
-- incompatible future schedules so they cannot block the assigned auditor.
UPDATE audit_schedules s SET status = 'cancelled'
 FROM binders b JOIN locations l ON l.id = b.location_id
 WHERE s.binder_id = b.id AND s.audit_date >= current_date
   AND s.status = 'scheduled'
   AND s.assigned_auditor_id IS DISTINCT FROM l.owner_auditor_id;

-- Subsequent reassignments must also release incompatible schedules.
CREATE FUNCTION cancel_schedules_on_reassignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.owner_auditor_id IS DISTINCT FROM NEW.owner_auditor_id THEN
    UPDATE audit_schedules s SET status = 'cancelled'
      FROM binders b
     WHERE b.location_id = NEW.id AND s.binder_id = b.id
       AND s.audit_date >= current_date AND s.status IN ('scheduled', 'covered');
    UPDATE audit_responsibility_transfers SET status = 'rejected', responded_at = now()
     WHERE location_id = NEW.id AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER locations_cancel_stale_schedules
  AFTER UPDATE OF owner_auditor_id ON locations
  FOR EACH ROW EXECUTE FUNCTION cancel_schedules_on_reassignment();
