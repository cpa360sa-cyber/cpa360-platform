/* CPA360 — Communication hub (Operations → Communication)
   One place to reach the membership: announcements, notices and replies.
   Channels today:
     · WhatsApp Business (Cloud API) — the CPA connects its own business number; messages go out
       from the server via the whatsapp-send Edge Function using the CPA's approved template, and
       delivery receipts + member replies come back through whatsapp-webhook (Inbox).
     · WhatsApp, one-by-one — no setup, no cost: a person taps Send in WhatsApp for each member
       (wa.me link), the same way Birthday wishes work.
     · Printed notice and copy-to-clipboard — for the notice board, the radio station, a group chat.
   Rules the hub enforces: only Active members; members who declined (wish_optout) are never
   messaged; adults only by default; a consent confirmation before any bulk send; nothing is sent
   automatically; the access token never reaches the browser (it lives in a locked table). */
import * as repo from "./repo.js";
import { FUNCTIONS_URL } from "./supabase.js";

/* indirection so the preview/test harness can swap the network layer (see _test) */
const api = {
  loadComm: repo.loadComm, createCommMessage: repo.createCommMessage, updateCommMessage: repo.updateCommMessage,
  listCommLog: repo.listCommLog, logCommOpened: repo.logCommOpened, deleteCommLogRows: repo.deleteCommLogRows,
  markCommInbound: repo.markCommInbound, whatsappSend: repo.whatsappSend, whatsappConnect: repo.whatsappConnect,
};
let S = null;      // per-CPA hub state: loaded history/inbox/connection + the compose draft
export const _test = { setApi: (o) => Object.assign(api, o), state: () => S, reset: () => { S = null; } };

const MAX_API_CHARS = 900;       // WhatsApp template parameter limit we enforce (server caps at the same figure)
const BATCH = 50;                // recipients per whatsapp-send call

const TEMPLATES = [
  { id: "general", label: "General announcement", title: "Announcement", body: "" },
  { id: "agm", label: "AGM / general meeting notice", title: "Notice of general meeting",
    body: "Notice: {cpa} will hold its general meeting on [date] at [time] at [venue]. All members are encouraged to attend and must bring their ID. The agenda is available from the CPA office." },
  { id: "reminder", label: "Meeting reminder", title: "Meeting reminder",
    body: "Reminder: our meeting is on [date] at [time] at [venue]. Your attendance matters — please come on time." },
  { id: "docs", label: "Document request", title: "Documents needed",
    body: "To complete your membership verification, please bring a clear copy of your ID (and proof of address if you have it) to [place] by [date]. Thank you." },
  { id: "benefit", label: "Benefit / payment notice", title: "Benefit notice",
    body: "Benefit notice: [details]. Please collect at [place] on [date] and bring your ID. If you cannot come, contact the CPA office to arrange." },
  { id: "contact", label: "Update your contact details", title: "Update your details",
    body: "Please confirm your cell number and household details with the CPA office at [place / number] so we can keep you informed about CPA matters." },
  { id: "condolence", label: "Condolence", title: "Condolences",
    body: "With deep sadness we share the passing of [name]. The Committee and all members send their condolences to the family. [Funeral details]." },
];

const CHANNEL_LABEL = { whatsapp_api: "WhatsApp Business", whatsapp_manual: "WhatsApp (one-by-one)", notice: "Printed notice", copy: "Copied text" };
const STATUS_TONE = { sent: "neutral", delivered: "good", read: "good", opened: "neutral", failed: "critical", queued: "neutral" };

/* Channels we recommend adding — shown on the Channels tab so the committee can see the road-map. */
const ROADMAP = [
  { name: "WhatsApp Business (Cloud API)", state: "Available", best: "Announcements to the whole membership; replies in the Inbox", cost: "Meta charges per conversation (low for utility messages)", effort: "1–2 days: Meta business verification + template approval" },
  { name: "WhatsApp, one-by-one", state: "Available", best: "Small groups, sensitive messages, no set-up", cost: "Free", effort: "None" },
  { name: "Printed notice / notice board", state: "Available", best: "Members without smartphones; the community hall; the tribal office", cost: "Printing only", effort: "None" },
  { name: "Calendar invites & online meetings", state: "Available", best: "Committee and department meetings (Teams / Zoom / Meet, .ics) — in Governance → Gov. Reports", cost: "Free", effort: "None" },
  { name: "Email", state: "Next", best: "Funders, the Department, committee members, formal notices with attachments", cost: "Free tier (Resend); the send-permit-email function is already built", effort: "Set the RESEND_API_KEY secret, then enable bulk email here" },
  { name: "SMS (BulkSMS / Clickatell / SMSPortal)", state: "Next", best: "Members without WhatsApp or data; reminders for AGMs and payouts", cost: "About R0.25–R0.40 per SMS, prepaid", effort: "Gateway account + API key; reuses this audience builder" },
  { name: "Voice / IVR call", state: "Idea", best: "Elderly and low-literacy members — a recorded message in isiZulu, Sesotho, etc.", cost: "Per-minute calling cost", effort: "Provider (e.g. Twilio / Africa's Talking) + recorded audio" },
  { name: "Community radio slot", state: "Idea", best: "Reaching everyone in the community, including non-members", cost: "Station rates (often sponsored for CPAs)", effort: "Use Print notice → read-out script" },
  { name: "Telegram bot / channel", state: "Idea", best: "Tech-comfortable members, committee groups; free and unlimited", cost: "Free", effort: "Bot token; members must opt in" },
  { name: "Facebook Page / Messenger", state: "Idea", best: "Public updates, youth, diaspora members", cost: "Free", effort: "Page + Meta app review for automation" },
  { name: "Public announcement page + QR", state: "Idea", best: "A link on the notice board and in every message that always shows the latest notices", cost: "Free", effort: "Small public page; QR is already built in" },
  { name: "Member app notifications (PWA push)", state: "Idea", best: "When members get a login to view their own record", cost: "Free", effort: "Member portal first" },
  { name: "USSD / “Please Call Me”", state: "Idea", best: "Feature-phone members with no data", cost: "USSD aggregator fees", effort: "Aggregator contract; longer lead time" },
];

/* ------------------------------------------------------------ helpers --- */
const fresh = (orgId) => ({
  orgId, loaded: false, loading: false, error: "", msgs: [], counts: {}, inbound: [], wa: null,
  draft: { tpl: "general", title: TEMPLATES[0].title, body: "", f: { verif: "all", pos: "all", gender: "all", hh: "", adults: true } },
});
const firstName = (full) => {
  const f = String(full || "").trim().split(/\s+/)[0] || "";
  return f ? f.toLowerCase().replace(/(^|[-'])(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : "Member";
};
const ageOf = (r) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(r[3] || ""));
  if (!m) return null;
  const t = new Date(), y = +m[1], mo = +m[2], d = +m[3];
  let a = t.getFullYear() - y;
  if (t.getMonth() + 1 < mo || (t.getMonth() + 1 === mo && t.getDate() < d)) a--;
  return a >= 0 && a < 120 ? a : null;
};
const brackets = (t) => /\[[^\]\n]{1,80}\]/.test(t);
const when = (iso) => { try { return new Date(iso).toLocaleString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso)) / 1000);
  return s < 60 ? "just now" : s < 3600 ? Math.floor(s / 60) + " min ago" : s < 86400 ? Math.floor(s / 3600) + " h ago" : Math.floor(s / 86400) + " d ago";
};
const waConnected = () => !!(S && S.wa && S.wa.status === "connected");

