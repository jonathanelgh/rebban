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
   - Authorized JavaScript origins: `http://localhost:3001`, `https://rebban.com`  
   - Authorized redirect URIs must include:  
     `https://cvqcanrdvtzovbmfhiwz.supabase.co/auth/v1/callback`  
     (keep your Gmail-send redirect `…/api/gmail/callback` on the same client if you use it)
2. Supabase Dashboard → **Authentication → Providers → Google** → enable  
   - paste the same `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
3. Supabase → **Authentication → URL configuration**  
   - **Site URL** must match the app you’re actually using (wrong port = broken Google login):  
     - local: `http://localhost:3001` (Next often skips 3000 if it’s taken)  
     - prod: `https://rebban.com`  
   - **Redirect URLs** allow list (add all you use):  
     `http://localhost:3001/auth/callback`  
     `http://localhost:3001/**`  
     `https://rebban.com/auth/callback`  
     `https://rebban.com/**`  

If Google returns you to `http://localhost:3000/?code=…`, Site URL is still on port 3000 — change it to 3001 (or run the app on 3000).

Signup with Google respects freelancer/agency + workspace name chosen on the signup screen (applied right after the first OAuth session).

## Platform admins

Insert via SQL (service role / dashboard only):

```sql
insert into public.platform_admins (user_id, notes)
values ('<auth-user-uuid>', 'Rebban staff');
```

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
- `CRON_SECRET` — shared secret for `/api/cron/proposal-followups`

Flow:

1. Freelancer sends via a 3-step modal (recipient → automation sequence → email message)
2. Resend emails `/p/{token}`; optional follow-ups are stored in `proposal_followups`
3. Hourly cron (`vercel.json`) hits `/api/cron/proposal-followups` to send due reminders
4. Accept/decline cancels pending follow-ups automatically
5. Client open/sign/decline updates status + alerts + activity log

Manual cron test:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" "$NEXT_PUBLIC_APP_URL/api/cron/proposal-followups"
```

## Gmail sending

Freelancers can connect Gmail in **Settings → Integrations**. Proposal invites and follow-ups then send from their Gmail address (Resend remains the fallback).

Google Cloud setup:

1. Create an OAuth client (Web application)
2. Authorized redirect URI: `{APP_URL}/api/gmail/callback` (for local: same host/port as `NEXT_PUBLIC_APP_URL`, e.g. `http://localhost:3001/api/gmail/callback`)
3. Enable Gmail API
4. Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and matching `GOOGLE_GMAIL_REDIRECT_URI` / `NEXT_PUBLIC_APP_URL`
