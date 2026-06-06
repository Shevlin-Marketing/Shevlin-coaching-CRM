# Auto-create leads from your application form

Your `apply.html` already collects everything and posts to Formspree. This adds one more line so each submission also lands in the CRM automatically as a lead at **Form Submitted** — with all the qualifying answers in the lead's notes, ready for Ayden to read and convert.

The bridge is a small Supabase **Edge Function** (`supabase/functions/apply-lead/index.ts`). The form posts the data straight to it.

---

## Step 1 — Deploy the function

1. In Supabase: **Edge Functions → Create a function**, name it exactly `apply-lead`.
2. Paste in the contents of `supabase/functions/apply-lead/index.ts`. Deploy.

## Step 2 — Add two secrets

In **Edge Functions → Secrets** (or Project Settings → Edge Functions), add:

- `FORM_SECRET` — invent a random string, e.g. `shevlin_8f3kd9`
- `SUPABASE_SERVICE_ROLE_KEY` — from **Project Settings → API**, the **service_role** key

`SUPABASE_URL` is set automatically. The service_role key lets the function write past Row Level Security — it lives only here on the server, never in your repo.

Your function URL will be:
```
https://YOUR-PROJECT.supabase.co/functions/v1/apply-lead?key=shevlin_8f3kd9
```

## Step 3 — Point the apply form at it

In `apply.html`, find the `submitForm()` function. It already builds a `data` object and does `fetch('https://formspree.io/f/mrejdprg', …)`. Right **after** that fetch, add a second one:

```js
// also create a CRM lead
fetch('https://YOUR-PROJECT.supabase.co/functions/v1/apply-lead?key=shevlin_8f3kd9', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
}).catch(() => {});
```

That's it. Formspree still gets the submission (your email notification); the CRM now gets it too. The field names already match — no changes to your form fields needed.

---

## How a submission maps to the lead

| Form field | Lead |
|---|---|
| name | Name |
| email | Contact link |
| tier (tier1/2/3) | Tier |
| — | Platform = "Application Form", Status = "Form Submitted" |
| phone, location, role, income, seriousness, readiness, source, situation, goal, obstacle, extra | All combined into Notes |

The lead arrives **unassigned** (no sourcing setter), which is correct for an inbound application — Ayden reviews it, books the call, and converts it to a deal.

---

## Security note

Because the form runs in the browser, the `?key=` value is visible to anyone who views the page source. It's a light deterrent, not a lock. Worst case if someone abuses it is junk leads, which an admin can delete. Two ways to harden later if you want:

- **Rotate the key** anytime by changing `FORM_SECRET` and the URL.
- **Route through Formspree's webhook instead** (Formspree → your form → Plugins/Integrations → Webhook → paste the function URL). Then the key stays server-side and never appears in the page. This needs a Formspree plan that includes webhooks — check their current plans.

For an internal application form, the direct approach above is the normal, practical choice.
