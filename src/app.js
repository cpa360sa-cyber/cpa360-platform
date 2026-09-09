import { supabase } from "./supabase.js";
import { onAuth, getSession, signOut } from "./auth.js";
import { renderAuth } from "./auth-ui.js";
import {
  myOrgs, resolveActiveOrg, setActiveOrgId, createOrg, seedSandbox, atLeast,
} from "./orgs.js";
import {
  listMembers, addMember, setMemberRole, removeMember,
} from "./members.js";
import * as dash from "./dashboard.js";

const root = document.getElementById("root");
const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const state = { session: null, orgs: [], active: null, dashOrgId: null };

/* ============ icons (path innards only) ============ */
const IC = {
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  columns: '<path d="M4 21h16M6 21V9m4 12V6m4 15V9m4 12V6M3 9l9-6 9 6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M15 11a3 3 0 1 0 0-6M4 20c0-2.8 2.2-5 5-5s5 2.2 5 5M15 15c2.4 0 5 1.6 5 5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18M16 14h2"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.4 12h11L21 8H6"/>',
  map: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
  sprout: '<path d="M12 22V10M12 10C9 10 7 7 7 4c3 0 5 3 5 6zM12 10c3 0 5-3 5-6-3 0-5 3-5 6z"/>',
  kanban: '<rect x="3" y="4" width="6" height="14" rx="1.5"/><rect x="10" y="4" width="6" height="9" rx="1.5"/><rect x="17" y="4" width="4" height="16" rx="1.5"/>',
  trend: '<path d="M3 17l6-6 4 4 8-9"/><path d="M15 6h6v6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  gauge: '<path d="M12 4a8 8 0 1 0 8 8"/><path d="M12 12l5-3"/><circle cx="12" cy="12" r="1.6"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H13a3 3 0 0 0 0-6H11a3 3 0 0 1 0-6h4.5"/>',
  report: '<path d="M7 3h7l5 5v13H7z"/><path d="M13 3v6h6M10 14l2 2 4-4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9"/>',
  pulse: '<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  team: '<circle cx="8" cy="9" r="2.5"/><circle cx="16" cy="9" r="2.5"/><path d="M3 19c0-3 2.2-5 5-5s5 2 5 5M13 19c0-3 2.2-5 5-5s3 2 3 5"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
  bell: '<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 3h16z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 0 1 5 .3c0 1.7-2.5 2-2.5 3.7M12 17h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
const svg = (name, cls) =>
  `<svg class="ic ${cls || ""}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[name] || ""}</svg>`;

/* ============ sidebar model ============
   id "a/b" → hash #/v/a/b (deep-links a dashboard sub-tab)
   app:true → routed by this file (#/members, #/settings, #/reports)          */
const NAV = [
  { group: "Overview", items: [
    { id: "exec", label: "Dashboard", icon: "grid" },
  ]},
  { group: "Institution", items: [
    { id: "profile", label: "Governance", icon: "columns" },
    { id: "beneficiary", label: "Beneficiaries", icon: "users" },
  ]},
  { group: "Resources", items: [
    { id: "finance", label: "Finance", icon: "wallet" },
    { id: "finance/requisitions", label: "Procurement", icon: "cart", sub: true },
    { id: "assets", label: "Land & Assets", icon: "map" },
    { id: "productivity", label: "Productivity", icon: "sprout" },
  ]},
  { group: "Delivery", items: [
    { id: "projects", label: "Projects", icon: "kanban" },
    { id: "projects/markets", label: "Commercialisation", icon: "trend", sub: true },
    { id: "projects/funding", label: "Funding Readiness", icon: "target", sub: true },
  ]},
  { group: "Insight", items: [
    { id: "score", label: "Institutional Performance", icon: "gauge" },
    { id: "journey", label: "CPA360 Journey", icon: "route" },
    { id: "reports", label: "Reports", icon: "report", app: true },
  ]},
  { group: "Records", items: [
    { id: "masterfile", label: "Master File", icon: "folder" },
    { id: "actions", label: "Action Tracker", icon: "check" },
    { id: "impact", label: "Impact & M&E", icon: "pulse" },
  ]},
  { group: "Manage", items: [
    { id: "members", label: "Members", icon: "team", app: true, admin: true },
    { id: "settings", label: "Settings", icon: "cog", app: true },
  ]},
];
const STRIP_VIEWS = new Set(["exec", "score", "journey", "reports"]);

/* ============================ boot ============================ */
(async function boot() {
  if (new URLSearchParams(location.search).has("preview")) return previewShell();
  state.session = await getSession();
  onAuth((event, session) => {
    state.session = session;
    if (event === "PASSWORD_RECOVERY") {
      renderAuth(root, "setpw", enterApp);
    } else if (event === "SIGNED_IN") {
      enterApp();
    } else if (event === "SIGNED_OUT") {
      dash.destroyDashboard();
      state.orgs = []; state.active = null; state.dashOrgId = null;
      renderAuth(root, "signin");
    }
  });
  if (state.session) enterApp();
  else renderAuth(root, "signin");
})();

window.addEventListener("hashchange", () => { if (state.session) renderView(); });

/* ======================== app shell ========================= */
async function enterApp() {
  root.className = "";
  root.innerHTML = `<div class="booting">Loading your workspaces…</div>`;
  try {
    state.orgs = await myOrgs();
  } catch (e) {
    root.innerHTML = `<div class="auth-wrap"><div class="auth-card"><h1>Couldn't load</h1>
      <p class="sub">${esc(e.message)}</p>
      <button class="btn" onclick="location.reload()">Retry</button></div></div>`;
    return;
  }
  state.active = resolveActiveOrg(state.orgs);
  renderShell();
  renderView();
}

function navGroupsHtml() {
  const canManage = state.active && atLeast(state.active.role, "admin");
  return NAV.map((g) => {
    const items = g.items.filter((it) => !(it.admin && !canManage));
    if (!items.length) return "";
    return `<div class="sb-group">${esc(g.group)}</div>` + items.map((it) => {
      const route = it.app ? "#/" + it.id : "#/v/" + it.id;
      return `<button class="sb-link${it.sub ? " sub" : ""}" data-route="${route}" data-navid="${esc(it.id)}">
        ${svg(it.icon)}<span>${esc(it.label)}</span></button>`;
    }).join("");
  }).join("");
}

function renderShell() {
  const email = state.session?.user?.email || "";
  const avatar = (email[0] || "?").toUpperCase();

  root.innerHTML = `
    <div class="app" data-nav-open="false">
      <div class="nav-scrim" id="nav-scrim"></div>
      <aside class="sidebar">
        <div class="sb-brand">
          <span class="sb-mark" aria-hidden="true">C</span>
          <span class="sb-brand-txt"><b>CPA360&trade;</b><span>A GAD Foundation Programme</span></span>
        </div>
        <nav class="sb-nav" id="nav" aria-label="Sections">${state.active ? navGroupsHtml() : ""}</nav>
        <div class="sb-foot">
          <button class="sb-foot-btn" id="theme-toggle" type="button">Theme</button>
        </div>
      </aside>

      <main>
        <header class="topbar">
          <button class="tb-menu" id="tb-menu" type="button" aria-label="Open menu">${svg("menu")}</button>
          <div class="tb-title">
            <span class="eyebrow" id="v-eyebrow"></span>
            <h1 id="v-title">CPA360</h1>
          </div>
          <div class="tb-tools">
            <div class="tb-search">
              ${svg("search", "tb-search-ic")}
              <input id="tb-search" type="search" placeholder="Search CPA360…" autocomplete="off" aria-label="Search" />
              <div class="tb-pop tb-search-pop" id="tb-search-pop" hidden></div>
            </div>
            <label class="tb-org" title="Active CPA">
              <select id="org-sel" aria-label="Active CPA">
                ${state.orgs.map((o) => `<option value="${o.id}"${o.id === state.active?.id ? " selected" : ""}>${esc(o.name)}</option>`).join("")}
                <option value="__new">+ Create a CPA…</option>
              </select>
            </label>
            <div class="tb-icon-wrap">
              <button class="tb-icon" id="tb-notif" type="button" aria-label="Notifications">
                ${svg("bell")}<span class="tb-dot" id="tb-dot" hidden></span>
              </button>
              <div class="tb-pop" id="notif-pop" hidden><div class="tb-pop-head">Needs attention</div><div id="notif-body"></div></div>
            </div>
            <a class="tb-icon" id="tb-help" href="./index.html#lp-faq" target="_blank" rel="noopener" aria-label="Help">${svg("help")}</a>
            <div class="tb-icon-wrap">
              <button class="tb-icon tb-avatar" id="tb-profile" type="button" aria-label="Account">${esc(avatar)}</button>
              <div class="tb-pop tb-pop-r" id="profile-pop" hidden>
                <div class="tb-pop-head">${esc(email)}</div>
                <div class="tb-pop-sub" id="profile-role"></div>
                <button class="tb-pop-item" data-route="#/settings" type="button">${svg("cog")}Settings</button>
                <button class="tb-pop-item" id="pp-print" type="button">${svg("report")}Print board pack</button>
                <button class="tb-pop-item" id="pp-signout" type="button">Sign out</button>
              </div>
            </div>
          </div>
        </header>

        <div class="journey-strip" id="journey-strip" hidden></div>
        <div class="viewport" id="view"></div>
      </main>
    </div>`;

  wireShell();
}

function wireShell() {
  const app = root.querySelector(".app");
  const setNav = (open) => app.dataset.navOpen = String(open);
  root.querySelector("#tb-menu").onclick = () => setNav(app.dataset.navOpen !== "true");
  root.querySelector("#nav-scrim").onclick = () => setNav(false);

  root.querySelectorAll("[data-route]").forEach((b) => {
    b.addEventListener("click", () => { location.hash = b.dataset.route; setNav(false); closePops(); });
  });

  root.querySelector("#org-sel").addEventListener("change", (e) => {
    if (e.target.value === "__new") { e.target.value = state.active?.id || ""; location.hash = "#/new"; return; }
    setActiveOrgId(e.target.value);
    state.active = state.orgs.find((o) => o.id === e.target.value) || null;
    dash.destroyDashboard();
    state.dashOrgId = null;
    renderShell();
    location.hash = "#/v/exec";
    renderView();
  });

  root.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
  root.querySelector("#pp-signout").addEventListener("click", () => signOut());
  root.querySelector("#pp-print").addEventListener("click", () => { closePops(); dash.printPack(); });

  const roleEl = root.querySelector("#profile-role");
  if (roleEl && state.active) roleEl.textContent = `${state.active.name} · your role: ${state.active.role}`;

  /* pop-overs */
  const pops = [["#tb-notif", "#notif-pop"], ["#tb-profile", "#profile-pop"]];
  pops.forEach(([btnSel, popSel]) => {
    const btn = root.querySelector(btnSel), pop = root.querySelector(popSel);
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      closePops();
      pop.hidden = !open;
    });
    pop.addEventListener("click", (e) => e.stopPropagation());
  });
  document.addEventListener("click", closePops);

  /* search */
  const si = root.querySelector("#tb-search"), sp = root.querySelector("#tb-search-pop");
  const idx = [];
  NAV.forEach((g) => g.items.forEach((it) => idx.push({ label: it.label, group: g.group, route: it.app ? "#/" + it.id : "#/v/" + it.id })));
  dash.NAV.forEach((n) => { if (n.sub) idx.push({ label: n.title, group: "Section", route: "#/v/" + n.id, hint: n.sub }); });
  si.addEventListener("input", () => {
    const q = si.value.trim().toLowerCase();
    if (!q) { sp.hidden = true; return; }
    const hits = idx.filter((r) => (r.label + " " + (r.hint || "")).toLowerCase().includes(q)).slice(0, 8);
    sp.innerHTML = hits.length
      ? hits.map((r) => `<button class="tb-pop-item" data-route="${r.route}" type="button">
          <span>${esc(r.label)}</span><em>${esc(r.group)}</em></button>`).join("")
      : `<div class="tb-pop-empty">Nothing found</div>`;
    sp.querySelectorAll("[data-route]").forEach((b) => (b.onclick = () => {
      location.hash = b.dataset.route; si.value = ""; sp.hidden = true; closePops();
    }));
    sp.hidden = false;
  });
  si.addEventListener("blur", () => setTimeout(() => (sp.hidden = true), 150));
}
function closePops() {
  root.querySelectorAll(".tb-pop").forEach((p) => (p.hidden = true));
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = cur === "dark" ? "light" : cur === "light" ? "dark"
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("cpa360.theme", next); } catch {}
}

