#!/usr/bin/env bash
# Astra AI — PostgreSQL Local Database Initialization Script
set -e

DB_NAME="astra_ai"
DB_USER="astra_user"
DB_PASS="astra_pass"

echo "Initializing Astra AI database: $DB_NAME..."

psql -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';" || true
psql -U postgres -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;" || true
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" || true

echo "Database $DB_NAME ready. Connection string: postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME"
