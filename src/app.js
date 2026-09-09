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
const GROUPS = ["Institutional", "Records", "Performance"];

/* ============================ boot ============================ */
(async function boot() {
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

function renderShell() {
  const email = state.session?.user?.email || "";
  const canManage = state.active && atLeast(state.active.role, "admin");
  const navGroups = state.active ? GROUPS.map((g) => `
      <div class="nav-group">${g}</div>
      ${dash.NAV.filter((n) => n.group === g).map((n) =>
        `<button data-route="#/v/${n.id}">${esc(n.label)}</button>`).join("")}
    `).join("") : "";

  root.innerHTML = `
    <div class="app">
      <aside class="sidebar">
        <div class="brand"><div><b>CPA360&trade;</b><span>Platform</span></div></div>
        <div class="org-switch">
          <label for="org-sel">Active CPA</label>
          <select id="org-sel">
            ${state.orgs.map((o) => `<option value="${o.id}"${o.id === state.active?.id ? " selected" : ""}>${esc(o.name)}</option>`).join("")}
            <option value="__new">+ Create a CPA…</option>
          </select>
          ${state.active ? `<div class="org-role">your role: ${esc(state.active.role)}</div>` : ""}
        </div>
        <nav class="nav" id="nav">
          ${navGroups}
          ${canManage ? `<div class="nav-group">Team</div><button data-route="#/members">Members</button>` : ""}
        </nav>
        <div class="foot">
          <span class="email">${esc(email)}</span>
          <div class="row-inline">
            <button class="linkbtn" id="print-btn" hidden>Print board pack</button>
            <button class="linkbtn" id="theme-toggle">Theme</button>
            <button class="linkbtn" id="sign-out">Sign out</button>
          </div>
        </div>
      </aside>
      <main>
        <div class="topbar">
          <div><div class="eyebrow" id="v-eyebrow"></div><h1 id="v-title"></h1>
            <div class="sub" id="v-sub"></div></div>
        </div>
        <div class="viewport" id="view"></div>
      </main>
    </div>`;

  root.querySelector("#org-sel").addEventListener("change", (e) => {
    if (e.target.value === "__new") { e.target.value = state.active?.id || ""; location.hash = "#/new"; return; }
    setActiveOrgId(e.target.value);
    state.active = state.orgs.find((o) => o.id === e.target.value) || null;
    dash.destroyDashboard();
    state.dashOrgId = null;
    renderShell();
    location.hash = "#/v/profile";
    renderView();
  });
  root.querySelector("#sign-out").addEventListener("click", () => signOut());
  root.querySelector("#theme-toggle").addEventListener("click", toggleTheme);
  root.querySelector("#print-btn").addEventListener("click", () => dash.printPack());
  root.querySelectorAll("#nav [data-route]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = b.dataset.route; }));
}

function toggleTheme() {
  const cur = document.documentElement.dataset.theme;
  const next = cur === "dark" ? "light" : cur === "light" ? "dark"
    : (matchMedia("(prefers-color-scheme: dark)").matches ? "light" : "dark");
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem("cpa360.theme", next); } catch {}
}

/* ========================== views ========================== */
function route() {
  const h = location.hash || "#/";
  if (h.startsWith("#/members")) return { name: "members" };
  if (h.startsWith("#/new")) return { name: "new" };
  if (h.startsWith("#/v/")) return { name: "dash", view: h.slice(4) };
  return { name: "home" };
}

function setHeader(eyebrow, title, sub) {
  const e = root.querySelector("#v-eyebrow"), t = root.querySelector("#v-title"), s = root.querySelector("#v-sub");
  if (e) e.textContent = eyebrow || "";
  if (t) t.textContent = title || "";
  if (s) s.textContent = sub || "";
}
function markActiveNav() {
  root.querySelectorAll("#nav button").forEach((b) =>
    b.classList.toggle("active", b.dataset.route === (location.hash || "")));
}
function showPrintBtn(on) {
  const b = root.querySelector("#print-btn");
  if (b) b.hidden = !on;
}

async function renderView() {
  const view = root.querySelector("#view");
  if (!view) return renderShell();
  const r = route();

  if (r.name === "new") { showPrintBtn(false); return renderNewOrg(view); }
  if (!state.active) { showPrintBtn(false); return renderWelcome(view); }

  if (r.name === "members") {
    showPrintBtn(false);
    if (!atLeast(state.active.role, "admin")) { location.hash = "#/v/profile"; return; }
    return renderMembers(view);
  }

  if (r.name === "home") { location.hash = "#/v/profile"; return; }

  return renderDashboardView(view, r.view);
}

/* ---- dashboard mount ---- */
async function renderDashboardView(view, viewId) {
  const nav = dash.NAV.find((n) => n.id === viewId) || dash.NAV[0];
  setHeader(nav.eyebrow, nav.title, nav.sub);
  showPrintBtn(true);
  markActiveNav();

  if (state.dashOrgId !== state.active.id) {
    view.innerHTML = `<div class="booting" style="min-height:180px">Loading ${esc(state.active.name)}…</div>`;
    try {
      await dash.initDashboard({ orgId: state.active.id, role: state.active.role });
    } catch (e) {
      view.innerHTML = `<div class="msg err">Couldn't load this CPA — ${esc(e.message)}</div>`;
      return;
    }
    state.dashOrgId = state.active.id;
    dash.setOnChange(() => {});
    dash.mountView(view, nav.id);
    return;
  }
  if (!view.querySelector(".view")) dash.mountView(view, nav.id);
  else dash.showView(nav.id);
}

/* ---- welcome / first CPA ---- */
function renderWelcome(view) {
  setHeader("Getting started", "Welcome to CPA360", "");
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
      location.hash = "#/v/profile";
      await enterApp();
    } catch (e) {
      view.querySelector("#w-msg").innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
      ev.target.disabled = false; ev.target.textContent = "Load the demo dataset";
    }
  });
}

/* ---- create org ---- */
function renderNewOrg(view) {
  setHeader("Institutional", "Create a CPA", "");
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
      location.hash = "#/v/profile";
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
  setHeader("Team", "Members — " + org.name, "");
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
