/* ============================================================================
 * CPA360 Back Office — the team's workspace for running the JV, built on
 * CPA360-OPS-01 (Operations Plan 2026–2029).
 *
 *   Overview      plan clock, my work, deadlines, platform pulse, activity
 *   Tasks         project board (drag between columns) and list, comments
 *   Roadmap       mobilisation → Year 3 milestones, ready-to-operate checklist
 *   Clients       BD pipeline (16.1), client lifecycle with SLAs (10), leads
 *   Field visits  visit plan and reports (K11, K12)
 *   Support desk  tickets with tier and severity SLAs (12.2, K21/K22/K24)
 *   KPIs          scorecard (24, 31) — computed where the data allows
 *   Governance    decisions log (25.1) and risk register (21)
 *   Platform      live, read-only view of every CPA on the platform
 *   Team          roster, vacancies, workload, access (26, 30)
 *
 * Same Supabase login as the platform. Access is enforced in the database
 * (bo_is_staff / bo_is_manager); hiding things here is only for tidiness.
 * ==========================================================================*/
import { supabase } from "./supabase.js";
import { signIn, sendMagicLink, signOut, onAuth, getSession } from "./auth.js";
import { db, DEMO } from "./backoffice-data.js";

const root = document.getElementById("root");

/* ---------- vocabularies ---------- */
const DEPTS = { delivery: "Client Delivery", back_office: "Back Office", platform: "Platform & Technology", programme: "Programme & Quality", bd: "Business Development", committee: "Committee / Parties" };
const TASK_STATUS = { backlog: "Backlog", todo: "To do", in_progress: "In progress", review: "Review", blocked: "Blocked", done: "Done" };
const PRIORITY = { P1: "P1 Critical", P2: "P2 High", P3: "P3 Normal", P4: "P4 Low" };
const PHASES = { pre_signature: "Before signature", month_1: "Month 1 — governance & money", months_2_3: "Months 2–3 — platform, office, people", ready: "Ready-to-operate checklist", year_1: "Year 1 — set up and pilot", year_2: "Year 2 — grow and build", year_3: "Year 3 — scale and sustain" };
const MS_STATUS = { not_started: "Not started", in_progress: "In progress", at_risk: "At risk", blocked: "Blocked", done: "Done" };
const PIPELINE = { lead: "Lead", qualified: "Qualified", proposal: "Proposal", negotiation: "Negotiation", won: "Won", lost: "Lost / parked" };
const LIFECYCLE = { referral: "1 · Referral", first_contact: "2 · First contact", evidence: "3 · Evidence gathering", triage: "4 · Triage", triage_confirmed: "5 · Triage confirmed", declined: "6a · Declined (C)", on_hold: "6b · On hold (D)", proposal: "7 · Proposal & funding", contracting: "8 · Contracting", onboarding: "9 · Onboarding", stabilise: "10 · Stabilise (Gates 1–2)", build: "11 · Build (Gates 3–4)", sustain: "12 · Sustain (Gates 5–6)", graduated: "14 · Graduated", exited: "15 · Exited" };
const ACTIVE_LIFE = ["onboarding", "stabilise", "build", "sustain", "graduated"];
const SEGMENTS = { A: "A · Governance-recoverable", B: "B · Land/rights-complex", C: "C · Structurally non-viable", D: "D · Under external control" };
const KINDS = { cpa: "Client CPA", funder: "Funder", government: "Government", partner: "Partner", municipality: "Municipality" };
const STREAMS = { A: "A · Platform (JV)", B: "B · Facilitation", AB: "A + B" };
const TICKET_STATUS = { open: "Open", acknowledged: "Acknowledged", in_progress: "In progress", resolved: "Resolved", closed: "Closed" };
const RISK_STATUS = { open: "Open", monitoring: "Monitoring", closed: "Closed" };
const DECISION_STATUS = { open: "Open", decided: "Decided", deferred: "Deferred" };
const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];
const PARTIES = { GAD: "GAD Foundation", Afribot: "Afribot Solutions", JV: "JV-appointed" };
const KPI_GROUPS = [["K0", "JV level"], ["K1", "Client delivery"], ["K2", "Platform & technology"], ["K3", "Programme & quality"], ["K4", "Business development"], ["K5", "Back office"], ["K6", "Compliance & people"]];

/* ---------- state ---------- */
const S = {
  session: null, me: null, missing: false, loadError: "",
  d: { bo_team: [], bo_clients: [], bo_milestones: [], bo_tasks: [], bo_task_comments: [], bo_visits: [], bo_tickets: [], bo_risks: [], bo_decisions: [], bo_kpis: [], bo_kpi_readings: [], bo_settings: [] },
  platform: { orgs: [], leads: [], summary: null, error: "" },
  activity: [],
  ui: { taskView: "board", taskQ: "", taskDept: "", taskWho: "", taskMs: "", clientTab: "pipeline", navOpen: false },
};

/* ---------- small helpers ---------- */
const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const today = () => new Date().toISOString().slice(0, 10);
const toDate = (s) => (s ? new Date(String(s).length === 10 ? s + "T00:00:00" : s) : null);
const fmtD = (s) => (s ? toDate(s).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDT = (s) => (s ? toDate(s).toLocaleString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const daysUntil = (s) => (s ? Math.round((toDate(s) - toDate(today())) / 864e5) : null);
const money = (v) => (v == null || v === "" ? "—" : "R " + Number(v).toLocaleString("en-ZA", { maximumFractionDigits: 0 }));
const byId = (list, id) => list.find((x) => x.id === id);
const teamName = (id) => { const t = byId(S.d.bo_team, id); return t ? t.full_name || t.role_title + " (vacant)" : ""; };
const clientName = (id) => byId(S.d.bo_clients, id)?.name || "";
const msLabel = (id) => { const m = byId(S.d.bo_milestones, id); return m ? `${m.code ? m.code + " · " : ""}${m.title}` : ""; };
const orgName = (id) => byId(S.platform.orgs, id)?.name || "";
const isManager = () => !!S.me?.is_manager;
const myTeamId = () => S.me?.team?.id || null;

/** Business days between two dates (weekends excluded; public holidays are not). */
function bdBetween(a, b) {
  const s = toDate(a), e = toDate(b);
  if (!s || !e) return null;
  let n = 0;
  const d = new Date(s);
  const sign = e >= s ? 1 : -1;
  while ((sign > 0 && d < e) || (sign < 0 && d > e)) { d.setDate(d.getDate() + sign); const w = d.getDay(); if (w && w !== 6) n += sign; }
  return n;
}
const hoursBetween = (a, b) => (a && b ? (toDate(b) - toDate(a)) / 36e5 : null);

const ICONS = {
  home: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  kanban: "M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z",
  route: "M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM6 15V9a4 4 0 0 1 4-4h6M18 9v6a4 4 0 0 1-4 4H8",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 20v-2a4 4 0 0 0-3-3.9M16 2.1a4 4 0 0 1 0 7.8",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  life: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5.6 5.6l3.6 3.6M14.8 14.8l3.6 3.6M18.4 5.6l-3.6 3.6M9.2 14.8l-3.6 3.6",
  gauge: "M12 14l4-4M3.3 17a9 9 0 1 1 17.4 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  pulse: "M3 12h4l3-8 4 16 3-8h4",
  team: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  menu: "M4 6h16M4 12h16M4 18h16",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  moon: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z",
};
const svg = (k) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[k]}"/></svg>`;

const NAV = [
  { group: "Run the JV", items: [["overview", "Overview", "home"], ["tasks", "Tasks & projects", "kanban"], ["roadmap", "Roadmap & milestones", "route"]] },
  { group: "Clients", items: [["clients", "Pipeline & lifecycle", "users"], ["visits", "Field visits", "map"], ["support", "Support desk", "life"]] },
  { group: "Oversight", items: [["kpis", "KPI scorecard", "gauge"], ["governance", "Decisions & risks", "shield"], ["platform", "Platform link", "pulse"]] },
  { group: "Office", items: [["team", "Team", "team"], ["activity", "Activity log", "clock"]] },
];

/* ---------- plan clock ---------- */
function planInfo() {
  const p = S.d.bo_settings.find((s) => s.key === "plan")?.value || { month1: "2026-12-01", name: "CPA360 Operations Plan 2026–2029", code: "CPA360-OPS-01" };
  const m1 = toDate(p.month1), t = toDate(today());
  const month = (t.getFullYear() - m1.getFullYear()) * 12 + (t.getMonth() - m1.getMonth()) + 1;
  const year = Math.min(3, Math.max(1, Math.ceil(month / 12)));
  const label = month < 1 ? `Mobilisation · Month 1 starts ${fmtD(p.month1)}` : month > 36 ? "Beyond the 3-year plan" : `Month ${month} of 36 · Year ${year}`;
  return { ...p, month, year, label };
}

/* ============================================================================
 * Boot, auth and loading
 * ==========================================================================*/
async function boot() {
  applyTheme();
  if (DEMO) { S.session = { user: { email: "demo@cpa360.local" } }; return start(); }
  S.session = await getSession();
  onAuth((ev, session) => {
    if (ev === "SIGNED_IN" && !S.me) { S.session = session; start(); }
    if (ev === "SIGNED_OUT") { S.session = null; S.me = null; renderLogin(); }
  });
  if (!S.session) return renderLogin();
  start();
}

async function start() {
  root.className = "booting";
  root.textContent = "Loading the back office…";
  try {
    S.me = await db.me();
  } catch (e) {
    if (isMissing(e)) { S.missing = true; S.me = { is_staff: false }; return renderMissing(); }
    root.className = ""; root.innerHTML = authShell(`<h1>Couldn't open the back office</h1><div class="msg err">${esc(e.message)}</div>`);
    return;
  }
  if (!S.me?.is_staff) return renderNoAccess();
  await loadAll();
  window.addEventListener("hashchange", render);
  render();
}

const isMissing = (e) => /PGRST20[25]|42P01|42883|Could not find the (function|table)/i.test(`${e?.code || ""} ${e?.message || ""}`);

async function loadAll() {
  const tables = Object.keys(S.d);
  const res = await Promise.allSettled(tables.map((t) => db.list(t)));
  const errs = [];
  res.forEach((r, i) => { if (r.status === "fulfilled") S.d[tables[i]] = r.value || []; else errs.push(`${tables[i]}: ${r.reason?.message}`); });
  S.loadError = errs.length ? errs.join(" · ") : "";
  await loadPlatform();
  try { S.activity = await db.activity(); } catch { S.activity = []; }
}

async function loadPlatform() {
  const [o, l, s] = await Promise.allSettled([db.rpc("bo_platform_orgs"), db.rpc("bo_platform_leads"), db.rpc("bo_platform_summary")]);
  S.platform.orgs = o.status === "fulfilled" ? o.value || [] : [];
  S.platform.leads = l.status === "fulfilled" ? l.value || [] : [];
  S.platform.summary = s.status === "fulfilled" ? s.value : null;
  S.platform.error = [o, l, s].find((x) => x.status === "rejected")?.reason?.message || "";
}

function authShell(inner) {
  return `<div class="auth-wrap"><div class="auth-card">
    <div class="bo-auth-brand"><img src="./assets/logo-cpa360.webp" alt="" width="34" height="34"><div><b>CPA360™ Back Office</b><span>Team workspace · Operations</span></div></div>
    ${inner}</div></div>`;
}

function renderLogin(msg = "") {
  root.className = "";
  root.innerHTML = authShell(`
    <h1>Team sign-in</h1>
    <p class="sub">Use your CPA360 platform login. Only back-office staff can open this workspace.</p>
    ${msg}
    <form id="bo-login">
      <div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email" required></div>
      <div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password"></div>
      <button class="btn primary lg" type="submit">Sign in</button>
    </form>
    <p class="bo-auth-alt"><button class="linkbtn" id="magic" type="button">Email me a sign-in link instead</button> · <a href="./app.html">Back to the platform</a></p>
    <p class="bo-auth-alt"><a href="?demo">Try the demo (sample data, nothing saved)</a></p>`);
  const f = root.querySelector("#bo-login");
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button"); btn.disabled = true; btn.textContent = "Signing in…";
    const { error } = await signIn(f.em.value.trim(), f.pw.value);
    if (error) renderLogin(`<div class="msg err">${esc(error.message)}</div>`);
  };
  root.querySelector("#magic").onclick = async () => {
    const email = f.em.value.trim();
    if (!email) return renderLogin(`<div class="msg err">Type your email first.</div>`);
    const { error } = await sendMagicLink(email);
    renderLogin(error ? `<div class="msg err">${esc(error.message)}</div>` : `<div class="msg ok">Check ${esc(email)} for a sign-in link.</div>`);
  };
}

