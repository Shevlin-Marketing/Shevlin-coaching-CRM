# Shevlin Coaching CRM

A lean, self-hosted CRM built around the Shevlin setter → closer system. Static front-end (no build step) plus a free Supabase backend for shared data, logins, and role-based access.

- **Setter pipeline** (Leads): new → contacted → responding → details shared → form submitted
- **Closer pipeline** (Deals): call booked → pending → closed won, plus no-show / cancelled states
- **Convert** turns a submitted lead into a closer deal and stamps the **sourcing setter** for commission attribution
- **Roles**: setter, closer, coach, admin (Ayden) — enforced in the database, not just the UI
- **Dashboard**: setter and closer metrics, close rate, revenue, close-rate-under-30% review flag

---

## What you need

- A free [GitHub](https://github.com) account
- A free [Supabase](https://supabase.com) account
- 30–45 minutes, once

---

## Step 1 — Create the Supabase project

1. Go to supabase.com → **New project**. Pick a name and a strong database password. Choose the region closest to your team.
2. Wait for it to finish provisioning (~2 min).

## Step 2 — Build the database

1. In Supabase, open **SQL Editor → New query**.
2. Open `schema.sql` from this repo, copy everything, paste it in, and click **Run**. This creates the tables, roles, security rules, and triggers.

## Step 3 — Get your keys

1. In Supabase, go to **Project Settings → API**.
2. Copy the **Project URL** and the **anon / public** key.
3. In this repo, copy `config.example.js` to a new file named `config.js` and paste both values in:
   ```js
   window.CRM_CONFIG = {
     SUPABASE_URL: "https://yourproject.supabase.co",
     SUPABASE_ANON_KEY: "eyJhbGci...your anon key...",
   };
   ```
   The anon key is safe to commit — Row Level Security is what actually protects your data.

## Step 4 — Put it on GitHub

1. Create a new repository on GitHub.
2. Upload all the files in this folder (drag-and-drop works: **Add file → Upload files**), including your filled-in `config.js`.

## Step 5 — Deploy it (free)

Easiest is **Netlify** or **Vercel**:

1. Go to [netlify.com](https://netlify.com) → **Add new site → Import from GitHub** → pick your repo.
2. No build command needed. Publish directory: the repo root. Click **Deploy**.
3. You get a live URL (e.g. `shevlin-crm.netlify.app`). That's the link your team uses.

*(GitHub Pages also works — Settings → Pages → deploy from your main branch.)*

## Step 6 — Make yourself admin

1. Open the live site and **Create account** (this is Ayden's login).
2. If Supabase has email confirmation on, confirm via the email, then sign in.
3. Back in Supabase **SQL Editor**, run this once (with your email):
   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```
4. Reload the site — you'll now see the **Team** tab. Everyone else signs up, then you set their role there.

---

## Day-to-day

- **Setters** create leads and drag them across the board. When a lead hits **Form Submitted**, a **Convert →** button appears — that creates the closer deal and records who sourced it.
- **Closers / Ayden** work the Deals board, tick the Stripe-sent and Ayden-notified boxes on close.
- **Dashboard** updates live for everyone, scoped to what their role can see.

## Notes & limits

- This is a focused pipeline CRM. It does not send emails, auto-dial, or run marketing automation.
- Tiers default to £2,500 / £5,000 / £10,000 — change these in `app.js` (the `TIERS` constant) if your pricing differs.
- Want email confirmation off for faster onboarding? Supabase → **Authentication → Providers → Email** → toggle "Confirm email."
- You own all of this. Anything here can be changed — it's plain HTML, CSS, and JavaScript.

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | All app logic (auth, pipelines, dashboard, admin) |
| `styles.css` | Styling |
| `supabaseClient.js` | Connects to Supabase |
| `config.example.js` | Template for your keys → copy to `config.js` |
| `schema.sql` | Database tables + security rules |