function audienceOf(ctx, f) {
  const { waNumber } = ctx.h;
  let m = (ctx.register() || []).filter((r) => r[8] === "Active");
  if (f.verif === "verified") m = m.filter((r) => r[9] === "Verified");
  else if (f.verif === "unverified") m = m.filter((r) => r[9] !== "Verified");
  if (f.pos !== "all") m = m.filter((r) => (r[11] || "") === f.pos);
  if (f.gender === "female") m = m.filter((r) => /^f/i.test(r[2] || ""));
  else if (f.gender === "male") m = m.filter((r) => /^m/i.test(r[2] || ""));
  const hh = String(f.hh || "").trim().toLowerCase();
  if (hh) m = m.filter((r) => String(r[5] || "").toLowerCase().includes(hh));
  if (f.adults) m = m.filter((r) => { const a = ageOf(r); return a == null || a >= 18; });
  const declined = m.filter((r) => r[13] === true);
  const ok = m.filter((r) => r[13] !== true);
  const reach = ok.filter((r) => waNumber(r[6]));
  return { match: m, declined, reach, noNumber: ok.length - reach.length };
}
const resolve = (ctx, body) => String(body || "").replace(/\{cpa\}/g, ctx.cpa().name || "the association").trim();
const manualText = (ctx, r, body) => `Hello ${firstName(r[1])},\n\n${resolve(ctx, body)}\n\n— ${ctx.cpa().name || "The Committee"}`;
const bubble = (text) => `<div class="cm-bubble">${String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])).replace(/\n/g, "<br>")}</div>`;

/* ------------------------------------------------------------- render --- */
export function renderCommunication(ctx) {
  if (!S || S.orgId !== ctx.orgId) S = fresh(ctx.orgId);
  const { h } = ctx;
  const cur = h.SUBTAB.communication || "compose";
  const unread = S.inbound.filter((m) => m.status === "new").length;
  const tabs = [
    { id: "compose", label: ctx.notices && ctx.notices().length ? `Compose (${ctx.notices().length})` : "Compose" },
    { id: "history", label: "History" },
    { id: "inbox", label: unread ? `Inbox (${unread})` : "Inbox" },
    { id: "channels", label: "Channels" },
  ];
  ctx.strip.innerHTML = h.subtabStrip("communication", tabs);
  h.wireSubtabs(ctx.strip);
  if (!S.loaded) {
    ctx.body.innerHTML = h.stateHtml("loading", "Loading communication…");
    if (!S.loading) load(ctx);
    return;
  }
  ({ compose: renderCompose, history: renderHistory, inbox: renderInbox, channels: renderChannels }[cur] || renderCompose)(ctx);
}
async function load(ctx) {
  S.loading = true;
  try { Object.assign(S, await api.loadComm(ctx.orgId)); S.error = ""; }
  catch (e) { S.error = (e && e.message) || String(e); }
  S.loaded = true; S.loading = false;
  ctx.rerender();
}
async function reload(ctx) {
  try { Object.assign(S, await api.loadComm(ctx.orgId)); S.error = ""; } catch (e) { S.error = (e && e.message) || String(e); }
  ctx.rerender();
}
const errBanner = (ctx) => S.error ? `<div class="illus-banner" role="alert" style="margin-bottom:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
  <span>Couldn't load message history / connection: ${ctx.h.esc(S.error)}</span><button type="button" class="btn small" data-cm-retry style="margin-left:auto;">Retry</button></div>` : "";
const wireRetry = (ctx) => { const b = ctx.body.querySelector("[data-cm-retry]"); if (b) b.onclick = () => { S.loaded = false; S.error = ""; ctx.rerender(); }; };

