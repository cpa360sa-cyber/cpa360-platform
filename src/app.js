import { supabase, FUNCTIONS_URL } from "./supabase.js";
import { onAuth, getSession, signOut, needsProfile, consumeManualSignOut } from "./auth.js";
import { renderAuth } from "./auth-ui.js";
import {
  myOrgs, resolveActiveOrg, setActiveOrgId, createOrg, seedSandbox, atLeast,
  updateOrgBrand, uploadOrgLogo, removeOrgLogo, resolveBrand,
  getOrgSignatures, setOrgSignature, processSignatureImage,
} from "./orgs.js";
import {
  listMembers, addMember, setMemberRole, removeMember,
  ROLE_INFO, assignableRoles, canManage, whatsappInviteUrl,
} from "./members.js";
import * as dash from "./dashboard.js";
import { renderToolsLibrary } from "./tools-library.js";
import { renderIntegrations } from "./integrations.js";
import { renderLeadsAdmin } from "./leads-admin.js";
import { renderStageReviews } from "./stage-reviews-admin.js";

const root = document.getElementById("root");
const ENV = window.__CPA360_ENV || {};
const IS_PREVIEW = new URLSearchParams(location.search).has("preview");
const ASSISTANT_ON = !!ENV.ASSISTANT_ENABLED && (!IS_PREVIEW || location.search.includes("asst"));
const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const state = { session: null, orgs: [], active: null, dashOrgId: null,
  asst: { open: false, busy: false, greeted: false, history: [] } };

/* ============ icons (path innards only) ============ */
const IC = {
  grid: '<rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/>',
  columns: '<path d="M4 21h16M6 21V9m4 12V6m4 15V9m4 12V6M3 9l9-6 9 6"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M15 11a3 3 0 1 0 0-6M4 20c0-2.8 2.2-5 5-5s5 2.2 5 5M15 15c2.4 0 5 1.6 5 5"/>',
  adm: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  hr: '<circle cx="12" cy="7" r="3.4"/><path d="M5 21c0-3.6 3.1-6.5 7-6.5s7 2.9 7 6.5"/>',
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
  kit: '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z"/><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M4 13h16"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z"/>',
  plug: '<path d="M9 3v6M15 3v6M7 9h10v3a5 5 0 0 1-10 0zM12 17v4"/>',
  inbox: '<path d="M3 12h4l2 4h6l2-4h4"/><path d="M5 12 3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2l-2 7"/><path d="M3 12v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.2-.9 2.2-2 0-.6-.3-1.1-.7-1.6-.5-.5-.7-1-.3-1.6.3-.5.9-.6 1.6-.6H17a4 4 0 0 0 4-4c0-4.9-4-8.2-9-8.2z"/><circle cx="7.3" cy="10.8" r="1.3"/><circle cx="10.3" cy="7" r="1.3"/><circle cx="15.2" cy="7.6" r="1.3"/>',
  chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 11h7M8.5 14h4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15.5 16 10 5 21"/>',
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
    { id: "communication", label: "Communication", icon: "chat" },
    { id: "administration", label: "Administration", icon: "adm" },
    { id: "hr", label: "HR", icon: "hr" },
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
    { id: "gallery", label: "Gallery / Media", icon: "image" },
    { id: "actions", label: "Action Tracker", icon: "check" },
    { id: "impact", label: "Impact & M&E", icon: "pulse" },
    { id: "tools", label: "Tools Library", icon: "kit", app: true },
  ]},
  { group: "Manage", items: [
    { id: "members", label: "Members", icon: "team", app: true, admin: true },
    { id: "brand", label: "Brand Box", icon: "palette", app: true, admin: true },
    { id: "integrations", label: "Integrations", icon: "plug", app: true, admin: true },
    { id: "leads", label: "Leads Inbox", icon: "inbox", app: true, platformAdmin: true },
    { id: "stage-reviews", label: "Stage Reviews", icon: "check", app: true, platformAdmin: true },
    { id: "settings", label: "Settings", icon: "cog", app: true },
  ]},
];
const STRIP_VIEWS = new Set(["exec", "score", "journey", "reports"]);

