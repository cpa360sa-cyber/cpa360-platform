/* ============================================================================
 * CPA360 Integrations — connect third-party apps with a pop-up sign-in.
 *
 *  - OAuth apps (Xero, Google, Microsoft 365, Dropbox, DocuSign, Slack) connect
 *    through the `oauth-connect` Edge Function: a small pop-up window handles the
 *    provider's sign-in, then closes itself.
 *  - "Webhook" (Zapier / Make / Slack incoming webhook / any URL) needs no setup
 *    — paste the URL and CPA360 posts attention alerts to it.
 *
 * Provider client IDs / secrets live only in the Edge Function's secrets.
 * `config.js` → INTEGRATIONS lists which OAuth providers you've set up.
 * ==========================================================================*/
import { supabase } from "./supabase.js";

const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const ENV = window.__CPA360_ENV || {};

const REDIRECT_URI =
  (ENV.SITE_URL || location.origin + location.pathname.replace(/[^/]*$/, "")).replace(/\/+$/, "") +
  "/oauth-callback.html";

/* ---------------------------------------------------------------- catalogue */
const CATS = [
  { id: "accounting", label: "Accounting & finance" },
  { id: "documents", label: "Documents & storage" },
  { id: "signature", label: "E-signature" },
  { id: "messaging", label: "Notifications" },
  { id: "automation", label: "Automation" },
];

export const CATALOG = [
  {
    id: "xero", name: "Xero", cat: "accounting", kind: "oauth", recommended: true,
    blurb: "Pull transactions and budget-vs-actual straight from your Xero organisation.",
    setup: "https://developer.xero.com/app/manage",
  },
  {
    id: "quickbooks", name: "QuickBooks Online", cat: "accounting", kind: "oauth",
    blurb: "Sync the CPA's books from QuickBooks into Finance & Procurement.",
    setup: "https://developer.intuit.com/app/developer/dashboard",
  },
  {
    id: "sage", name: "Sage Business Cloud", cat: "accounting", kind: "soon",
    blurb: "Sage Accounting sync — on the roadmap.",
  },
  {
    id: "google", name: "Google Workspace", cat: "documents", kind: "oauth", recommended: true,
    blurb: "Attach files from Google Drive to the Master File, and push the governance calendar to Google Calendar.",
    setup: "https://console.cloud.google.com/apis/credentials",
  },
  {
    id: "microsoft", name: "Microsoft 365", cat: "documents", kind: "oauth",
    blurb: "OneDrive files on the Master File, plus Outlook calendar and mail.",
    setup: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade",
  },
  {
    id: "dropbox", name: "Dropbox", cat: "documents", kind: "oauth",
    blurb: "Keep CPA documents in a shared Dropbox folder and link them here.",
    setup: "https://www.dropbox.com/developers/apps",
  },
  {
    id: "docusign", name: "DocuSign", cat: "signature", kind: "oauth",
    blurb: "Send leases, resolutions and agreements for signature without leaving CPA360.",
    setup: "https://apps.docusign.com/admin/api-and-keys",
  },
  {
    id: "slack", name: "Slack", cat: "messaging", kind: "oauth", recommended: true,
    blurb: "Post what needs the Committee's attention to a Slack channel.",
    setup: "https://api.slack.com/apps",
  },
  {
    id: "webhook", name: "Zapier / Make / Webhook", cat: "automation", kind: "webhook", recommended: true,
    blurb: "Paste a webhook URL and CPA360 will POST attention alerts and key events to it. Works with Zapier, Make, or a Slack incoming webhook.",
  },
];

/* ------------------------------------------------------------------ helpers */
let CTX = { orgId: null, orgName: "", role: "member", userId: null };
const canManage = () => CTX.role === "admin" || CTX.role === "owner";
const providerConfigured = (id) => !!(ENV.INTEGRATIONS && ENV.INTEGRATIONS[id]);
const hostOf = (u) => { try { return new URL(u).host; } catch { return u.slice(0, 40); } };

function toast(msg, bad) {
  let t = document.querySelector(".intg-toast");
  if (!t) { t = document.createElement("div"); t.className = "intg-toast"; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.toggle("bad", !!bad);
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 3200);
}

async function loadRows() {
  if (!CTX.orgId) return {};
  const { data } = await supabase.from("integrations").select("*").eq("org_id", CTX.orgId);
  const by = {};
  (data || []).forEach((r) => (by[r.provider] = r));
  return by;
}