/* ------------------------------------------------------------ compose --- */
function renderCompose(ctx) {
  const { h } = ctx, { esc } = h, d = S.draft, f = d.f;
  const roles = ["all", ...ctx.roles()];
  const sel = (id, opts, val) => `<select id="${id}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === val ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  const pend = ctx.notices ? ctx.notices() : [];
  ctx.body.innerHTML = `${errBanner(ctx)}
  ${pend.length ? `<div class="card" style="margin-bottom:14px;border-color:var(--status-warning);">
    <div class="card-head"><div><h3>Condolence notices waiting</h3><span class="hint">A member was marked Deceased. Nothing is sent until you review the message and confirm.</span></div></div>
    ${pend.map((n, i) => `<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--border);">
      <b style="flex:1;min-width:140px;">${esc(n.name)}</b><span class="hint">${esc(when(n.at))}</span>
      ${ctx.canEdit ? `<button type="button" class="btn small primary" data-cm-notice="${i}">Review &amp; send</button><button type="button" class="btn small" data-cm-nodismiss="${i}">Don't send</button>` : ""}</div>`).join("")}
  </div>` : ""}
  <div class="cm-grid">
    <div class="card">
      <div class="card-head"><div><h3>Message</h3><span class="hint">Write once — send by WhatsApp Business, one-by-one on WhatsApp, or print it as a notice.</span></div></div>
      <div class="field"><label for="cm-tpl">Start from</label>${sel("cm-tpl", TEMPLATES.map((t) => [t.id, t.label]), d.tpl)}</div>
      <div class="field"><label for="cm-title">Title <span class="hint">(for your records — not sent)</span></label><input id="cm-title" type="text" value="${esc(d.title)}" maxlength="120"></div>
      <div class="field"><label for="cm-body">Message</label><textarea id="cm-body" rows="7" placeholder="Type your announcement…">${esc(d.body)}</textarea>
        <div class="hint" id="cm-count"></div></div>
      <p class="hint" style="margin:0;">Use <b>{cpa}</b> for your CPA's name. Each member is greeted by first name automatically. Fill in any <b>[brackets]</b> before sending.</p>
    </div>
    <div class="card">
      <div class="card-head"><div><h3>Who receives it</h3><span class="hint">Active members only. Members who declined WhatsApp messages are always left out.</span></div></div>
      <div class="cm-filters">
        <div class="field"><label for="cm-verif">Verification</label>${sel("cm-verif", [["all", "All active members"], ["verified", "Verified only"], ["unverified", "Not yet verified"]], f.verif)}</div>
        <div class="field"><label for="cm-pos">Family position</label>${sel("cm-pos", roles.map((r) => [r, r === "all" ? "Any position" : r === "ODI" ? "ODI (head of household)" : r]), f.pos)}</div>
        <div class="field"><label for="cm-gender">Gender</label>${sel("cm-gender", [["all", "Any"], ["female", "Female"], ["male", "Male"]], f.gender)}</div>
        <div class="field"><label for="cm-hh">Household contains</label><input id="cm-hh" type="text" value="${esc(f.hh)}" placeholder="e.g. HH-0042"></div>
      </div>
      <label class="cm-check"><input id="cm-adults" type="checkbox"${f.adults ? " checked" : ""}> Adults only (18+, where a birth date is on file)</label>
      <div id="cm-counts" style="margin-top:12px;"></div>
    </div>
  </div>
  <div class="card" style="margin-top:14px;">
    <div class="card-head"><div><h3>Preview &amp; send</h3><span class="hint">Nothing is sent until you choose a channel and confirm.</span></div></div>
    <div class="cm-grid">
      <div id="cm-preview"></div>
      <div id="cm-actions" class="cm-actions"></div>
    </div>
  </div>`;
  wireRetry(ctx);
  ctx.body.querySelectorAll("[data-cm-notice]").forEach((b) => (b.onclick = () => deathDialog(ctx, pend[+b.dataset.cmNotice])));
  ctx.body.querySelectorAll("[data-cm-nodismiss]").forEach((b) => (b.onclick = () => dismissNotice(ctx, pend[+b.dataset.cmNodismiss])));

  const $ = (s) => ctx.body.querySelector(s);
  const dyn = () => {
    const aud = audienceOf(ctx, f), body = resolve(ctx, d.body), len = body.length;
    $("#cm-count").textContent = `${len} characters${len > MAX_API_CHARS ? ` — over the ${MAX_API_CHARS} limit for WhatsApp Business (one-by-one still works)` : ""}`;
    $("#cm-counts").innerHTML = `<div class="grid grid-2" style="gap:8px;">
      ${h.statTile("Matching members", aud.match.length, "", "")}
      ${h.statTile("Can be messaged on WhatsApp", aud.reach.length, aud.reach.length ? "Have a cell number, not declined" : "None yet", aud.reach.length ? "good" : "warning")}
      ${h.statTile("No usable cell number", aud.noNumber, aud.noNumber ? "Use a printed notice for these" : "", aud.noNumber ? "warning" : "")}
      ${h.statTile("Declined messages", aud.declined.length, "Never messaged", "")}</div>`;
    const sample = aud.reach[0] || ["", "Thandi Dlamini"];
    $("#cm-preview").innerHTML = `<div class="hint" style="margin-bottom:6px;">How it looks to ${esc(firstName(sample[1]))}</div>${bubble(body ? manualText(ctx, sample, d.body) : "Your message will appear here.")}
      ${waConnected() ? `<div class="hint" style="margin:10px 0 6px;">Via WhatsApp Business (approved template)</div>${bubble(`Hello ${firstName(sample[1])}, a message from ${ctx.cpa().name || "your CPA"}: ${body || "…"}`)}` : ""}`;
    const can = ctx.canEdit;
    const need = !d.title.trim() || !body ? "Add a title and a message first." : brackets(d.body) ? "Fill in the [brackets] first." : "";
    const apiWhy = !waConnected() ? "Connect WhatsApp Business under Channels first." : len > MAX_API_CHARS ? `Shorten the message to ${MAX_API_CHARS} characters.` : !aud.reach.length ? "No members can be reached." : need;
    const manWhy = !aud.reach.length ? "No members can be reached." : need;
    $("#cm-actions").innerHTML = can ? `
      <button type="button" class="btn primary" id="cm-api"${apiWhy ? ` disabled title="${esc(apiWhy)}"` : ""}>Send via WhatsApp Business (${aud.reach.length})</button>
      <button type="button" class="btn" id="cm-manual"${manWhy ? ` disabled title="${esc(manWhy)}"` : ""}>Send one-by-one on WhatsApp (${aud.reach.length})</button>
      <button type="button" class="btn" id="cm-print"${need ? ` disabled title="${esc(need)}"` : ""}>Print notice</button>
      <button type="button" class="btn" id="cm-copy"${need ? ` disabled title="${esc(need)}"` : ""}>Copy message</button>
      ${!waConnected() ? `<p class="hint" style="margin:6px 0 0;">WhatsApp Business isn't connected yet — one-by-one sending works now. <a href="#" id="cm-goch">Connect it</a>.</p>` : ""}
      ${apiWhy && waConnected() ? `<p class="hint" style="margin:6px 0 0;">${esc(apiWhy)}</p>` : ""}`
      : `<p class="hint">You have view-only access. Ask an editor to send messages.</p>`;
    const on = (id, fn) => { const b = $(id); if (b && !b.disabled) b.onclick = fn; };
    on("#cm-api", () => sendApi(ctx, aud));
    on("#cm-manual", () => manualQueue(ctx, aud));
    on("#cm-print", () => printNotice(ctx, aud));
    on("#cm-copy", () => copyMessage(ctx, aud));
    const go = $("#cm-goch"); if (go) go.onclick = (e) => { e.preventDefault(); h.SUBTAB.communication = "channels"; ctx.rerender(); };
  };
  dyn();

  $("#cm-tpl").onchange = (e) => {
    const t = TEMPLATES.find((x) => x.id === e.target.value) || TEMPLATES[0];
    d.tpl = t.id;
    if (!d.body.trim() || TEMPLATES.some((x) => x.body === d.body)) { d.body = t.body; d.title = t.title; $("#cm-body").value = d.body; $("#cm-title").value = d.title; }
    else h.toast("Template chosen — your current text was kept.");
    dyn();
  };
  $("#cm-title").oninput = (e) => { d.title = e.target.value; dyn(); };
  $("#cm-body").oninput = (e) => { d.body = e.target.value; dyn(); };
  const bind = (id, key, num) => { $(id).onchange = (e) => { f[key] = e.target.value; dyn(); }; };
  bind("#cm-verif", "verif"); bind("#cm-pos", "pos"); bind("#cm-gender", "gender");
  $("#cm-hh").oninput = (e) => { f.hh = e.target.value; dyn(); };
  $("#cm-adults").onchange = (e) => { f.adults = e.target.checked; dyn(); };
}

const audSnapshot = (f, aud) => ({ ...f, matching: aud.match.length, reachable: aud.reach.length, declined: aud.declined.length });

/* ---- WhatsApp Business: confirm, then send in batches of 50 with progress ---- */
function sendApi(ctx, aud, d = S.draft, opts = {}) {
  const { h } = ctx, { esc } = h, list = aud.reach, body = resolve(ctx, d.body);
  const { scrim, close } = h.govModal("Send via WhatsApp Business", `
    <p style="margin:0 0 10px;">You are about to message <b>${list.length}</b> member${list.length === 1 ? "" : "s"} from <b>${esc(S.wa.account_label || "your business number")}</b>.</p>
    ${bubble(`Hello {first name}, a message from ${ctx.cpa().name || "your CPA"}: ${body}`)}
    <ul class="hint" style="margin:10px 0;padding-left:18px;">
      <li>Sent using your approved template <b>${esc((S.wa.settings || {}).template_name || "")}</b>. Meta bills per conversation to your WhatsApp Business account.</li>
      <li>Members who declined (${aud.declined.length}) and members without a cell number (${aud.noNumber}) are skipped.</li>
      <li>You can't unsend a WhatsApp message.</li></ul>
    <label class="cm-check"><input type="checkbox" id="sa-ok"> I confirm these members have agreed to receive CPA messages on WhatsApp.</label>
    <div id="sa-prog" style="margin-top:12px;"></div>`,
    `<button class="btn" data-act="close" type="button" id="sa-cancel">Cancel</button><button class="btn primary" type="button" id="sa-go" disabled>Send to ${list.length}</button>`, 560);
  const $ = (s) => scrim.querySelector(s), ok = $("#sa-ok"), go = $("#sa-go"), prog = $("#sa-prog");
  ok.onchange = () => { go.disabled = !ok.checked; };
  let stop = false, running = false;
  go.onclick = async () => {
    if (running) return;
    running = true; go.disabled = true; ok.disabled = true; $("#sa-cancel").textContent = "Stop after this batch";
    $("#sa-cancel").onclick = () => { if (running) { stop = true; $("#sa-cancel").disabled = true; } else close(); };
    let sent = 0, failed = 0, done = 0, fatal = "", msg = null; const errs = [];
    const paint = () => { if (scrim.isConnected) prog.innerHTML = `<div class="hint">${done} of ${list.length} processed — ${sent} sent${failed ? `, ${failed} failed` : ""}…</div><progress max="${list.length}" value="${done}" style="width:100%;"></progress>`; };
    try {
      msg = await api.createCommMessage(ctx.orgId, { title: d.title.trim(), body, kind: d.tpl, channel: "whatsapp_api", audience: audSnapshot(d.f, aud), recipientCount: list.length });
      paint();
      for (let i = 0; i < list.length && !stop; i += BATCH) {
        const batch = list.slice(i, i + BATCH);
        const res = await api.whatsappSend({ org_id: ctx.orgId, message_id: msg.id, mode: "template", body,
          recipients: batch.map((r) => ({ beneficiary_id: r._id || null, name: r[1], phone: ctx.h.waNumber(r[6]) })) });
        sent += res.sent || 0; failed += res.failed || 0; done += batch.length;
        (res.results || []).filter((x) => !x.ok && x.error).forEach((x) => errs.push(x.error));
        paint();
      }
    } catch (e) { fatal = (e && e.message) || String(e); }
    running = false;
    if (msg) { try { await api.updateCommMessage(msg.id, { status: stop || fatal ? "cancelled" : "sent", recipient_count: done }); } catch (e) {} }
    if (sent > 0 && opts.onSent) { try { await opts.onSent(msg); } catch (e) {} }
    const top = [...new Set(errs)].slice(0, 3);
    if (scrim.isConnected) {
      prog.innerHTML = `<div class="${fatal || failed ? "illus-banner" : ""}" role="status" style="${fatal || failed ? "display:block;" : ""}">
        <b>${stop ? "Stopped." : fatal ? "Couldn't finish." : "Done."}</b> ${sent} sent${failed ? `, ${failed} failed` : ""}${done < list.length ? `, ${list.length - done} not attempted` : ""}.
        ${fatal ? `<div>${esc(fatal)}</div>` : ""}${top.length ? `<div class="hint">Reasons: ${top.map(esc).join(" · ")}</div>` : ""}
        <div class="hint">Delivery and read receipts appear under History as WhatsApp reports them.</div></div>`;
      $("#sa-cancel").disabled = false; $("#sa-cancel").textContent = "Close"; go.style.display = "none";
    }
    h.toast(fatal ? "Sending stopped: " + fatal : `WhatsApp: ${sent} sent${failed ? `, ${failed} failed` : ""}.`, !!(fatal || (failed && !sent)));
    reload(ctx);
  };
}

/* ---- WhatsApp one-by-one (wa.me): a person taps Send for each member ---- */
function manualQueue(ctx, aud, d = S.draft, opts = {}) {
  const { h } = ctx, { esc } = h, list = aud.reach, body = resolve(ctx, d.body);
  let i = 0, msg = null, warned = false, notified = false; const opened = new Set();
  const { scrim, close } = h.govModal("Send one-by-one on WhatsApp", `<div id="mq"></div>`, `<button class="btn" data-act="close" type="button">Done</button>`, 560);
  const paint = () => {
    const r = list[i], num = ctx.h.waNumber(r[6]);
    scrim.querySelector("#mq").innerHTML = `
      <div class="hint">Member ${i + 1} of ${list.length} · ${opened.size} opened</div>
      <h4 style="margin:6px 0 2px;">${esc(r[1])} ${opened.has(i) ? h.pill("Opened", "good") : ""}</h4>
      <div class="hint mono" style="margin-bottom:8px;">${esc(h.prettyCell(num))}</div>
      ${bubble(manualText(ctx, r, d.body))}
      <p class="hint" style="margin:10px 0;">“Open WhatsApp” opens this chat with the message filled in. Press Send there, come back, and the next member is ready.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" class="btn primary" id="mq-open">Open WhatsApp &amp; next</button>
        <button type="button" class="btn" id="mq-skip">Skip</button>
        <button type="button" class="btn" id="mq-prev"${i === 0 ? " disabled" : ""}>Back</button></div>`;
    const q = (s) => scrim.querySelector(s);
    const next = () => { if (i < list.length - 1) { i++; paint(); } else { q("#mq").innerHTML = `<p><b>That was the last member.</b> ${opened.size} of ${list.length} chats were opened.</p><p class="hint">This is recorded under History.</p>`; reload(ctx); } };
    q("#mq-skip").onclick = next;
    q("#mq-prev").onclick = () => { if (i > 0) { i--; paint(); } };
    q("#mq-open").onclick = async () => {
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(manualText(ctx, r, d.body))}`, "_blank", "noopener");
      opened.add(i);
      try {
        if (!msg) msg = await api.createCommMessage(ctx.orgId, { title: d.title.trim(), body, kind: d.tpl, channel: "whatsapp_manual", audience: audSnapshot(d.f, aud), recipientCount: 0 });
        await api.logCommOpened(ctx.orgId, msg.id, { beneficiary_id: r._id || null, name: r[1], phone: num });
        await api.updateCommMessage(msg.id, { recipient_count: opened.size, status: "sent" });
        if (opts.onSent && !notified) { notified = true; await opts.onSent(msg); }
      } catch (e) { if (!warned) { warned = true; h.toast("WhatsApp opened, but this couldn't be recorded in History: " + ((e && e.message) || e), true); } }
      next();
    };
  };
  paint();
}