/* ==================== shell chrome refresh ==================== */
function refreshChrome(routeView) {
  const s = dash.dashSummary && dash.dashSummary();
  const strip = root.querySelector("#journey-strip");
  const dot = root.querySelector("#tb-dot");
  const nb = root.querySelector("#notif-body");
  if (!s) { if (strip) strip.hidden = true; return; }

  if (strip) {
    strip.hidden = !STRIP_VIEWS.has(routeView);
    strip.innerHTML = `
      <div class="js-lead"><span class="eyebrow">CPA360 Journey</span>
        <b>Stage ${s.stageN} · ${esc(s.stageName)}</b></div>
      <ol class="js-track">${s.journey.map((g) => `
        <li class="js-node ${g.state}"><span>${g.n}</span>${esc(g.name)}</li>`).join("")}</ol>`;
    strip.querySelector(".js-track").onclick = () => { location.hash = "#/v/journey"; };
  }

  if (dot) dot.hidden = !s.alerts.length;
  if (nb) {
    nb.innerHTML = s.alerts.length
      ? s.alerts.map((a) => `<button class="notif-item tone-${a.tone}" data-route="${a.goto}" type="button">
          <span class="notif-mark"></span><span>${esc(a.text)}</span></button>`).join("")
      : `<div class="tb-pop-empty">All clear — nothing needs attention.</div>`;
    nb.querySelectorAll("[data-route]").forEach((b) => (b.onclick = () => {
      location.hash = b.dataset.route; closePops();
    }));
  }
}

