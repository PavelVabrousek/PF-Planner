@echo off
rem Sets environment variables for scripts\import_google_portfolio.py.
rem Run this from cmd.exe with:
rem   call scripts\set_pfp_import_env.bat
rem
rem This sets variables only for the current terminal session.
rem Do not commit real passwords or private user ids into the repository.

set "PFP_SUPABASE_DB_PASSWORD=replace-with-db-password"
set "PFP_SUPABASE_USER_ID=replace-with-auth-user-uuid"

set "PFP_SUPABASE_PROJECT_REF=replace-with-project-ref"
set "PFP_SUPABASE_POOLER_HOST=replace-with-pooler-host"
set "PFP_SUPABASE_DATABASE_URL="

set "PFP_PORTFOLIO_NAME=Google Portfolio Import"
set "PFP_BASE_CURRENCY=CZK"

echo PFP importer environment variables are set for this terminal session.
echo Project ref: %PFP_SUPABASE_PROJECT_REF%
echo Pooler host: %PFP_SUPABASE_POOLER_HOST%

