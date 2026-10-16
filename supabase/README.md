# Supabase (Rebban)

Project: `rebban` (`cvqcanrdvtzovbmfhiwz`, region `eu-west-1`)

Schema is applied via Supabase MCP migrations. Regenerate TypeScript types with the MCP `generate_typescript_types` tool and replace `src/types/database.ts`.

## Signup metadata

`auth.users` trigger `handle_new_user` reads:

- `full_name` (also accepts Google’s `name`)
- `avatar_url` / `picture` (Google)
- `organization_name`
- `organization_type` (`solo` | `agency`)

## Google login / signup (Supabase Auth)

UI: **Continue with Google** on `/login` and **Sign up with Google** on `/signup`.

1. [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → your OAuth **Web** client  
   - Authorized JavaScript origins: `http://localhost:3001`, `https://app.rebban.com`  
   - Authorized redirect URIs must include:  
     `https://cvqcanrdvtzovbmfhiwz.supabase.co/auth/v1/callback`  
     (keep your Gmail-send redirect `…/api/gmail/callback` on the same client if you use it)
2. Supabase Dashboard → **Authentication → Providers → Google** → enable  
   - paste the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
3. Supabase → **Authentication → URL configuration** (this is what controls the post-Google redirect):  
   - **Site URL:** `https://app.rebban.com`  
     (If this is still `http://localhost:…`, Google auth will send users to localhost.)  
   - **Redirect URLs** allow list — add all of these:  
     `https://app.rebban.com/auth/callback`  
     `https://app.rebban.com/**`  
     `http://localhost:3001/auth/callback`  
     `http://localhost:3001/**`  
   Password reset emails use `…/auth/callback?next=/reset-password` (same allow list).

4. Vercel / `.env`: `NEXT_PUBLIC_APP_URL=https://app.rebban.com`  
   The Google button uses this for `redirectTo`.

5. Google Cloud OAuth client → Authorized JavaScript origins / redirect URIs:  
   - Origin: `https://app.rebban.com`  
   - Redirect (Supabase): `https://cvqcanrdvtzovbmfhiwz.supabase.co/auth/v1/callback`

Signup with Google respects freelancer/agency + workspace name chosen on the signup screen (applied right after the first OAuth session).

## Platform admins

Owner console lives at `/admin` (overview + workspaces). Access is gated by
`public.is_platform_admin()` and the `platform_admins` table.

Insert via SQL (service role / dashboard only):

```sql
insert into public.platform_admins (user_id, notes)
values ('<auth-user-uuid>', 'Rebban staff')
on conflict (user_id) do update
set notes = excluded.notes,
    revoked_at = null;
```

Admin APIs (`/api/admin/*`) verify the session with `is_platform_admin`, then
read cross-tenant rows via existing RLS (`is_platform_admin()` on orgs /
profiles / members). Non-admins are redirected to `/`.

## Storage path conventions

- `avatars/{user_id}/...`
- `org-assets/{organization_id}/...`
- `org-assets/{organization_id}/clients/{client_id}/logo.*`

## Proposal templates

- System templates live in `proposal_templates` with `is_system = true` (readable by all authenticated users).
- Workspace templates use `organization_id` and appear under **Yours** on the template picker.
- Save a designed proposal from the editor with **Save as template**.

## Proposal send / e-sign / follow-ups

Env vars:

- `NEXT_PUBLIC_APP_URL` — public app URL used in proposal links
- `RESEND_API_KEY` — Resend API key
- `RESEND_FROM_EMAIL` — verified sender
- `SUPABASE_SERVICE_ROLE_KEY` — used by the follow-up cron job
- `CRON_SECRET` — shared secret for `/api/cron/proposal-followups` and `/api/cron/invoice-reminders`

Flow:

1. Freelancer sends via a 3-step modal (recipient → automation sequence → email message)
2. Resend emails `/p/{token}`; optional follow-ups are stored in `proposal_followups`
3. Hourly cron (`vercel.json`) hits `/api/cron/proposal-followups` to send due reminders
4. Accept/decline cancels pending follow-ups automatically
5. Client open/sign/decline updates status + alerts + activity log

Invoice payment reminders:

1. Freelancer sends via a 3-step modal (recipient → reminder sequence → email message)
2. Reminders are scheduled relative to `due_date` in `invoice_reminders`
3. Hourly cron hits `/api/cron/invoice-reminders`
4. Paid / void cancels pending reminders automatically

Manual cron test:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/cron/proposal-followups"
curl -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/cron/invoice-reminders"
```

## Gmail sending

Freelancers can connect Gmail in **Settings → Integrations**. Proposal invites and follow-ups then send from their Gmail address (Resend remains the fallback).

Google Cloud setup:

1. Create an OAuth client (Web application)
2. **Google Cloud → Credentials → OAuth client → Authorized redirect URIs** must include exactly:
   - `https://app.rebban.com/api/gmail/callback`
   - `http://localhost:3001/api/gmail/callback` (local only)
   Changing a value in Vercel does **not** register it with Google. `redirect_uri_mismatch` means this list is wrong/missing.
3. Enable Gmail API
4. Vercel env: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXT_PUBLIC_APP_URL=https://app.rebban.com`
5. Leave `GOOGLE_GMAIL_REDIRECT_URI` unset in Vercel (prod uses `NEXT_PUBLIC_APP_URL`)

## Internal outreach Gmail (admin leads)

Platform admins use a **separate** OAuth connection for founder outreach (`outreach_gmail_connections`), so tenant proposal-sending Gmail stays isolated.

Same env vars as freelancer Gmail:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL` (or `APP_URL`) — used to build the outreach redirect URI in production

Add these redirect URIs on the same Google OAuth client:

- `https://app.rebban.com/api/admin/outreach-gmail/callback`
- `http://localhost:3000/api/admin/outreach-gmail/callback` (and/or `:3001` if that is your local port)

OAuth scopes requested for outreach: `gmail.send` + `gmail.readonly` (required for reply sync).

Admin UI: sidebar Users / Leads / Insights / Settings. Leads at `/admin/leads`, outreach controls at `/admin/settings?section=outreach`.

Additional env:

- `OPENAI_API_KEY` — reply analysis + suggested drafts (optional until you sync replies)
- `OPENAI_OUTREACH_MODEL` — optional, default `gpt-4o-mini`
- `SUPABASE_SERVICE_ROLE_KEY` — required for outreach cron jobs
- `CRON_SECRET` — authorizes `/api/cron/outreach-sync` and `/api/cron/outreach-queue`

Crons (see `vercel.json`):

- `/api/cron/outreach-sync` every 15 minutes — Gmail reply sync, AI analysis, follow-up prep
- `/api/cron/outreach-queue` every 20 minutes — processes queued sends when sending_enabled + window/limit allow

Manual: lead detail **Sync replies**, settings **Sync replies now**, list **Send email**.

## Outlook / Microsoft 365 sending

Same Integrations UI and send path as Gmail. If Outlook is connected, mail sends via Microsoft Graph first; otherwise Gmail; otherwise Resend.

Azure App Registration setup:

1. [Azure Portal](https://portal.azure.com/) → Microsoft Entra ID → App registrations → New registration
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
3. Redirect URIs (Web):
   - `https://app.rebban.com/api/outlook/callback`
   - `http://localhost:3001/api/outlook/callback` (local only)
4. Certificates & secrets → New client secret
5. API permissions → Microsoft Graph (delegated): `Mail.Send`, `User.Read`, `offline_access` → Grant admin consent if required
6. Vercel / `.env.local`: `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`
7. Leave `MICROSOFT_OUTLOOK_REDIRECT_URI` unset unless you need an override
