-- God Admin is an additional permission.  It never removes audit access.
UPDATE auditors
   SET can_audit = true
 WHERE active = true AND is_god_admin = true;