async function recordSimple(ctx, channel, aud) {
  const d = S.draft;
  try { await api.createCommMessage(ctx.orgId, { title: d.title.trim(), body: resolve(ctx, d.body), kind: d.tpl, channel, audience: audSnapshot(d.f, aud), recipientCount: 0 }); reload(ctx); }
  catch (e) { /* history is a convenience here — the notice/copy itself already worked */ }
}
async function copyMessage(ctx, aud) {
  const d = S.draft, text = `${d.title.trim()}\n\n${resolve(ctx, d.body)}\n\n— ${ctx.cpa().name || "The Committee"}`;
  let ok = false; try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {}
  ctx.h.toast(ok ? "Message copied — paste it into a group chat, email or SMS." : "Couldn't copy automatically — select the text in the box and copy it.", !ok);
  if (ok) recordSimple(ctx, "copy", aud);
}
function printNotice(ctx, aud) {
  const { h } = ctx, { esc } = h, d = S.draft, cpa = ctx.cpa();
  const paras = resolve(ctx, d.body).split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
  const logo = cpa.logoDataUrl ? `<img class="hdr-logo" src="${cpa.logoDataUrl}" alt="">` : "";
  const chair = h.chairName();
  h.printHtmlDoc(d.title.trim() || "Notice", `
    <div class="hdr">${logo}<div><div class="brand">${esc(cpa.name || "")}</div><h1>NOTICE TO MEMBERS</h1>
      <p class="sub">${esc(new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }))}</p></div></div>
    <h2>${esc(d.title.trim())}</h2>
    <div style="font-size:14pt;line-height:1.6;margin:16pt 0 26pt;">${paras}</div>
    <table class="sig"><tr><th>Signature</th><th>Name</th><th>Capacity</th></tr>
      <tr><td>${h.sigImg("chair")}&nbsp;</td><td>${esc(chair)}&nbsp;</td><td>Chairperson</td></tr></table>
    <div class="foot">${esc(cpa.name || "")} &middot; generated by CPA360&trade; &mdash; A GAD Foundation Programme.</div>`);
  recordSimple(ctx, "notice", aud);
}