function renderNoAccess() {
  root.className = "";
  root.innerHTML = authShell(`
    <h1>No back-office access</h1>
    <p class="sub">You're signed in as <b>${esc(S.session?.user?.email)}</b>, but this login isn't on the back-office team yet.
      Ask the JV Operations Lead to add your email under <b>Team</b>.</p>
    <div class="bo-row"><a class="btn" href="./app.html">Go to the platform</a><button class="btn ghost" id="so" type="button">Sign out</button></div>`);
  root.querySelector("#so").onclick = () => signOut();
}

function renderMissing() {
  root.className = "";
  root.innerHTML = authShell(`
    <h1>Back office not installed yet</h1>
    <p class="sub">The database tables for the back office haven't been created in this Supabase project.
      Run <code>supabase/migrations/0054_backoffice.sql</code> and then <code>0055_backoffice_seed.sql</code>
      (Supabase → SQL editor), then reload.</p>
    <div class="bo-row"><a class="btn" href="?demo">Open the demo instead</a><button class="btn ghost" id="so" type="button">Sign out</button></div>`);
  root.querySelector("#so").onclick = () => signOut();
}

/* ============================================================================
 * Shell and routing
 * ==========================================================================*/
const route = () => (location.hash.replace(/^#\/?/, "").split("/")[0] || "overview");

function render() {
  const r = route();
  const item = NAV.flatMap((g) => g.items).find((i) => i[0] === r) || NAV[0].items[0];
  const plan = planInfo();
  const user = S.session?.user?.email || "";
  root.className = "";
  root.innerHTML = `
  <div class="app bo" data-nav-open="${S.ui.navOpen}">
    <div class="nav-scrim" id="scrim"></div>
    <aside class="sidebar">
      <div class="sb-brand"><div class="sb-mark"><img src="./assets/logo-cpa360.webp" alt=""></div>
        <div class="sb-brand-txt"><b>CPA360™</b><span>Back Office</span></div></div>
      <nav class="sb-nav" aria-label="Back office">
        ${NAV.map((g) => `<div class="sb-group">${g.group}</div>` + g.items.map(([id, label, ic]) =>
          `<a class="sb-link${id === item[0] ? " active" : ""}" href="#/${id}"${id === item[0] ? ' aria-current="page"' : ""}>${svg(ic)}<span>${label}</span>${navCount(id)}</a>`).join("")).join("")}
        <div class="sb-group">Platform</div>
        <a class="sb-link" href="./app.html">${svg("ext")}<span>Open CPA360 platform</span></a>
      </nav>
      <div class="sb-foot"><div class="bo-plan-mini">${esc(plan.code || "")} · ${esc(plan.label)}</div>
        <button class="sb-foot-btn" id="signout" type="button">Sign out ${esc(user)}</button></div>
    </aside>
    <div class="bo-main">
      <header class="topbar">
        <button class="tb-menu" id="menu" type="button" aria-label="Open menu">${svg("menu")}</button>
        <div class="tb-title"><span class="eyebrow">Back Office${DEMO ? " · Demo" : ""}</span><h1>${esc(item[1])}</h1></div>
        <div class="bo-tb-right">
          ${DEMO ? `<span class="badge gold" title="Nothing you change here is saved">Demo data</span>` : ""}
          <span class="badge brand bo-hide-sm">${esc(plan.label)}</span>
          <button class="bo-icon" id="theme" type="button" aria-label="Toggle dark mode">${svg("moon")}</button>
        </div>
      </header>
      <main class="viewport bo-vp" id="view" tabindex="-1">
        ${S.loadError ? `<div class="msg err">Some data didn't load — ${esc(S.loadError)}</div>` : ""}
        ${VIEWS[item[0]]()}
      </main>
    </div>
  </div>
  <div id="drawer-host"></div>`;
  wireShell();
  (WIRES[item[0]] || (() => {}))();
}

function navCount(id) {
  let n = 0;
  if (id === "tasks") n = S.d.bo_tasks.filter((t) => t.status !== "done" && t.due_date && t.due_date < today()).length;
  if (id === "support") n = S.d.bo_tickets.filter((t) => t.status === "open").length;
  if (id === "clients") n = S.platform.leads.filter((l) => !l.imported && l.status === "new").length;
  return n ? `<span class="bo-count">${n}</span>` : "";
}

function wireShell() {
  const app = root.querySelector(".app");
  const setNav = (v) => { S.ui.navOpen = v; app.dataset.navOpen = v; };
  root.querySelector("#menu").onclick = () => setNav(true);
  root.querySelector("#scrim").onclick = () => setNav(false);
  root.querySelectorAll(".sb-link").forEach((a) => a.addEventListener("click", () => setNav(false)));
  root.querySelector("#signout").onclick = () => (DEMO ? (location.href = "./backoffice.html") : signOut());
  root.querySelector("#theme").onclick = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("cpa360.theme", next); } catch {}
  };
  root.querySelectorAll("[data-open]").forEach((el) => el.addEventListener("click", (e) => {
    const own = e.target.closest("select,input,textarea,button,a");
    if (own && own !== el) return;
    e.preventDefault();
    const [table, id] = el.dataset.open.split(":");
    openDrawer(table, id === "new" ? null : id, el.dataset.preset ? JSON.parse(el.dataset.preset) : {});
  }));
  root.querySelectorAll("[data-quick]").forEach((sel) => sel.addEventListener("change", async () => {
    const [table, id, field] = sel.dataset.quick.split(":");
    await save(table, id, { [field]: sel.value || null }, true);
  }));
}

function applyTheme() {
  try { const t = localStorage.getItem("cpa360.theme"); if (t === "dark" || t === "light") document.documentElement.dataset.theme = t; } catch {}
}

/* ---------- shared bits ---------- */
const tile = (k, v, m = "", tone = "") => `<div class="tile${tone ? " bo-tone-" + tone : ""}"><div class="k">${k}</div><div class="v">${v}</div>${m ? `<div class="m">${m}</div>` : ""}</div>`;
const opts = (map, cur, blank = "—") => (blank !== null ? `<option value="">${blank}</option>` : "") + Object.entries(map).map(([v, l]) => `<option value="${esc(v)}"${String(v) === String(cur ?? "") ? " selected" : ""}>${esc(l)}</option>`).join("");
const teamOpts = () => Object.fromEntries(S.d.bo_team.filter((t) => t.status !== "left").map((t) => [t.id, t.full_name ? `${t.full_name} — ${t.role_title}` : `${t.role_title} (vacant)`]));
const statusTone = { done: "good", decided: "good", won: "good", resolved: "good", closed: "good", in_progress: "info", review: "info", acknowledged: "info", monitoring: "info", at_risk: "warning", blocked: "critical", lost: "critical", open: "warning" };
const chip = (map, v) => `<span class="badge ${statusTone[v] || ""}">${esc(map[v] || v || "—")}</span>`;
const prioChip = (p) => `<span class="bo-prio bo-${(p || "P3").toLowerCase()}">${esc(p || "P3")}</span>`;
function dueChip(d, done) {
  if (!d) return `<span class="bo-muted">No date</span>`;
  const n = daysUntil(d);
  const tone = done ? "" : n < 0 ? "critical" : n <= 3 ? "warning" : "";
  const txt = done ? fmtD(d) : n < 0 ? `${-n}d overdue` : n === 0 ? "Due today" : n <= 14 ? `In ${n}d` : fmtD(d);
  return `<span class="badge ${tone}" title="${esc(fmtD(d))}">${txt}</span>`;
}
const bar = (pct, tone = "") => `<div class="bo-bar" role="img" aria-label="${Math.round(pct)}%"><span class="${tone}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>`;
const empty = (msg) => `<div class="bo-empty">${msg}</div>`;
const sectionHead = (title, actions = "") => `<div class="bo-sec"><h2>${title}</h2><div class="bo-row">${actions}</div></div>`;
const addBtn = (table, label, preset) => `<button class="btn bo-add" type="button" data-open="${table}:new"${preset ? ` data-preset='${esc(JSON.stringify(preset))}'` : ""}>${svg("plus")}${label}</button>`;

/* ============================================================================
 * Views
 * ==========================================================================*/
const VIEWS = {};
const WIRES = {};

/* ---------- Overview ---------- */
VIEWS.overview = () => {
  const plan = planInfo();
  const T = S.d.bo_tasks, open = T.filter((t) => t.status !== "done");
  const overdue = open.filter((t) => t.due_date && t.due_date < today());
  const ms = S.d.bo_milestones, msDone = ms.filter((m) => m.status === "done").length;
  const activeCpas = S.d.bo_clients.filter((c) => c.kind === "cpa" && ACTIVE_LIFE.includes(c.lifecycle)).length;
  const pipeline = S.d.bo_clients.filter((c) => ["qualified", "proposal", "negotiation"].includes(c.pipeline_stage));
  const highRisks = S.d.bo_risks.filter((r) => r.status !== "closed" && r.likelihood * r.impact >= 15).length;
  const openDecisions = S.d.bo_decisions.filter((d) => d.status === "open");
  const p1 = S.d.bo_tickets.filter((t) => t.severity === "P1" && !["resolved", "closed"].includes(t.status)).length;
  const mine = myTeamId() ? open.filter((t) => t.assignee_id === myTeamId()) : [];
  const horizon = [
    ...open.filter((t) => t.due_date && daysUntil(t.due_date) <= 14).map((t) => ({ kind: "Task", label: t.title, d: t.due_date, open: `bo_tasks:${t.id}` })),
    ...ms.filter((m) => m.status !== "done" && m.due_date && daysUntil(m.due_date) <= 30).map((m) => ({ kind: m.code || "Milestone", label: m.title, d: m.due_date, open: `bo_milestones:${m.id}` })),
    ...openDecisions.filter((d) => d.due_date && daysUntil(d.due_date) <= 30).map((d) => ({ kind: d.code || "Decision", label: d.decision, d: d.due_date, open: `bo_decisions:${d.id}` })),
  ].sort((a, b) => a.d.localeCompare(b.d)).slice(0, 12);
  const sc = scorecard();
  const reds = sc.filter((k) => k.status === "red");
  const ps = S.platform.summary;

  return `
  <section class="bo-hero">
    <div><span class="eyebrow">${esc(plan.name)} · ${esc(plan.code || "")} v${esc(plan.version || "")}</span>
      <h2>${esc(plan.label)}</h2>
      <p>${plan.month < 1 ? `Signature target ${fmtD(plan.signature_target)}. Nothing is sold and no CPA is onboarded until the ready-to-operate checklist is signed off.` : `Year ${plan.year} targets apply across the scorecard.`}</p></div>
    <div class="bo-hero-prog"><div class="bo-ring" style="--p:${ms.length ? (msDone / ms.length) * 100 : 0}"><b>${ms.length ? Math.round((msDone / ms.length) * 100) : 0}%</b><span>milestones</span></div></div>
  </section>
  <div class="tiles">
    ${tile("Active client CPAs", activeCpas, `Year ${plan.year} target ${S.d.bo_kpis.find((k) => k.id === "K01")?.["target_y" + plan.year] ?? "—"}`)}
    ${tile("Qualified pipeline", pipeline.length, money(pipeline.reduce((s, c) => s + Number(c.value_zar || 0), 0)) + " open value")}
    ${tile("Open tasks", open.length, overdue.length ? `<b class="bo-red">${overdue.length} overdue</b>` : "None overdue", overdue.length ? "critical" : "")}
    ${tile("Decisions open", openDecisions.length, `${openDecisions.filter((d) => d.due_date && d.due_date < today()).length} past their date`)}
    ${tile("High risks", highRisks, "Score ≥ 15 of 25", highRisks ? "warning" : "")}
    ${tile("P1 incidents open", p1, "Acknowledge in 4 business hours", p1 ? "critical" : "")}
  </div>
  <div class="bo-grid2">
    <section class="card">
      ${sectionHead("Coming up", `<a class="linkbtn" href="#/roadmap">Roadmap</a>`)}
      ${horizon.length ? `<ul class="bo-list">${horizon.map((h) => `<li data-open="${h.open}" class="bo-click"><span class="bo-tag">${esc(h.kind)}</span><span class="bo-grow">${esc(h.label)}</span>${dueChip(h.d)}</li>`).join("")}</ul>` : empty("Nothing due in the next two weeks.")}
    </section>
    <section class="card">
      ${sectionHead(myTeamId() ? "My open tasks" : "Overdue tasks", `<a class="linkbtn" href="#/tasks">Board</a>`)}
      ${(() => { const list = (myTeamId() ? mine : overdue).slice(0, 10); return list.length ? `<ul class="bo-list">${list.map((t) => `<li data-open="bo_tasks:${t.id}" class="bo-click">${prioChip(t.priority)}<span class="bo-grow">${esc(t.title)}</span>${chip(TASK_STATUS, t.status)}${dueChip(t.due_date)}</li>`).join("")}</ul>` : empty(myTeamId() ? "Nothing assigned to you." : "No overdue tasks."); })()}
    </section>
    <section class="card">
      ${sectionHead("Scorecard alerts", `<a class="linkbtn" href="#/kpis">All KPIs</a>`)}
      ${reds.length ? `<ul class="bo-list">${reds.slice(0, 8).map((k) => `<li><span class="bo-tag">${k.id}</span><span class="bo-grow">${esc(k.name)}</span><span class="bo-mono">${fmtKpi(k, k.value)}</span><span class="badge critical">Red</span></li>`).join("")}</ul>` : empty("No KPIs in red this month.")}
    </section>
    <section class="card">
      ${sectionHead("Platform pulse", `<a class="linkbtn" href="#/platform">Details</a>`)}
      ${ps ? `<div class="bo-mini-tiles">
          <div><b>${ps.orgs}</b><span>CPAs on platform</span></div><div><b>${ps.users}</b><span>user logins</span></div>
          <div><b>${ps.events_7d}</b><span>record changes, 7 days</span></div><div><b>${ps.new_leads}</b><span>new website leads</span></div>
        </div>${sparkBars(ps.daily_30d || [])}` : empty(S.platform.error ? "Platform link unavailable — " + esc(S.platform.error) : "No platform data.")}
    </section>
  </div>
  <section class="card bo-mt">
    ${sectionHead("Recent activity", `<a class="linkbtn" href="#/activity">Full log</a>`)}
    ${activityList(S.activity.slice(0, 8))}
  </section>`;
};

function sparkBars(rows) {
  if (!rows.length) return "";
  const max = Math.max(1, ...rows.map((r) => r.n));
  const w = 100 / rows.length;
  return `<svg class="bo-spark" viewBox="0 0 100 32" preserveAspectRatio="none" role="img" aria-label="Platform record changes per day, last 30 days">
    ${rows.map((r, i) => `<rect x="${i * w + w * 0.15}" y="${32 - (r.n / max) * 30}" width="${w * 0.7}" height="${(r.n / max) * 30 || 0.5}" rx="0.6"><title>${esc(fmtD(r.d))}: ${r.n}</title></rect>`).join("")}
  </svg><div class="bo-spark-cap"><span>30 days ago</span><span>Today</span></div>`;
}

function activityList(rows) {
  if (!rows.length) return empty("No back-office activity yet.");
  const what = { bo_tasks: "Task", bo_clients: "Client", bo_milestones: "Milestone", bo_visits: "Visit", bo_tickets: "Ticket", bo_risks: "Risk", bo_decisions: "Decision", bo_team: "Team", bo_task_comments: "Comment" };
  return `<ul class="bo-list bo-activity">${rows.map((a) => `<li><span class="bo-tag">${esc(what[a.table_name] || a.table_name)}</span>
    <span class="bo-grow"><b>${esc(a.action === "insert" ? "Added" : a.action === "delete" ? "Removed" : "Updated")}</b> ${esc(a.summary || "")}</span>
    <span class="bo-muted">${esc((a.actor_email || "system").split("@")[0])} · ${fmtDT(a.at)}</span></li>`).join("")}</ul>`;
}

/* ---------- Tasks ---------- */
function filteredTasks() {
  const u = S.ui, q = u.taskQ.toLowerCase();
  return S.d.bo_tasks.filter((t) =>
    (!q || (t.title + " " + (t.description || "") + " T-" + t.number).toLowerCase().includes(q)) &&
    (!u.taskDept || t.department === u.taskDept) &&
    (!u.taskWho || (u.taskWho === "me" ? t.assignee_id === myTeamId() : u.taskWho === "none" ? !t.assignee_id : t.assignee_id === u.taskWho)) &&
    (!u.taskMs || t.milestone_id === u.taskMs));
}

VIEWS.tasks = () => {
  const u = S.ui, list = filteredTasks();
  const who = { ...(myTeamId() ? { me: "Assigned to me" } : {}), none: "Unassigned", ...teamOpts() };
  const msMap = Object.fromEntries(S.d.bo_milestones.filter((m) => m.status !== "done").map((m) => [m.id, `${m.code || ""} ${m.title}`.trim().slice(0, 60)]));
  return `
  <div class="bo-toolbar">
    <input class="bo-input" id="tq" type="search" placeholder="Search tasks or T-number…" value="${esc(u.taskQ)}" aria-label="Search tasks">
    <select class="bo-input" id="tdept" aria-label="Department">${opts(DEPTS, u.taskDept, "All departments")}</select>
    <select class="bo-input" id="twho" aria-label="Assignee">${opts(who, u.taskWho, "Everyone")}</select>
    <select class="bo-input" id="tms" aria-label="Milestone">${opts(msMap, u.taskMs, "All milestones")}</select>
    <div class="bo-seg" role="tablist" aria-label="View">
      <button type="button" data-tview="board" class="${u.taskView === "board" ? "on" : ""}" role="tab" aria-selected="${u.taskView === "board"}">Board</button>
      <button type="button" data-tview="list" class="${u.taskView === "list" ? "on" : ""}" role="tab" aria-selected="${u.taskView === "list"}">List</button>
    </div>
    ${addBtn("bo_tasks", "New task", u.taskMs ? { milestone_id: u.taskMs } : null)}
  </div>
  ${u.taskView === "board" ? taskBoard(list) : taskTable(list)}`;
};

function taskCard(t) {
  const comments = S.d.bo_task_comments.filter((c) => c.task_id === t.id).length;
  return `<article class="bo-card" draggable="true" data-task="${t.id}" data-open="bo_tasks:${t.id}" tabindex="0" aria-label="${esc(t.title)}">
    <div class="bo-card-top"><span class="bo-mono bo-muted">T-${t.number ?? ""}</span>${prioChip(t.priority)}</div>
    <div class="bo-card-title">${esc(t.title)}</div>
    ${t.milestone_id ? `<div class="bo-card-meta">${esc(msLabel(t.milestone_id).slice(0, 52))}</div>` : ""}
    ${t.client_id ? `<div class="bo-card-meta">◆ ${esc(clientName(t.client_id))}</div>` : ""}
    <div class="bo-card-foot"><span class="bo-avatar" title="${esc(teamName(t.assignee_id) || "Unassigned")}">${esc(initials(teamName(t.assignee_id)))}</span>
      ${comments ? `<span class="bo-muted">💬 ${comments}</span>` : ""}${dueChip(t.due_date, t.status === "done")}</div>
  </article>`;
}
const initials = (n) => (n ? n.replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() : "–");

function taskBoard(list) {
  return `<div class="bo-board">${Object.entries(TASK_STATUS).map(([k, label]) => {
    const col = list.filter((t) => t.status === k).sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));
    return `<section class="bo-col" data-col="${k}" aria-label="${label}">
      <header><span class="bo-dot bo-s-${k}"></span>${label}<span class="bo-muted">${col.length}</span></header>
      <div class="bo-col-body">${col.map(taskCard).join("") || `<div class="bo-col-empty">Drop tasks here</div>`}</div>
    </section>`;
  }).join("")}</div>`;
}

function taskTable(list) {
  if (!list.length) return empty("No tasks match these filters.");
  const rows = [...list].sort((a, b) => (a.status === "done") - (b.status === "done") || (a.due_date || "9").localeCompare(b.due_date || "9"));
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Task</th><th>Status</th><th>Priority</th><th>Owner</th><th>Department</th><th>Due</th></tr></thead>
    <tbody>${rows.map((t) => `<tr class="bo-click" data-open="bo_tasks:${t.id}">
      <td class="bo-mono">T-${t.number ?? ""}</td><td><b>${esc(t.title)}</b>${t.milestone_id ? `<div class="bo-sub">${esc(msLabel(t.milestone_id).slice(0, 70))}</div>` : ""}</td>
      <td><select class="bo-inline" data-quick="bo_tasks:${t.id}:status" aria-label="Status">${opts(TASK_STATUS, t.status, null)}</select></td>
      <td>${prioChip(t.priority)}</td><td>${esc(teamName(t.assignee_id) || "—")}</td><td>${esc(DEPTS[t.department] || "—")}</td>
      <td>${dueChip(t.due_date, t.status === "done")}</td></tr>`).join("")}</tbody></table></div>`;
}

WIRES.tasks = () => {
  const v = root.querySelector("#view");
  const re = (k, val) => { S.ui[k] = val; const pos = v.querySelector("#tq")?.selectionStart; render(); if (k === "taskQ") { const q = root.querySelector("#tq"); q.focus(); q.setSelectionRange(pos, pos); } };
  v.querySelector("#tq").oninput = (e) => re("taskQ", e.target.value);
  v.querySelector("#tdept").onchange = (e) => re("taskDept", e.target.value);
  v.querySelector("#twho").onchange = (e) => re("taskWho", e.target.value);
  v.querySelector("#tms").onchange = (e) => re("taskMs", e.target.value);
  v.querySelectorAll("[data-tview]").forEach((b) => (b.onclick = () => re("taskView", b.dataset.tview)));
  // drag and drop between columns
  let dragId = null;
  v.querySelectorAll("[data-task]").forEach((c) => {
    c.addEventListener("dragstart", (e) => { dragId = c.dataset.task; c.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", dragId); });
    c.addEventListener("dragend", () => c.classList.remove("dragging"));
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") openDrawer("bo_tasks", c.dataset.task); });
  });
  v.querySelectorAll("[data-col]").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
    col.addEventListener("dragleave", () => col.classList.remove("over"));
    col.addEventListener("drop", async (e) => {
      e.preventDefault(); col.classList.remove("over");
      const id = dragId || e.dataTransfer.getData("text/plain");
      const t = byId(S.d.bo_tasks, id);
      if (!t) return;
      // place below the card the pointer is over, else at the end of the column
      const cards = [...col.querySelectorAll("[data-task]")].filter((c) => c.dataset.task !== id);
      const after = cards.find((c) => e.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
      const sortOf = (c) => byId(S.d.bo_tasks, c?.dataset.task)?.sort ?? 0;
      let sort;
      if (after) { const i = cards.indexOf(after); sort = i === 0 ? sortOf(after) - 1 : (sortOf(cards[i - 1]) + sortOf(after)) / 2; }
      else sort = cards.length ? sortOf(cards[cards.length - 1]) + 1 : Date.now() / 1000;
      if (t.status === col.dataset.col && t.sort === sort) return;
      await save("bo_tasks", id, { status: col.dataset.col, sort }, true);
    });
  });
};

/* ---------- Roadmap ---------- */
VIEWS.roadmap = () => {
  const ms = S.d.bo_milestones;
  const tasksFor = (id) => S.d.bo_tasks.filter((t) => t.milestone_id === id);
  return `
  <div class="bo-toolbar"><p class="bo-lead">Milestones from the Operations Plan: mobilisation (section 4), the ready-to-operate checklist (4.4) and the Year 1–3 plans (5–7). Link tasks to a milestone to track progress against it.</p>${addBtn("bo_milestones", "New milestone")}</div>
  <div class="bo-phase-strip">${Object.entries(PHASES).map(([k, label]) => {
    const list = ms.filter((m) => m.phase === k), done = list.filter((m) => m.status === "done").length;
    const late = list.filter((m) => m.status !== "done" && m.due_date && m.due_date < today()).length;
    return `<a class="bo-phase" href="#ph-${k}"><span>${esc(label.split(" — ")[0])}</span><b>${done}/${list.length}</b>${bar(list.length ? (done / list.length) * 100 : 0, late ? "warn" : "")}</a>`;
  }).join("")}</div>
  ${Object.entries(PHASES).map(([k, label]) => {
    const list = ms.filter((m) => m.phase === k);
    if (!list.length) return "";
    return `<section class="card bo-mt" id="ph-${k}">
      ${sectionHead(esc(label), k === "ready" ? `<span class="bo-muted">The Operations Lead signs this off to the Committee before the first CPA is onboarded.</span>` : "")}
      <div class="table-wrap bo-flat"><table>
        <thead><tr><th>Code</th><th>Milestone</th><th>Owner</th><th>Due</th><th>Tasks</th><th>Status</th></tr></thead>
        <tbody>${list.map((m) => { const ts = tasksFor(m.id), td = ts.filter((t) => t.status === "done").length; return `<tr class="bo-click" data-open="bo_milestones:${m.id}">
          <td class="bo-mono">${esc(m.code || "")}</td>
          <td><b>${esc(m.title)}</b>${m.evidence ? `<div class="bo-sub">Evidence: ${esc(m.evidence)}</div>` : ""}</td>
          <td>${esc(teamName(m.owner_id) || m.owner_role || "—")}<div class="bo-sub">${esc(DEPTS[m.department] || "")}</div></td>
          <td>${dueChip(m.due_date, m.status === "done")}</td>
          <td>${ts.length ? `<a class="linkbtn" href="#/tasks" data-msfilter="${m.id}">${td}/${ts.length}</a>${bar((td / ts.length) * 100)}` : `<span class="bo-muted">—</span>`}</td>
          <td><select class="bo-inline bo-st-${m.status}" data-quick="bo_milestones:${m.id}:status" aria-label="Status">${opts(MS_STATUS, m.status, null)}</select></td></tr>`; }).join("")}</tbody>
      </table></div></section>`;
  }).join("")}`;
};
WIRES.roadmap = () => root.querySelectorAll("[data-msfilter]").forEach((a) => a.addEventListener("click", () => { S.ui.taskMs = a.dataset.msfilter; S.ui.taskView = "list"; }));

/* ---------- Clients ---------- */
VIEWS.clients = () => {
  const tab = S.ui.clientTab;
  const newLeads = S.platform.leads.filter((l) => !l.imported);
  return `
  <div class="bo-toolbar">
    <div class="bo-seg" role="tablist" aria-label="Client views">
      ${[["pipeline", "BD pipeline"], ["lifecycle", "Client lifecycle"], ["leads", `Website leads${newLeads.length ? ` (${newLeads.length})` : ""}`]].map(([k, l]) => `<button type="button" data-ctab="${k}" class="${tab === k ? "on" : ""}" role="tab" aria-selected="${tab === k}">${l}</button>`).join("")}
    </div>
    ${addBtn("bo_clients", "New client or prospect")}
  </div>
  ${tab === "pipeline" ? pipelineBoard() : tab === "lifecycle" ? lifecycleTable() : leadsTable()}`;
};

function pipelineBoard() {
  const c = S.d.bo_clients;
  return `<p class="bo-lead">Pipeline stages from section 16.1. A won client is handed to Intake within 1 business day (K43).</p>
  <div class="bo-board bo-board-6">${Object.entries(PIPELINE).map(([k, label]) => {
    const col = c.filter((x) => x.pipeline_stage === k);
    const val = col.reduce((s, x) => s + Number(x.value_zar || 0), 0);
    return `<section class="bo-col" aria-label="${label}"><header><span class="bo-dot bo-p-${k}"></span>${label}<span class="bo-muted">${col.length}</span></header>
      ${val ? `<div class="bo-col-sum">${money(val)}</div>` : ""}
      <div class="bo-col-body">${col.map((x) => `<article class="bo-card" data-open="bo_clients:${x.id}" tabindex="0">
        <div class="bo-card-top"><span class="bo-tag">${esc(KINDS[x.kind] || x.kind)}</span>${x.segment ? `<span class="bo-tag">Seg ${x.segment}</span>` : ""}</div>
        <div class="bo-card-title">${esc(x.name)}</div>
        <div class="bo-card-meta">${esc([x.province, x.payer].filter(Boolean).join(" · "))}</div>
        <div class="bo-card-foot"><span>${money(x.value_zar)}</span>${x.next_step_date ? dueChip(x.next_step_date) : ""}</div>
      </article>`).join("") || `<div class="bo-col-empty">—</div>`}</div></section>`;
  }).join("")}</div>`;
}

function lifecycleTable() {
  const c = S.d.bo_clients.filter((x) => x.kind === "cpa");
  if (!c.length) return empty("No client CPAs yet. Add one, or import a website lead.");
  return `<p class="bo-lead">Every client CPA follows the same path (section 10). SLA checks: referral → triage decision ≤ 20 business days (K10); signature → onboarded ≤ 15 business days (K14).</p>
  <div class="table-wrap"><table>
    <thead><tr><th>CPA</th><th>Step</th><th>Segment</th><th>Facilitator</th><th>Triage SLA</th><th>Onboarding SLA</th><th>Platform</th><th>Next step</th></tr></thead>
    <tbody>${c.map((x) => {
      const tri = x.triage_date ? bdBetween(x.referral_date, x.triage_date) : bdBetween(x.referral_date, today());
      const triTxt = x.referral_date ? `${tri} BD${x.triage_date ? "" : " so far"}` : "—";
      const triTone = !x.referral_date ? "" : tri > 20 ? "critical" : tri > 15 ? "warning" : x.triage_date ? "good" : "";
      const onb = x.signed_date ? bdBetween(x.signed_date, x.onboarded_date || today()) : null;
      const onbTone = onb == null ? "" : onb > 15 ? "critical" : onb > 10 && !x.onboarded_date ? "warning" : x.onboarded_date ? "good" : "";
      const org = x.org_id ? byId(S.platform.orgs, x.org_id) : null;
      return `<tr class="bo-click" data-open="bo_clients:${x.id}">
        <td><b>${esc(x.name)}</b><div class="bo-sub">${esc(x.province || "")}</div></td>
        <td><select class="bo-inline" data-quick="bo_clients:${x.id}:lifecycle" aria-label="Lifecycle step">${opts(LIFECYCLE, x.lifecycle, null)}</select></td>
        <td>${x.segment ? `<span class="bo-tag" title="${esc(SEGMENTS[x.segment])}">${x.segment}</span>` : "—"}</td>
        <td>${esc(teamName(x.facilitator_id) || "—")}</td>
        <td><span class="badge ${triTone}">${triTxt}</span></td>
        <td>${onb == null ? "—" : `<span class="badge ${onbTone}">${onb} BD${x.onboarded_date ? "" : " so far"}</span>`}</td>
        <td>${org ? `<span class="badge ${org.events_30d ? "good" : "warning"}">Gate ${org.current_gate ?? "–"} · ${org.events_30d ? "active" : "quiet"}</span>` : `<span class="bo-muted">Not linked</span>`}</td>
        <td>${esc(x.next_step || "—")}${x.next_step_date ? `<div>${dueChip(x.next_step_date)}</div>` : ""}</td></tr>`;
    }).join("")}</tbody></table></div>`;
}

function leadsTable() {
  const L = S.platform.leads;
  if (S.platform.error && !L.length) return `<div class="msg err">Couldn't read platform leads — ${esc(S.platform.error)}</div>`;
  if (!L.length) return empty("No enquiries from the website form yet.");
  return `<p class="bo-lead">Enquiries from the public CPA360 landing page. Importing creates a pipeline record at stage “Lead”, linked back to the enquiry (step 1 of the lifecycle).</p>
  <div class="table-wrap"><table>
    <thead><tr><th>Received</th><th>CPA</th><th>Contact</th><th>Message</th><th>Inbox status</th><th></th></tr></thead>
    <tbody>${L.map((l) => `<tr>
      <td class="bo-mono">${fmtD(l.created_at)}</td>
      <td><b>${esc(l.cpa_name)}</b><div class="bo-sub">${esc([l.province, l.households && l.households + " households"].filter(Boolean).join(" · "))}</div></td>
      <td>${esc(l.contact_name)}<div class="bo-sub"><a href="mailto:${esc(l.email)}">${esc(l.email)}</a>${l.phone ? " · " + esc(l.phone) : ""}</div></td>
      <td class="bo-msg">${esc((l.message || "").slice(0, 160))}</td>
      <td>${chip({ new: "New", contacted: "Contacted", qualified: "Qualified", closed: "Closed" }, l.status)}</td>
      <td>${l.imported ? `<span class="badge good">In pipeline</span>` : `<button class="btn" type="button" data-import="${l.id}">Import</button>`}</td></tr>`).join("")}</tbody></table></div>`;
}

WIRES.clients = () => {
  root.querySelectorAll("[data-ctab]").forEach((b) => (b.onclick = () => { S.ui.clientTab = b.dataset.ctab; render(); }));
  root.querySelectorAll("[data-import]").forEach((b) => (b.onclick = async () => {
    const l = S.platform.leads.find((x) => x.id === b.dataset.import);
    b.disabled = true; b.textContent = "Importing…";
    const ok = await create("bo_clients", {
      ...defaults("bo_clients"), name: l.cpa_name, province: PROVINCES.includes(l.province) ? l.province : l.province || null, contact_name: l.contact_name,
      contact_email: l.email, contact_phone: l.phone || null, source: `Website (${l.intent || "enquiry"})`, lead_id: l.id,
      referral_date: String(l.created_at).slice(0, 10), notes: l.message || null,
    });
    if (ok) { l.imported = true; S.ui.clientTab = "pipeline"; render(); }
  }));
};

/* ---------- Field visits ---------- */
VIEWS.visits = () => {
  const V = S.d.bo_visits;
  const m0 = today().slice(0, 7);
  const due = V.filter((v) => v.planned_date.slice(0, 7) === m0 && v.planned_date <= today());
  const held = V.filter((v) => v.held_date);
  const k11 = due.length ? (due.filter((v) => v.held_date).length / due.length) * 100 : null;
  const k12 = held.length ? (held.filter((v) => v.report_date && bdBetween(v.held_date, v.report_date) <= 2).length / held.length) * 100 : null;
  const late = held.filter((v) => !v.report_date && daysUntil(v.held_date) < -2);
  const rows = [...V].sort((a, b) => b.planned_date.localeCompare(a.planned_date));
  return `
  <div class="tiles">
    ${tile("Visits held vs planned", k11 == null ? "—" : Math.round(k11) + "%", "This month to date · K11 target 85%", k11 != null && k11 < 85 ? "warning" : "")}
    ${tile("Reports within 48h", k12 == null ? "—" : Math.round(k12) + "%", "All held visits · K12 target 90%", k12 != null && k12 < 90 ? "warning" : "")}
    ${tile("Reports missing", late.length, "Held more than 2 days ago", late.length ? "critical" : "")}
    ${tile("Upcoming", V.filter((v) => v.planned_date > today()).length, "Planned visits")}
  </div>
  <div class="bo-toolbar"><p class="bo-lead">Cadence (10.1): onboarding weekly · Stabilise every two weeks · Build monthly · Sustain quarterly. Plan trips a week ahead and capture the report in the platform within 48 hours.</p>${addBtn("bo_visits", "Plan a visit")}</div>
  ${rows.length ? `<div class="table-wrap"><table>
    <thead><tr><th>Planned</th><th>CPA</th><th>Purpose</th><th>Facilitator</th><th>Held</th><th>Report</th></tr></thead>
    <tbody>${rows.map((v) => {
      const repTone = v.report_date ? (bdBetween(v.held_date, v.report_date) <= 2 ? "good" : "warning") : v.held_date && daysUntil(v.held_date) < -2 ? "critical" : "";
      return `<tr class="bo-click" data-open="bo_visits:${v.id}">
      <td class="bo-mono">${fmtD(v.planned_date)}</td><td><b>${esc(clientName(v.client_id))}</b></td><td>${esc(v.purpose || "—")}</td>
      <td>${esc(teamName(v.facilitator_id) || "—")}</td>
      <td>${v.held_date ? `<span class="badge good">${fmtD(v.held_date)}</span>` : v.planned_date < today() ? `<span class="badge critical">Not held</span>` : `<span class="bo-muted">Planned</span>`}</td>
      <td>${v.report_date ? `<span class="badge ${repTone}">${fmtD(v.report_date)}</span>` : v.held_date ? `<span class="badge ${repTone}">Outstanding</span>` : "—"}</td></tr>`; }).join("")}</tbody></table></div>` : empty("No visits planned yet.")}`;
};

/* ---------- Support desk ---------- */
VIEWS.support = () => {
  const T = S.d.bo_tickets;
  const open = T.filter((t) => !["resolved", "closed"].includes(t.status));
  const sla = ticketSla();
  return `
  <div class="tiles">
    ${tile("Open tickets", open.length, `${open.filter((t) => t.status === "open").length} not yet acknowledged`)}
    ${tile("P1 open", open.filter((t) => t.severity === "P1").length, "Acknowledge 4 BH · fix 1 BD", open.some((t) => t.severity === "P1") ? "critical" : "")}
    ${tile("P1 acknowledged in 4h", sla.k21 == null ? "—" : Math.round(sla.k21) + "%", "K21 · target 100%", sla.k21 != null && sla.k21 < 100 ? "critical" : "")}
    ${tile("Tier 1 answered in 4h", sla.k24 == null ? "—" : Math.round(sla.k24) + "%", "K24 · target 90%", sla.k24 != null && sla.k24 < 90 ? "warning" : "")}
  </div>
  <div class="bo-toolbar"><p class="bo-lead">Tier 1: support desk (log-ins, how-to) · Tier 2: Afribot technical support (configuration, data fixes) · Tier 3: developers (defects, outages, security). Changing status records acknowledgement and resolution times automatically.</p>${addBtn("bo_tickets", "Log a ticket")}</div>
  ${T.length ? `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th>Issue</th><th>Severity</th><th>Tier</th><th>Client</th><th>Assignee</th><th>Opened</th><th>Response</th><th>Status</th></tr></thead>
    <tbody>${[...T].sort((a, b) => (["resolved", "closed"].includes(a.status) - ["resolved", "closed"].includes(b.status)) || a.severity.localeCompare(b.severity) || b.opened_at.localeCompare(a.opened_at)).map((t) => {
      const h = hoursBetween(t.opened_at, t.acknowledged_at || new Date().toISOString());
      const tone = t.acknowledged_at ? (h <= 4 ? "good" : "warning") : h > 4 ? "critical" : "warning";
      return `<tr class="bo-click" data-open="bo_tickets:${t.id}">
      <td class="bo-mono">#${t.number ?? ""}</td><td><b>${esc(t.title)}</b><div class="bo-sub">${esc(t.reporter || "")}</div></td>
      <td>${prioChip(t.severity)}</td><td>Tier ${t.tier}</td><td>${esc(clientName(t.client_id) || orgName(t.org_id) || "—")}</td>
      <td>${esc(teamName(t.assignee_id) || "—")}</td><td class="bo-mono">${fmtDT(t.opened_at)}</td>
      <td><span class="badge ${tone}">${t.acknowledged_at ? `${h.toFixed(1)}h` : `${h.toFixed(1)}h waiting`}</span></td>
      <td><select class="bo-inline" data-quick="bo_tickets:${t.id}:status" aria-label="Status">${opts(TICKET_STATUS, t.status, null)}</select></td></tr>`; }).join("")}</tbody></table></div>` : empty("No support tickets logged.")}`;
};

function ticketSla() {
  const T = S.d.bo_tickets;
  const p1 = T.filter((t) => t.severity === "P1");
  const t1 = T.filter((t) => t.tier === 1 && t.acknowledged_at);
  const pct = (list, f) => (list.length ? (list.filter(f).length / list.length) * 100 : null);
  return {
    k21: pct(p1, (t) => t.acknowledged_at && hoursBetween(t.opened_at, t.acknowledged_at) <= 4),
    k22: pct(p1.filter((t) => t.resolved_at), (t) => hoursBetween(t.opened_at, t.resolved_at) <= 24),
    k24: pct(t1, (t) => hoursBetween(t.opened_at, t.acknowledged_at) <= 4),
  };
}

/* ---------- KPIs ---------- */
function autoKpi(id) {
  const C = S.d.bo_clients, cpas = C.filter((c) => c.kind === "cpa");
  const active = cpas.filter((c) => ACTIVE_LIFE.includes(c.lifecycle));
  const plan = planInfo();
  const pct = (a, b) => (b ? (a / b) * 100 : null);
  switch (id) {
    case "K01": return active.length;
    case "K04": { const s = C.filter((c) => c.satisfaction); return s.length ? s.reduce((a, c) => a + Number(c.satisfaction), 0) / s.length : null; }
    case "K10": { const t = cpas.filter((c) => c.referral_date && c.triage_date); return t.length ? t.reduce((a, c) => a + bdBetween(c.referral_date, c.triage_date), 0) / t.length : null; }
    case "K11": { const m = today().slice(0, 7), due = S.d.bo_visits.filter((v) => v.planned_date.slice(0, 7) === m && v.planned_date <= today()); return pct(due.filter((v) => v.held_date).length, due.length); }
    case "K12": { const h = S.d.bo_visits.filter((v) => v.held_date); return pct(h.filter((v) => v.report_date && bdBetween(v.held_date, v.report_date) <= 2).length, h.length); }
    case "K14": { const s = cpas.filter((c) => c.signed_date && c.onboarded_date); return pct(s.filter((c) => bdBetween(c.signed_date, c.onboarded_date) <= 15).length, s.length); }
    case "K15": { const l = active.filter((c) => c.org_id); return pct(l.filter((c) => byId(S.platform.orgs, c.org_id)?.events_30d > 0).length, l.length); }
    case "K16": { const fte = S.d.bo_team.filter((t) => t.status === "active" && /Facilitator|Regional Delivery Lead/.test(t.role_title)).reduce((a, t) => a + (/Regional/.test(t.role_title) ? 0.5 : Number(t.fte || 1)), 0); return fte ? active.length / fte : null; }
    case "K21": return ticketSla().k21;
    case "K22": return ticketSla().k22;
    case "K24": return ticketSla().k24;
    case "K40": return C.filter((c) => ["qualified", "proposal", "negotiation"].includes(c.pipeline_stage)).length;
    case "K41": { const since = new Date(); since.setMonth(since.getMonth() - 6); const d = C.filter((c) => ["won", "lost"].includes(c.pipeline_stage) && toDate(c.updated_at || c.created_at) >= since); return pct(d.filter((c) => c.pipeline_stage === "won").length, d.length); }
    case "K42": { const y0 = toDate(plan.month1); y0.setMonth(y0.getMonth() + 12 * (plan.year - 1)); return cpas.filter((c) => c.signed_date && toDate(c.signed_date) >= y0).length; }
    default: return null;
  }
}

function kpiStatus(k, v, target) {
  if (v == null || target == null) return "none";
  const t = Number(target);
  if (k.unit === "yesno") return v >= 1 ? "green" : "red";
  const band = Math.max(Math.abs(t) * 0.1, k.unit === "count" || k.unit === "days" ? 1 : 0);
  if (k.direction === "lte") return v <= t ? "green" : v <= t + band ? "amber" : "red";
  return v >= t ? "green" : v >= t - band ? "amber" : "red";
}

function scorecard() {
  const plan = planInfo();
  return S.d.bo_kpis.map((k) => {
    const readings = S.d.bo_kpi_readings.filter((r) => r.kpi_id === k.id).sort((a, b) => b.period.localeCompare(a.period));
    const target = k["target_y" + plan.year];
    const value = k.auto ? autoKpi(k.id) : readings[0] ? Number(readings[0].value) : null;
    const status = kpiStatus(k, value, target);
    const lastTwoRed = readings.length >= 2 && readings.slice(0, 2).every((r) => kpiStatus(k, Number(r.value), target) === "red");
    return { ...k, readings, target, value, status, lastTwoRed };
  });
}

function fmtKpi(k, v) {
  if (v == null) return "—";
  const n = Number(v);
  if (k.unit === "yesno") return n >= 1 ? "Yes" : "No";
  if (k.unit === "pct") return `${Math.round(n * 10) / 10}%`;
  if (k.unit === "days") return `${Math.round(n * 10) / 10} d`;
  if (k.unit === "months") return `${Math.round(n * 10) / 10} mo`;
  if (k.unit === "score") return n.toFixed(1);
  return String(Math.round(n * 10) / 10);
}

VIEWS.kpis = () => {
  const sc = scorecard(), plan = planInfo();
  const count = (s) => sc.filter((k) => k.status === s).length;
  return `
  <div class="tiles">
    ${tile("Green", count("green"), "Target met", "good")}${tile("Amber", count("amber"), "Within the amber band", "warning")}
    ${tile("Red", count("red"), "Owner brings a recovery action", count("red") ? "critical" : "")}${tile("No data", count("none"), "Needs a reading or source")}
  </div>
  <p class="bo-lead">KPI dictionary from section 31.4, scored against <b>Year ${plan.year}</b> targets. <span class="badge info">Auto</span> KPIs are calculated live from back-office and platform records; the rest take a monthly reading signed off by the owner. Two reds in a row go to the Committee with the monthly pack.</p>
  ${KPI_GROUPS.map(([pre, label]) => {
    const list = sc.filter((k) => k.id.startsWith(pre));
    if (!list.length) return "";
    return `<section class="bo-mt"><h3 class="section-title">${label}</h3><div class="table-wrap"><table>
      <thead><tr><th>KPI</th><th>Owner</th><th>Target Y${plan.year}</th><th>Current</th><th>Status</th><th>Trend</th><th></th></tr></thead>
      <tbody>${list.map((k) => `<tr>
        <td><span class="bo-mono bo-muted">${k.id}</span> <b>${esc(k.name)}</b>${k.auto ? ` <span class="badge info">Auto</span>` : ""}${k.definition ? `<div class="bo-sub">${esc(k.definition)}</div>` : ""}</td>
        <td>${esc(k.owner_role || "—")}</td>
        <td class="bo-mono">${k.direction === "lte" ? "≤" : "≥"} ${fmtKpi(k, k.target)}</td>
        <td class="bo-mono"><b>${fmtKpi(k, k.value)}</b>${!k.auto && k.readings[0] ? `<div class="bo-sub">${esc(toDate(k.readings[0].period).toLocaleDateString("en-ZA", { month: "short", year: "numeric" }))}</div>` : ""}</td>
        <td>${{ green: `<span class="badge good">Green</span>`, amber: `<span class="badge warning">Amber</span>`, red: `<span class="badge critical">Red</span>`, none: `<span class="badge">No data</span>` }[k.status]}${k.lastTwoRed ? `<div><span class="badge critical" title="Two reds in a row">→ Committee</span></div>` : ""}</td>
        <td>${trend(k)}</td>
        <td>${k.auto ? "" : `<button class="btn" type="button" data-reading="${k.id}">Record</button>`}</td></tr>`).join("")}</tbody></table></div></section>`;
  }).join("")}`;
};

function trend(k) {
  const r = k.readings.slice(0, 6).reverse();
  if (r.length < 2) return `<span class="bo-muted">—</span>`;
  const vals = r.map((x) => Number(x.value)), min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) => `${(i / (vals.length - 1)) * 60},${18 - ((v - min) / span) * 16}`).join(" ");
  return `<svg class="bo-trend" viewBox="0 -1 60 20" role="img" aria-label="Last ${vals.length} readings"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>`;
}
WIRES.kpis = () => root.querySelectorAll("[data-reading]").forEach((b) => (b.onclick = () => openReading(b.dataset.reading)));

/* ---------- Governance ---------- */
VIEWS.governance = () => {
  const D = S.d.bo_decisions, R = S.d.bo_risks;
  const grid = Array.from({ length: 5 }, (_, i) => 5 - i).map((l) => Array.from({ length: 5 }, (_, j) => j + 1).map((im) => {
    const n = R.filter((r) => r.status !== "closed" && r.likelihood === l && r.impact === im);
    const sc = l * im, tone = sc >= 15 ? "critical" : sc >= 8 ? "warning" : "good";
    return `<div class="bo-heat bo-heat-${tone}" title="Likelihood ${l} × impact ${im}: ${n.map((r) => r.code || r.risk).join(", ")}">${n.length ? `<b>${n.length}</b>` : ""}</div>`;
  }).join("")).join("");
  return `
  <section class="card">
    ${sectionHead("Decisions log", addBtn("bo_decisions", "New decision"))}
    <p class="bo-lead">Decisions the Parties and Committee must make (section 25.1). Reserved matters stay with the Committee.</p>
    <div class="table-wrap bo-flat"><table>
      <thead><tr><th>Code</th><th>Decision</th><th>Needed by</th><th>Status</th><th>Outcome</th></tr></thead>
      <tbody>${D.map((d) => `<tr class="bo-click" data-open="bo_decisions:${d.id}">
        <td class="bo-mono">${esc(d.code || "")}</td><td><b>${esc(d.decision)}</b></td>
        <td>${esc(d.needed_by || "")}<div>${dueChip(d.due_date, d.status !== "open")}</div></td>
        <td><select class="bo-inline" data-quick="bo_decisions:${d.id}:status" aria-label="Status">${opts(DECISION_STATUS, d.status, null)}</select></td>
        <td>${esc(d.outcome || "—")}${d.decided_on ? `<div class="bo-sub">${fmtD(d.decided_on)}</div>` : ""}</td></tr>`).join("")}</tbody></table></div>
  </section>
  <section class="card bo-mt">
    ${sectionHead("Risk register", addBtn("bo_risks", "New risk"))}
    <p class="bo-lead">Kept by the Operations Lead; the top ten go to the Committee every quarter (section 21). Score = likelihood × impact.</p>
    <div class="bo-risk-wrap">
      <div class="bo-heatmap" role="img" aria-label="Risk heat map"><span class="bo-ax-y">Likelihood →</span><div class="bo-heat-grid">${grid}</div><span class="bo-ax-x">Impact →</span></div>
      <div class="table-wrap bo-flat bo-grow"><table>
        <thead><tr><th>Code</th><th>Risk</th><th>Owner</th><th>Score</th><th>Status</th></tr></thead>
        <tbody>${[...R].sort((a, b) => b.likelihood * b.impact - a.likelihood * a.impact).map((r) => { const s = r.likelihood * r.impact; return `<tr class="bo-click" data-open="bo_risks:${r.id}">
          <td class="bo-mono">${esc(r.code || "")}</td><td><b>${esc(r.risk)}</b>${r.mitigation ? `<div class="bo-sub">${esc(r.mitigation)}</div>` : ""}</td>
          <td>${esc(teamName(r.owner_id) || r.owner_role || "—")}</td>
          <td><span class="badge ${s >= 15 ? "critical" : s >= 8 ? "warning" : "good"}">${s}</span></td>
          <td>${chip(RISK_STATUS, r.status)}</td></tr>`; }).join("")}</tbody></table></div>
    </div>
  </section>`;
};

/* ---------- Platform link ---------- */
VIEWS.platform = () => {
  const P = S.platform, ps = P.summary;
  if (!ps && P.error) return `<div class="msg err">Couldn't reach the platform — ${esc(P.error)}</div>`;
  const linked = Object.fromEntries(S.d.bo_clients.filter((c) => c.org_id).map((c) => [c.org_id, c]));
  return `
  <div class="tiles">
    ${tile("CPAs on platform", ps?.orgs ?? "—")}${tile("User logins", ps?.users ?? "—")}${tile("Beneficiary records", (ps?.beneficiaries ?? 0).toLocaleString("en-ZA"))}
    ${tile("Documents", ps?.documents ?? "—")}${tile("Stage reviews pending", ps?.pending_reviews ?? "—", "Platform admins decide these", ps?.pending_reviews ? "warning" : "")}${tile("Changes, 7 days", ps?.events_7d ?? "—")}
  </div>
  <section class="card">
    ${sectionHead("Platform activity, last 30 days", `<a class="btn" href="./app.html">${svg("ext")}Open platform</a>`)}
    ${sparkBars(ps?.daily_30d || [])}
  </section>
  <section class="bo-mt">
    <p class="bo-lead">Live, read-only figures for each CPA workspace on the platform (no member personal information). “Quiet” means no records changed in 30 days — K15 counts linked active clients that are not quiet. Link an org to a client record from the client's form.</p>
    <div class="table-wrap"><table>
      <thead><tr><th>CPA workspace</th><th>Gate</th><th>Users</th><th>Members on register</th><th>Docs</th><th>Meetings</th><th>Open actions</th><th>Last 30 days</th><th>Back-office client</th></tr></thead>
      <tbody>${P.orgs.map((o) => `<tr>
        <td><b>${esc(o.name)}</b><div class="bo-sub">${esc(o.region || "")}${o.pending_reviews ? ` · <span class="badge warning">${o.pending_reviews} review pending</span>` : ""}</div></td>
        <td><span class="bo-gate">${o.current_gate ?? "–"}</span></td><td>${o.users}</td>
        <td>${Number(o.beneficiaries).toLocaleString("en-ZA")}${o.members_count ? `<div class="bo-sub">of ${o.members_count} declared</div>` : ""}</td>
        <td>${o.documents}</td><td>${o.meetings}</td><td>${o.open_actions}</td>
        <td><span class="badge ${o.events_30d ? "good" : "warning"}">${o.events_30d ? o.events_30d + " changes" : "Quiet"}</span><div class="bo-sub">Last ${fmtD(o.last_activity)}</div></td>
        <td>${linked[o.id] ? `<a class="linkbtn" href="#/clients" data-open="bo_clients:${linked[o.id].id}">${esc(linked[o.id].name)}</a>` : `<button class="btn" type="button" data-open="bo_clients:new" data-preset='${esc(JSON.stringify({ name: o.name, org_id: o.id, kind: "cpa", province: PROVINCES.includes(o.region) ? o.region : null, pipeline_stage: "won", lifecycle: "onboarding" }))}'>Create client</button>`}</td></tr>`).join("") || `<tr><td colspan="9">${empty("No CPA workspaces yet.")}</td></tr>`}</tbody>
    </table></div>
  </section>`;
};

/* ---------- Team ---------- */
VIEWS.team = () => {
  const T = S.d.bo_team.filter((t) => t.status !== "left");
  const open = S.d.bo_tasks.filter((t) => t.status !== "done");
  const fte = T.filter((t) => t.status === "active").reduce((a, t) => a + Number(t.fte || 0), 0);
  return `
  <div class="tiles">
    ${tile("People in post", T.filter((t) => t.status === "active").length, `${fte.toFixed(1)} FTE`)}
    ${tile("Vacancies", T.filter((t) => t.status === "vacant").length, "Budgeted roles to fill · K63 ≤ 60 days")}
    ${tile("With login", T.filter((t) => t.user_id).length, "Can open the back office")}
    ${tile("Unassigned tasks", open.filter((t) => !t.assignee_id).length)}
  </div>
  <div class="bo-toolbar"><p class="bo-lead">Four departments, one office (section 26). Add a person's email to give them back-office access — it links to their platform login automatically. ${isManager() ? "" : "Only managers can change the team."}</p>${isManager() ? addBtn("bo_team", "Add person or role") : ""}</div>
  <div class="bo-team-grid">${Object.entries(DEPTS).map(([k, label]) => {
    const list = T.filter((t) => t.department === k);
    if (!list.length) return "";
    return `<section class="card"><h3 class="bo-dept">${label}<span class="bo-muted">${list.length}</span></h3>
      <ul class="bo-people">${list.map((t) => {
        const mine = open.filter((x) => x.assignee_id === t.id), late = mine.filter((x) => x.due_date && x.due_date < today()).length;
        return `<li class="${isManager() ? "bo-click" : ""}" ${isManager() ? `data-open="bo_team:${t.id}"` : ""}>
          <span class="bo-avatar ${t.status === "vacant" ? "vacant" : ""}">${t.status === "vacant" ? "?" : esc(initials(t.full_name))}</span>
          <div class="bo-grow"><b>${esc(t.full_name || "Vacant")}</b><div class="bo-sub">${esc(t.role_title)} · ${esc(PARTIES[t.party] || "")} · ${t.fte} FTE${t.access === "admin" ? " · manager" : ""}</div></div>
          <div class="bo-right">${t.status === "vacant" ? `<span class="badge warning">From ${fmtD(t.starts_on)}</span>` : `<span class="badge">${mine.length} open</span>${late ? ` <span class="badge critical">${late} late</span>` : ""}${t.email && !t.user_id ? `<div class="bo-sub">No login yet</div>` : ""}`}</div></li>`;
      }).join("")}</ul></section>`;
  }).join("")}</div>`;
};

/* ---------- Activity ---------- */
VIEWS.activity = () => `<section class="card">${sectionHead("Back-office activity", `<span class="bo-muted">Latest ${S.activity.length} changes</span>`)}${activityList(S.activity)}</section>`;

/* ============================================================================
 * Forms (one drawer for every record type)
 * ==========================================================================*/
const F = (k, label, type = "text", extra = {}) => ({ k, label, type, ...extra });
const FORMS = {
  bo_tasks: { title: "Task", fields: () => [F("title", "Title", "text", { req: true, wide: true }), F("status", "Status", "select", { map: TASK_STATUS }), F("priority", "Priority", "select", { map: PRIORITY }),
    F("assignee_id", "Assignee", "select", { map: teamOpts() }), F("department", "Department", "select", { map: DEPTS }), F("milestone_id", "Milestone", "select", { map: Object.fromEntries(S.d.bo_milestones.map((m) => [m.id, `${m.code || ""} ${m.title}`.trim().slice(0, 80)])), wide: true }),
    F("client_id", "Client", "select", { map: Object.fromEntries(S.d.bo_clients.map((c) => [c.id, c.name])) }), F("stream", "Stream", "select", { map: STREAMS }),
    F("start_date", "Start", "date"), F("due_date", "Due", "date"), F("estimate_hours", "Estimate (hours)", "number"), F("description", "Description", "textarea", { wide: true })] },
  bo_milestones: { title: "Milestone", fields: () => [F("code", "Code"), F("phase", "Phase", "select", { map: PHASES, req: true }), F("title", "Milestone", "text", { req: true, wide: true }), F("status", "Status", "select", { map: MS_STATUS }),
    F("due_date", "Due", "date"), F("department", "Department", "select", { map: DEPTS }), F("owner_role", "Owner (role)"), F("owner_id", "Owner (person)", "select", { map: teamOpts() }), F("evidence", "Evidence of completion", "text", { wide: true }), F("notes", "Notes", "textarea", { wide: true })] },
  bo_clients: { title: "Client / prospect", fields: () => [F("name", "Name", "text", { req: true, wide: true }), F("kind", "Type", "select", { map: KINDS }), F("province", "Province", "select", { map: Object.fromEntries(PROVINCES.map((p) => [p, p])) }),
    F("pipeline_stage", "Pipeline stage", "select", { map: PIPELINE }), F("lifecycle", "Lifecycle step", "select", { map: LIFECYCLE }), F("segment", "Triage segment", "select", { map: SEGMENTS }), F("stream", "Stream", "select", { map: STREAMS }),
    F("contact_name", "Contact person"), F("contact_phone", "Contact phone"), F("contact_email", "Contact email", "email", { wide: true }), F("source", "Referral source"), F("payer", "Who pays"), F("value_zar", "Value (R)", "number"),
    F("owner_id", "BD owner", "select", { map: teamOpts() }), F("facilitator_id", "Facilitator", "select", { map: teamOpts() }),
    F("org_id", "Linked platform workspace", "select", { map: Object.fromEntries(S.platform.orgs.map((o) => [o.id, o.name])), wide: true }),
    F("referral_date", "Referral logged", "date"), F("triage_date", "Triage decision", "date"), F("signed_date", "Engagement signed", "date"), F("onboarded_date", "Onboarding complete", "date"),
    F("next_step", "Next step", "text"), F("next_step_date", "Next step date", "date"), F("satisfaction", "Client satisfaction (1–5)", "number", { step: 0.1, min: 1, max: 5 }), F("lost_reason", "Lost / declined reason"), F("notes", "Notes", "textarea", { wide: true })] },
  bo_visits: { title: "Field visit", fields: () => [F("client_id", "CPA", "select", { map: Object.fromEntries(S.d.bo_clients.filter((c) => c.kind === "cpa").map((c) => [c.id, c.name])), req: true, wide: true }),
    F("facilitator_id", "Facilitator", "select", { map: teamOpts() }), F("planned_date", "Planned date", "date", { req: true }), F("held_date", "Held on", "date"), F("report_date", "Report captured", "date"), F("purpose", "Purpose", "text", { wide: true }), F("outcome", "Outcome / follow-ups", "textarea", { wide: true })] },
  bo_tickets: { title: "Support ticket", fields: () => [F("title", "Issue", "text", { req: true, wide: true }), F("severity", "Severity", "select", { map: { P1: "P1 — outage / security", P2: "P2 — major, no workaround", P3: "P3 — has workaround", P4: "P4 — question / minor" } }),
    F("tier", "Tier", "select", { map: { 1: "Tier 1 — support desk", 2: "Tier 2 — Afribot support", 3: "Tier 3 — developers" } }), F("status", "Status", "select", { map: TICKET_STATUS }),
    F("assignee_id", "Assignee", "select", { map: teamOpts() }), F("client_id", "Client", "select", { map: Object.fromEntries(S.d.bo_clients.map((c) => [c.id, c.name])) }),
    F("org_id", "Platform workspace", "select", { map: Object.fromEntries(S.platform.orgs.map((o) => [o.id, o.name])) }), F("reporter", "Reported by"), F("description", "Details", "textarea", { wide: true })] },
  bo_risks: { title: "Risk", fields: () => [F("code", "Code"), F("status", "Status", "select", { map: RISK_STATUS }), F("risk", "Risk", "text", { req: true, wide: true }), F("effect", "Effect", "text", { wide: true }), F("mitigation", "Mitigation", "textarea", { wide: true }),
    F("likelihood", "Likelihood (1–5)", "number", { min: 1, max: 5, req: true }), F("impact", "Impact (1–5)", "number", { min: 1, max: 5, req: true }), F("owner_role", "Owner (role)"), F("owner_id", "Owner (person)", "select", { map: teamOpts() }), F("review_date", "Next review", "date")] },
  bo_decisions: { title: "Decision", fields: () => [F("code", "Code"), F("status", "Status", "select", { map: DECISION_STATUS }), F("decision", "Decision needed", "text", { req: true, wide: true }), F("needed_by", "Needed by (stage)"), F("due_date", "Due date", "date"),
    F("outcome", "Outcome", "textarea", { wide: true }), F("decided_on", "Decided on", "date")] },
  bo_team: { title: "Team member", fields: () => [F("full_name", "Full name (blank = vacant)"), F("status", "Status", "select", { map: { active: "In post", vacant: "Vacant", left: "Left" } }), F("role_title", "Role", "text", { req: true, wide: true }),
    F("department", "Department", "select", { map: DEPTS, req: true }), F("party", "Provided by", "select", { map: PARTIES }), F("fte", "FTE", "number", { step: 0.1, min: 0, max: 1 }), F("starts_on", "Starts", "date"),
    F("email", "Login email (gives access)", "email", { wide: true }), F("phone", "Phone"), F("access", "Access", "select", { map: { member: "Member — edit work", admin: "Manager — also team & deletes" } }), F("notes", "Notes", "textarea", { wide: true })] },
};
const NUMERIC = new Set(["value_zar", "estimate_hours", "satisfaction", "likelihood", "impact", "fte", "tier"]);

function field(f, v) {
  const id = "f-" + f.k, req = f.req ? " required" : "";
  let input;
  if (f.type === "select") input = `<select id="${id}" name="${f.k}"${req}>${opts(f.map, v, f.req ? null : "—")}</select>`;
  else if (f.type === "textarea") input = `<textarea id="${id}" name="${f.k}" rows="3">${esc(v)}</textarea>`;
  else input = `<input id="${id}" name="${f.k}" type="${f.type}" value="${esc(v)}"${req}${f.step ? ` step="${f.step}"` : f.type === "number" ? ' step="any"' : ""}${f.min != null ? ` min="${f.min}"` : ""}${f.max != null ? ` max="${f.max}"` : ""}>`;
  return `<div class="field${f.wide ? " bo-wide" : ""}"><label for="${id}">${esc(f.label)}${f.req ? " *" : ""}</label>${input}</div>`;
}

function openDrawer(table, id, preset = {}) {
  const spec = FORMS[table];
  if (!spec) return;
  if (table === "bo_team" && !isManager()) return;
  const row = id ? byId(S.d[table], id) : { ...defaults(table), ...preset };
  if (!row) return;
  const host = root.querySelector("#drawer-host");
  const extra = id ? drawerExtra(table, row) : "";
  host.innerHTML = `<div class="bo-scrim" data-close></div>
  <aside class="bo-drawer" role="dialog" aria-modal="true" aria-labelledby="dr-h">
    <header><div><span class="eyebrow">${id ? "Edit" : "New"} ${esc(spec.title.toLowerCase())}${table === "bo_tasks" && row.number ? ` · T-${row.number}` : ""}</span><h2 id="dr-h">${esc(row.title || row.name || row.risk || row.decision || row.full_name || row.role_title || (id ? spec.title : "New " + spec.title.toLowerCase()))}</h2></div>
      <button class="bo-icon" type="button" data-close aria-label="Close">${svg("x")}</button></header>
    <form id="dr-form" novalidate>
      <div class="bo-form-grid">${spec.fields().map((f) => field(f, row[f.k])).join("")}</div>
      <div id="dr-msg"></div>
      <div class="bo-row bo-form-actions">
        <button class="btn primary bo-auto" type="submit">${id ? "Save changes" : "Create"}</button>
        <button class="btn" type="button" data-close>Cancel</button>
        ${id && isManager() ? `<button class="btn ghost bo-danger" type="button" id="dr-del">Delete</button>` : ""}
      </div>
    </form>
    ${extra}
  </aside>`;
  const form = host.querySelector("#dr-form");
  host.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeDrawer));
  host.querySelector(".bo-drawer").addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
  form.querySelector("input,select,textarea")?.focus();
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const patch = {};
    spec.fields().forEach((f) => {
      let v = form.elements[f.k].value;
      v = v === "" ? null : NUMERIC.has(f.k) ? Number(v) : v;
      if (!id || String(v ?? "") !== String(row[f.k] ?? "")) patch[f.k] = v;
    });
    const btn = form.querySelector("[type=submit]"); btn.disabled = true;
    const ok = id ? await save(table, id, patch) : await create(table, { ...preset, ...patch });
    if (ok) closeDrawer(); else btn.disabled = false;
  };
  host.querySelector("#dr-del")?.addEventListener("click", async () => {
    if (!confirm(`Delete this ${spec.title.toLowerCase()}? This can't be undone.`)) return;
    try { await db.remove(table, id); S.d[table] = S.d[table].filter((x) => x.id !== id); closeDrawer(); refreshActivity(); render(); }
    catch (err) { host.querySelector("#dr-msg").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
  });
  wireDrawerExtra(table, row);
}

