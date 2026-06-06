// Copy this file to "config.js" and fill in your two Supabase values.
// Find them in Supabase: Project Settings → API.
// The anon key is safe to expose — Row Level Security protects your data.
window.CRM_CONFIG = {
  SUPABASE_URL: "https://YOUR-PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-ANON-PUBLIC-KEY",

  // OPTIONAL — paste a webhook URL (Zapier/Make/Slack/your own) to get a ping
  // every time a deal is marked Closed Won. Leave empty to disable.
  CLOSE_WEBHOOK: "",
};