/* ------------------------------------------------------------------- connect */
function connectOAuth(id) {
  // open the pop-up NOW, inside the click, so it isn't blocked
  const popup = window.open("about:blank", "cpa360-oauth", "popup,width=520,height=680");
  if (!popup) { toast("Allow pop-ups for this site, then try again.", true); return; }
  try { popup.document.write("<p style='font:14px system-ui;margin:28px'>Opening the sign-in…</p>"); } catch {}

  supabase.functions
    .invoke("oauth-connect", { body: { action: "start", provider: id, orgId: CTX.orgId } })
    .then(({ data, error }) => {
      if (error || !data || data.error || !data.url) {
        popup.close();
        if (data && data.error === "not_configured") return setupModal(id);
        if (data && data.error === "forbidden") return toast("Only an admin can connect apps.", true);
        return toast("Couldn't start the connection. Try again.", true);
      }
      popup.location = data.url;
    })
    .catch(() => { popup.close(); toast("Couldn't reach the server. Try again.", true); });
}

let msgWired = false;
function wireOAuthMessages(onDone) {
  if (msgWired) return;
  msgWired = true;
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || !e.data || e.data.source !== "cpa360-oauth") return;
    if (e.data.ok) toast(`Connected ${e.data.label || e.data.provider}.`);
    else if (e.data.error && e.data.error !== "bad_callback") toast("That connection didn't complete.", true);
    onDone();
  });
}

async function disconnect(row) {
  if (!confirm(`Disconnect ${row.account_label || row.provider}?`)) return;
  if (row.provider === "webhook") {
    await supabase.from("integrations").delete().eq("id", row.id);
  } else {
    await supabase.functions.invoke("oauth-connect", { body: { action: "disconnect", id: row.id } });
  }
  toast("Disconnected.");
  render(document.querySelector("#view"));
}

async function saveWebhook(url) {
  const clean = url.trim();
  if (!/^https:\/\/\S+$/.test(clean)) { toast("Enter a valid https:// URL.", true); return false; }
  const { error } = await supabase.from("integrations").upsert(
    {
      org_id: CTX.orgId, provider: "webhook", category: "automation", status: "connected",
      account_label: hostOf(clean), settings: { webhook_url: clean },
      connected_by: CTX.userId, connected_at: new Date().toISOString(), updated_by: CTX.userId,
    },
    { onConflict: "org_id,provider" },
  );
  if (error) { toast("Couldn't save that.", true); return false; }
  toast("Webhook connected.");
  return true;
}

function sendWebhookTest(url) {
  try {
    fetch(url, {
      method: "POST", mode: "no-cors", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "CPA360", event: "test", cpa: CTX.orgName,
        text: `Test message from CPA360 — the integration is working.`,
        at: new Date().toISOString(),
      }),
    });
    toast("Test sent — check your channel or scenario.");
  } catch { toast("Couldn't send the test.", true); }
}

/* -------------------------------------------------------------------- modals */
function modal(title, bodyHtml, onMount) {
  const scrim = document.createElement("div");
  scrim.className = "intg-scrim";
  scrim.innerHTML = `<div class="intg-modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="intg-modal-head"><b>${esc(title)}</b>
      <button type="button" class="intg-x" aria-label="Close">&times;</button></div>
    <div class="intg-modal-body">${bodyHtml}</div></div>`;
  const close = () => scrim.remove();
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector(".intg-x").onclick = close;
  document.body.appendChild(scrim);
  onMount && onMount(scrim, close);
  return close;
}

function webhookModal(existing) {
  modal(existing ? "Edit webhook" : "Connect a webhook", `
    <p class="intg-note">Paste the webhook URL from Zapier (“Catch Hook”), Make (“Custom webhook”), or Slack
      (an <b>Incoming Webhook</b> URL). CPA360 will <code>POST</code> a small JSON payload to it when something needs attention.</p>
    <label class="intg-field"><span>Webhook URL</span>
      <input type="url" id="wh-url" placeholder="https://hooks.slack.com/services/…" value="${esc(existing?.settings?.webhook_url || "")}" /></label>
    <div class="intg-modal-foot">
      <button type="button" class="btn" id="wh-cancel">Cancel</button>
      <button type="button" class="btn primary" id="wh-save">${existing ? "Save" : "Connect"}</button>
    </div>`, (scrim, close) => {
    scrim.querySelector("#wh-url").focus();
    scrim.querySelector("#wh-cancel").onclick = close;
    scrim.querySelector("#wh-save").onclick = async () => {
      const ok = await saveWebhook(scrim.querySelector("#wh-url").value);
      if (ok) { close(); render(document.querySelector("#view")); }
    };
  });
}

