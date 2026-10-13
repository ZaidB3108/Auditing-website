#!/bin/sh
set -eu

: "${PGHOST:?Set PGHOST before running migrations.}"
: "${PGDATABASE:?Set PGDATABASE before running migrations.}"
: "${PGUSER:?Set PGUSER before running migrations.}"
: "${PGPASSWORD:?Set PGPASSWORD before running migrations.}"

export PGPORT="${PGPORT:-5432}"
export PGSSLMODE="${PGSSLMODE:-verify-full}"
export PGSSLROOTCERT="${PGSSLROOTCERT:-/app/rds-global-bundle.pem}"

psql -v ON_ERROR_STOP=1 --quiet --command '
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
'

for migration in /app/migrations/*.sql; do
  filename="$(basename "$migration")"
  # Migration names are repository-controlled, but quote them before placing them
  # in the SQL literal so this remains safe if a future filename contains an apostrophe.
  filename_sql="$(printf '%s' "$filename" | sed "s/'/''/g")"
  applied="$(psql --quiet --tuples-only --no-align \
    --command "SELECT 1 FROM schema_migrations WHERE filename = '$filename_sql';")"

  if [ "$applied" = "1" ]; then
    echo "Already applied: $filename"
    continue
  fi

  echo "Applying: $filename"
  psql -v ON_ERROR_STOP=1 --single-transaction --file "$migration"
  psql -v ON_ERROR_STOP=1 \
    --command "INSERT INTO schema_migrations (filename) VALUES ('$filename_sql');"
done

if [ -n "${INITIAL_AUDITOR_PASSWORD:-}" ]; then
  initial_password_sql="$(printf '%s' "$INITIAL_AUDITOR_PASSWORD" | sed "s/'/''/g")"
  psql -v ON_ERROR_STOP=1 --command "
    UPDATE auditors
       SET password_hash = crypt('$initial_password_sql', gen_salt('bf')),
           must_change_password = true,
           initial_password_set_at = now()
     WHERE active = true AND initial_password_set_at IS NULL;"
fi

echo "Database migrations completed successfully."