function defaults(table) {
  const me = myTeamId();
  return {
    bo_tasks: { status: "todo", priority: "P3", assignee_id: me, department: S.me?.team?.department || null },
    bo_milestones: { status: "not_started", phase: "year_1" },
    bo_clients: { kind: "cpa", pipeline_stage: "lead", lifecycle: "referral", referral_date: today(), owner_id: me },
    bo_visits: { planned_date: today(), facilitator_id: me },
    bo_tickets: { severity: "P3", tier: 1, status: "open" },
    bo_risks: { likelihood: 3, impact: 3, status: "open" },
    bo_decisions: { status: "open" },
    bo_team: { status: "active", access: "member", fte: 1, department: "back_office" },
  }[table] || {};
}

function closeDrawer() { const h = root.querySelector("#drawer-host"); if (h) h.innerHTML = ""; }

/* Related records shown under the form: comments on tasks, visits and tasks on clients, tasks on milestones. */
function drawerExtra(table, row) {
  if (table === "bo_tasks") {
    const cs = S.d.bo_task_comments.filter((c) => c.task_id === row.id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    return `<section class="bo-related"><h3>Comments</h3>
      ${cs.map((c) => `<div class="bo-comment"><b>${esc(c.author_name || "Team member")}</b><span class="bo-muted"> · ${fmtDT(c.created_at)}</span><p>${esc(c.body)}</p></div>`).join("") || `<p class="bo-muted">No comments yet.</p>`}
      <form id="cm-form"><div class="field"><label for="cm">Add a comment</label><textarea id="cm" rows="2" required></textarea></div><button class="btn" type="submit">Post comment</button></form></section>`;
  }
  if (table === "bo_clients") {
    const vs = S.d.bo_visits.filter((v) => v.client_id === row.id), ts = S.d.bo_tasks.filter((t) => t.client_id === row.id);
    const org = row.org_id ? byId(S.platform.orgs, row.org_id) : null;
    return `<section class="bo-related">
      ${org ? `<h3>On the platform</h3><p>Gate <b>${org.current_gate ?? "–"}</b> · ${org.users} users · ${Number(org.beneficiaries).toLocaleString("en-ZA")} members on register · ${org.documents} documents · ${org.events_30d} changes in 30 days.</p>` : ""}
      <h3>Visits</h3>${vs.map((v) => `<div class="bo-rel-row">${fmtD(v.planned_date)} — ${esc(v.purpose || "Visit")} ${v.held_date ? `<span class="badge good">held</span>` : ""}</div>`).join("") || `<p class="bo-muted">None yet.</p>`}
      <h3>Tasks</h3>${ts.map((t) => `<div class="bo-rel-row">T-${t.number} ${esc(t.title)} ${chip(TASK_STATUS, t.status)}</div>`).join("") || `<p class="bo-muted">None yet.</p>`}
      <div class="bo-row"><button class="btn" type="button" data-rel="bo_visits">${svg("plus")}Plan visit</button><button class="btn" type="button" data-rel="bo_tasks">${svg("plus")}Add task</button></div></section>`;
  }
  if (table === "bo_milestones") {
    const ts = S.d.bo_tasks.filter((t) => t.milestone_id === row.id);
    return `<section class="bo-related"><h3>Tasks for this milestone</h3>
      ${ts.map((t) => `<div class="bo-rel-row">T-${t.number} ${esc(t.title)} ${chip(TASK_STATUS, t.status)}</div>`).join("") || `<p class="bo-muted">No tasks linked yet.</p>`}
      <button class="btn" type="button" data-rel="bo_tasks">${svg("plus")}Add task</button></section>`;
  }
  return "";
}

function wireDrawerExtra(table, row) {
  const host = root.querySelector("#drawer-host");
  host.querySelector("#cm-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = host.querySelector("#cm").value.trim();
    if (!body) return;
    const name = S.me?.team?.full_name || S.session?.user?.user_metadata?.full_name || S.session?.user?.email;
    if (await create("bo_task_comments", { task_id: row.id, body, author_name: name }, false)) openDrawer(table, row.id);
  });
  host.querySelectorAll("[data-rel]").forEach((b) => (b.onclick = () => {
    const preset = table === "bo_clients" ? { client_id: row.id } : { milestone_id: row.id, department: row.department };
    openDrawer(b.dataset.rel, null, preset);
  }));
}

