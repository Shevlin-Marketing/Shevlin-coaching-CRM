// Shevlin CRM — application form -> lead
// Receives the JSON your apply.html already builds and inserts a lead
// at status "form_submitted", with all qualifying answers in notes.
//
// Deploy: Supabase dashboard -> Edge Functions -> create "apply-lead" -> paste -> deploy
// Secrets needed (Edge Functions -> Secrets):
//   FORM_SECRET                = a random string you choose (e.g. shevlin_8f3kd9)
//   SUPABASE_SERVICE_ROLE_KEY  = Project Settings -> API -> service_role key (keep secret)
// SUPABASE_URL is provided automatically.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

const TIER_MAP: Record<string, string> = {
  tier1: "tier_1", tier2: "tier_2", tier3: "tier_3",
  "tier 1": "tier_1", "tier 2": "tier_2", "tier 3": "tier_3",
  "2500": "tier_1", "5000": "tier_2", "10000": "tier_3",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: cors });

  // shared-secret check (?key=...) — light deterrent against spam
  const key = new URL(req.url).searchParams.get("key");
  if (key !== Deno.env.get("FORM_SECRET"))
    return new Response("Unauthorized", { status: 401, headers: cors });

  // Formspree webhooks nest fields; direct posts are flat. Handle both.
  const raw = await req.json().catch(() => ({}));
  const f = raw.data && typeof raw.data === "object" ? raw.data : raw;

  const name = (f.name || f.full_name || "").toString().trim();
  const email = (f.email || "").toString().trim();
  if (!name || !email)
    return new Response(JSON.stringify({ error: "name and email required" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });

  const tier = TIER_MAP[(f.tier || "").toString().toLowerCase().trim()] || null;

  const notes = [
    f.submittedAt ? `Application submitted ${f.submittedAt}` : null,
    f.phone ? `Phone: ${f.phone}` : null,
    f.location ? `Location: ${f.location}` : null,
    f.role ? `Role: ${f.role}` : null,
    f.income ? `Income: ${f.income}` : null,
    f.seriousness ? `Seriousness: ${f.seriousness}/10` : null,
    f.readiness ? `Move forward in 7 days: ${f.readiness}` : null,
    f.source ? `Heard via: ${f.source}` : null,
    f.situation ? `\nSituation: ${f.situation}` : null,
    f.goal ? `12-month goal: ${f.goal}` : null,
    f.obstacle ? `Biggest blocker: ${f.obstacle}` : null,
    f.extra ? `Extra: ${f.extra}` : null,
  ].filter(Boolean).join("\n");

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { error } = await supabase.from("leads").insert({
    name,
    platform: "Application Form",
    contact_link: email,
    tier,
    status: "form_submitted",
    next_action: "Review application & book call",
    notes,
    affordability_ok: true,
  });

  if (error)
    return new Response(JSON.stringify(error), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...cors, "Content-Type": "application/json" },
  });
});
