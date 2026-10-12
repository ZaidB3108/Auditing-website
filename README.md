# Handshake Audit

Daily operational audits for Chartwells locations. Shannon, Chuck, Ken, and Scott are the initial auditors. A location owner cannot audit their own location. Zaid Basri, Aansh Salia, and Lakshmi Ravipati are God Admins: they can view every submitted audit and directly add or deactivate auditors.

## Local setup

1. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.
2. Run `pnpm install`.
3. Run the SQL files in `apps/api/src/db/migrations/` in numerical order: `001_initial.sql`, `002_local_auth_and_seed_data.sql`, `003_add_unassigned_locations.sql`, `004_god_admin_access.sql`, then `005_audit_responsibility_transfers.sql`.
4. Run `pnpm dev`.

The web app runs on `http://localhost:5173` and the API on `http://localhost:3001`.

For local testing, the seeded auditor and God Admin accounts use their listed `@compass-usa.com` address and the temporary password `AuditTest!2026`. God Admins cannot submit audits; their role is to view all submitted work and manage auditors and locations. Replace local passwords with Microsoft Entra ID before production deployment.

## Branching

- `dev` is the integration branch and the only branch used for ordinary feature work.
- `prod` is the stable release branch. Merge `dev` into `prod` only after review and deployment verification.

Configure the Chartwells GitHub remote before the first push.