function openReading(kpiId) {
  const k = S.d.bo_kpis.find((x) => x.id === kpiId);
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  const host = root.querySelector("#drawer-host");
  host.innerHTML = `<div class="bo-scrim" data-close></div>
  <aside class="bo-drawer bo-narrow" role="dialog" aria-modal="true" aria-labelledby="rd-h">
    <header><div><span class="eyebrow">${k.id} · ${esc(k.owner_role || "")}</span><h2 id="rd-h">${esc(k.name)}</h2></div><button class="bo-icon" type="button" data-close aria-label="Close">${svg("x")}</button></header>
    <p class="bo-lead">${esc(k.definition || "")}${k.source ? ` Source: ${esc(k.source)}.` : ""}</p>
    <form id="rd-form">
      <div class="field"><label for="rd-p">Month</label><input id="rd-p" type="month" required value="${d.toISOString().slice(0, 7)}"></div>
      <div class="field"><label for="rd-v">${k.unit === "yesno" ? "Done? (1 = yes, 0 = no)" : `Value (${{ pct: "%", days: "days", months: "months", score: "1–5", count: "count" }[k.unit] || ""})`}</label><input id="rd-v" type="number" step="any" required></div>
      <div class="field"><label for="rd-n">Note</label><textarea id="rd-n" rows="2"></textarea></div>
      <div id="dr-msg"></div>
      <div class="bo-row"><button class="btn primary bo-auto" type="submit">Save reading</button><button class="btn" type="button" data-close>Cancel</button></div>
    </form>
    ${k.readings?.length || S.d.bo_kpi_readings.some((r) => r.kpi_id === k.id) ? `<section class="bo-related"><h3>History</h3>${S.d.bo_kpi_readings.filter((r) => r.kpi_id === k.id).sort((a, b) => b.period.localeCompare(a.period)).map((r) => `<div class="bo-rel-row">${toDate(r.period).toLocaleDateString("en-ZA", { month: "long", year: "numeric" })} — <b>${fmtKpi(k, r.value)}</b> ${esc(r.note || "")}</div>`).join("")}</section>` : ""}
  </aside>`;
  host.querySelectorAll("[data-close]").forEach((b) => (b.onclick = closeDrawer));
  host.querySelector("#rd-form").onsubmit = async (e) => {
    e.preventDefault();
    const period = host.querySelector("#rd-p").value + "-01";
    try {
      const r = await db.upsert("bo_kpi_readings", { kpi_id: k.id, period, value: Number(host.querySelector("#rd-v").value), note: host.querySelector("#rd-n").value || null }, "kpi_id,period");
      S.d.bo_kpi_readings = S.d.bo_kpi_readings.filter((x) => !(x.kpi_id === k.id && x.period === period)).concat(r);
      closeDrawer(); render();
    } catch (err) { host.querySelector("#dr-msg").innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
  };
}

/* ---------- writes ---------- */
function stamp(table, row, patch) {
  // tickets: record when a ticket is first acknowledged / resolved
  if (table === "bo_tickets" && patch.status) {
    const t = new Date().toISOString();
    if (patch.status !== "open" && !row?.acknowledged_at) patch.acknowledged_at = t;
    if (["resolved", "closed"].includes(patch.status) && !row?.resolved_at) patch.resolved_at = t;
    if (!["resolved", "closed"].includes(patch.status)) patch.resolved_at = null;
  }
  // clients: winning a deal moves the client to contracting
  if (table === "bo_clients" && patch.pipeline_stage === "won" && row && ["referral", "first_contact", "evidence", "triage", "triage_confirmed", "proposal"].includes(row.lifecycle) && !patch.lifecycle) patch.lifecycle = "contracting";
  if (table === "bo_decisions" && patch.status === "decided" && !row?.decided_on && !patch.decided_on) patch.decided_on = today();
  return patch;
}

async function save(table, id, patch, rerender = true) {
  const row = byId(S.d[table], id);
  stamp(table, row, patch);
  if (!Object.keys(patch).length) return true;
  try {
    const r = await db.update(table, id, patch);
    S.d[table] = S.d[table].map((x) => (x.id === id ? r : x));
    refreshActivity();
    if (rerender) render();
    return true;
  } catch (e) { toast(e.message); return false; }
}

async function create(table, row, rerender = true) {
  stamp(table, null, row);
  try {
    const r = await db.insert(table, row);
    S.d[table] = [...S.d[table], r];
    refreshActivity();
    if (rerender) render();
    return true;
  } catch (e) {
    const m = root.querySelector("#dr-msg");
    if (m) m.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; else toast(e.message);
    return false;
  }
}

async function refreshActivity() { try { S.activity = await db.activity(); } catch {} }

function toast(msg) {
  const t = document.createElement("div");
  t.className = "bo-toast"; t.setAttribute("role", "alert"); t.textContent = `Couldn't save — ${msg}`;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

boot();
