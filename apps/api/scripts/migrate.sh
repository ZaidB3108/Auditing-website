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
  applied="$(psql -v filename="$filename" --quiet --tuples-only --no-align \
    --command "SELECT 1 FROM schema_migrations WHERE filename = :'filename';")"

  if [ "$applied" = "1" ]; then
    echo "Already applied: $filename"
    continue
  fi

  echo "Applying: $filename"
  psql -v ON_ERROR_STOP=1 --single-transaction --file "$migration"
  psql -v ON_ERROR_STOP=1 -v filename="$filename" \
    --command "INSERT INTO schema_migrations (filename) VALUES (:'filename');"
done

echo "Database migrations completed successfully."
