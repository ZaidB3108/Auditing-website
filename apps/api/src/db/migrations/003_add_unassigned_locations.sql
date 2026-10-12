-- Locations can be loaded before ownership mapping is available.
ALTER TABLE locations ALTER COLUMN owner_auditor_id DROP NOT NULL;

WITH supplied_locations (area_name, location_name) AS (
  VALUES
    ('Unassigned locations', 'All Pho U'),
    ('Unassigned locations', 'Basecamp'),
    ('Unassigned locations', 'Qdoba'),
    ('Unassigned locations', 'The Bean Yard'),
    ('Unassigned locations', '521 Kitchen'),
    ('Unassigned locations', 'Cilantree'),
    ('Unassigned locations', 'City Edge Cafe'),
    ('Unassigned locations', 'Crimson Corner Market'),
    ('Unassigned locations', 'Crimson View'),
    ('Unassigned locations', 'Crossroads - Salads'),
    ('Unassigned locations', 'Crossroads Bistro'),
    ('Unassigned locations', 'Cupbop'),
    ('Unassigned locations', 'Einstein Bros. Bagels'),
    ('Unassigned locations', 'Epicenter Cafe'),
    ('Unassigned locations', 'Gardner C- Store'),
    ('Unassigned locations', 'Greek Kabob'),
    ('Unassigned locations', 'Hive Express'),
    ('Unassigned locations', 'Honors Market'),
    ('Unassigned locations', 'Miller Cafe'),
    ('Unassigned locations', 'Morning Grounds'),
    ('Unassigned locations', 'Panda Express'),
    ('Unassigned locations', 'Quartzdyne'),
    ('Unassigned locations', 'Shake Smart - Student Life Center'),
    ('Unassigned locations', 'Supper Club; Taylor Swift Dance Party'),
    ('Unassigned locations', 'The Other Side Donuts'),
    ('Unassigned locations', 'Tu Taco'),
    ('Unassigned locations', 'Union - Shake Smart'),
    ('Unassigned locations', 'Union Food Court - Retail'),
    ('Unassigned locations', 'City Edge'),
    ('Unassigned locations', 'Miller Cafe (2)'),
    ('Unassigned locations', 'Urban Bytes'),
    ('Unassigned locations', 'United Table'),
    ('Unassigned locations', 'Athletic Center')
), inserted AS (
  INSERT INTO locations (area_name, location_name, owner_auditor_id)
  SELECT area_name, location_name, NULL FROM supplied_locations
  ON CONFLICT (area_name, location_name) DO NOTHING
  RETURNING id
)
INSERT INTO binders (location_id, binder_name)
SELECT id, 'Binder #1' FROM inserted
ON CONFLICT (location_id, binder_name) DO NOTHING;
