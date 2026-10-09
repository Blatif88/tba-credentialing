# TBA Credentialing database change management

## Current state (2026-10-09)

- Existing main project: `kjuxfjufoxlxhpoainnq`; schema and historical migrations reside remotely.
- Dedicated staging project: `wghvuevqufjvutlrcfzn`; currently has no app tables or migration history.
- Versioned function snapshot: `database/patches/2026-10-09_record_activation_channel.sql`.
- Rollback-only regression suite: `database/tests/activation_channels_regression.sql`.

**Do not run `supabase db reset --linked` or `supabase db push` on the main project.** The remote has historical migrations absent from this repository. Reconciling those is a separate task.

## Baseline plan

1. Install the current Supabase CLI locally and initialize `supabase/` in the application checkout.
2. Authenticate and link the **main project read-only for schema capture**, using `supabase link --project-ref kjuxfjufoxlxhpoainnq`.
3. Use `supabase db pull` to generate and review the baseline. Check the migration history/CLI prompts carefully because this project already has historical migration records.
4. Audit the generated SQL for secrets, role grants, destructive statements, and auto-generated extension changes. Do not commit confidential data.
5. Only after a reliable baseline is established, link the dedicated staging project and apply reviewed migrations there.
6. Create a synthetic tenant, test user, project, enrollment case, and prerequisite operational-completion evidence in staging.
7. Run the regression test with `psql -v case_id=<staging-test-case-uuid> -v user_id=<staging-test-user-uuid> -f database/tests/activation_channels_regression.sql`. This test always ends in ROLLBACK.

The function SQL snapshot is meant for **existing compatible schemas** and is not itself a full schema migration. The regression suite has been committed but not yet run against staging.

## Security follow-ups

Before production deployment: require meaningful payer evidence/references, manager review when channels are Not Applicable, enable leaked-password protection, configure reliable SMTP password recovery, and add role/cross-tenant RLS tests.