/* ========================== views ========================== */
function route() {
  const h = location.hash || "#/";
  if (h.startsWith("#/members")) return { name: "members" };
  if (h.startsWith("#/settings")) return { name: "settings" };
  if (h.startsWith("#/reports")) return { name: "reports" };
  if (h.startsWith("#/new")) return { name: "new" };
  if (h.startsWith("#/v/")) {
    const parts = h.slice(4).split("/");
    return { name: "dash", view: parts[0], tab: parts[1] || null };
  }
  return { name: "home" };
}

function setHeader(eyebrow, title) {
  const e = root.querySelector("#v-eyebrow"), t = root.querySelector("#v-title");
  if (e) e.textContent = eyebrow || "";
  if (t) t.textContent = title || "";
  document.title = "CPA360 · " + (title || "");
}
function markActiveNav(id) {
  root.querySelectorAll("#nav .sb-link").forEach((b) =>
    b.classList.toggle("active", b.dataset.navid === id));
}

async function renderView() {
  const view = root.querySelector("#view");
  if (!view) return renderShell();
  const r = route();
  closePops();

  if (r.name === "new") return renderNewOrg(view);
  if (!state.active) return renderWelcome(view);

  if (r.name === "members") {
    if (!atLeast(state.active.role, "admin")) { location.hash = "#/v/exec"; return; }
    setHeader("Manage", "Members — " + state.active.name); markActiveNav("members");
    refreshChrome("members");
    return renderMembers(view);
  }
  if (r.name === "settings") {
    setHeader("Manage", "Settings"); markActiveNav("settings");
    refreshChrome("settings");
    return renderSettings(view);
  }
  if (r.name === "reports") {
    setHeader("Insight", "Reports"); markActiveNav("reports");
    return renderReports(view);
  }
  if (r.name === "home") { location.hash = "#/v/exec"; return; }

  return renderDashboardView(view, r.view, r.tab);
}