/* ============================ boot ============================ */
(async function boot() {
  if (new URLSearchParams(location.search).has("preview")) return previewShell();
  // A password-recovery link signs the person in AND fires PASSWORD_RECOVERY; without this
  // guard the SIGNED_IN handler loads the dashboard over the "set a new password" screen, so
  // the password never gets changed. Also surfaces expired / already-used links.
  const hp = new URLSearchParams((location.hash || "").replace(/^#/, "") + "&" + (location.search || "").replace(/^\?/, ""));
  let recovering = hp.get("type") === "recovery";
  const linkError = hp.get("error_description") || (hp.get("error_code") ? "That link has expired or was already used." : "");
  const finishRecovery = () => { recovering = false; shownFor = state.session?.user?.id || null; history.replaceState(null, "", location.pathname); enterApp(); };
  // An invited teammate lands here from the invite link already signed in, but with no name, cell or
  // password yet. Show the welcome screen first; "joining" stops a tab-refocus SIGNED_IN from
  // redrawing it and wiping what they've typed.
  let joining = false;
  // The login library re-announces SIGNED_IN whenever a tab is refocused or a token is renewed. Redrawing the
  // whole app each time looked like the page "keeps refreshing" (and threw away anything half-typed), so an
  // announcement for the person who is already looking at the app is ignored.
  let shownFor = null;
  const gateAndEnter = async () => {
    if (joining) return;
    const user = state.session?.user;
    if (!needsProfile(user)) {
      if (user && shownFor === user.id && root.querySelector(".app")) return;
      shownFor = user ? user.id : null;
      enterApp();
      return;
    }
    joining = true;
    let orgs = [];
    try { orgs = await myOrgs(); } catch (e) { /* the welcome screen still works without the CPA name */ }
    const org = orgs.find((o) => o.id === user.user_metadata.invited_to_org) || orgs[0];
    const roleName = ROLE_INFO[org?.role]?.label || "";
    renderAuth(root, "join", () => {
      joining = false;
      shownFor = user.id;
      history.replaceState(null, "", location.pathname);
      if (org) setActiveOrgId(org.id);
      enterApp();
    }, { email: user.email, orgName: org?.name || "", role: roleName });
  };
  state.session = await getSession();
  onAuth((event, session) => {
    state.session = session;
    if (event === "PASSWORD_RECOVERY") {
      recovering = true;
      renderAuth(root, "setpw", finishRecovery);
    } else if (event === "SIGNED_IN") {
      if (!recovering) gateAndEnter();
    } else if (event === "SIGNED_OUT") {
      recovering = false; joining = false; shownFor = null;
      dash.destroyDashboard();
      state.orgs = []; state.active = null; state.dashOrgId = null;
      renderAuth(root, "signin");
      // not pressed by the person → say so instead of silently dropping them on the login page
      if (!consumeManualSignOut()) {
        const m = root.querySelector("#auth-msg");
        if (m) m.innerHTML = `<div class="msg err">You were signed out because your session ended. Please sign in again.</div>`;
      }
    }
  });
  // The personal invite link (#join=<code>) only opens this screen. The sign-in is created when the person
  // presses "Accept invitation" — so WhatsApp / mail-scanner link previews can't use it up.
  const joinCode = (/[#&]join=([A-Za-z0-9_-]+)/.exec(location.hash) || [])[1];
  const callAccept = async (action) => {
    const res = await fetch(`${FUNCTIONS_URL}/invite-accept`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code: joinCode }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || "We couldn't open this invitation. Please try again.");
    return out;
  };
  if (joinCode) {
    root.className = "";
    root.innerHTML = `<div class="booting">Opening your invitation…</div>`;
    let info;
    try { info = await callAccept("peek"); }
    catch (e) { renderAuth(root, "accept", null, { error: e.message }); return; }
    if (info.done) { renderAuth(root, "accept", null, { error: "You've already joined — sign in with your email and password." }); return; }
    joining = true;                                           // the welcome screen follows the sign-in
    renderAuth(root, "accept", async () => {
      const out = await callAccept("accept");
      joining = false;
      const { error } = await supabase.auth.verifyOtp({ token_hash: out.token_hash, type: out.type });
      if (error) throw new Error("That didn't work — please ask for a new invitation. (" + error.message + ")");
      history.replaceState(null, "", location.pathname);     // drop the code from the address bar; SIGNED_IN shows the welcome screen
    }, { email: info.email, orgName: info.org_name, role: ROLE_INFO[info.role]?.label || "" });
    return;
  }
  if (state.session && recovering) renderAuth(root, "setpw", finishRecovery);
  else if (state.session) gateAndEnter();
  else {
    renderAuth(root, "signin");
    if (linkError) {
      const m = root.querySelector("#auth-msg");
      if (m) m.innerHTML = `<div class="msg err">${esc(linkError.replace(/\+/g, " "))} Request a new link with “Forgot password”.</div>`;
    }
  }
})();

window.addEventListener("hashchange", () => { if (state.session) renderView(); });

/* ======================== app shell ========================= */
async function enterApp() {
  root.className = "";
  root.innerHTML = `<div class="booting">Loading your workspaces…</div>`;
  try {
    // Right after a fresh sign-in this call can leave before the new session token is
    // attached and come back 401 — that must not read as "not staff", so retry on error.
    const checkAdmin = async () => {
      for (let i = 0; i < 3; i++) {
        try {
          const r = await supabase.rpc("is_platform_admin");
          if (!r.error) return !!r.data;
        } catch (e) { /* retry */ }
        await new Promise((res) => setTimeout(res, 300 * (i + 1)));
      }
      return false;
    };
    const [orgs, isAdmin] = await Promise.all([myOrgs(), checkAdmin()]);
    state.orgs = orgs;
    state.isPlatformAdmin = isAdmin;
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
    const items = g.items.filter((it) => !(it.admin && !canManage) && !(it.platformAdmin && !state.isPlatformAdmin));
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
  const fullName = (state.session?.user?.user_metadata?.full_name || "").trim();
  const avatar = ((fullName || email)[0] || "?").toUpperCase();

  root.innerHTML = `
    <div class="app" data-nav-open="false">
      <button class="skip-link" id="skip-link" type="button">Skip to main content</button>
      <div class="nav-scrim" id="nav-scrim"></div>
      <aside class="sidebar">
        <div class="sb-brand">
          <span class="sb-mark"><img src="./assets/logo-cpa360.webp" alt="CPA360"></span>
          <span class="sb-brand-txt"><b>CPA360&trade;</b><span>A GAD Foundation Programme</span></span>
        </div>
        <nav class="sb-nav" id="nav" aria-label="Sections">${state.active ? navGroupsHtml() : ""}</nav>
        <div class="sb-foot">
          <button class="sb-foot-btn" id="theme-toggle" type="button">Theme</button>
        </div>
      </aside>

      <main>
        <header class="topbar">
          <button class="tb-menu" id="tb-menu" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="nav">${svg("menu")}</button>
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
            ${ASSISTANT_ON ? `<button class="tb-icon" id="tb-assistant" type="button" aria-label="Assistant">${svg("spark")}<span class="tb-dot" id="asst-dot" hidden></span></button>` : ""}
            <a class="tb-icon" id="tb-help" href="./index.html#lp-faq" target="_blank" rel="noopener" aria-label="Help">${svg("help")}</a>
            <div class="tb-icon-wrap">
              <button class="tb-icon tb-avatar" id="tb-profile" type="button" aria-label="Account">${esc(avatar)}</button>
              <div class="tb-pop tb-pop-r" id="profile-pop" hidden>
                <div class="tb-pop-head">${esc(fullName || email)}</div>
                ${fullName ? `<div class="tb-pop-sub">${esc(email)}</div>` : ""}
                <div class="tb-pop-sub" id="profile-role"></div>
                <button class="tb-pop-item" data-route="#/settings" type="button">${svg("cog")}Settings</button>
                <button class="tb-pop-item" id="pp-print" type="button">${svg("report")}Print board pack</button>
                <button class="tb-pop-item" id="pp-signout" type="button">Sign out</button>
              </div>
            </div>
          </div>
        </header>

        <div class="journey-strip" id="journey-strip" hidden></div>
        <div class="viewport" id="view" tabindex="-1"></div>
      </main>
      ${ASSISTANT_ON ? assistantPanelHtml() : ""}
    </div>`;

  wireShell();
}

function wireShell() {
  const app = root.querySelector(".app");
  const menuBtn = root.querySelector("#tb-menu");
  const setNav = (open) => {
    app.dataset.navOpen = String(open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    if (open) { const f = root.querySelector("#nav .sb-link"); if (f) f.focus(); }
  };
  menuBtn.onclick = () => setNav(app.dataset.navOpen !== "true");
  root.querySelector("#nav-scrim").onclick = () => setNav(false);
  root.querySelector("#skip-link").onclick = () => {
    const v = root.querySelector("#view");
    if (v) { v.focus(); v.scrollIntoView(); }
  };
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (app.dataset.navOpen === "true") { setNav(false); menuBtn.focus(); }
    closePops();
  });

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
    btn.setAttribute("aria-haspopup", "true");
    btn.setAttribute("aria-expanded", "false");
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const open = pop.hidden;
      closePops();
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
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

  if (ASSISTANT_ON) wireAssistant();
}
function closePops() {
  root.querySelectorAll(".tb-pop").forEach((p) => (p.hidden = true));
  root.querySelectorAll('.tb-icon[aria-expanded="true"]').forEach((b) => b.setAttribute("aria-expanded", "false"));
}

/* ==================== assistant (navigation + attention) ==================== */
function assistantPanelHtml() {
  const chips = [
    "What needs my attention?",
    "Take me to overdue actions",
    "Where do I record a new lease?",
    "Explain my institutional score",
  ];
  return `
    <aside class="asst" id="asst" hidden aria-label="CPA360 Assistant">
      <div class="asst-head">
        <div><b>CPA360 Assistant</b><span>Navigation &amp; what needs attention</span></div>
        <button class="asst-x" id="asst-close" type="button" aria-label="Close assistant">&times;</button>
      </div>
      <div class="asst-log" id="asst-log" tabindex="0"></div>
      <div class="asst-chips" id="asst-chips">
        ${chips.map((c) => `<button type="button" class="asst-chip">${esc(c)}</button>`).join("")}
      </div>
      <form class="asst-bar" id="asst-form">
        <input id="asst-input" type="text" autocomplete="off" placeholder="Ask, or say where you want to go…" aria-label="Message the assistant" />
        <button class="btn primary" id="asst-send" type="submit" aria-label="Send">${svg("spark")}</button>
      </form>
    </aside>`;
}
function wireAssistant() {
  const panel = root.querySelector("#asst");
  if (!panel) return;
  const btn = root.querySelector("#tb-assistant");
  const log = root.querySelector("#asst-log");
  const input = root.querySelector("#asst-input");

  btn.addEventListener("click", () => asstToggle(!state.asst.open));
  root.querySelector("#asst-close").addEventListener("click", () => asstToggle(false));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.asst.open) { asstToggle(false); btn.focus(); }
  });
  root.querySelectorAll(".asst-chip").forEach((c) =>
    c.addEventListener("click", () => asstSend(c.textContent)));
  root.querySelector("#asst-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = input.value.trim();
    if (t) asstSend(t);
  });
  void log;
}
function asstToggle(open) {
  const panel = root.querySelector("#asst");
  const btn = root.querySelector("#tb-assistant");
  if (!panel) return;
  state.asst.open = open;
  panel.hidden = !open;
  root.querySelector(".app").classList.toggle("asst-open", open);
  if (btn) btn.setAttribute("aria-expanded", String(open));
  if (open) {
    if (!state.asst.greeted) asstGreet();
    setTimeout(() => root.querySelector("#asst-input")?.focus(), 30);
  }
}
function asstGreet() {
  state.asst.greeted = true;
  const s = dash.dashSummary && dash.dashSummary();
  const n = s && s.alerts ? s.alerts.length : 0;
  const line = n
    ? `Hello. ${n} thing${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention on this CPA. Ask me “what needs my attention?” or tell me where you want to go.`
    : `Hello. Nothing is flagged right now. Tell me where you want to go, or ask what a screen is for.`;
  asstBubble("assistant", line);
}
function asstBubble(role, text, opts = {}) {
  const log = root.querySelector("#asst-log");
  if (!log) return null;
  const el = document.createElement("div");
  el.className = "asst-msg asst-" + role + (opts.pending ? " pending" : "");
  el.textContent = text;
  if (opts.nav) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "asst-go";
    b.textContent = `Open ${opts.nav.label} →`;
    b.addEventListener("click", () => { location.hash = opts.nav.route; });
    el.appendChild(b);
  }
  log.appendChild(el);
  log.scrollTop = log.scrollHeight;
  return el;
}
function asstContext() {
  const s = (dash.dashSummary && dash.dashSummary()) || {};
  const r = route();
  return {
    cpaName: state.active?.name || s.cpaName || "",
    role: state.active?.role || "member",
    currentView: r.name === "dash" ? (r.tab ? r.view + "/" + r.tab : r.view) : r.name,
    score: s.score, band: s.band, stageN: s.stageN, stageName: s.stageName,
    isDemo: /kwezi valley/i.test(state.active?.name || ""),
    alerts: (s.alerts || []).map((a) => ({ text: a.text, goto: a.goto })),
  };
}
async function asstSend(text) {
  if (state.asst.busy) return;
  const chips = root.querySelector("#asst-chips");
  if (chips) chips.hidden = true;
  const input = root.querySelector("#asst-input");
  if (input) input.value = "";
  if (!state.asst.greeted) state.asst.greeted = true;

  asstBubble("user", text);
  state.asst.history.push({ role: "user", text });
  state.asst.busy = true;
  const pending = asstBubble("assistant", "…", { pending: true });

  try {
    const { data, error } = await supabase.functions.invoke("cpa-assistant", {
      body: {
        message: text,
        history: state.asst.history.slice(-10),
        context: asstContext(),
      },
    });
    pending?.remove();
    if (error) throw error;

    if (data?.error === "not_configured") {
      asstBubble("assistant",
        "The assistant isn’t switched on yet. An ANTHROPIC_API_KEY needs to be added to the cpa-assistant function in Supabase.");
      return;
    }
    const reply = data?.reply || "I didn’t catch that — try again.";
    const nav = data?.navigate && /^#\//.test(data.navigate.route) ? data.navigate : null;
    asstBubble("assistant", reply, nav ? { nav } : {});
    state.asst.history.push({ role: "assistant", text: reply });
    if (nav) {
      location.hash = nav.route;
      asstBubble("assistant", `→ Opened ${nav.label}.`);
    }
  } catch (e) {
    pending?.remove();
    asstBubble("assistant", "I couldn’t reach the assistant just now. Please check your connection and try again.");
  } finally {
    state.asst.busy = false;
    root.querySelector("#asst-input")?.focus();
  }
}
function asstDot() {
  const d = root.querySelector("#asst-dot");
  if (!d) return;
  const s = dash.dashSummary && dash.dashSummary();
  d.hidden = !(s && s.alerts && s.alerts.length) || state.asst.open;
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
  asstDot();
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
  if (h.startsWith("#/brand")) return { name: "brand" };
  if (h.startsWith("#/settings")) return { name: "settings" };
  if (h.startsWith("#/reports")) return { name: "reports" };
  if (h.startsWith("#/tools")) return { name: "tools" };
  if (h.startsWith("#/integrations")) return { name: "integrations" };
  if (h.startsWith("#/leads")) return { name: "leads" };
  if (h.startsWith("#/stage-reviews")) return { name: "stage-reviews" };
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
  root.querySelectorAll("#nav .sb-link").forEach((b) => {
    const on = b.dataset.navid === id;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
}

async function renderView() {
  const view = root.querySelector("#view");
  if (!view) return renderShell();
  const r = route();
  closePops();

  if (r.name === "new") return renderNewOrg(view);

  if (r.name === "tools") {
    // the library is the same for every CPA — available even before one is chosen;
    // with one active, its Brand Box (logo/colors) is baked into every DOC download
    setHeader("Records", "Tools Library"); markActiveNav("tools");
    if (state.active) refreshChrome("tools");
    const brand = state.active ? await resolveBrand(state.active).catch(() => null) : null;
    return renderToolsLibrary(view, brand);
  }

  if (r.name === "leads") {
    if (!state.isPlatformAdmin) { location.hash = state.active ? "#/v/exec" : "#/"; return; }
    setHeader("Manage", "Leads Inbox"); markActiveNav("leads");
    if (state.active) refreshChrome("leads");
    return renderLeadsAdmin(view);
  }

  if (r.name === "stage-reviews") {
    if (!state.isPlatformAdmin) { location.hash = state.active ? "#/v/exec" : "#/"; return; }
    setHeader("Manage", "Stage Reviews"); markActiveNav("stage-reviews");
    if (state.active) refreshChrome("stage-reviews");
    return renderStageReviews(view);
  }

  if (!state.active) return renderWelcome(view);

  if (r.name === "members") {
    if (!atLeast(state.active.role, "admin")) { location.hash = "#/v/exec"; return; }
    setHeader("Manage", "Members — " + state.active.name); markActiveNav("members");
    refreshChrome("members");
    return renderMembers(view);
  }
  if (r.name === "brand") {
    if (!atLeast(state.active.role, "admin")) { location.hash = "#/v/exec"; return; }
    setHeader("Manage", "Brand Box — " + state.active.name); markActiveNav("brand");
    refreshChrome("brand");
    return renderBrandBox(view);
  }
  if (r.name === "settings") {
    setHeader("Manage", "Settings"); markActiveNav("settings");
    refreshChrome("settings");
    return renderSettings(view);
  }
  if (r.name === "integrations") {
    if (!atLeast(state.active.role, "admin")) { location.hash = "#/v/exec"; return; }
    setHeader("Manage", "Integrations — " + state.active.name); markActiveNav("integrations");
    refreshChrome("integrations");
    return renderIntegrations(view, {
      orgId: state.active.id, orgName: state.active.name, role: state.active.role,
      userId: state.session?.user?.id || null,
    });
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
      view.innerHTML = `<div class="msg err">Couldn't load this CPA — ${esc(e.message || "the connection was interrupted")}.
        <button class="btn" id="retry-load" type="button" style="margin-left:10px">Try again</button></div>`;
      const rb = view.querySelector("#retry-load");
      if (rb) rb.onclick = () => renderView();
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

/* ---- brand box ---- */
function renderBrandBox(view) {
  const org = state.active;
  const primary = org.brand_primary || "#1c3a68";
  const secondary = org.brand_secondary || "#2f7d4f";
  view.innerHTML = `
    <p class="note" style="margin-bottom:18px">
      ${esc(org.name)}&rsquo;s own logo, colors and letterhead — applied automatically to every DOC template
      downloaded from the <a href="#/tools">Tools Library</a> and to the printed board pack (Reports &rarr; Board pack).
      CSV templates are data-only and stay unbranded.
    </p>
    <div class="settings-grid">
      <section class="card">
        <div class="section-title" style="margin-top:0">Logo</div>
        <div id="bb-logo-preview" style="margin-bottom:12px;min-height:48px;display:flex;align-items:center;font-size:12.5px;color:var(--ink-2)">Loading…</div>
        <label class="btn primary" style="cursor:pointer;display:inline-flex;width:auto">Upload logo<input type="file" id="bb-logo-file" accept="image/*" hidden></label>
        <button class="btn" id="bb-logo-remove" type="button" style="margin-left:8px;width:auto">Remove</button>
        <div id="bb-logo-msg" style="font-size:11.5px;color:var(--ink-2);margin-top:8px"></div>
        <p style="font-size:11.5px;color:var(--ink-muted);margin:10px 0 0">PNG, JPG or SVG, max 4&nbsp;MB.</p>
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">Brand colors</div>
        <div class="field">
          <label for="bb-primary">Primary color</label>
          <div class="row-inline"><input type="color" id="bb-primary-pick" value="${esc(primary)}" style="width:44px;height:32px;padding:2px">
            <input id="bb-primary" value="${esc(primary)}" style="flex:1"></div>
        </div>
        <div class="field">
          <label for="bb-secondary">Secondary / accent color</label>
          <div class="row-inline"><input type="color" id="bb-secondary-pick" value="${esc(secondary)}" style="width:44px;height:32px;padding:2px">
            <input id="bb-secondary" value="${esc(secondary)}" style="flex:1"></div>
        </div>
      </section>
      <section class="card" style="grid-column:1/-1">
        <div class="section-title" style="margin-top:0">Signatures</div>
        <p style="font-size:12px;color:var(--ink-2);margin:0 0 12px">The Chairperson&rsquo;s and Secretary&rsquo;s signatures are placed automatically on documents that need them —
          member receipts, membership cards, submissions to the Department and permit certificates. Upload a photo or scan of each signature in dark ink on white or light paper;
          the background is removed for you. Visible only to this CPA&rsquo;s members.</p>
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          ${[["chair", "Chairperson"], ["secretary", "Secretary"]].map(([k, label]) => `
            <div style="min-width:230px;flex:1">
              <div style="font-weight:700;font-size:12.5px;margin-bottom:6px">${label}</div>
              <div id="sig-${k}-prev" style="height:80px;border:1px dashed var(--border-strong);border-radius:8px;display:flex;align-items:center;justify-content:center;background:#fff;margin-bottom:8px;font-size:12px;color:var(--ink-muted)">Loading…</div>
              <label class="btn primary" style="cursor:pointer;display:inline-flex;width:auto">Upload<input type="file" id="sig-${k}-file" accept="image/*" hidden></label>
              <button class="btn" id="sig-${k}-rm" type="button" style="margin-left:8px;width:auto">Remove</button>
              <div id="sig-${k}-msg" style="font-size:11.5px;color:var(--ink-2);margin-top:6px"></div>
            </div>`).join("")}
        </div>
      </section>
      <section class="card">
        <div class="section-title" style="margin-top:0">Letterhead footer</div>
        <div class="field">
          <label for="bb-footer">Address / contact line (optional)</label>
          <textarea id="bb-footer" rows="3" placeholder="e.g. Plot 12, District Municipality · 012 345 6789 · info@cpa.org.za">${esc(org.brand_footer || "")}</textarea>
        </div>
        <button class="btn primary" id="bb-save" type="button" style="width:auto">Save Brand Box</button>
        <div id="bb-msg" style="font-size:11.5px;color:var(--ink-2);margin-top:8px"></div>
      </section>
    </div>`;

  const preview = view.querySelector("#bb-logo-preview");
  function paintLogo(dataUrl) {
    preview.innerHTML = dataUrl
      ? `<img src="${dataUrl}" alt="" style="max-height:60px;max-width:240px">`
      : `No logo uploaded yet.`;
  }
  resolveBrand(org).then((b) => paintLogo(b && b.logoDataUrl)).catch(() => (preview.textContent = "Couldn't load the logo."));

  view.querySelector("#bb-logo-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const msg = view.querySelector("#bb-logo-msg");
    msg.textContent = "Uploading…";
    try {
      const path = await uploadOrgLogo(org.id, f);
      org.logo_path = path; delete org._logoDataUrl;
      msg.textContent = "";
      e.target.value = "";
      resolveBrand(org).then((b) => paintLogo(b && b.logoDataUrl));
    } catch (err) { msg.textContent = "Failed: " + (err.message || err); }
  };
  view.querySelector("#bb-logo-remove").onclick = async () => {
    if (!org.logo_path) return;
    if (!confirm("Remove the logo?")) return;
    const msg = view.querySelector("#bb-logo-msg");
    try {
      await removeOrgLogo(org.id, org.logo_path);
      org.logo_path = null; org._logoDataUrl = null;
      paintLogo(null); msg.textContent = "";
    } catch (err) { msg.textContent = "Failed: " + (err.message || err); }
  };

  /* signatures */
  getOrgSignatures(org.id).then((sg) => {
    ["chair", "secretary"].forEach((k) => {
      const prev = view.querySelector(`#sig-${k}-prev`), msg = view.querySelector(`#sig-${k}-msg`);
      const paint = (u) => { prev.innerHTML = u ? `<img src="${u}" alt="" style="max-height:70px;max-width:90%">` : "No signature yet."; };
      paint(sg[k]);
      view.querySelector(`#sig-${k}-file`).onchange = async (e) => {
        const f = e.target.files[0]; e.target.value = "";
        if (!f) return;
        msg.textContent = "Cleaning and saving…";
        try {
          const url = await processSignatureImage(f);
          await setOrgSignature(org.id, k, url);
          paint(url); msg.textContent = "Saved.";
        } catch (err) { msg.textContent = "Failed: " + (err.message || err); }
      };
      view.querySelector(`#sig-${k}-rm`).onclick = async () => {
        if (!confirm(`Remove the ${k === "chair" ? "Chairperson" : "Secretary"}'s signature?`)) return;
        try { await setOrgSignature(org.id, k, null); paint(""); msg.textContent = ""; }
        catch (err) { msg.textContent = "Failed: " + (err.message || err); }
      };
    });
  }).catch(() => ["chair", "secretary"].forEach((k) => { view.querySelector(`#sig-${k}-prev`).textContent = "Couldn't load."; }));

  const syncPair = (pickId, textId) => {
    const pick = view.querySelector(pickId), text = view.querySelector(textId);
    pick.oninput = () => { text.value = pick.value; };
    text.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(text.value.trim())) pick.value = text.value.trim(); };
  };
  syncPair("#bb-primary-pick", "#bb-primary");
  syncPair("#bb-secondary-pick", "#bb-secondary");

  view.querySelector("#bb-save").onclick = async () => {
    const msg = view.querySelector("#bb-msg");
    const p = view.querySelector("#bb-primary").value.trim();
    const s = view.querySelector("#bb-secondary").value.trim();
    if ((p && !/^#[0-9a-f]{6}$/i.test(p)) || (s && !/^#[0-9a-f]{6}$/i.test(s))) {
      msg.innerHTML = `<div class="msg err">Colors must be a hex code like #1c3a68.</div>`; return;
    }
    const footer = view.querySelector("#bb-footer").value.trim();
    try {
      await updateOrgBrand(org.id, { primary: p, secondary: s, footer });
      org.brand_primary = p || null; org.brand_secondary = s || null; org.brand_footer = footer || null;
      msg.innerHTML = `<div class="msg ok">Saved.</div>`;
    } catch (err) { msg.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
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
  const org = state.active, myRole = org.role;
  view.innerHTML = `<div class="booting" style="min-height:120px">Loading your team…</div>`;

  let members = [];
  try { members = await listMembers(org.id); }
  catch (e) { view.innerHTML = `<div class="msg err">${esc(e.message)}</div>`; return; }

  const me = state.session?.user?.id;
  const myName = (state.session?.user?.user_metadata?.full_name || "").trim();
  const owners = members.filter((m) => m.role === "owner").length;
  const giveRoles = assignableRoles(myRole);

  view.innerHTML = `
    <div class="card" style="margin-bottom:22px">
      <div class="section-title" style="margin-top:0">Invite a teammate</div>
      <p class="hint" style="margin:0 0 12px">They get a link. It opens a short welcome screen where they add their name, cell number and a password — then they are inside ${esc(org.name)}. No account needed beforehand.</p>
      <form id="add-form">
        <div class="row-inline">
          <div class="field" style="flex:1;min-width:200px">
            <label for="m-email">Their email</label>
            <input id="m-email" type="email" placeholder="person@gmail.com" autocomplete="off" required />
          </div>
          <div class="field">
            <label for="m-role">Access level</label>
            <select id="m-role">${giveRoles.map((r) => `<option value="${r}"${r === "member" ? " selected" : ""}>${esc(ROLE_INFO[r].label)} — ${esc(ROLE_INFO[r].short)}</option>`).join("")}</select>
          </div>
          <button class="btn primary" type="submit" style="width:auto">Send invitation</button>
        </div>
        <p class="hint" id="m-role-hint" style="margin:6px 0 0"></p>
        <div id="m-msg"></div>
      </form>
    </div>

    <div class="card" style="margin-bottom:22px">
      <div class="section-title" style="margin-top:0">What each access level can do</div>
      <div class="table-wrap"><table>
        <tbody>${["viewer", "member", "admin", "owner"].map((r) => `<tr><td style="white-space:nowrap"><b>${esc(ROLE_INFO[r].label)}</b></td><td>${esc(ROLE_INFO[r].detail)}</td></tr>`).join("")}</tbody>
      </table></div>
    </div>

    <div class="table-wrap"><table>
      <thead><tr><th>Person</th><th>Access</th><th>Status</th><th>Joined</th><th></th></tr></thead>
      <tbody id="team-body">${members.map((m) => memberRow(m, me, owners, myRole)).join("")}</tbody>
    </table></div>`;

  const roleSel = view.querySelector("#m-role"), hint = view.querySelector("#m-role-hint");
  const showHint = () => { hint.textContent = ROLE_INFO[roleSel.value]?.detail || ""; };
  roleSel.addEventListener("change", showHint); showHint();

  const showLink = (m, email, link, note) => showInviteLink(m, org, myName, link, note);

  view.querySelector("#add-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = view.querySelector("#m-email").value.trim();
    const role = roleSel.value;
    const btn = e.target.querySelector("button[type=submit]");
    const msg = view.querySelector("#m-msg");
    btn.disabled = true; btn.textContent = "Sending…";
    try {
      const r = await addMember(org.id, email, role);
      if (r.existing) {
        msg.innerHTML = `<div class="msg ok">${esc(email)} already has a CPA360 account, so no invitation was needed — they now have <b>${esc(ROLE_INFO[role].label)}</b> access to ${esc(org.name)}. They'll see it the next time they sign in (the CPA switcher at the top lists every CPA they belong to).</div>`;
      } else {
        showLink(msg, email, r.link, inviteNote(email, r) );
      }
      view.querySelector("#m-email").value = "";
      btn.disabled = false; btn.textContent = "Send invitation";
      refreshTeamTable(view);
    } catch (err) {
      msg.innerHTML = `<div class="msg err">${esc(err.message)}</div>`;
      btn.disabled = false; btn.textContent = "Send invitation";
    }
  });

  wireTeamTable(view, org, myName, showLink);
}

/* what to tell the inviter once an invitation exists */
function inviteNote(email, r) {
  const head = r.emailed
    ? `Invitation emailed to <b>${esc(email)}</b> (ask them to check Spam too). To be sure they get it, you can also send this link on WhatsApp:`
    : `<b>${esc(email)}</b> is ready to join.${r.emailNote ? ` (The email couldn't be sent: ${esc(r.emailNote)}.)` : ""} Send them this link on WhatsApp:`;
  return `${head}<br><span class="hint">They tap the link, press <b>Accept invitation</b>, then add their name, cell number and a password. The link works for 14 days.</span>`;
}

/* the personal invite link, with Copy + WhatsApp */
function showInviteLink(msg, org, myName, link, note) {
  msg.innerHTML = `<div class="msg ok">${note}
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <input readonly value="${esc(link)}" style="flex:1;min-width:220px" aria-label="Invite link">
      <button class="btn" type="button" data-copy>Copy link</button>
      <a class="btn primary" target="_blank" rel="noopener" href="${esc(whatsappInviteUrl({ cpaName: org.name, link, inviterName: myName }))}">Send on WhatsApp</a>
    </div></div>`;
  msg.querySelector("[data-copy]").addEventListener("click", async (ev) => {
    try { await navigator.clipboard.writeText(link); ev.target.textContent = "Copied ✓"; }
    catch { msg.querySelector("input").select(); }
  });
}

/* re-draw just the team table (so the invite result message stays on screen) */
async function refreshTeamTable(view) {
  const org = state.active;
  const myName = (state.session?.user?.user_metadata?.full_name || "").trim();
  try {
    const members = await listMembers(org.id);
    const me = state.session?.user?.id, owners = members.filter((m) => m.role === "owner").length;
    const body = view.querySelector("#team-body");
    if (!body) return;
    body.innerHTML = members.map((m) => memberRow(m, me, owners, org.role)).join("");
    wireTeamTable(view, org, myName, (m, email, link, note) => showInviteLink(m, org, myName, link, note));
  } catch (e) { /* the page still shows the previous list */ }
}

function wireTeamTable(view, org, myName, showLink) {
  const msg = view.querySelector("#m-msg");
  view.querySelectorAll("[data-role-for]").forEach((sel) => {
    sel.onchange = async () => {
      try { await setMemberRole(org.id, sel.dataset.roleFor, sel.value); renderMembers(view); }
      catch (e) { alert(e.message); renderMembers(view); }
    };
  });
  view.querySelectorAll("[data-remove]").forEach((b) => {
    b.onclick = async () => {
      if (!confirm(`Remove ${b.dataset.name} from ${org.name}? They will lose access straight away.`)) return;
      try { await removeMember(org.id, b.dataset.remove); renderMembers(view); }
      catch (e) { alert(e.message); }
    };
  });
  view.querySelectorAll("[data-resend]").forEach((b) => {
    b.onclick = async () => {
      b.disabled = true;
      try {
        const r = await addMember(org.id, b.dataset.resend, b.dataset.role, b.dataset.how);
        if (r.link) showLink(msg, b.dataset.resend, r.link, inviteNote(b.dataset.resend, r));
        else msg.innerHTML = `<div class="msg ok"><b>${esc(b.dataset.resend)}</b> already has a working account — nothing to send.</div>`;
        msg.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch (err) { msg.innerHTML = `<div class="msg err">${esc(err.message)}</div>`; }
      b.disabled = false;
    };
  });
}

function memberRow(m, meId, ownerCount, myRole) {
  const isMe = m.user_id === meId;
  const lockOwner = m.role === "owner" && ownerCount <= 1;
  const manage = canManage(myRole, m.role, isMe) && !lockOwner;
  const joined = m.joined_at ? new Date(m.joined_at).toLocaleDateString("en-ZA") : "";
  const label = m.full_name || m.email;
  const options = myRole === "owner" ? ["viewer", "member", "admin", "owner"] : ["viewer", "member"];
  const status = !m.status || m.status === "active" ? '<span class="role-pill">Active</span>'
    : m.status === "setup" ? '<span class="role-pill">Setting up their profile</span>'
    : '<span class="role-pill" style="background:var(--status-warning-bg,#fff4d6);color:var(--status-warning,#8a5a00)">Invited — hasn\'t joined yet</span>';
  const pending = m.status && m.status !== "active" && manage && !isMe;
  const roleCell = manage
    ? `<select class="role-pill" data-role-for="${m.user_id}" aria-label="Access for ${esc(label)}"
        style="border:1px solid var(--border);background:var(--surface);color:var(--ink)">
        ${options.map((r) => `<option value="${r}"${r === m.role ? " selected" : ""}>${ROLE_INFO[r].label}</option>`).join("")}
      </select>`
    : `<span class="role-pill">${esc(ROLE_INFO[m.role]?.label || m.role)}</span>`;
  const actions = [
    pending ? `<button class="linkbtn" data-resend="${esc(m.email)}" data-role="${m.role}" data-how="email">resend email</button>` : "",
    pending ? `<button class="linkbtn" data-resend="${esc(m.email)}" data-role="${m.role}" data-how="link">get link</button>` : "",
    manage && !isMe ? `<button class="linkbtn" data-remove="${m.user_id}" data-name="${esc(label)}">remove</button>` : "",
  ].filter(Boolean).join(" · ");
  return `<tr>
    <td>${m.full_name ? `<b>${esc(m.full_name)}</b><br><span class="hint">${esc(m.email)}</span>` : esc(m.email)}${isMe ? ' <span class="role-pill">you</span>' : ""}${m.phone ? `<br><span class="hint mono">${esc(m.phone)}</span>` : ""}</td>
    <td>${roleCell}</td>
    <td>${status}</td>
    <td class="mono">${esc(joined)}</td>
    <td style="white-space:nowrap">${actions}</td>
  </tr>`;
}

/* ---- dev: preview the shell chrome without signing in (?preview) ---- */
function previewShell() {
  root.className = "";
  state.session = { user: { email: "chairperson@kwezivalley.org.za" } };
  state.orgs = [{ id: "kv", name: "Kwezi Valley CPA", role: "admin" },
    { id: "mb", name: "Mashobotho CPA", role: "member" }];
  state.active = state.orgs[0];
  state.isPlatformAdmin = true;
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