function setupModal(id) {
  const item = CATALOG.find((c) => c.id === id);
  modal(`Set up ${item.name}`, `
    <p class="intg-note">${esc(item.name)} needs a one-time setup by whoever manages your Supabase project.</p>
    <ol class="intg-steps">
      <li>Create an OAuth app at <a href="${esc(item.setup || "#")}" target="_blank" rel="noopener">${esc(item.setup ? hostOf(item.setup) : "the provider's developer console")}</a>.</li>
      <li>Add this exact redirect / callback URL:
        <code class="intg-copy" id="intg-redir">${esc(REDIRECT_URI)}</code></li>
      <li>Copy the app's <b>Client ID</b> and <b>Client secret</b> into the Supabase Edge Function secrets:
        <code>OAUTH_${esc(id.toUpperCase())}_ID</code> and <code>OAUTH_${esc(id.toUpperCase())}_SECRET</code>.</li>
      <li>Add <code>"${esc(id)}": true</code> to <code>INTEGRATIONS</code> in <code>web/config.js</code>, then re-deploy.</li>
    </ol>
    <div class="intg-modal-foot"><button type="button" class="btn primary" id="setup-done">Got it</button></div>`,
    (scrim, close) => {
      scrim.querySelector("#setup-done").onclick = close;
      const c = scrim.querySelector("#intg-redir");
      c.style.cursor = "copy";
      c.title = "Click to copy";
      c.onclick = () => { navigator.clipboard?.writeText(REDIRECT_URI); toast("Redirect URL copied."); };
    });
}

/* --------------------------------------------------------------------- render */
export async function renderIntegrations(view, ctx) {
  CTX = { ...CTX, ...ctx };
  wireOAuthMessages(() => render(view));
  await render(view);
}

async function render(view) {
  if (!view) return;
  const rows = await loadRows();
  const manage = canManage();
  const connectedCount = Object.keys(rows).length;

  view.innerHTML = `
    <div class="intg">
      <p class="note intg-intro">
        Connect the tools your CPA already uses. Connecting opens a small sign-in window that closes on its own —
        CPA360 never sees your password. ${connectedCount ? `<b>${connectedCount} connected.</b>` : ""}
        ${manage ? "" : "<br>Only an admin or owner can connect or disconnect apps."}
      </p>
      ${CATS.map((cat) => sectionHtml(cat, rows, manage)).join("")}
    </div>`;

  view.querySelectorAll("[data-connect]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.connect;
    if (id === "webhook") webhookModal(rows.webhook);
    else if (!providerConfigured(id)) setupModal(id);
    else connectOAuth(id);
  }));
  view.querySelectorAll("[data-setup]").forEach((b) => (b.onclick = () => setupModal(b.dataset.setup)));
  view.querySelectorAll("[data-disconnect]").forEach((b) => (b.onclick = () => disconnect(rows[b.dataset.disconnect])));
  view.querySelectorAll("[data-test]").forEach((b) => (b.onclick = () => sendWebhookTest(rows.webhook.settings.webhook_url)));
  view.querySelectorAll("[data-editwh]").forEach((b) => (b.onclick = () => webhookModal(rows.webhook)));
}

function sectionHtml(cat, rows, manage) {
  const items = CATALOG.filter((c) => c.cat === cat.id);
  if (!items.length) return "";
  return `
    <section class="intg-cat">
      <h2>${esc(cat.label)}</h2>
      <div class="intg-grid">${items.map((it) => cardHtml(it, rows[it.id], manage)).join("")}</div>
    </section>`;
}

function cardHtml(it, row, manage) {
  const connected = row && row.status === "connected";
  const configured = it.kind === "webhook" || providerConfigured(it.id);
  let action = "";
  if (it.kind === "soon") {
    action = `<span class="intg-tag soon">Coming soon</span>`;
  } else if (connected) {
    action = `
      <div class="intg-conn">
        <span class="intg-tag ok">Connected</span>
        <span class="intg-acct">${esc(row.account_label || "")}</span>
      </div>
      ${manage ? `<div class="intg-acts">
        ${it.kind === "webhook" ? `<button class="intg-link" type="button" data-test>Send test</button>
          <button class="intg-link" type="button" data-editwh>Edit</button>` : ""}
        <button class="intg-link danger" type="button" data-disconnect="${esc(it.id)}">Disconnect</button>
      </div>` : ""}`;
  } else if (!manage) {
    action = `<span class="intg-tag muted">Not connected</span>`;
  } else if (!configured) {
    action = `<button class="btn" type="button" data-setup="${esc(it.id)}">Set up</button>`;
  } else {
    action = `<button class="btn primary" type="button" data-connect="${esc(it.id)}">Connect</button>`;
  }

  return `
    <article class="intg-card${connected ? " is-on" : ""}">
      <div class="intg-card-top">
        <h3>${esc(it.name)}</h3>
        ${it.recommended && !connected ? `<span class="intg-tag rec">Recommended</span>` : ""}
      </div>
      <p>${esc(it.blurb)}</p>
      <div class="intg-card-foot">${action}</div>
    </article>`;
}