/* ---- dashboard mount ---- */
async function renderDashboardView(view, viewId, tab) {
  const nav = dash.NAV.find((n) => n.id === viewId) || dash.NAV[0];
  setHeader(nav.eyebrow, nav.title);
  markActiveNav(tab ? viewId + "/" + tab : viewId);

  if (state.dashOrgId !== state.active.id) {
    view.innerHTML = `<div class="booting" style="min-height:180px">Loading ${esc(state.active.name)}…</div>`;
    try {
      await dash.initDashboard({ orgId: state.active.id, role: state.active.role });
    } catch (e) {
      view.innerHTML = `<div class="msg err">Couldn't load this CPA — ${esc(e.message)}</div>`;
      return;
    }
    state.dashOrgId = state.active.id;
    dash.setOnChange(() => refreshChrome(route().view));
    dash.mountView(view, nav.id);
    if (tab) dash.showView(nav.id, tab);
  } else if (!view.querySelector(".view")) {
    dash.mountView(view, nav.id);
    if (tab) dash.showView(nav.id, tab);
  } else {
    dash.showView(nav.id, tab || undefined);
  }
  refreshChrome(viewId);
}

/* ---- settings ---- */
function renderSettings(view) {
  const email = state.session?.user?.email || "";
  const notify = localStorage.getItem("cpa360.notify") !== "off";
  view.innerHTML = `
    <div class="settings-grid">
      <section class="card">
        <div class="section-title" style="margin-top:0">Appearance</div>
        <div class="row-inline" style="justify-content:space-between">
          <div><b>Theme</b><div style="font-size:12px;color:var(--ink-2)">Light, dark, or match your device.</div></div>
          <button class="btn" id="set-theme" type="button">Switch theme</button>
        </div>
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">Notifications</div>
        <label class="row-inline" style="justify-content:space-between;cursor:pointer">
          <div><b>Attention alerts</b><div style="font-size:12px;color:var(--ink-2)">Show the badge on overdue actions, expiring leases and unreconciled transactions.</div></div>
          <input type="checkbox" id="set-notify" ${notify ? "checked" : ""} style="width:18px;height:18px;accent-color:var(--brand-2)">
        </label>
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">Account</div>
        <dl class="kv">
          <dt>Signed in as</dt><dd>${esc(email)}</dd>
          <dt>Active CPA</dt><dd>${esc(state.active.name)}</dd>
          <dt>Your role</dt><dd style="text-transform:capitalize">${esc(state.active.role)}</dd>
        </dl>
        <button class="btn" id="set-signout" type="button" style="margin-top:12px">Sign out</button>
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">About CPA360</div>
        <p style="font-size:12.5px;color:var(--ink-2);margin:0">
          CPA360&trade; — Your CPA Institutional Operating System. A GAD Foundation Programme.
          CPA360 supports institutional management; it does not replace a CPA's lawful governance structures.</p>
      </section>
    </div>`;
  view.querySelector("#set-theme").onclick = toggleTheme;
  view.querySelector("#set-signout").onclick = () => signOut();
  view.querySelector("#set-notify").onchange = (e) => {
    localStorage.setItem("cpa360.notify", e.target.checked ? "on" : "off");
    refreshChrome(route().view);
  };
}

