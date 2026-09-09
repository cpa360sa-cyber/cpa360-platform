import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm";

const env = window.__CPA360_ENV || {};

if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || env.SUPABASE_URL.includes("YOUR-PROJECT")) {
  const r = document.getElementById("root");
  if (r) r.innerHTML =
    '<div class="auth-wrap"><div class="auth-card"><h1>Configuration needed</h1>' +
    '<p class="sub">Copy <code>config.example.js</code> to <code>config.js</code> and fill in your ' +
    "Supabase project URL and anon key (Project Settings &rarr; API).</p></div></div>";
  throw new Error("CPA360: missing config.js — copy config.example.js to config.js");
}

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const FUNCTIONS_URL =
  env.FUNCTIONS_URL || env.SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1";
