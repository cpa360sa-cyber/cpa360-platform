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

/* Loading a CPA fires ~60 REST reads at once. On some connections a few of them are
   silently dropped (no response, no error), and because nothing timed out, Promise.all
   waited forever — an endless "Loading…". So REST reads now (1) run at most REST_SLOTS at a
   time, (2) give up on a request that gets no response headers within TTFB_MS, and
   (3) retry it up to RETRIES times. Writes, auth and storage calls are left untouched. */
const REST_SLOTS = 8, TTFB_MS = 20000, RETRIES = 2;
let active = 0;
const waiting = [];
const acquire = () => new Promise((res) => { if (active < REST_SLOTS) { active++; res(); } else waiting.push(res); });
const release = () => { const next = waiting.shift(); if (next) next(); else active--; };

/* Wrong-clock protection. The login server says when a token expires ("expires_at", in ITS clock) and the
   library compares that with the DEVICE's clock. On a computer whose clock is more than ~an hour ahead, every
   brand-new token already looks expired, so the app refreshes it again straight away — about once a second —
   until the server's rate limit kicks in and the person is signed out, then signs in again and it repeats.
   So for sessions we drop the server's timestamp: the library then works it out as "now (device clock) +
   expires_in", which is correct on any clock because only the elapsed time matters. */
async function localExpiry(res) {
  try {
    if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return res;
    const data = await res.clone().json();
    if (!data || typeof data.expires_in !== "number" || !("access_token" in data)) return res;
    delete data.expires_at;
    return new Response(JSON.stringify(data), { status: res.status, statusText: res.statusText, headers: res.headers });
  } catch (e) { return res; }
}

async function resilientFetch(input, init = {}) {
  const url = typeof input === "string" ? input : input.url;
  const method = String(init.method || (typeof input !== "string" && input.method) || "GET").toUpperCase();
  if (url.includes("/auth/v1/")) return localExpiry(await fetch(input, init));
  if (!((method === "GET" || method === "HEAD") && url.includes("/rest/v1/"))) return fetch(input, init);
  await acquire();
  try {
    for (let attempt = 0; ; attempt++) {
      const outer = init.signal;
      if (outer && outer.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const ctrl = new AbortController();
      const onAbort = () => ctrl.abort();
      if (outer) outer.addEventListener("abort", onAbort, { once: true });
      const timer = setTimeout(() => ctrl.abort(), TTFB_MS);
      try {
        const res = await fetch(input, { ...init, signal: ctrl.signal });
        clearTimeout(timer);
        return res;
      } catch (e) {
        clearTimeout(timer);
        if ((outer && outer.aborted) || attempt >= RETRIES) throw e;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      } finally {
        if (outer) outer.removeEventListener("abort", onAbort);
      }
    }
  } finally {
    release();
  }
}

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: resilientFetch },
});

export const FUNCTIONS_URL =
  env.FUNCTIONS_URL || env.SUPABASE_URL.replace(/\/+$/, "") + "/functions/v1";