/* ------------------------------------------------------------ history --- */
function summaryOf(c) {
  c = c || {};
  const bits = [];
  if (c.read) bits.push(`${c.read} read`);
  if (c.delivered) bits.push(`${c.delivered} delivered`);
  if (c.sent) bits.push(`${c.sent} sent`);
  if (c.opened) bits.push(`${c.opened} opened`);
  if (c.failed) bits.push(`<span style="color:var(--status-critical);">${c.failed} failed</span>`);
  return bits.join(" · ") || "—";
}
function renderHistory(ctx) {
  const { h } = ctx, { esc } = h;
  const rows = S.msgs;
  const sum = (k) => rows.reduce((n, m) => n + ((S.counts[m.id] || {})[k] || 0), 0);
  ctx.body.innerHTML = `${errBanner(ctx)}
  <div class="grid grid-4">
    ${h.statTile("Messages", rows.length, "All channels", "")}
    ${h.statTile("Delivered / read", sum("delivered") + sum("read"), "WhatsApp Business", "good")}
    ${h.statTile("Opened one-by-one", sum("opened"), "Chats opened by staff", "")}
    ${h.statTile("Failed", sum("failed"), sum("failed") ? "Open a message to retry" : "None", sum("failed") ? "warning" : "good")}
  </div>
  <div class="card" style="margin-top:14px;">
    <div class="card-head"><div><h3>Message history</h3><span class="hint">Every announcement and notice, with delivery status where WhatsApp reports it.</span></div>
      <button type="button" class="btn small" id="cm-refresh">Refresh</button></div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Sent</th><th>Title</th><th>Channel</th><th class="num">Members</th><th>Delivery</th><th></th></tr></thead><tbody>
      ${rows.map((m, i) => `<tr><td>${esc(when(m.created_at))}</td><td><b>${esc(m.title)}</b><div class="hint">${esc(String(m.body).slice(0, 90))}${String(m.body).length > 90 ? "…" : ""}</div></td>
        <td>${h.pill(esc(CHANNEL_LABEL[m.channel] || m.channel), m.channel === "whatsapp_api" ? "good" : "neutral")}${m.status === "cancelled" ? " " + h.pill("Stopped", "warning") : ""}</td>
        <td class="num">${m.recipient_count || "—"}</td><td>${summaryOf(S.counts[m.id])}</td>
        <td><button type="button" class="btn small" data-cm-open="${i}">Details</button></td></tr>`).join("")}</tbody></table></div>`
      : h.stateHtml("empty", "Nothing sent yet. Messages you send, print or copy from Compose are recorded here.")}
  </div>`;
  wireRetry(ctx);
  ctx.body.querySelector("#cm-refresh").onclick = () => reload(ctx);
  ctx.body.querySelectorAll("[data-cm-open]").forEach((b) => (b.onclick = () => messageDetail(ctx, S.msgs[+b.dataset.cmOpen])));
}
async function messageDetail(ctx, m) {
  const { h } = ctx, { esc } = h;
  const { scrim } = h.govModal(m.title, `<div class="hint" style="margin-bottom:6px;">${esc(when(m.created_at))} · ${esc(CHANNEL_LABEL[m.channel] || m.channel)}</div>${bubble(m.body)}<div id="md-log" style="margin-top:12px;">${h.stateHtml("loading", "Loading recipients…")}</div>`,
    `<button class="btn" data-act="close" type="button">Close</button>`, 720);
  const box = scrim.querySelector("#md-log");
  let log = [];
  const paint = () => {
    const failed = log.filter((l) => l.status === "failed" && l.phone);
    box.innerHTML = log.length ? `
      <div class="hint" style="margin-bottom:6px;">${log.length} recipient${log.length === 1 ? "" : "s"} — ${summaryOf(log.reduce((a, l) => ((a[l.status] = (a[l.status] || 0) + 1), a), {}))}</div>
      ${failed.length && m.channel === "whatsapp_api" && waConnected() && ctx.canEdit ? `<button type="button" class="btn small" id="md-retry" style="margin-bottom:8px;">Retry ${failed.length} failed</button> <span class="hint" id="md-retry-msg"></span>` : ""}
      <div class="table-wrap scroll" style="max-height:300px;"><table><thead><tr><th>Member</th><th>Cell</th><th>Status</th><th>Detail</th></tr></thead><tbody>
      ${log.map((l) => `<tr><td>${esc(l.recipient_name || "")}</td><td class="mono">${esc(l.phone || "")}</td><td>${h.pill(esc(l.status), STATUS_TONE[l.status] || "neutral")}</td><td class="hint">${esc(l.error || (l.status_at ? when(l.status_at) : ""))}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="hint">No per-member records for this message${m.channel === "notice" || m.channel === "copy" ? " (printed / copied messages aren't tracked per member)" : ""}.</p>`;
    const rb = box.querySelector("#md-retry");
    if (rb) rb.onclick = async () => {
      rb.disabled = true; const note = box.querySelector("#md-retry-msg");
      let sent = 0, still = 0; const clearIds = [];
      try {
        for (let i = 0; i < failed.length; i += BATCH) {
          const batch = failed.slice(i, i + BATCH);
          const res = await api.whatsappSend({ org_id: ctx.orgId, message_id: m.id, mode: "template", body: m.body,
            recipients: batch.map((l) => ({ beneficiary_id: l.beneficiary_id, name: l.recipient_name, phone: l.phone })) });
          sent += res.sent || 0; still += res.failed || 0;
          (res.results || []).filter((x) => x.ok).forEach((x) => batch.filter((l) => l.phone === x.phone).forEach((l) => clearIds.push(l.id)));
          if (note) note.textContent = `${sent} sent, ${still} still failing…`;
        }
        await api.deleteCommLogRows(clearIds);     // superseded "failed" rows
      } catch (e) { h.toast("Retry stopped: " + ((e && e.message) || e), true); }
      try { log = await api.listCommLog(m.id); } catch (e) {}
      paint(); reload(ctx);
    };
  };
  try { log = await api.listCommLog(m.id); paint(); } catch (e) { box.innerHTML = h.stateHtml("error", "Couldn't load recipients. " + ((e && e.message) || e)); }
}

