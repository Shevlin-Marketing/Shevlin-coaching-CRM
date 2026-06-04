import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const cfg = window.CRM_CONFIG || {};
if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("YOUR-PROJECT")) {
  document.body.innerHTML =
    '<div style="font-family:system-ui;max-width:540px;margin:80px auto;padding:32px;' +
    'background:#161b2e;color:#e7e9f0;border:1px solid #2a3148;border-radius:14px;line-height:1.6">' +
    "<h2 style='margin-top:0'>Setup needed</h2>" +
    "<p>Copy <code>config.example.js</code> to <code>config.js</code> and add your Supabase URL and anon key " +
    "(Supabase → Project Settings → API), then reload.</p></div>";
  throw new Error("CRM_CONFIG missing");
}

export const supabase = createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
