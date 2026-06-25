## Goal

Replace the client-only `localStorage` model in `src/HRApp.jsx` with a real backend on **Lovable Cloud** (Supabase under the hood). After this change:

- Login uses Supabase Auth (email + password), not an in-memory `employees` array.
- Roles live in a separate `user_roles` table and are enforced server-side via RLS.
- All employee, balance, leave-type, request, and audit data lives in Postgres, not `localStorage`.
- The `client_side_auth_bypass` and `hardcoded_credentials` findings are genuinely resolved (no plaintext passwords in the bundle, no client-only role checks).

## Step 1 — Enable Lovable Cloud

Provision the backend (database, auth, storage, server functions) for this project. After this, the Cloud-managed Supabase client and `_authenticated` route gate become available.

## Step 2 — Database schema (one migration)

Tables in `public`, all with explicit GRANTs and RLS enabled:

- `profiles` — `id uuid PK references auth.users on delete cascade`, `email`, `full_name`, `department`, `position`, `employee_no`, `hire_date`, `created_at`. Trigger `handle_new_user()` auto-creates a row on signup.
- `app_role` enum: `'admin' | 'employee'`.
- `user_roles` — `(user_id, role)` unique; read by security-definer `has_role(_user_id, _role)`.
- `leave_types` — `id`, `name`, `code`, `default_credits_hours`, `is_active`. Admin-managed; readable by all authenticated users.
- `leave_balances` — `(user_id, leave_type_id)` unique, `credits_hours`, `used_hours`, `offset_used_hours`, `updated_at`.
- `ot_duty_credits` — per-user OT/duty credit ledger entries (date, hours, source, note) so the "Remaining OT/Duty Credits" math becomes a server-side sum, not a client field.
- `requests` — `id`, `user_id`, `type` (`'leave' | 'ot_offset' | 'duty_offset' | 'other'`), `leave_type_id` (nullable), `start_date`, `end_date`, `start_time`, `end_time`, `hours`, `days`, `reason`, `status` (`'pending' | 'approved' | 'rejected'`), `decided_by`, `decided_at`, `created_at`.
- `audit_log` — append-only `(actor_id, action, target_table, target_id, payload jsonb, created_at)` for approvals/rejections/password resets.

### RLS policies (high level)

- `profiles`: user can SELECT/UPDATE own row; admin (via `has_role`) can SELECT/UPDATE all.
- `user_roles`: SELECT own; only admin can INSERT/DELETE.
- `leave_types`: SELECT for all authenticated; INSERT/UPDATE/DELETE admin only.
- `leave_balances`: user SELECT own; admin SELECT/UPDATE all. Mutations from approvals go through a security-definer function so balance math can't be tampered with from the client.
- `requests`: user SELECT/INSERT own; user UPDATE own only while `status = 'pending'`; admin SELECT all and UPDATE status/decided_by/decided_at.
- `audit_log`: INSERT via security-definer functions only; SELECT admin only.

Every `CREATE TABLE` is followed by `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` and `GRANT ALL ... TO service_role` in the same migration (no `anon` grants — this app has no public surface).

## Step 3 — Server functions (`src/lib/*.functions.ts`)

Thin RPC layer using `createServerFn` + `requireSupabaseAuth`:

- `listEmployees`, `getMyProfile`, `updateMyProfile`
- `listLeaveTypes`, `upsertLeaveType` (admin), `deleteLeaveType` (admin)
- `getMyBalances`, `getAllBalances` (admin)
- `listMyRequests`, `listAllRequests` (admin), `createRequest`, `cancelMyPendingRequest`
- `approveRequest` / `rejectRequest` (admin) — wrap a Postgres function that atomically updates request status AND adjusts the user's balance, writing an `audit_log` row.
- `adminResetPassword` / `adminDeleteAccount` — admin-only, verify `has_role(auth.uid(), 'admin')` then call the Supabase Auth Admin API via `supabaseAdmin` loaded inside the handler.
- `exportAllDataForExcel` (admin) — returns the rows the existing Excel export needs.

All admin-only functions re-check `has_role` server-side; RLS is the second line of defense.

## Step 4 — Auth UI and route structure

- New public route `src/routes/auth.tsx`: email/password sign-in and sign-up forms.
- Move the entire HR app under the integration-managed `src/routes/_authenticated/` subtree so the gate redirects unauthenticated users to `/auth`.
- Add a one-time **admin bootstrap**: a server function that grants `admin` role to the first user who signs up if no admin exists yet (so there's a real first-run flow instead of seeded passwords).
- Remove `SEED_EMPLOYEES`, plaintext password fields, and all role checks based on local React state.

## Step 5 — Migrate `HRApp.jsx` data flow

Replace every `useState` + `localStorage` block with TanStack Query reads against the server functions above. Mutations (create request, approve, reject, update leave type, edit balance) become `useMutation` calls that invalidate the relevant queries. Excel export keeps the same column layout but is fed by `exportAllDataForExcel`.

## Step 6 — Cleanup & verification

- Delete `SEED_EMPLOYEES`, the `accounts` array, `handleLogin` password compare, and any code that reads/writes the old `localStorage` keys.
- Verify in the preview: sign up → first user becomes admin → admin creates leave types → second user signs up as employee → submits request → admin approves → balance updates → Excel export still works.
- Re-run the security scan; both findings should clear.

## Out of scope (call out for confirmation)

- **Data migration of existing `localStorage` data** to the new DB. Because data only ever lived in individual browsers, there's nothing central to migrate; users start fresh. If you want a one-time "import my localStorage" button I can add it after the core migration lands.
- Email-based password reset flow (can be added in a follow-up; the admin reset path covers the immediate need).
- SSO / Google sign-in (not requested; email/password only).

## Technical notes

- `src/HRApp.jsx` becomes much smaller — purely presentational components plus TanStack Query hooks.
- No `supabaseAdmin` import at module scope in any `.functions.ts` file; loaded inside handlers with `await import('@/integrations/supabase/client.server')`.
- Balance mutations live in Postgres functions (`SECURITY DEFINER`) so approval math is atomic and can't be skipped by a malicious client.
- The `_authenticated` layout is integration-managed; I won't author it.

Approve this and I'll start with Step 1 (enable Cloud) and Step 2 (schema migration) in the next turn.