/* ---- reports ---- */
function renderReports(view) {
  const s = dash.dashSummary && dash.dashSummary();
  markActiveNav("reports");
  refreshChrome("reports");
  view.innerHTML = `
    <p class="note" style="margin-bottom:18px">Reports pull live figures from this CPA. The board pack renders every section for printing or PDF.</p>
    <div class="reports-grid">
      <section class="card">
        <div class="section-title" style="margin-top:0">Institutional snapshot</div>
        ${s ? `<dl class="kv">
          <dt>Institutional Score</dt><dd><b>${s.score} / 100</b> · ${esc(s.band)}</dd>
          <dt>Journey stage</dt><dd>Stage ${s.stageN} — ${esc(s.stageName)}</dd>
          <dt>Needs attention</dt><dd>${s.alerts.length} item${s.alerts.length === 1 ? "" : "s"}</dd>
        </dl>` : `<p style="font-size:12.5px;color:var(--ink-2)">Open the Dashboard once to load this CPA, then return here.</p>`}
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">Board pack</div>
        <p style="font-size:12.5px;color:var(--ink-2);margin:0 0 12px">All twelve views, formatted for a Committee meeting. Use your browser's "Save as PDF".</p>
        <button class="btn primary" id="rep-print" type="button" style="width:auto">Generate board pack</button>
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">Jump to a report view</div>
        <div class="report-links">
          <button class="btn" data-route="#/v/score" type="button">Institutional Performance</button>
          <button class="btn" data-route="#/v/journey" type="button">CPA360 Journey</button>
          <button class="btn" data-route="#/v/masterfile" type="button">Master File status</button>
          <button class="btn" data-route="#/v/impact" type="button">Impact &amp; M&amp;E</button>
        </div>
      </section>
    </div>`;
  view.querySelectorAll("[data-route]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.route; }));
  view.querySelector("#rep-print").onclick = async () => {
    if (state.dashOrgId !== state.active.id) {
      // mount the dashboard off-screen so printPack has something to render
      const holder = document.createElement("div");
      holder.style.display = "none";
      document.body.appendChild(holder);
      try {
        await dash.initDashboard({ orgId: state.active.id, role: state.active.role });
        state.dashOrgId = state.active.id;
        dash.mountView(holder, "exec");
      } catch (e) { alert("Couldn't load this CPA: " + e.message); return; }
    }
    dash.printPack();
  };
}

/* ---- welcome / first CPA ---- */
function renderWelcome(view) {
  setHeader("Getting started", "Welcome to CPA360");
  view.innerHTML = `
    <div class="card" style="max-width:460px">
      <h2 style="font-size:16px;margin-bottom:6px">You're not in any CPA yet</h2>
      <p style="color:var(--ink-2);font-size:12.5px;margin:0 0 16px">
        Start a new Communal Property Association, or load the demo dataset to explore.</p>
      <button class="btn primary" id="go-new" style="margin-bottom:10px">Create a CPA</button>
      <button class="btn" id="go-seed" style="width:100%">Load the demo dataset</button>
      <div id="w-msg"></div>
    </div>`;
  view.querySelector("#go-new").addEventListener("click", () => { location.hash = "#/new"; });
  view.querySelector("#go-seed").addEventListener("click", async (ev) => {
    ev.target.disabled = true; ev.target.textContent = "Loading…";
    try {
      const id = await seedSandbox();
      setActiveOrgId(id);
      state.dashOrgId = null;
      location.hash = "#/v/exec";
      await enterApp();
    } catch (e) {
      view.querySelector("#w-msg").innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
      ev.target.disabled = false; ev.target.textContent = "Load the demo dataset";
    }
  });
}

/* ---- create org ---- */
function renderNewOrg(view) {
  setHeader("Institution", "Create a CPA");
  view.innerHTML = `
    <form class="card" id="new-form" style="max-width:460px">
      <div class="field"><label for="n-name">Legal name</label><input id="n-name" required /></div>
      <div class="field"><label for="n-reg">Registration no.</label><input id="n-reg" placeholder="CPA 20XX/XXXXXXX/XX" /></div>
      <div class="field"><label for="n-region">Region</label><input id="n-region" placeholder="District, Province" /></div>
      <div class="field"><label for="n-est">Year established</label><input id="n-est" type="number" inputmode="numeric" /></div>
      <div id="n-msg"></div>
      <button class="btn primary" type="submit">Create</button>
    </form>`;
  view.querySelector("#new-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button");
    btn.disabled = true; btn.textContent = "Creating…";
    try {
      const id = await createOrg({
        name: view.querySelector("#n-name").value.trim(),
        registration: view.querySelector("#n-reg").value.trim(),
        region: view.querySelector("#n-region").value.trim(),
        established: view.querySelector("#n-est").value.trim(),
      });
      setActiveOrgId(id);
      state.dashOrgId = null;
      location.hash = "#/v/exec";
      await enterApp();
    } catch (err) {
      view.querySelector("#n-msg").innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = "Create";
    }
  });
}

