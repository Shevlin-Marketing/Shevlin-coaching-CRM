# What's new (v2) & how to switch it on

This release upgrades the look and adds five functional features. The app keeps working without any of the steps below — but two features need a one-time database migration, and one needs an optional setting.

## Visual
The whole interface moved to the **Obsidian** theme — animated depth, glass panels, sparklines, and smoother motion. No action needed; just re-upload `app.js`, `styles.css`, and `index.html`, and hard-refresh (private tab) to clear the cache.

## New features

**1. Date range filter** — Dashboard and Reports now have a range selector (This week / 30 days / This month / All time). Metrics, charts, and reports all respect it. Works out of the box.

**2. Sparklines + trend deltas** — metric cards show a 6-week mini-trend and a vs-previous-period delta. Works out of the box.

**3. "Needs attention" panel** (Dashboard) — surfaces leads with no contact in 7+ days and no-shows awaiting a chase, so the CRM prompts action instead of just recording it. Works out of the box. *(Most accurate once you fill in "Last contact" dates on leads.)*

**4. Board search + tier filter** — both pipelines have a live search box and a tier filter. Works out of the box.

**5. Close notification + SOP enforcement** — when a deal is marked **Closed Won**, the app stamps the close time, opens a quick checklist (Stripe sent / Ayden notified), and — if you set a webhook — pings you instantly.
- To get the ping: in `config.js`, set `CLOSE_WEBHOOK` to a webhook URL. Easiest is a free Zapier or Make "catch hook," or a Slack incoming webhook. Leave it blank to skip; the in-app checklist still works.

## One-time database migration (enables activity tracking + accurate revenue dates)

Run **`schema-v2.sql`** once in Supabase (SQL Editor → New query → paste → Run). It:
- adds a `closed_at` column so "revenue this month" is dated by when deals actually closed (and backfills existing ones), and
- adds an **activities** table so setters can log outreach.

After running it:
- Setters get a **"Log activity"** button on the Leads page to record daily outreach and replies.
- Reports gains a **Leading indicators** section (outreach, replies, reply rate per setter) — the predictive numbers that flag problems weeks before close rate does.

If you skip the migration, the app still runs; the activity button and leading-indicators panel will just tell you the migration is needed.

## Apply-form de-duplication
The `apply-lead` function now checks for an existing lead by email and updates it (tagging it as a re-application) instead of creating a duplicate. If you've already deployed the function, redeploy it with the updated `supabase/functions/apply-lead/index.ts`.

## Re-deploy checklist
- [ ] Re-upload `app.js`, `styles.css`, `index.html` to GitHub
- [ ] Run `schema-v2.sql` in Supabase (for activity tracking + close dates)
- [ ] (Optional) set `CLOSE_WEBHOOK` in `config.js`
- [ ] (If using the apply form) redeploy the `apply-lead` function
- [ ] Hard-refresh / private tab to clear the cache — login screen should read **build 5**
