# Rebban Timer (Chrome)

Load this folder as an unpacked Chrome extension:

1. Open `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked** and select `extensions/chrome`
4. After updates, click **Reload** on the extension card

Host access is limited to Rebban + Supabase. Reading the current page (save lead / client match scrape) uses **activeTab**, so it only runs after you open the extension.

## Features

- Start / stop the same timer as app.rebban.com
- **Alt+Shift+R** toggles the timer (uses the matched tab client, or your last client)
- Today + this week hours in the popup
- Auto-selects a client when the current tab matches their website
- **Save page as lead** — reads the person’s name (and company on LinkedIn) from the page, and any visible email / mailto
- Toolbar badge shows timer minutes, or unread money alerts / overdue invoices when idle

## Sign in

- Email + password in the popup, or
- Stay signed in at app.rebban.com in this Chrome profile (Google accounts)