/* ---- members ---- */
async function renderMembers(view) {
  const org = state.active;
  view.innerHTML = `<div class="booting" style="min-height:120px">Loading members…</div>`;

  let members = [];
  try { members = await listMembers(org.id); }
  catch (e) { view.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }

  const me = state.session?.user?.id;
  const owners = members.filter((m) => m.role === "owner").length;

  view.innerHTML = `
    <form class="card" id="add-form" style="margin-bottom:22px">
      <div class="section-title" style="margin-top:0">Add a member</div>
      <div class="row-inline">
        <div class="field" style="flex:1;min-width:200px">
          <label for="m-email">Email</label>
          <input id="m-email" type="email" placeholder="person@example.org" required />
        </div>
        <div class="field">
          <label for="m-role">Role</label>
          <select id="m-role">
            <option value="member" selected>Member</option>
            <option value="admin">Admin</option>
            <option value="viewer">Viewer</option>
          </select>
        </div>
        <button class="btn primary" type="submit" style="width:auto">Add</button>
      </div>
      <div id="m-msg"></div>
      <p style="font-size:11.5px;color:var(--ink-muted);margin:10px 0 0">
        If they don't have an account, they'll get an email invitation.</p>
    </form>

    <div class="table-wrap"><table>
      <thead><tr><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
      <tbody>${members.map((m) => memberRow(m, me, owners)).join("")}</tbody>
    </table></div>`;

  view.querySelector("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = view.querySelector("#m-email").value.trim();
    const role = view.querySelector("#m-role").value;
    const btn = e.target.querySelector("button");
    const msg = view.querySelector("#m-msg");
    btn.disabled = true; btn.textContent = "…";
    try {
      const { invited } = await addMember(org.id, email, role);
      msg.innerHTML = `<div class="msg ok">${invited ? "Invitation emailed to " : "Added "}${esc(email)}.</div>`;
      setTimeout(() => renderMembers(view), 700);
    } catch (err) {
      msg.innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = "Add";
    }
  });

  view.querySelectorAll("[data-role-for]").forEach((sel) =>
    sel.addEventListener("change", async () => {
      try { await setMemberRole(org.id, sel.dataset.roleFor, sel.value); renderMembers(view); }
      catch (e) { alert(e.message); renderMembers(view); }
    }));
  view.querySelectorAll("[data-remove]").forEach((b) =>
    b.addEventListener("click", async () => {
      if (!confirm("Remove this member?")) return;
      try { await removeMember(org.id, b.dataset.remove); renderMembers(view); }
      catch (e) { alert(e.message); }
    }));
}

