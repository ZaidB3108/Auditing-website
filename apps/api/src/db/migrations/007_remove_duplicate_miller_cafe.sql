-- Remove only the duplicate seeded record. The original "Miller Cafe" remains.
BEGIN;

WITH target AS (
  SELECT id FROM locations
   WHERE area_name = 'Unassigned locations' AND location_name = 'Miller Cafe (2)'
), target_binders AS (
  SELECT b.id FROM binders b JOIN target t ON t.id = b.location_id
), deleted_audits AS (
  DELETE FROM audits WHERE binder_id IN (SELECT id FROM target_binders)
  RETURNING id
)
DELETE FROM audit_responsibility_transfers
 WHERE location_id IN (SELECT id FROM target);

DELETE FROM locations
 WHERE area_name = 'Unassigned locations' AND location_name = 'Miller Cafe (2)';

COMMIT;
