# Supabase authentication — preflight check

Status: WORKING / verified 2026-10-29 by successful manual GitHub Actions run.

This is shared authentication infrastructure, not an Ewa-only service.

- Supabase project: Property Picker Auth
- Project ID: xlppvlzgvncwijjiavpa
- Free tier: keepalive is best-effort, not a guarantee against pausing
- Keepalive workflow: .github/workflows/supabase-keepalive.yml
- Schedule: daily 08:17 UTC, with manual workflow_dispatch
- GitHub repository secrets: SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY
- RPC: public.keepalive(), returns integer 1 and doesn't access app records
- Access: EXECUTE on this harmless RPC was ultimately granted to PUBLIC to resolve PostgREST HTTP 403 / PostgreSQL 42501
- Do not expand permissions on other functions or tables to troubleshoot this RPC

## Include in HeadlessChicken preflight

Canonical local preflight script: C:\Worker\jobs\archive-preflight.ps1 (HeadlessChicken).
This markdown is a record for incorporating the following checks in that script; it does not modify the machine's local script.

1. Confirm the original project still exists and is not paused: https://supabase.com/dashboard/project/xlppvlzgvncwijjiavpa
2. Review latest GitHub Actions keepalive run: https://github.com/WorkCleyton/ewa-property-picker-lite/actions/workflows/supabase-keepalive.yml
3. Check latest scheduled run has completed successfully in the last ~48 hours; distinguish missed schedule vs failed run.
4. On failure, inspect HTTP status, Postgres error code and sanitized detail. Previous cause: 403 / 42501 / permission denied for function keepalive.
5. Confirm Property Picker login still works; a successful RPC alone does not verify authentication.
6. Never expose or print repository secret values.

Failure status: not verified/needs attention, don't claim free-tier availability guarantees.