/* ---- dev: preview the shell chrome without signing in (?preview) ---- */
function previewShell() {
  state.session = { user: { email: "chairperson@kwezivalley.org.za" } };
  state.orgs = [{ id: "kv", name: "Kwezi Valley CPA", role: "admin" },
    { id: "mb", name: "Mashobotho CPA", role: "member" }];
  state.active = state.orgs[0];
  renderShell();
  setHeader("Overview", "CPA Executive Dashboard");
  markActiveNav("exec");
  const strip = root.querySelector("#journey-strip");
  const jn = ["Assess", "Recover", "Stabilise", "Professionalise", "Productivise", "Commercialise", "Scale"];
  strip.hidden = false;
  strip.innerHTML = `<div class="js-lead"><span class="eyebrow">CPA360 Journey</span><b>Stage 4 · Professionalise</b></div>
    <ol class="js-track">${jn.map((n, i) => `<li class="js-node ${i < 3 ? "done" : i === 3 ? "current" : ""}"><span>${i + 1}</span>${n}</li>`).join("")}</ol>`;
  root.querySelector("#tb-dot").hidden = false;
  root.querySelector("#notif-body").innerHTML = [
    ["critical", "2 actions overdue"], ["warning", "1 land lease expiring or expired"],
    ["info", "2 transactions not reconciled"],
  ].map(([t, x]) => `<button class="notif-item tone-${t}" type="button"><span class="notif-mark"></span><span>${x}</span></button>`).join("");
  root.querySelector("#view").innerHTML = `<div class="note">Shell preview — sign in for the real dashboard.</div>`;
}

function memberRow(m, meId, ownerCount) {
  const isMe = m.user_id === meId;
  const lockOwner = m.role === "owner" && ownerCount <= 1;
  const joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString("en-ZA") : "";
  return `<tr>
    <td>${esc(m.email)}${isMe ? ' <span class="role-pill">you</span>' : ""}</td>
    <td>
      <select class="role-pill" data-role-for="${m.user_id}" ${lockOwner ? "disabled" : ""}
        style="border:1px solid var(--border);background:var(--surface);color:var(--ink)">
        ${["viewer", "member", "admin", "owner"].map((r) =>
          `<option value="${r}"${r === m.role ? " selected" : ""}>${r}</option>`).join("")}
      </select>
    </td>
    <td class="mono">${esc(joined)}</td>
    <td>${lockOwner ? "" : `<button class="linkbtn" data-remove="${m.user_id}">remove</button>`}</td>
  </tr>`;
}