/* -------------------------------------------------------------- inbox --- */
function renderInbox(ctx) {
  const { h } = ctx, { esc } = h;
  const byNum = new Map();
  (ctx.register() || []).forEach((r) => { const n = h.waNumber(r[6]); if (n && !byNum.has(n)) byNum.set(n, r); });
  const rows = S.inbound;
  const nNew = rows.filter((m) => m.status === "new").length;
  ctx.body.innerHTML = `${errBanner(ctx)}
  <div class="card">
    <div class="card-head"><div><h3>Inbox</h3><span class="hint">Replies members send to your WhatsApp Business number.${nNew ? ` ${nNew} new.` : ""}</span></div>
      <button type="button" class="btn small" id="cm-refresh">Refresh</button></div>
    ${rows.length ? `<div class="table-wrap"><table><thead><tr><th>Received</th><th>From</th><th>Message</th><th></th></tr></thead><tbody>
      ${rows.map((m, i) => { const r = byNum.get(m.from_phone);
        return `<tr${m.status === "new" ? ' style="background:var(--surface-2);"' : ""}><td>${esc(when(m.received_at))}<div class="hint">${esc(ago(m.received_at))}</div></td>
        <td><b>${esc(r ? r[1] : m.profile_name || "Unknown number")}</b><div class="hint mono">${esc(h.prettyCell(m.from_phone))}</div>${r ? "" : `<div class="hint">Not matched to a member</div>`}</td>
        <td style="max-width:360px;white-space:pre-wrap;">${esc(m.body || "")}</td>
        <td style="white-space:nowrap;">${ctx.canEdit ? `<button type="button" class="btn small primary" data-cm-reply="${i}">Reply</button> <button type="button" class="btn small" data-cm-toggle="${i}">${m.status === "new" ? "Mark handled" : "Reopen"}</button>` : ""}</td></tr>`; }).join("")}</tbody></table></div>`
      : h.stateHtml("empty", waConnected() ? "No replies yet. When a member answers one of your messages it appears here." : "Connect WhatsApp Business (Channels) and set up the webhook to receive member replies here.")}
  </div>`;
  wireRetry(ctx);
  ctx.body.querySelector("#cm-refresh").onclick = () => reload(ctx);
  ctx.body.querySelectorAll("[data-cm-toggle]").forEach((b) => (b.onclick = async () => {
    const m = rows[+b.dataset.cmToggle], next = m.status === "new" ? "handled" : "new";
    try { await api.markCommInbound(m.id, next); m.status = next; ctx.rerender(); } catch (e) { h.toast("Couldn't update: " + ((e && e.message) || e), true); }
  }));
  ctx.body.querySelectorAll("[data-cm-reply]").forEach((b) => (b.onclick = () => replyModal(ctx, rows[+b.dataset.cmReply], byNum.get(rows[+b.dataset.cmReply].from_phone))));
}
function replyModal(ctx, m, member) {
  const { h } = ctx, { esc } = h;
  const inWindow = Date.now() - new Date(m.received_at) < 24 * 3600 * 1000;
  const canApi = waConnected() && inWindow;
  const { scrim, close } = h.govModal("Reply to " + (member ? member[1] : m.profile_name || h.prettyCell(m.from_phone)), `
    ${bubble(m.body || "")}
    <div class="field" style="margin-top:12px;"><label for="rp-body">Your reply</label><textarea id="rp-body" rows="4"></textarea></div>
    <p class="hint" style="margin:0;">${canApi ? "This member wrote within the last 24 hours, so you can reply directly from the platform." : waConnected() ? "More than 24 hours have passed, so WhatsApp only allows an approved template message — open the chat in WhatsApp instead." : "Open the chat in WhatsApp to reply."}</p>
    <div id="rp-msg" class="hint" style="margin-top:8px;"></div>`,
    `<button class="btn" data-act="close" type="button">Cancel</button>${canApi ? '<button class="btn primary" type="button" id="rp-api">Send from platform</button>' : ""}<button class="btn" type="button" id="rp-wa">Open in WhatsApp</button>`, 520);
  const $ = (s) => scrim.querySelector(s), text = () => $("#rp-body").value.trim();
  const done = async () => { try { await api.markCommInbound(m.id, "handled"); m.status = "handled"; } catch (e) {} close(); ctx.rerender(); };
  $("#rp-wa").onclick = () => { if (!text()) { $("#rp-msg").textContent = "Type a reply first."; return; } window.open(`https://wa.me/${m.from_phone}?text=${encodeURIComponent(text())}`, "_blank", "noopener"); done(); };
  const a = $("#rp-api");
  if (a) a.onclick = async () => {
    if (!text()) { $("#rp-msg").textContent = "Type a reply first."; return; }
    a.disabled = true; $("#rp-msg").textContent = "Sending…";
    try {
      const res = await api.whatsappSend({ org_id: ctx.orgId, mode: "text", body: text(), recipients: [{ beneficiary_id: member ? member._id || null : null, name: member ? member[1] : m.profile_name || "", phone: m.from_phone }] });
      if (res.sent) { h.toast("Reply sent."); done(); } else { $("#rp-msg").textContent = "Not sent: " + (((res.results || [])[0] || {}).error || "unknown error"); a.disabled = false; }
    } catch (e) { $("#rp-msg").textContent = "Not sent: " + ((e && e.message) || e); a.disabled = false; }
  };
}

