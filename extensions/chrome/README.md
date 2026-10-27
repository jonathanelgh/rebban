# Rebban (Chrome)

Load this folder as an unpacked Chrome extension:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select `extensions/chrome`
4. After updates, click **Reload** on the extension card

The toolbar icon opens a **side panel** (like ChatGPT), not a small popup.

Host access for Rebban + Supabase is always on. **From this page** / save-lead may ask Chrome for permission to read the site you’re on (needed for email and other tabs while the side panel stays open).

## Features

- Start / stop the same timer as app.rebban.com
- **Alt+Shift+R** toggles the timer (uses the matched tab client, or your last client)
- Today + this week hours
- Auto-selects a client when the current tab matches their website
- **Save page as lead** — reads the person’s name (and company on LinkedIn) from the page, and any visible email / mailto
- **Proposal** — detects the page from the URL:
  - **Upwork / Freelancer** → proposal text to copy into the marketplace
  - **Email (Gmail etc.)** → creates a real Rebban proposal (finds or creates lead/client from the sender)
  - Other pages → same proposal flow from the page text
  Edit proposal profile in Settings → Profile or in the extension.
- Toolbar badge shows timer minutes, or unread money alerts / overdue invoices when idle

## Sign in

- Email + password in the side panel, or
- Stay signed in at app.rebban.com in this Chrome profile (Google accounts)
