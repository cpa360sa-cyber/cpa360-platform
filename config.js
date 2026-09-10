/* CPA360 — live config. These two values are public (RLS + the session token do
   the security). Git-ignored. Regenerate from Supabase → Project Settings → API. */
window.__CPA360_ENV = {
  SUPABASE_URL: "https://fztadhwbgahubdjxqfwd.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_t--dAyijW90sR1Hg0PU7xQ_VJDaZqMe",
  FUNCTIONS_URL: "",
  // Landing page → "Book a consultation". Paste your Calendly / Cal.com link
  // (e.g. "https://calendly.com/gad-foundation/cpa360"). Leave "" to route the
  // consultation CTA through the lead form instead.
  CONSULTATION_URL: "",
  // In-app AI Assistant (navigation + attention). The `cpa-assistant` Edge
  // Function is deployed; add its key:  supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
  ASSISTANT_ENABLED: true,
  // Integrations → which OAuth providers are set up. Add a provider here AFTER
  // you've put its OAUTH_<PROVIDER>_ID / _SECRET into the oauth-connect function
  // secrets. "webhook" needs no setup and always works.
  //   ids: google · microsoft · slack · xero · quickbooks · dropbox · docusign
  INTEGRATIONS: { webhook: true },
};