/* ----------------------------------------------------------- channels --- */
const TEMPLATE_TEXT = "Hello {{1}}, a message from {{2}}: {{3}}";
function renderChannels(ctx) {
  const { h } = ctx, { esc } = h, wa = S.wa, st = (wa && wa.settings) || {};
  const hook = `${FUNCTIONS_URL}/whatsapp-webhook`;
  const connected = waConnected();
  ctx.body.innerHTML = `${errBanner(ctx)}
  <div class="card">
    <div class="card-head"><div><h3>WhatsApp Business ${connected ? h.pill("Connected", "good") : h.pill("Not connected", "neutral")}</h3>
      <span class="hint">Connect your CPA's own WhatsApp Business number to send announcements to the whole membership and receive replies here.</span></div>
      ${ctx.isAdmin ? `<div style="display:flex;gap:6px;flex-wrap:wrap;">${connected
        ? '<button type="button" class="btn small" id="ch-test">Send a test</button><button type="button" class="btn small" id="ch-tpl">Change template</button><button type="button" class="btn small" id="ch-conn">Reconnect</button><button type="button" class="btn small danger" id="ch-disc">Disconnect</button>'
        : '<button type="button" class="btn primary" id="ch-conn">Connect WhatsApp Business</button>'}</div>` : ""}</div>
    ${connected ? `<div class="grid grid-3">
        ${h.statTile("Number", st.display_phone_number || wa.account_label || "—", st.verified_name || "", "")}
        ${h.statTile("Template", st.template_name || "—", `Language ${st.template_lang || "en"}`, "")}
        ${h.statTile("Quality rating", st.quality_rating || "—", wa.last_used_at ? "Last used " + ago(wa.last_used_at) : "Not used yet", st.quality_rating === "RED" ? "critical" : st.quality_rating === "YELLOW" ? "warning" : "good")}</div>`
      : `<p class="hint" style="margin:0;">Until it's connected you can still send one-by-one on WhatsApp (free, no set-up) from Compose.</p>`}
    ${ctx.isAdmin ? "" : `<p class="hint">Only a CPA admin can connect or change the WhatsApp number.</p>`}
    <details style="margin-top:14px;"><summary style="cursor:pointer;font-weight:600;">What you need to connect (one-time set-up)</summary>
      <ol class="hint" style="line-height:1.7;padding-left:18px;">
        <li>A <b>Meta Business account</b> (business.facebook.com) — complete <i>business verification</i> with the CPA's registration documents.</li>
        <li>In Meta for Developers, create an app with the <b>WhatsApp</b> product and add the CPA's business phone number (a number not already on the WhatsApp app).</li>
        <li>Create a <b>message template</b> (category <i>Utility</i>, language as you choose) with exactly this text, then wait for Meta's approval:
          <div class="mono" style="margin:4px 0;padding:6px 8px;background:var(--surface-2);border-radius:6px;">${esc(TEMPLATE_TEXT)} <button type="button" class="linkbtn" id="ch-copytpl">Copy</button></div>
          <span>Template parameters: {{1}} the member's first name, {{2}} your CPA's name, {{3}} the message.</span></li>
        <li>Create a <b>System User</b> in Business Settings, assign it your WhatsApp account, and generate a <b>permanent access token</b> (permissions <i>whatsapp_business_messaging</i> and <i>whatsapp_business_management</i>).</li>
        <li>Press <b>Connect</b> above and paste the Phone Number ID, the token and the template name. The token is stored in a locked server table — it never comes back to the browser.</li>
        <li>To see delivery receipts and member replies, point the Meta webhook (WhatsApp → Configuration) at the URL below and subscribe to <i>messages</i>.</li></ol>
      <div class="field"><label>Webhook callback URL</label><div class="mono" style="padding:6px 8px;background:var(--surface-2);border-radius:6px;word-break:break-all;">${esc(hook)}</div></div>
      <p class="hint">The platform operator sets two server secrets once for all CPAs: <span class="mono">WHATSAPP_APP_SECRET</span> (your Meta app secret) and <span class="mono">WHATSAPP_VERIFY_TOKEN</span> (any phrase you choose, entered again in Meta as the “Verify token”). Until they are set the webhook safely refuses all requests.</p>
      <p class="hint"><b>Good to know:</b> WhatsApp only allows business-initiated messages to people who have agreed to hear from you (keep a record of consent) and starts new numbers at 250 contacts per day, rising automatically with good quality. Free-text replies are allowed only within 24 hours of a member's message.</p>
    </details>
  </div>
  <div class="card" style="margin-top:14px;">
    <div class="card-head"><div><h3>All communication channels</h3><span class="hint">What's available now and what we recommend adding, so every message to members is sent and recorded from one place.</span></div></div>
    <div class="table-wrap"><table><thead><tr><th>Channel</th><th>Status</th><th>Best for</th><th>Cost</th><th>Effort to enable</th></tr></thead><tbody>
      ${ROADMAP.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${h.pill(c.state, c.state === "Available" ? "good" : c.state === "Next" ? "warning" : "neutral")}</td><td>${esc(c.best)}</td><td>${esc(c.cost)}</td><td>${esc(c.effort)}</td></tr>`).join("")}</tbody></table></div>
  </div>`;
  wireRetry(ctx);
  const $ = (s) => ctx.body.querySelector(s);
  const ct = $("#ch-copytpl"); if (ct) ct.onclick = async () => { try { await navigator.clipboard.writeText(TEMPLATE_TEXT); h.toast("Template text copied."); } catch (e) { h.toast("Select the text and copy it.", true); } };
  const cb = $("#ch-conn"); if (cb) cb.onclick = () => connectModal(ctx);
  const tb = $("#ch-tpl"); if (tb) tb.onclick = () => templateModal(ctx);
  const tt = $("#ch-test"); if (tt) tt.onclick = () => testModal(ctx);
  const db = $("#ch-disc"); if (db) db.onclick = () => h.confirmModal("Disconnect WhatsApp Business? Sending stops immediately and the stored access token is deleted. Your message history stays.", async () => {
    try { await api.whatsappConnect({ action: "disconnect", org_id: ctx.orgId }); h.toast("WhatsApp Business disconnected."); S.loaded = false; ctx.rerender(); }
    catch (e) { h.toast("Couldn't disconnect: " + ((e && e.message) || e), true); }
  });
}
function connectModal(ctx) {
  const { h } = ctx, { esc } = h, st = (S.wa && S.wa.settings) || {};
  const { scrim, close } = h.govModal("Connect WhatsApp Business", `
    <p class="hint" style="margin-top:0;">Details come from Meta for Developers → your app → WhatsApp → API Setup. The details are checked with Meta before anything is saved.</p>
    <div class="field"><label for="wc-pid">Phone number ID</label><input id="wc-pid" type="text" inputmode="numeric" autocomplete="off" value="${esc(st.phone_number_id || "")}" placeholder="e.g. 109876543210987"></div>
    <div class="field"><label for="wc-waba">WhatsApp Business Account ID <span class="hint">(optional)</span></label><input id="wc-waba" type="text" inputmode="numeric" autocomplete="off" value="${esc(st.waba_id || "")}"></div>
    <div class="field"><label for="wc-tok">Permanent access token</label><input id="wc-tok" type="password" autocomplete="new-password" spellcheck="false" placeholder="Paste the System User token"></div>
    <div class="field"><label for="wc-tpl">Approved template name</label><input id="wc-tpl" type="text" autocomplete="off" value="${esc(st.template_name || "")}" placeholder="e.g. cpa_announcement"></div>
    <div class="field"><label for="wc-lang">Template language code</label><input id="wc-lang" type="text" autocomplete="off" value="${esc(st.template_lang || "en")}" placeholder="en"></div>
    <div id="wc-msg" class="hint" role="status"></div>`,
    `<button class="btn" data-act="close" type="button">Cancel</button><button class="btn primary" type="button" id="wc-go">Check &amp; connect</button>`, 520);
  const $ = (s) => scrim.querySelector(s);
  $("#wc-go").onclick = async () => {
    const v = { phone_number_id: $("#wc-pid").value.trim(), waba_id: $("#wc-waba").value.trim(), access_token: $("#wc-tok").value.trim(), template_name: $("#wc-tpl").value.trim(), template_lang: $("#wc-lang").value.trim() || "en" };
    const bad = !v.phone_number_id ? "Enter the Phone number ID." : !v.access_token ? "Paste the access token." : !v.template_name ? "Enter the approved template name." : "";
    if (bad) { $("#wc-msg").textContent = bad; return; }
    const btn = $("#wc-go"); btn.disabled = true; $("#wc-msg").textContent = "Checking with Meta…";
    try {
      const out = await api.whatsappConnect({ action: "connect", org_id: ctx.orgId, ...v });
      $("#wc-tok").value = "";
      close(); h.toast("WhatsApp Business connected: " + (out.label || "ok")); S.loaded = false; ctx.rerender();
    } catch (e) { $("#wc-msg").textContent = (e && e.message) || String(e); $("#wc-msg").style.color = "var(--status-critical)"; btn.disabled = false; }
  };
}
function templateModal(ctx) {
  const { h } = ctx, { esc } = h, st = (S.wa && S.wa.settings) || {};
  const { scrim, close } = h.govModal("Change template", `
    <div class="field"><label for="wt-tpl">Approved template name</label><input id="wt-tpl" type="text" value="${esc(st.template_name || "")}"></div>
    <div class="field"><label for="wt-lang">Language code</label><input id="wt-lang" type="text" value="${esc(st.template_lang || "en")}"></div>
    <div id="wt-msg" class="hint"></div>`, `<button class="btn" data-act="close" type="button">Cancel</button><button class="btn primary" type="button" id="wt-go">Save</button>`, 440);
  scrim.querySelector("#wt-go").onclick = async () => {
    const btn = scrim.querySelector("#wt-go"); btn.disabled = true;
    try { await api.whatsappConnect({ action: "update", org_id: ctx.orgId, template_name: scrim.querySelector("#wt-tpl").value.trim(), template_lang: scrim.querySelector("#wt-lang").value.trim() || "en" }); close(); h.toast("Template updated."); S.loaded = false; ctx.rerender(); }
    catch (e) { scrim.querySelector("#wt-msg").textContent = (e && e.message) || String(e); btn.disabled = false; }
  };
}
function testModal(ctx) {
  const { h } = ctx;
  const { scrim } = h.govModal("Send a test message", `
    <p class="hint" style="margin-top:0;">Sends your approved template with a short test text to one number — use your own cell to check the connection and the wording.</p>
    <div class="field"><label for="wx-num">Cell number</label><input id="wx-num" type="tel" placeholder="082 123 4567"></div><div id="wx-msg" class="hint" role="status"></div>`,
    `<button class="btn" data-act="close" type="button">Close</button><button class="btn primary" type="button" id="wx-go">Send test</button>`, 440);
  scrim.querySelector("#wx-go").onclick = async () => {
    const n = h.waNumber(scrim.querySelector("#wx-num").value), msg = scrim.querySelector("#wx-msg");
    if (!n) { msg.textContent = "Enter a valid South African cell number."; return; }
    msg.textContent = "Sending…";
    try {
      const res = await api.whatsappSend({ org_id: ctx.orgId, mode: "template", body: "This is a test message from CPA360.", recipients: [{ name: "Test", phone: n }] });
      msg.textContent = res.sent ? "Sent — check that phone." : "Not sent: " + (((res.results || [])[0] || {}).error || "unknown error");
    } catch (e) { msg.textContent = "Not sent: " + ((e && e.message) || e); }
  };
}

/* ------------------------------------------------- condolence notices --- */
/* When a member is marked Deceased the dashboard queues one notice (death_notices). Nothing is
   sent automatically: a person reviews the wording, confirms the family has been told, and sends
   through WhatsApp Business or one-by-one. A notice can't be un-sent, so there is always this
   confirmation. Defaults protect the family: the household of the deceased is skipped (tell them
   personally), as are members who declined messages, minors and anyone without a cell number. */
export async function openDeathNotice(ctx, notice) {
  if (!S || S.orgId !== ctx.orgId) S = fresh(ctx.orgId);
  if (!S.loaded) {
    try { Object.assign(S, await api.loadComm(ctx.orgId)); S.error = ""; } catch (e) { S.error = (e && e.message) || String(e); }
    S.loaded = true;
  }
  deathDialog(ctx, notice);
}
async function dismissNotice(ctx, n) {
  ctx.h.confirmModal(`Don't send a condolence notice for ${n.name}? The notice is cleared and no message goes out.`, async () => {
    try { await ctx.resolveNotice(n.id, "dismissed"); ctx.h.toast("Notice cleared."); } catch (e) { ctx.h.toast("Couldn't update: " + ((e && e.message) || e), true); }
  });
}
function deathDialog(ctx, n) {
  const { h } = ctx, { esc } = h;
  const reg = ctx.register() || [], dead = reg.find((r) => r._id === n.beneficiary_id) || null;
  const full = String((dead && dead[1]) || n.name || "the member").trim();
  const d = { tpl: "condolence", title: `Condolences — ${full}`, f: { kind: "death_notice", member: (dead && dead[0]) || "", verif: "all", pos: "all", gender: "all", hh: "", adults: true },
    body: `With deep sadness we share the passing of ${full}${dead && dead[0] ? ` (member no. ${dead[0]})` : ""}. The Committee and all members of {cpa} send their condolences to the family. [Funeral / memorial details]` };
  let skipHh = true;
  const narrow = () => {
    const a = audienceOf(ctx, d.f);
    const keep = (r) => r !== dead && !(skipHh && dead && dead[5] && r[5] === dead[5]);
    const reach = a.reach.filter(keep);
    return { match: a.match.filter(keep), declined: a.declined.filter(keep), reach, noNumber: a.noNumber, skipped: a.reach.length - reach.length };
  };
  const { scrim, close } = h.govModal("Condolence notice — " + full, `
    <p class="hint" style="margin:0 0 8px;"><b>${esc(full)}</b> was marked <b>Deceased</b>. Review the message, then send it to the membership. This can't be unsent.</p>
    <div class="field"><label for="dn-body">Message <span class="hint">(replace the [brackets] with the funeral or memorial details, or delete them)</span></label><textarea id="dn-body" rows="5"></textarea></div>
    <label class="cm-check"><input type="checkbox" id="dn-hh" checked> Don't message the deceased's own household — tell the family personally</label>
    <div id="dn-aud" class="hint" style="margin:8px 0;"></div>
    <label class="cm-check"><input type="checkbox" id="dn-ok"> I have spoken to the family and the Committee agrees this can be announced.</label>
    <div id="dn-msg" class="hint" role="status" style="margin-top:8px;"></div>`,
    `<button class="btn" data-act="close" type="button">Not now</button>
     <button class="btn" id="dn-skip" type="button">Don't send</button>
     <button class="btn" id="dn-man" type="button" disabled>Send one-by-one</button>
     <button class="btn primary" id="dn-api" type="button" disabled>Send via WhatsApp Business</button>`, 600);
  const $s = (q) => scrim.querySelector(q);
  $s("#dn-body").value = d.body;
  const refresh = () => {
    const a = narrow(), ok = $s("#dn-ok").checked, body = resolve(ctx, d.body);
    $s("#dn-aud").textContent = `${a.reach.length} member${a.reach.length === 1 ? "" : "s"} will be messaged` +
      `${a.skipped ? ` · ${a.skipped} in the family's household skipped` : ""}${a.declined.length ? ` · ${a.declined.length} declined messages` : ""}${a.noNumber ? ` · ${a.noNumber} have no usable cell number (use a printed notice)` : ""}.`;
    const why = !ok ? "Confirm the family has been told first." : brackets(d.body) ? "Fill in or remove the [brackets] first." : !body ? "Write a message first." : !a.reach.length ? "No members can be reached." : "";
    const apiWhy = why || (!waConnected() ? "Connect WhatsApp Business under Channels first." : body.length > MAX_API_CHARS ? `Shorten the message to ${MAX_API_CHARS} characters.` : "");
    $s("#dn-man").disabled = !!why; $s("#dn-man").title = why;
    $s("#dn-api").disabled = !!apiWhy; $s("#dn-api").title = apiWhy;
    return a;
  };
  $s("#dn-body").oninput = (e) => { d.body = e.target.value; refresh(); };
  $s("#dn-hh").onchange = (e) => { skipHh = e.target.checked; refresh(); };
  $s("#dn-ok").onchange = refresh;
  refresh();
  const done = async (msg) => { try { await ctx.resolveNotice(n.id, "sent", msg && msg.id); } catch (e) {} close(); };
  $s("#dn-api").onclick = () => sendApi(ctx, refresh(), d, { onSent: done });
  $s("#dn-man").onclick = () => manualQueue(ctx, refresh(), d, { onSent: async (msg) => { try { await ctx.resolveNotice(n.id, "sent", msg && msg.id); } catch (e) {} } });
  $s("#dn-skip").onclick = () => { close(); dismissNotice(ctx, n); };
}
