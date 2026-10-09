# Handshake Audit

Daily operational audits for Chartwells locations. Shannon, Chuck, Ken, and Scott are the initial auditors. A location owner cannot audit their own location.

## Local setup

1. Copy `apps/api/.env.example` to `apps/api/.env` and set `DATABASE_URL`.
2. Run `pnpm install`.
3. Run the SQL in `apps/api/src/db/migrations/001_initial.sql` against PostgreSQL.
4. Run `pnpm dev`.

The web app runs on `http://localhost:5173` and the API on `http://localhost:3001`.

## Branching

- `dev` is the integration branch and the only branch used for ordinary feature work.
- `prod` is the stable release branch. Merge `dev` into `prod` only after review and deployment verification.

Configure the Chartwells GitHub remote before the first push.
