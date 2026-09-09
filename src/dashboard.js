/* ============================================================================
   dashboard.js — the nine-view CPA360 dashboard, ported from the Command Center
   to run inside the platform shell, backed by Supabase (see repo.js).

   Changed from the standalone version:
     · DATA is loaded from / saved to Postgres, one section per edit
     · commit(section) writes just that section, then re-renders
     · realtime (postgres_changes) re-hydrates on other members' edits
     · CAN_EDIT (role !== 'viewer') hides every edit control
     · the sidebar, theme toggle, hash router and demo/JSON tools are the shell's
   Everything else — renderers, charts, editors, modals, print — is unchanged.
   ============================================================================ */
import * as repo from "./repo.js";

/* ============ constants ============ */
const ICONS = {
  good: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M4 12.5l5 5L20 6"/></svg>',
  warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 3.5 22 20H2z"/><path d="M12 10v4.2M12 17.2v.1"/></svg>',
  critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  neutral: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M9 12h6"/></svg>',
};
const PENCIL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h4L20 8l-4-4L4 16z"/></svg>';
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>';
const CLIP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8.5 12.5 17a4 4 0 0 1-5.7-5.7l8-8a2.7 2.7 0 0 1 3.8 3.8l-8 8a1.4 1.4 0 0 1-2-2l7.3-7.3"/></svg>';

const STATUS_TONE = {
  "Completed": "good", "Verified": "good", "Active": "good", "On Track": "good", "Complete": "good", "Valid": "good", "Paid": "good",
  "Implemented": "good", "Adopted": "good", "Closed": "good", "Quorate": "good", "Managed": "good", "Recused": "good", "Done": "good",
  "In Progress": "warning", "Pending": "warning", "Pending Verification": "warning", "Expiring Soon": "warning", "At Risk": "warning", "Under Renewal": "warning",
  "Open": "warning", "Draft": "warning", "Forming": "warning", "Upcoming": "warning", "Declared": "warning", "Scheduled": "warning",
  "Overdue": "critical", "Disputed": "critical", "Delayed": "critical", "Vacant": "critical", "Inquorate": "critical", "Outstanding": "critical", "Expired": "critical",
  "Not Started": "neutral",
};
const MATURITY = [
  { name: "Critical", min: 0, max: 30 }, { name: "Foundational", min: 31, max: 50 },
  { name: "Developing", min: 51, max: 70 }, { name: "Consolidating", min: 71, max: 85 },
  { name: "Mature", min: 86, max: 100 },
];
const ACTION_CATEGORIES = ["Governance", "Administration", "Finance", "HR", "Beneficiary", "Land & Assets", "Projects", "Productivity", "Commercialisation"];
const ACTION_STATUSES = ["Not Started", "In Progress", "Overdue", "Completed"];
const PROJECT_STAGES = ["Concept", "Business Case", "Approved", "Implementation", "Complete"];
const PROJECT_STATUSES = ["Not Started", "On Track", "At Risk", "Delayed", "Complete"];

export const NAV = [
  { id: "exec", label: "Executive Dashboard", group: "Overview", eyebrow: "Overview", title: "CPA Executive Dashboard", sub: "Institutional score, journey stage and the alerts that need the Committee's attention." },
  { id: "score", label: "Institutional Performance", group: "Performance", eyebrow: "Performance", title: "Institutional Performance", sub: "The CPA360™ 100-point institutional score across nine weighted domains." },
  { id: "journey", label: "CPA360 Journey", group: "Performance", eyebrow: "Performance", title: "The CPA360™ Journey", sub: "Seven stages from Assess to Scale — where this CPA is, and what comes next." },
  { id: "profile", label: "Governance Centre", group: "Operations", eyebrow: "Operations", title: "Governance Centre", sub: "Institutional identity, EXCO and office bearers, committees, resolutions, meetings and the governance calendar." },
  { id: "beneficiary", label: "Beneficiary Centre", group: "Operations", eyebrow: "Operations", title: "Beneficiary Centre", sub: "The Master Beneficiary Register — verification, households, succession, deceased members and disputes." },
  { id: "finance", label: "Finance & Procurement", group: "Operations", eyebrow: "Operations", title: "Finance & Procurement", sub: "Budget, transactions, requisitions, purchase orders, suppliers, payments and procurement compliance." },
  { id: "assets", label: "Land & Assets", group: "Operations", eyebrow: "Operations", title: "Land & Assets", sub: "Land parcels, allocations, leases, permits, infrastructure, the asset register and maintenance." },
  { id: "productivity", label: "Productivity Centre", group: "Operations", eyebrow: "Operations", title: "Productivity Centre", sub: "Crops, orchards, timber, livestock, water, labour, inputs, harvest, sales and cost of production." },
  { id: "projects", label: "Projects & Commercialisation", group: "Operations", eyebrow: "Operations", title: "Projects & Commercialisation", sub: "Project pipeline and scorecards, business cases, funding readiness, markets, partnerships and revenue." },
  { id: "masterfile", label: "CPA Master File", group: "Records", eyebrow: "Records", title: "CPA Master File", sub: "The complete institutional record, indexed to the CPA360™ Master File structure." },
  { id: "actions", label: "Action Tracker", group: "Tools", eyebrow: "Tools", title: "Action Tracker", sub: "Open items from resolutions, assessments and Committee decisions, in one place." },
  { id: "impact", label: "Impact & M&E", group: "Tools", eyebrow: "Tools", title: "Impact & M&E", sub: "The outcomes CPA360™ implementation is producing on the ground." },
];

/* The CPA360 journey — 7 stages. `n` matches gates.n from the DB. */
const JOURNEY = [
  { n: 1, key: "Assess",          blurb: "Baseline the institution: assessment, master-file audit, beneficiary and land position established." },
  { n: 2, key: "Recover",         blurb: "Restore legal standing and control — constitution, EXCO, banking, and the most urgent compliance gaps closed." },
  { n: 3, key: "Stabilise",       blurb: "Core systems run consistently: minuted meetings, bookkeeping, records management, a working action tracker." },
  { n: 4, key: "Professionalise", blurb: "Institutionalise the systems — delegation of authority, budgeting, audited finances, full registers." },
  { n: 5, key: "Productivise",    blurb: "Put the land to work: enterprises identified, production planned and recorded, cost of production tracked." },
  { n: 6, key: "Commercialise",   blurb: "Turn production into income — market linkages, off-take agreements, partnerships, diversified revenue." },
  { n: 7, key: "Scale",           blurb: "Investment-ready: a bankable business plan, investment-grade governance and finance, a funding pipeline." },
];

/* ============ module state ============ */
let DATA = null;
let orgId = null;
let CAN_EDIT = false;
let container = null;
let currentView = "profile";
let onChange = null;
let channel = null;
let pendingRemote = false;
let suppressRemoteUntil = 0;   // ignore the echo of our own writes for a moment
const rendered = new Set();
let actionsFilter = "All";

/* ============ helpers ============ */
const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
const fmtR = (n) => "R " + Math.round(+n || 0).toLocaleString("en-ZA");
const fmtPct = (n) => (Math.round(n * 10) / 10) + "%";
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}" style="text-align:center;color:var(--ink-muted);padding:22px;">${esc(msg)}</td></tr>`;
const maturityBand = (score) => MATURITY.find((b) => score >= b.min && score <= b.max) || MATURITY[0];
const scoreTotal = () => DATA.score.domains.reduce((s, d) => s + domainScore(d), 0);
function pill(label, tone) { return `<span class="pill ${tone}">${ICONS[tone]}${label}</span>`; }
function statusPill(label) { return pill(esc(label), STATUS_TONE[label] || "neutral"); }

let toastTimer = null;
export function toast(msg, isErr) {
  document.querySelectorAll(".cpa-dash-toast").forEach((e) => e.remove());
  const t = document.createElement("div");
  t.className = "cpa-dash-toast" + (isErr ? " err" : "");
  t.textContent = msg;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 4200);
}

/* ============ chart helpers ============ */
function barRows(items, { fmtVal, cls } = {}) {
  const max = Math.max(1, ...items.map((i) => i.max ?? i.value));
  return items.map((it) => {
    const pct = Math.max(2, Math.min(100, (it.value / (it.max ?? max)) * 100));
    const barCls = it.cls || cls || "";
    const valStr = fmtVal ? fmtVal(it) : it.value;
    return `<div class="bar-row"><div class="lbl">${esc(it.label)}</div>
      <div class="bar-track"><div class="bar-fill ${barCls}" style="width:${pct}%"></div></div>
      <div class="val">${valStr}</div></div>`;
  }).join("");
}
function scoreGauge(value, max, size = 168) {
  const r = size / 2 - 14, c = size / 2, circ = 2 * Math.PI * r;
  const dash = circ * Math.max(0, Math.min(1, value / max));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="14"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--brand)" stroke-width="14"
      stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${c} ${c})"/>
    <text x="${c}" y="${c - 4}" text-anchor="middle" font-family="Libre Franklin, sans-serif" font-weight="800" font-size="34" fill="var(--ink)">${value}</text>
    <text x="${c}" y="${c + 18}" text-anchor="middle" font-family="Public Sans, sans-serif" font-size="12" fill="var(--ink-muted)">of ${max} points</text></svg>`;
}
function donut(slices, size = 160) {
  const total = slices.reduce((s, x) => s + x.value, 0) || 1;
  const r = size / 2 - 10, c = size / 2, circ = 2 * Math.PI * r;
  let offset = 0;
  const circles = slices.map((sl) => {
    const dash = (sl.value / total) * circ;
    const el = `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="${sl.color}" stroke-width="18"
      stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${c} ${c})"/>`;
    offset += dash;
    return el;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="18"/>${circles}
    <text x="${c}" y="${c - 2}" text-anchor="middle" font-family="Libre Franklin, sans-serif" font-weight="800" font-size="22" fill="var(--ink)">${total.toLocaleString()}</text>
    <text x="${c}" y="${c + 16}" text-anchor="middle" font-family="Public Sans, sans-serif" font-size="10.5" fill="var(--ink-muted)">members</text></svg>`;
}
function lineChart(containerId, months, values, { width = 560, height = 210 } = {}) {
  const el = container.querySelector("#" + containerId);
  if (!el) return;
  if (!values.length) { el.innerHTML = `<p class="muted">No cash history recorded.</p>`; return; }
  const pad = { l: 44, r: 14, t: 16, b: 26 };
  const w = width - pad.l - pad.r, h = height - pad.t - pad.b;
  const min = Math.min(...values) * 0.92, max = Math.max(...values) * 1.06 || 1;
  const x = (i) => pad.l + (i / Math.max(1, values.length - 1)) * w;
  const y = (v) => pad.t + h - ((v - min) / ((max - min) || 1)) * h;
  const pts = values.map((v, i) => [x(i), y(v)]);
  const path = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
  const area = path + ` L${pts[pts.length - 1][0].toFixed(1)},${pad.t + h} L${pts[0][0].toFixed(1)},${pad.t + h} Z`;
  let grid = "";
  for (let i = 0; i <= 4; i++) {
    const gy = pad.t + (h / 4) * i, gv = max - ((max - min) / 4) * i;
    grid += `<line x1="${pad.l}" y1="${gy}" x2="${width - pad.r}" y2="${gy}" stroke="var(--grid-line)" stroke-width="1"/>
      <text x="${pad.l - 8}" y="${gy + 3}" text-anchor="end" font-size="9.5" fill="var(--ink-muted)" font-family="IBM Plex Mono, monospace">R${Math.round(gv / 1000)}k</text>`;
  }
  const xLabels = months.map((m, i) => i % 2 === 0 ? `<text x="${x(i)}" y="${height - 6}" text-anchor="middle" font-size="9.5" fill="var(--ink-muted)">${esc(m)}</text>` : "").join("");
  const lastIdx = values.length - 1;
  const dots = pts.map((p, i) => i === lastIdx
    ? `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" fill="var(--brand)" stroke="var(--surface)" stroke-width="2"/>`
    : `<circle class="hp" data-i="${i}" cx="${p[0]}" cy="${p[1]}" r="10" fill="transparent"/>`).join("");
  el.innerHTML = `<svg width="100%" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet">
    <defs><linearGradient id="lg-${containerId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="var(--series-1)" stop-opacity="0.30"/><stop offset="100%" stop-color="var(--series-1)" stop-opacity="0.02"/>
    </linearGradient></defs>${grid}
    <path d="${area}" fill="url(#lg-${containerId})" stroke="none"/>
    <path d="${path}" fill="none" stroke="var(--series-1)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}${xLabels}
    <line id="crosshair-${containerId}" x1="0" y1="${pad.t}" x2="0" y2="${pad.t + h}" stroke="var(--ink-muted)" stroke-width="1" stroke-dasharray="3 3" opacity="0"/>
  </svg><div class="chart-tip" id="tip-${containerId}"></div>`;
  const tip = el.querySelector("#tip-" + containerId);
  const crosshair = el.querySelector("#crosshair-" + containerId);
  el.querySelectorAll(".hp").forEach((hp) => {
    const show = () => {
      const i = +hp.dataset.i;
      const rect = el.getBoundingClientRect();
      const scale = rect.width / width;
      tip.style.opacity = 1;
      tip.style.left = (pts[i][0] * scale + 8) + "px";
      tip.style.top = (pts[i][1] * scale - 30) + "px";
      tip.textContent = `${months[i]} — ${fmtR(values[i])}`;
      crosshair.setAttribute("x1", pts[i][0]); crosshair.setAttribute("x2", pts[i][0]);
      crosshair.setAttribute("opacity", 1);
    };
    const hide = () => { tip.style.opacity = 0; crosshair.setAttribute("opacity", 0); };
    hp.addEventListener("mousemove", show);
    hp.addEventListener("mouseleave", hide);
    hp.addEventListener("touchstart", show, { passive: true });
    hp.addEventListener("touchend", hide);
  });
}

/* ============ modal system ============ */
function fieldHtml(f) {
  const v = esc(f.value);
  if (f.type === "select")
    return `<div class="field"><label for="fld-${f.key}">${esc(f.label)}</label>
      <select id="fld-${f.key}" name="${f.key}">${f.options.map((o) =>
        `<option${String(o) === String(f.value) ? " selected" : ""}>${esc(o)}</option>`).join("")}</select></div>`;
  if (f.type === "textarea")
    return `<div class="field"><label for="fld-${f.key}">${esc(f.label)}</label>
      <textarea id="fld-${f.key}" name="${f.key}" rows="3">${v}</textarea></div>`;
  return `<div class="field"><label for="fld-${f.key}">${esc(f.label)}</label>
    <input id="fld-${f.key}" name="${f.key}" type="${f.type || "text"}" value="${v}"${f.type === "number" ? ' inputmode="numeric"' : ""}></div>`;
}
function openModal(title, fields, onSave) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3>
    <div class="modal-body">${fields.map(fieldHtml).join("")}</div>
    <div class="modal-foot">
      <button class="btn" data-act="cancel" type="button">Cancel</button>
      <button class="btn primary" data-act="save" type="button">Save</button>
    </div></div>`;
  document.body.appendChild(scrim);
  const close = () => { scrim.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  document.addEventListener("keydown", onKey);
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector('[data-act="cancel"]').onclick = close;
  scrim.querySelector('[data-act="save"]').onclick = () => {
    const out = {};
    let bad = false;
    fields.forEach((f) => {
      const inp = scrim.querySelector(`[name="${f.key}"]`);
      out[f.key] = inp.value.trim();
      if (f.required && !out[f.key]) { inp.style.borderColor = "var(--status-critical)"; bad = true; }
      else inp.style.borderColor = "";
    });
    if (bad) return;
    if (onSave(out) !== false) close();
  };
  const first = scrim.querySelector("input,select,textarea");
  if (first) first.focus();
}
function confirmModal(msg, onYes) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="width:min(400px,100%)">
    <h3>Please confirm</h3>
    <div class="modal-body"><p style="margin:0;">${esc(msg)}</p></div>
    <div class="modal-foot">
      <button class="btn" data-act="no" type="button">Cancel</button>
      <button class="btn danger" data-act="yes" type="button">Confirm</button>
    </div></div>`;
  document.body.appendChild(scrim);
  const close = () => scrim.remove();
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector('[data-act="no"]').onclick = close;
  scrim.querySelector('[data-act="yes"]').onclick = () => { close(); onYes(); };
  scrim.querySelector('[data-act="yes"]').focus();
}

/* ============ document attachments ============ */
const fmtBytes = (n) => n == null ? "" : n < 1024 ? n + " B"
  : n < 1048576 ? (n / 1024).toFixed(0) + " KB" : (n / 1048576).toFixed(1) + " MB";

function docCount(section, refId) {
  const m = (DATA && DATA._docCounts && DATA._docCounts[section]) || {};
  return m[refId == null ? "_" : String(refId)] || 0;
}

/* Reusable file manager. section: 'masterfile'|'action'|'score'|'general'. */
function attachmentsModal(section, refId, title) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3>
    <div class="modal-body" style="display:block;">
      <div id="att-list"><p class="muted">Loading…</p></div>
      ${CAN_EDIT ? `<label class="btn primary" style="margin-top:12px;display:inline-flex;cursor:pointer;">
        Upload a file<input type="file" id="att-file" hidden></label>
        <span id="att-msg" style="font-size:11.5px;color:var(--ink-muted);margin-left:8px;"></span>` : ""}
    </div>
    <div class="modal-foot"><button class="btn primary" data-act="close" type="button">Done</button></div>
  </div>`;
  document.body.appendChild(scrim);
  const listEl = scrim.querySelector("#att-list");
  const msg = scrim.querySelector("#att-msg");
  const close = () => scrim.remove();
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector('[data-act="close"]').onclick = close;

  async function refresh() {
    try {
      const docs = await repo.listDocs(orgId, section, refId);
      listEl.innerHTML = docs.length ? docs.map((d) => `
        <div class="le-row">
          <span title="${esc(d.name)}">${esc(d.name)} <span style="color:var(--ink-muted);">${fmtBytes(d.size)}</span></span>
          <span class="row-actions">
            <button type="button" data-dl="${d.id}" title="Download" aria-label="Download">${CLIP}</button>
            ${CAN_EDIT ? `<button type="button" data-rm="${d.id}" title="Delete" aria-label="Delete">${TRASH}</button>` : ""}
          </span>
        </div>`).join("") : `<p class="muted">No files yet.</p>`;
      listEl.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
        const d = docs.find((x) => x.id === b.dataset.dl);
        try { window.open(await repo.docUrl(d.path), "_blank", "noopener"); }
        catch (e) { toast("Couldn't open file", true); }
      }));
      listEl.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => {
        const d = docs.find((x) => x.id === b.dataset.rm);
        confirmModal(`Delete "${d.name}"?`, async () => {
          try { await repo.deleteDoc(d); bumpDocCount(section, refId, -1); refresh(); renderCurrent(); if (onChange) onChange(); }
          catch (e) { toast("Couldn't delete: " + (e.message || e), true); }
        });
      }));
    } catch (e) {
      listEl.innerHTML = `<p class="muted">Couldn't load files — ${esc(e.message || e)}</p>`;
    }
  }
  refresh();

  const fileInput = scrim.querySelector("#att-file");
  if (fileInput) fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (f.size > 25 * 1048576) { msg.textContent = "Max 25 MB."; fileInput.value = ""; return; }
    msg.textContent = "Uploading…";
    try {
      await repo.uploadDoc(orgId, section, refId, f);
      bumpDocCount(section, refId, 1);
      msg.textContent = "";
      fileInput.value = "";
      refresh();
      renderCurrent();
      if (onChange) onChange();
    } catch (e) {
      msg.textContent = "Failed: " + (e.message || e);
    }
  };
}

/* Inline file manager for a section/ref — used as a sub-tab panel. */
function mountFileList(host, section, refId, title, hint) {
  host.innerHTML = `
    <div class="card">
      <div class="card-head"><div><h3>${esc(title)}</h3>${hint ? `<span class="hint">${esc(hint)}</span>` : ""}</div>
        ${CAN_EDIT ? `<label class="btn primary" style="cursor:pointer;">Upload a file<input type="file" id="fl-file" hidden></label>` : ""}</div>
      <div id="fl-msg" style="font-size:11.5px;color:var(--ink-muted);margin-bottom:8px;"></div>
      <div id="fl-list"><p class="muted">Loading…</p></div>
    </div>`;
  const listEl = host.querySelector("#fl-list");
  const msg = host.querySelector("#fl-msg");
  async function refresh() {
    try {
      const docs = await repo.listDocs(orgId, section, refId);
      listEl.innerHTML = docs.length ? `<div class="table-wrap"><table><tbody>${docs.map((d) => `
        <tr><td style="font-weight:600;">${esc(d.name)}</td>
          <td class="mono" style="color:var(--ink-muted);">${fmtBytes(d.size)}</td>
          <td class="mono" style="color:var(--ink-muted);">${esc((d.uploaded_at || "").slice(0, 10))}</td>
          <td><span class="row-actions">
            <button type="button" data-dl="${d.id}" title="Download" aria-label="Download">${CLIP}</button>
            ${CAN_EDIT ? `<button type="button" data-rm="${d.id}" title="Delete" aria-label="Delete">${TRASH}</button>` : ""}
          </span></td></tr>`).join("")}</tbody></table></div>` : `<p class="muted">No files yet.</p>`;
      listEl.querySelectorAll("[data-dl]").forEach((b) => (b.onclick = async () => {
        const d = docs.find((x) => x.id === b.dataset.dl);
        try { window.open(await repo.docUrl(d.path), "_blank", "noopener"); } catch (e) { toast("Couldn't open file", true); }
      }));
      listEl.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => {
        const d = docs.find((x) => x.id === b.dataset.rm);
        confirmModal(`Delete "${d.name}"?`, async () => {
          try { await repo.deleteDoc(d); bumpDocCount(section, refId, -1); refresh(); if (onChange) onChange(); }
          catch (e) { toast("Couldn't delete", true); }
        });
      }));
    } catch (e) { listEl.innerHTML = `<p class="muted">Couldn't load files — ${esc(e.message || e)}</p>`; }
  }
  refresh();
  const fi = host.querySelector("#fl-file");
  if (fi) fi.onchange = async () => {
    const f = fi.files[0];
    if (!f) return;
    if (f.size > 25 * 1048576) { msg.textContent = "Max 25 MB."; fi.value = ""; return; }
    msg.textContent = "Uploading…";
    try { await repo.uploadDoc(orgId, section, refId, f); bumpDocCount(section, refId, 1); msg.textContent = ""; fi.value = ""; refresh(); if (onChange) onChange(); }
    catch (e) { msg.textContent = "Failed: " + (e.message || e); }
  };
}

function bumpDocCount(section, refId, delta) {
  if (!DATA._docCounts) DATA._docCounts = {};
  (DATA._docCounts[section] ||= {});
  const k = refId == null ? "_" : String(refId);
  DATA._docCounts[section][k] = Math.max(0, (DATA._docCounts[section][k] || 0) + delta);
}

/* ============ spreadsheet (CSV) import ============ */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

/* cfg: { title, targets:[{k,label,required}], make:(obj)=>row, arr:()=>array, section } */
function importModal(cfg) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Import ${esc(cfg.title)}">
    <h3>Import ${esc(cfg.title)} from a spreadsheet</h3>
    <div class="modal-body" style="display:block;">
      <p style="margin:0 0 10px;font-size:12px;color:var(--ink-2);">
        Upload a <strong>.csv</strong> (export any sheet as CSV). Match its columns to the fields below.</p>
      <label class="btn" style="cursor:pointer;display:inline-flex;">Choose CSV<input type="file" id="imp-file" accept=".csv,text/csv" hidden></label>
      <span id="imp-name" style="font-size:11.5px;color:var(--ink-muted);margin-left:8px;"></span>
      <div id="imp-map" style="margin-top:14px;"></div>
      <label style="display:flex;gap:7px;align-items:center;margin-top:12px;font-size:12.5px;">
        <input type="checkbox" id="imp-replace"> Replace all existing rows (otherwise append)</label>
      <p id="imp-msg" style="margin:10px 0 0;font-size:12px;"></p>
    </div>
    <div class="modal-foot">
      <button class="btn" data-act="cancel" type="button">Cancel</button>
      <button class="btn primary" data-act="go" type="button" disabled>Import</button>
    </div>
  </div>`;
  document.body.appendChild(scrim);
  const close = () => scrim.remove();
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector('[data-act="cancel"]').onclick = close;
  const mapEl = scrim.querySelector("#imp-map");
  const msg = scrim.querySelector("#imp-msg");
  const goBtn = scrim.querySelector('[data-act="go"]');
  let headers = [], dataRows = [];

  scrim.querySelector("#imp-file").onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    scrim.querySelector("#imp-name").textContent = f.name;
    const rows = parseCSV(await f.text());
    if (rows.length < 2) { msg.textContent = "That file has no data rows."; return; }
    headers = rows[0].map((h) => h.trim());
    dataRows = rows.slice(1);
    const opts = ['<option value="">— skip —</option>']
      .concat(headers.map((h, i) => `<option value="${i}">${esc(h)}</option>`)).join("");
    mapEl.innerHTML = cfg.targets.map((t) => {
      const guess = headers.findIndex((h) => h.toLowerCase().replace(/[^a-z]/g, "").includes(
        t.label.toLowerCase().replace(/[^a-z]/g, "").slice(0, 5)));
      return `<div class="field" style="margin-bottom:8px;">
        <label>${esc(t.label)}${t.required ? " *" : ""}</label>
        <select data-t="${t.k}">${opts.replace(`value="${guess}"`, `value="${guess}" selected`)}</select>
      </div>`;
    }).join("");
    goBtn.disabled = false;
    msg.textContent = `${dataRows.length} row(s) ready.`;
  };

  goBtn.onclick = () => {
    const pick = {};
    mapEl.querySelectorAll("select[data-t]").forEach((s) => { pick[s.dataset.t] = s.value === "" ? null : +s.value; });
    const missing = cfg.targets.filter((t) => t.required && pick[t.k] == null);
    if (missing.length) { msg.textContent = "Map the required field(s): " + missing.map((m) => m.label).join(", "); return; }
    const built = dataRows.map((r) => {
      const obj = {};
      cfg.targets.forEach((t) => { obj[t.k] = pick[t.k] == null ? "" : (r[pick[t.k]] || "").trim(); });
      return cfg.make(obj);
    }).filter(Boolean);
    const arr = cfg.arr();
    if (scrim.querySelector("#imp-replace").checked) arr.length = 0;
    built.forEach((row) => arr.push(row));
    commit(cfg.section);
    toast(`Imported ${built.length} row(s) into ${cfg.title}.`);
    close();
  };
}

/* ============ generic editors ============ */
function objectEditor(title, obj, spec, section) {
  openModal(title, spec.map((s) => ({ ...s, value: obj[s.key] })), (out) => {
    spec.forEach((s) => {
      if (s.type === "number") {
        let v = parseFloat(out[s.key]);
        if (isNaN(v)) return;
        if (s.min != null) v = Math.max(s.min, v);
        if (s.max != null) v = Math.min(s.max, v);
        obj[s.key] = v;
      } else obj[s.key] = out[s.key];
    });
    commit(section);
  });
}
function listEditor(cfg) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(cfg.title)}">
    <h3>${esc(cfg.title)}</h3>
    <div class="modal-body" id="le-body" style="display:block;"></div>
    <div class="modal-foot">
      <button class="btn" data-act="add" type="button">+ Add</button>
      <button class="btn primary" data-act="close" type="button">Done</button>
    </div></div>`;
  document.body.appendChild(scrim);
  const body = scrim.querySelector("#le-body");
  const close = () => scrim.remove();
  scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); });
  scrim.querySelector('[data-act="close"]').onclick = close;
  function editRow(i) {
    const row = i == null ? cfg.blank() : cfg.arr[i];
    openModal(i == null ? "Add — " + cfg.title : "Edit — " + cfg.title, cfg.fields(row), (out) => {
      cfg.write(row, out);
      if (i == null) cfg.arr.push(row);
      commit(cfg.section);
      build();
    });
  }
  function build() {
    body.innerHTML = cfg.arr.length ? cfg.arr.map((row, i) => `
      <div class="le-row"><span>${esc(cfg.rowLabel(row))}</span>
        <span class="row-actions">
          <button type="button" data-e="${i}" title="Edit" aria-label="Edit entry">${PENCIL}</button>
          <button type="button" data-d="${i}" title="Delete" aria-label="Delete entry">${TRASH}</button>
        </span></div>`).join("") : `<p class="muted">Nothing recorded yet — use “Add”.</p>`;
    body.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editRow(+b.dataset.e)));
    body.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => {
      const i = +b.dataset.d;
      confirmModal("Delete “" + cfg.rowLabel(cfg.arr[i]) + "”?", () => { cfg.arr.splice(i, 1); commit(cfg.section); build(); });
    }));
  }
  scrim.querySelector('[data-act="add"]').onclick = () => editRow(null);
  build();
}

/* ============ sub-tabs + generic register panel ============ */
const SUBTAB = {};
function subtabStrip(section, tabs) {
  const cur = SUBTAB[section] || tabs[0].id;
  return `<div class="subtabs">${tabs.map((t) =>
    `<button type="button" data-subtab="${section}:${t.id}" class="${t.id === cur ? "active" : ""}">${esc(t.label)}</button>`).join("")}</div>`;
}
function wireSubtabs(host) {
  host.querySelectorAll("[data-subtab]").forEach((b) => (b.onclick = () => {
    const [section, tab] = b.dataset.subtab.split(":");
    SUBTAB[section] = tab;
    renderCurrent();
  }));
}

/* A read table + Import/Manage buttons wired to an editor. cfg:
   { title, hint, columns:[{label,cls}], rows:()=>arr, cell:(row)=>[htmlCell,…],
     manage:()=>void, importKey?, stats?:()=>[htmlTile,…] } */
function mountRegister(host, cfg) {
  const rows = cfg.rows();
  const tools = [];
  if (CAN_EDIT && cfg.importKey) tools.push(`<button class="btn" data-reg-import type="button">Import CSV</button>`);
  if (CAN_EDIT) tools.push(`<button class="btn" data-reg-manage type="button">Manage</button>`);
  host.innerHTML = `
    ${cfg.stats ? `<div class="grid grid-4">${cfg.stats().join("")}</div>` : ""}
    <div class="card-head" style="margin:${cfg.stats ? "18px" : "2px"} 0 10px;">
      <div><h3 style="font-size:13px;">${esc(cfg.title)}</h3>${cfg.hint ? `<span class="hint">${esc(cfg.hint)}</span>` : ""}</div>
      <span style="display:flex;gap:6px;">${tools.join("")}</span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>${cfg.columns.map((c) => `<th class="${c.cls || ""}">${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.length
        ? rows.map((r) => `<tr>${cfg.cell(r).map((cell, i) => `<td class="${cfg.columns[i].cls || ""}">${cell}</td>`).join("")}</tr>`).join("")
        : emptyRow(cfg.columns.length, cfg.empty || "Nothing recorded yet.")}</tbody>
    </table></div>`;
  const mb = host.querySelector("[data-reg-manage]");
  if (mb) mb.onclick = cfg.manage;
  const ib = host.querySelector("[data-reg-import]");
  if (ib) ib.onclick = () => importModal(IMPORT[cfg.importKey]);
}

/* ============ section editors ============ */
function nextActionRef() {
  const yr = new Date().getFullYear();
  const nums = DATA.actions.map((a) => { const m = /(\d+)\s*$/.exec(a[0] || ""); return m ? +m[1] : 0; });
  return `CPA360-ACT-${yr}-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}
function editAction(ref) {
  const a = ref ? DATA.actions.find((x) => x[0] === ref) : null;
  openModal(a ? "Edit action" : "Add action", [
    { key: "action", label: "Action", type: "textarea", value: a ? a[2] : "", required: true },
    { key: "category", label: "Category", type: "select", options: ACTION_CATEGORIES, value: a ? a[1] : ACTION_CATEGORIES[0] },
    { key: "owner", label: "Owner", type: "text", value: a ? a[3] : "" },
    { key: "due", label: "Due date", type: "date", value: a ? a[4] : "" },
    { key: "status", label: "Status", type: "select", options: ACTION_STATUSES, value: a ? a[5] : "Not Started" },
  ], (out) => {
    if (a && out.status === "Completed" && a[5] !== "Completed" && docCount("action", a._id) === 0) {
      toast("Attach a document to this action before marking it Completed.", true);
      return false;
    }
    if (a) { a[1] = out.category; a[2] = out.action; a[3] = out.owner; a[4] = out.due; a[5] = out.status; }
    else DATA.actions.push([nextActionRef(), out.category, out.action, out.owner, out.due, out.status]);
    commit("actions");
  });
}
function deleteAction(ref) {
  const a = DATA.actions.find((x) => x[0] === ref);
  confirmModal(`Delete action "${((a && a[2]) || "").slice(0, 60)}"?`, () => {
    DATA.actions = DATA.actions.filter((x) => x[0] !== ref);
    commit("actions");
  });
}
function editIdentity() {
  const c = DATA.cpa;
  openModal("Edit CPA identity", [
    { key: "name", label: "Legal name", type: "text", value: c.name, required: true },
    { key: "reg", label: "Registration no.", type: "text", value: c.reg },
    { key: "region", label: "Region", type: "text", value: c.region },
    { key: "established", label: "Year established", type: "number", value: c.established },
    { key: "landExtent", label: "Land extent (ha)", type: "number", value: c.landExtent },
    { key: "portions", label: "Registered portions", type: "number", value: c.portions },
    { key: "members", label: "Verified members", type: "number", value: c.members },
  ], (out) => {
    c.name = out.name; c.reg = out.reg; c.region = out.region;
    c.established = +out.established || c.established;
    c.landExtent = +out.landExtent || c.landExtent;
    c.portions = +out.portions || c.portions;
    c.members = +out.members || c.members;
    commit("cpa");
  });
}
function editCommittee() {
  listEditor({
    title: "EXCO & office bearers", arr: DATA.committee, section: "committee",
    rowLabel: (r) => `${r[1] || "—"} · ${r[0]} (${r[3] || "EXCO"})`,
    blank: () => ["Additional Member", "", new Date().getFullYear() + " – present", "EXCO"],
    fields: (r) => [
      { key: "body", label: "Body", type: "select", options: ["EXCO", "Office Bearer", "Sub-committee"], value: r[3] || "EXCO" },
      { key: "role", label: "Role / portfolio", type: "text", value: r[0], required: true },
      { key: "name", label: "Name", type: "text", value: r[1], required: true },
      { key: "term", label: "Term", type: "text", value: r[2] },
    ],
    write: (r, o) => { r[0] = o.role; r[1] = o.name; r[2] = o.term; r[3] = o.body || "EXCO"; },
  });
}
function editMasterFile() {
  listEditor({
    title: "Master File sections", arr: DATA.masterFile, section: "masterfile",
    rowLabel: (r) => `${r[0]}. ${r[1] || "—"} — ${r[3]}%`,
    blank: () => [String(DATA.masterFile.length + 1), "", "0 documents", 0],
    fields: (r) => [
      { key: "no", label: "Section no.", type: "text", value: r[0] },
      { key: "name", label: "Section name", type: "text", value: r[1], required: true },
      { key: "count", label: "Document count (e.g. “12 documents”)", type: "text", value: r[2] },
      { key: "pct", label: "Completeness %", type: "number", value: r[3], min: 0, max: 100 },
    ],
    write: (r, o) => { r[0] = o.no; r[1] = o.name; r[2] = o.count; r[3] = Math.max(0, Math.min(100, parseFloat(o.pct) || 0)); },
  });
}
function editBeneficiary() {
  objectEditor("Beneficiary register figures", DATA.beneficiary, [
    { key: "total", label: "Total registered", type: "number", min: 0 },
    { key: "verified", label: "Verified", type: "number", min: 0 },
    { key: "pending", label: "Pending verification", type: "number", min: 0 },
    { key: "disputed", label: "Disputed", type: "number", min: 0 },
    { key: "female", label: "Female members", type: "number", min: 0 },
    { key: "male", label: "Male members", type: "number", min: 0 },
    { key: "households", label: "Households represented", type: "number", min: 0 },
    { key: "succession", label: "Succession cases pending", type: "number", min: 0 },
  ], "beneficiary");
}
function editLand() {
  listEditor({
    title: "Land portions", arr: DATA.assets.land, section: "land",
    rowLabel: (r) => `${r[0]} — ${r[1] || "—"} (${(+r[2] || 0).toLocaleString()} ha)`,
    blank: () => ["Portion " + (DATA.assets.land.length + 1), "", 0, "", "Active"],
    fields: (r) => [
      { key: "portion", label: "Portion", type: "text", value: r[0], required: true },
      { key: "use", label: "Primary use", type: "text", value: r[1] },
      { key: "ha", label: "Extent (ha)", type: "number", value: r[2], min: 0 },
      { key: "lease", label: "Lease / tenure", type: "text", value: r[3] },
      { key: "status", label: "Status", type: "select", options: ["Active", "Under Renewal", "Vacant", "Disputed"], value: r[4] },
    ],
    write: (r, o) => { r[0] = o.portion; r[1] = o.use; r[2] = parseFloat(o.ha) || 0; r[3] = o.lease; r[4] = o.status; },
  });
}
function editLeases() {
  listEditor({
    title: "Land leases", arr: DATA.assets.leases, section: "leases",
    rowLabel: (r) => `${r[0] || "—"} — ${r[1] || "—"} (${(+r[3] || 0).toLocaleString()} ha)`,
    blank: () => ["", "", "", 0, "", "", 0, "Active"],
    fields: (r) => [
      { key: "party", label: "Lessee / party", type: "text", value: r[0], required: true },
      { key: "portion", label: "Land / portion", type: "text", value: r[1] },
      { key: "use", label: "Land use", type: "text", value: r[2] },
      { key: "ha", label: "Area (ha)", type: "number", value: r[3], min: 0 },
      { key: "start", label: "Start date", type: "text", value: r[4] },
      { key: "end", label: "End date", type: "text", value: r[5] },
      { key: "rental", label: "Annual rental (R)", type: "number", value: r[6], min: 0 },
      { key: "status", label: "Status", type: "select", options: ["Active", "Under Negotiation", "Expiring Soon", "Expired", "Terminated"], value: r[7] },
    ],
    write: (r, o) => {
      r[0] = o.party; r[1] = o.portion; r[2] = o.use; r[3] = parseFloat(o.ha) || 0;
      r[4] = o.start; r[5] = o.end; r[6] = parseFloat(o.rental) || 0; r[7] = o.status;
    },
  });
}
function editAllocations() {
  listEditor({
    title: "Land allocated to beneficiaries", arr: DATA.assets.allocations, section: "allocations",
    rowLabel: (r) => `${r[0] || "—"} — ${r[1] || "—"} (${(+r[3] || 0).toLocaleString()} ha)`,
    blank: () => ["", "", "", 0, "", "", "Active"],
    fields: (r) => [
      { key: "beneficiary", label: "Beneficiary / household", type: "text", value: r[0], required: true },
      { key: "portion", label: "Land / portion", type: "text", value: r[1] },
      { key: "purpose", label: "Purpose", type: "text", value: r[2] },
      { key: "ha", label: "Area (ha)", type: "number", value: r[3], min: 0 },
      { key: "date", label: "Allocated on", type: "text", value: r[4] },
      { key: "ref", label: "Agreement ref.", type: "text", value: r[5] },
      { key: "status", label: "Status", type: "select", options: ["Active", "Pending", "Under Dispute", "Revoked"], value: r[6] },
    ],
    write: (r, o) => {
      r[0] = o.beneficiary; r[1] = o.portion; r[2] = o.purpose; r[3] = parseFloat(o.ha) || 0;
      r[4] = o.date; r[5] = o.ref; r[6] = o.status;
    },
  });
}
function editMovable() {
  listEditor({
    title: "Movable assets", arr: DATA.assets.movable, section: "movable",
    rowLabel: (r) => `${r[0] || "—"} — ${r[1]}`,
    blank: () => ["", 0, "Serviceable"],
    fields: (r) => [
      { key: "cls", label: "Asset class", type: "text", value: r[0], required: true },
      { key: "count", label: "Count", type: "number", value: r[1], min: 0 },
      { key: "cond", label: "Condition", type: "text", value: r[2] },
    ],
    write: (r, o) => { r[0] = o.cls; r[1] = parseFloat(o.count) || 0; r[2] = o.cond; },
  });
}
function editPermits() {
  listEditor({
    title: "Permits & licenses", arr: DATA.assets.permits, section: "permits",
    rowLabel: (r) => `${r[0] || "—"} — ${r[2]}`,
    blank: () => ["", "N/A", "Valid"],
    fields: (r) => [
      { key: "name", label: "Permit / license", type: "text", value: r[0], required: true },
      { key: "valid", label: "Valid until", type: "text", value: r[1] },
      { key: "status", label: "Status", type: "select", options: ["Valid", "Expiring Soon", "Under Renewal", "Not Started"], value: r[2] },
    ],
    write: (r, o) => { r[0] = o.name; r[1] = o.valid; r[2] = o.status; },
  });
}
function editFinanceFigures() {
  const f = DATA.finance;
  openModal("Finance figures", [
    { key: "annualBudget", label: "Annual budget (R)", type: "number", value: f.annualBudget },
    { key: "ytdIncomeBudget", label: "YTD income — budget (R)", type: "number", value: f.ytdIncomeBudget },
    { key: "ytdIncomeActual", label: "YTD income — actual (R)", type: "number", value: f.ytdIncomeActual },
    { key: "ytdExpBudget", label: "YTD expenditure — budget (R)", type: "number", value: f.ytdExpBudget },
    { key: "ytdExpActual", label: "YTD expenditure — actual (R)", type: "number", value: f.ytdExpActual },
    { key: "cashBalance", label: "Current cash balance (R)", type: "number", value: f.cashBalance },
    { key: "cashMonths", label: "Cash chart — month labels (comma-separated)", type: "text", value: f.cashMonths.join(", ") },
    { key: "cashTrend", label: "Cash chart — monthly balances (comma-separated R)", type: "textarea", value: f.cashTrend.join(", ") },
  ], (out) => {
    ["annualBudget", "ytdIncomeBudget", "ytdIncomeActual", "ytdExpBudget", "ytdExpActual", "cashBalance"].forEach((k) => {
      const v = parseFloat(out[k]); if (!isNaN(v)) f[k] = v;
    });
    const months = out.cashMonths.split(",").map((s) => s.trim()).filter(Boolean);
    const trend = out.cashTrend.split(",").map((s) => parseFloat(s.trim())).filter((n) => !isNaN(n));
    if (months.length) f.cashMonths = months;
    if (trend.length) f.cashTrend = trend;
    commit("finance");
  });
}
function editCategories() {
  listEditor({
    title: "Budget categories", arr: DATA.finance.categories, section: "categories",
    rowLabel: (r) => `${r[0] || "—"} — ${fmtR(r[2])} / ${fmtR(r[1])}`,
    blank: () => ["", 0, 0],
    fields: (r) => [
      { key: "name", label: "Category", type: "text", value: r[0], required: true },
      { key: "budget", label: "Annual budget (R)", type: "number", value: r[1], min: 0 },
      { key: "actual", label: "YTD actual (R)", type: "number", value: r[2], min: 0 },
    ],
    write: (r, o) => { r[0] = o.name; r[1] = parseFloat(o.budget) || 0; r[2] = parseFloat(o.actual) || 0; },
  });
}
function editProject(idx) {
  const p = idx == null ? null : DATA.projects[idx];
  openModal(p ? "Edit project" : "Add project", [
    { key: "name", label: "Project", type: "text", value: p ? p[0] : "", required: true },
    { key: "stage", label: "Stage", type: "select", options: PROJECT_STAGES, value: p ? p[1] : "Concept" },
    { key: "budget", label: "Budget (R)", type: "number", value: p ? p[2] : 0, min: 0 },
    { key: "spent", label: "Spent (R)", type: "number", value: p ? p[3] : 0, min: 0 },
    { key: "pct", label: "Progress %", type: "number", value: p ? p[4] : 0, min: 0, max: 100 },
    { key: "status", label: "Status", type: "select", options: PROJECT_STATUSES, value: p ? p[5] : "Not Started" },
  ], (out) => {
    const row = [out.name, out.stage, parseFloat(out.budget) || 0, parseFloat(out.spent) || 0,
      Math.max(0, Math.min(100, parseFloat(out.pct) || 0)), out.status];
    if (p) { row._id = p._id; DATA.projects[idx] = row; }
    else DATA.projects.push(row);
    commit("projects");
  });
}
function deleteProject(idx) {
  confirmModal(`Delete project “${(DATA.projects[idx] || [])[0] || ""}”?`, () => { DATA.projects.splice(idx, 1); commit("projects"); });
}
function editImpactFigures() {
  objectEditor("Impact figures", DATA.impact, [
    { key: "jobsThisYear", label: "Jobs created this year (FTE)", type: "number", min: 0 },
    { key: "jobsCumulative", label: "Cumulative jobs since Gate 2", type: "number", min: 0 },
    { key: "hectaresActive", label: "Hectares under active production", type: "number", min: 0 },
    { key: "hectaresTotal", label: "Total hectares", type: "number", min: 0 },
    { key: "householdsBenefit", label: "Households benefiting", type: "number", min: 0 },
    { key: "householdsTotal", label: "Households represented (total)", type: "number", min: 0 },
    { key: "revenue", label: "Enterprise revenue (R)", type: "number", min: 0 },
    { key: "training", label: "Training beneficiaries", type: "number", min: 0 },
  ], "impact");
}
function editJobsByYear() {
  listEditor({
    title: "Jobs created by year", arr: DATA.impact.jobsByYear, section: "impact",
    rowLabel: (r) => `${r[0]} — ${r[1]} FTE`,
    blank: () => [String(new Date().getFullYear()), 0],
    fields: (r) => [
      { key: "year", label: "Year", type: "text", value: r[0], required: true },
      { key: "jobs", label: "Jobs (FTE)", type: "number", value: r[1], min: 0 },
    ],
    write: (r, o) => { r[0] = o.year; r[1] = parseFloat(o.jobs) || 0; },
  });
}

/* ============ view renderers ============ */
const $ = (id) => container.querySelector("#" + id);
function statTile(label, value, sub, tone) {
  return `<div class="stat-tile"><div class="label">${esc(label)}</div><div class="value num">${esc(value)}</div>${sub ? `<div class="sub ${tone || ""}">${esc(sub)}</div>` : ""}</div>`;
}

const GOV_TABS = [
  { id: "identity", label: "Identity" },
  { id: "exco", label: "EXCO & Office Bearers" },
  { id: "committees", label: "Committees" },
  { id: "resolutions", label: "Resolutions" },
  { id: "meetings", label: "Meetings" },
  { id: "agm", label: "AGM / SGM" },
  { id: "coi", label: "Conflict of Interest" },
  { id: "calendar", label: "Governance Calendar" },
];
const GOV_PANELS = {
  identity: renderGovIdentity, exco: renderGovExco, committees: renderGovCommittees,
  resolutions: renderGovResolutions, meetings: renderGovMeetings, agm: renderGovAgm,
  coi: renderGovCoi, calendar: renderGovCalendar,
};
function renderProfile() {
  const strip = $("governance-subtabs");
  strip.innerHTML = subtabStrip("governance", GOV_TABS);
  wireSubtabs(strip);
  const cur = SUBTAB.governance || "identity";
  (GOV_PANELS[cur] || renderGovIdentity)($("governance-body"));
}

function renderGovIdentity(host) {
  const c = DATA.cpa;
  const total = scoreTotal();
  const gCur = DATA.gates.find((g) => g.state === "current") || DATA.gates[DATA.gates.length - 1] || { n: "–", name: "—" };
  const now = new Date();
  const overdue = DATA.actions.filter((a) => a[5] === "Overdue");
  const dueSoon = DATA.actions.filter((a) => {
    if (a[5] === "Completed" || !a[4]) return false;
    const days = (new Date(a[4]) - now) / 86400000;
    return days >= 0 && days <= 45;
  });
  const govDom = DATA.score.domains.find((d) => d.name === "Governance") || { achieved: 0, weight: 1 };
  const yrs = new Date().getFullYear() - (+c.established || new Date().getFullYear());
  const overdueGovCal = (DATA.governance.calendar || []).filter((r) => r[2] && new Date(r[2]) < now && r[5] !== "Done").length;

  const parts = [];
  if (overdue.length) parts.push(`<strong>${overdue.length} action${overdue.length > 1 ? "s" : ""} overdue</strong>`);
  if (dueSoon.length) parts.push(`${dueSoon.length} due within 45 days`);
  if (overdueGovCal) parts.push(`${overdueGovCal} governance-calendar item${overdueGovCal > 1 ? "s" : ""} past due`);

  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Governance Score", `${domainScore(govDom)} / ${govDom.weight}`, "Institutional Performance domain", "")}
      ${statTile("Journey Stage", `${gCur.n} of 7`, `${gCur.name}`, "warning")}
      ${statTile("EXCO & Office Bearers", DATA.committee.length, "Elected members on record", "")}
      ${statTile("Sub-committees", (DATA.governance.committees || []).length, "Standing committees", "")}
    </div>
    ${parts.length ? `<div class="callout" style="margin-top:14px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3.5 22 20H2z"/><path d="M12 10v4M12 17.2v.1"/></svg>
      <div>Attention needed — ${parts.join(" · ")}. Open the <a href="#/v/actions" style="font-weight:600;text-decoration:underline;">Action Tracker</a>.</div></div>` : ""}
    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-head"><h3>Institutional Identity</h3>${CAN_EDIT ? `<button class="btn" id="gov-edit-identity" type="button">Edit</button>` : ""}</div>
        <dl class="kv">
          <dt>Legal name</dt><dd>${esc(c.name)}</dd>
          <dt>Registration no.</dt><dd class="mono">${esc(c.reg)}</dd>
          <dt>Region</dt><dd>${esc(c.region)}</dd>
          <dt>Established</dt><dd>${esc(c.established)}${c.established ? ` (${yrs} year${yrs === 1 ? "" : "s"} operating)` : ""}</dd>
          <dt>Land extent</dt><dd>${(+c.landExtent || 0).toLocaleString()} ha across ${esc(c.portions)} portions</dd>
          <dt>Verified members</dt><dd>${(+c.members || 0).toLocaleString()}</dd>
        </dl>
      </div>
      <div class="card">
        <div class="card-head"><h3>Office Bearers</h3><span class="hint">${DATA.committee.filter((r) => r[3] === "Office Bearer").length || DATA.committee.length} on record</span></div>
        ${DATA.committee.length ? `<table><tbody>${DATA.committee.map(([role, name, term]) =>
          `<tr><td style="color:var(--ink-2);font-size:12px;">${esc(role)}</td><td style="font-weight:600;">${esc(name)}</td><td style="color:var(--ink-muted);font-size:11.5px;">${esc(term)}</td></tr>`).join("")}</tbody></table>`
          : `<p class="muted">No members recorded — see the EXCO tab.</p>`}
      </div>
    </div>`;
  const eb = host.querySelector("#gov-edit-identity");
  if (eb) eb.onclick = editIdentity;
}

const COMMITTEE_BODIES = ["EXCO", "Office Bearer", "Sub-committee"];
function renderGovExco(host) {
  mountRegister(host, {
    title: "EXCO & Office Bearers", importKey: "committee",
    hint: "The elected Executive Committee and the CPA's office bearers.",
    columns: [{ label: "Body" }, { label: "Role / Portfolio" }, { label: "Name" }, { label: "Term" }],
    rows: () => DATA.committee,
    cell: (r) => [`<span class="pill ${r[3] === "Office Bearer" ? "brand" : "neutral"}">${esc(r[3] || "EXCO")}</span>`,
      esc(r[0]), `<span style="font-weight:600;">${esc(r[1])}</span>`, `<span class="mono">${esc(r[2])}</span>`],
    manage: editCommittee,
  });
}
function renderGovCommittees(host) {
  mountRegister(host, {
    title: "Standing Committees", importKey: "gov_committees",
    columns: [{ label: "Committee" }, { label: "Mandate" }, { label: "Chair" }, { label: "Members", cls: "num" }, { label: "Cadence" }, { label: "Status" }],
    rows: () => DATA.governance.committees,
    empty: "No sub-committees recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span style="color:var(--ink-2);">${esc(r[1])}</span>`,
      esc(r[2]), `<span class="mono">${esc(r[3])}</span>`, esc(r[4]), statusPill(r[5])],
    manage: () => listEditor(GOV_EDITORS.committees()),
  });
}
function renderGovResolutions(host) {
  const open = DATA.governance.resolutions.filter((r) => !["Implemented", "Adopted", "Closed"].includes(r[6])).length;
  mountRegister(host, {
    title: "Resolutions Register", importKey: "gov_resolutions",
    hint: "Decisions of the EXCO and general meetings — with their implementation status.",
    stats: () => [
      statTile("Resolutions", DATA.governance.resolutions.length, "On record", ""),
      statTile("Still Open", open, "Not yet implemented", open ? "warning" : "good"),
      statTile("Implemented", DATA.governance.resolutions.length - open, "Closed out", "good"),
      statTile("Linked to Actions", DATA.governance.resolutions.filter((r) => /RES/.test(r[0])).length, "Tracked in the Action Tracker", ""),
    ],
    columns: [{ label: "Ref." }, { label: "Date" }, { label: "Meeting" }, { label: "Decision" }, { label: "Responsible" }, { label: "Due" }, { label: "Status" }],
    rows: () => DATA.governance.resolutions,
    empty: "No resolutions recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`,
      esc(r[2]), `<span style="min-width:220px;display:inline-block;">${esc(r[3])}</span>`, esc(r[4]), `<span class="mono">${esc(r[5])}</span>`, statusPill(r[6])],
    manage: () => listEditor(GOV_EDITORS.resolutions()),
  });
}
function renderGovMeetings(host) { renderGovMeetingList(host, null); }
function renderGovAgm(host) { renderGovMeetingList(host, ["AGM", "SGM"]); }
function renderGovMeetingList(host, kinds) {
  const all = DATA.governance.meetings;
  const rows = kinds ? all.filter((r) => kinds.includes(r[0])) : all;
  const nextAgm = (DATA.governance.calendar || []).find((r) => /general meeting/i.test(r[0]));
  mountRegister(host, {
    title: kinds ? "AGM / SGM Records" : "Meetings Register", importKey: "gov_meetings",
    hint: kinds && nextAgm ? `Next AGM due ${nextAgm[2] || "—"}.` : (kinds ? "Annual and special general meetings." : "All governance meetings and their minute status."),
    columns: [{ label: "Type" }, { label: "Date" }, { label: "Venue" }, { label: "Quorum" }, { label: "Attendance", cls: "num" }, { label: "Minutes" }, { label: "Notes" }],
    rows: () => rows,
    empty: kinds ? "No general meetings recorded." : "No meetings recorded.",
    cell: (r) => [`<span class="pill brand">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`, esc(r[2]),
      statusPill(r[3] || "Pending"), `<span class="mono">${esc(r[4] || "")}</span>`, statusPill(r[5]), `<span style="color:var(--ink-2);">${esc(r[6])}</span>`],
    manage: () => listEditor(GOV_EDITORS.meetings()),
  });
}
function renderGovCoi(host) {
  const outstanding = DATA.governance.coi.filter((r) => r[5] === "Outstanding" || r[5] === "Declared").length;
  mountRegister(host, {
    title: "Conflict-of-Interest Register", importKey: "gov_coi",
    hint: "Interests declared by EXCO and committee members, and how each is managed.",
    stats: () => [
      statTile("Declarations", DATA.governance.coi.length, "On record", ""),
      statTile("Open / Declared", outstanding, "Awaiting a management decision", outstanding ? "warning" : "good"),
      statTile("Managed / Recused", DATA.governance.coi.filter((r) => ["Managed", "Recused"].includes(r[5])).length, "Mitigation in place", "good"),
      statTile("Members Covered", new Set(DATA.governance.coi.map((r) => r[0])).size, "Distinct declarants", ""),
    ],
    columns: [{ label: "Member" }, { label: "Position" }, { label: "Interest" }, { label: "Nature" }, { label: "Declared" }, { label: "Status" }],
    rows: () => DATA.governance.coi,
    empty: "No declarations recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), esc(r[2]),
      `<span style="color:var(--ink-2);">${esc(r[3])}</span>`, `<span class="mono">${esc(r[4])}</span>`, statusPill(r[5])],
    manage: () => listEditor(GOV_EDITORS.coi()),
  });
}
function renderGovCalendar(host) {
  const now = new Date();
  const rows = [...DATA.governance.calendar].sort((a, b) => String(a[2]).localeCompare(String(b[2])));
  const overdue = rows.filter((r) => r[2] && new Date(r[2]) < now && r[5] !== "Done").length;
  const in60 = rows.filter((r) => { if (!r[2]) return false; const d = (new Date(r[2]) - now) / 86400000; return d >= 0 && d <= 60; }).length;
  mountRegister(host, {
    title: "Governance Calendar", importKey: "gov_calendar",
    hint: "Statutory returns, reporting deadlines and recurring governance events.",
    stats: () => [
      statTile("Calendar Items", rows.length, "Tracked deadlines", ""),
      statTile("Overdue", overdue, "Past the due date", overdue ? "critical" : "good"),
      statTile("Due in 60 days", in60, "Coming up", in60 ? "warning" : "good"),
      statTile("Statutory", rows.filter((r) => r[1] === "Statutory").length, "CIPC / SARS / DALRRD", ""),
    ],
    columns: [{ label: "Item" }, { label: "Category" }, { label: "Due" }, { label: "Recurrence" }, { label: "Responsible" }, { label: "Status" }],
    rows: () => rows,
    empty: "No calendar items recorded.",
    cell: (r) => {
      const late = r[2] && new Date(r[2]) < now && r[5] !== "Done";
      return [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
        `<span class="mono" style="${late ? "color:var(--status-critical);font-weight:700;" : ""}">${esc(r[2])}</span>`,
        esc(r[3]), esc(r[4]), statusPill(r[5])];
    },
    manage: () => listEditor(GOV_EDITORS.calendar()),
  });
}

function renderActions() {
  const items = DATA.actions;
  const counts = {};
  items.forEach((i) => (counts[i[5]] = (counts[i[5]] || 0) + 1));
  $("actions-stats").innerHTML = [
    statTile("Open Actions", items.length - (counts.Completed || 0), "Across all toolkits", ""),
    statTile("Overdue", counts.Overdue || 0, "Needs immediate attention", counts.Overdue ? "critical" : "good"),
    statTile("In Progress", counts["In Progress"] || 0, "Currently being worked", "warning"),
    statTile("Completed", counts.Completed || 0, "This cycle", "good"),
  ].join("");

  const filters = ["All", "Overdue", "In Progress", "Not Started", "Completed"];
  const filterRow = $("actions-filters");
  filterRow.innerHTML = filters.map((f) => `<button type="button" data-f="${f}" class="${f === actionsFilter ? "active" : ""}">${f}</button>`).join("");
  filterRow.querySelectorAll("button").forEach((b) => (b.onclick = () => { actionsFilter = b.dataset.f; renderActions(); }));

  const rows = items.filter((i) => actionsFilter === "All" || i[5] === actionsFilter);
  const tbody = $("actions-body");
  tbody.innerHTML = rows.length ? rows.map((row) => {
    const [ref, cat, action, owner, due, status] = row;
    const nDocs = docCount("action", row._id);
    return `
    <tr>
      <td class="mono" style="color:var(--ink-muted);white-space:nowrap;">${esc(ref)}</td>
      <td>${esc(cat)}</td>
      <td style="min-width:220px;">${esc(action)}</td>
      <td>${esc(owner) || "—"}</td>
      <td class="mono" style="white-space:nowrap;">${esc(due) || "—"}</td>
      <td><select class="inline-select" data-ref="${esc(ref)}" aria-label="Status for ${esc(ref)}">${
        ACTION_STATUSES.map((s) => `<option${s === status ? " selected" : ""}>${s}</option>`).join("")}</select></td>
      <td><div class="row-actions">
        <button type="button" data-clip="${esc(ref)}" title="Evidence (${nDocs})" aria-label="Attachments for ${esc(ref)}"
          style="${nDocs ? "color:var(--brand);" : ""}">${CLIP}${nDocs ? `<span style="font-size:10px;font-weight:700;margin-left:1px;">${nDocs}</span>` : ""}</button>
        <button type="button" data-edit="${esc(ref)}" title="Edit" aria-label="Edit action ${esc(ref)}">${PENCIL}</button>
        <button type="button" data-del="${esc(ref)}" title="Delete" aria-label="Delete action ${esc(ref)}">${TRASH}</button>
      </div></td>
    </tr>`;
  }).join("") : emptyRow(7, actionsFilter === "All" ? "No actions yet — add the first one." : "No actions with this status.");

  tbody.querySelectorAll("select[data-ref]").forEach((s) => {
    const before = s.value;
    s.onchange = () => {
      const a = DATA.actions.find((x) => x[0] === s.dataset.ref);
      if (!a) return;
      if (s.value === "Completed" && docCount("action", a._id) === 0) {
        toast("Attach a document (the paperclip) before marking an action Completed.", true);
        s.value = before;
        return;
      }
      a[5] = s.value;
      commit("actions");
    };
  });
  tbody.querySelectorAll("[data-clip]").forEach((b) => (b.onclick = () => {
    const a = DATA.actions.find((x) => x[0] === b.dataset.clip);
    attachmentsModal("action", a._id, "Evidence — " + (a[0] || a[2].slice(0, 40)));
  }));
  tbody.querySelectorAll("[data-edit]").forEach((b) => (b.onclick = () => editAction(b.dataset.edit)));
  tbody.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => deleteAction(b.dataset.del)));
}

function renderMasterFile() {
  const mf = DATA.masterFile;
  const avg = mf.length ? Math.round(mf.reduce((s, r) => s + (+r[3] || 0), 0) / mf.length) : 0;
  const complete = mf.filter((r) => r[3] >= 90).length;
  const sectionFiles = Object.values((DATA._docCounts || {}).masterfile || {}).reduce((s, n) => s + n, 0);
  const generalFiles = ((DATA._docCounts || {}).general || {})._ || 0;
  $("masterfile-stats").innerHTML = [
    statTile("Sections Tracked", mf.length, "Per Master File Index", ""),
    statTile("Overall Completeness", avg + "%", "Weighted across sections", avg >= 70 ? "good" : "warning"),
    statTile("Sections Complete", complete + " / " + mf.length, "", "good"),
    statTile("Files Uploaded", sectionFiles + generalFiles, "Across all sections + general", ""),
  ].join("");
  $("masterfile-grid").innerHTML = mf.length ? mf.map((row) => {
    const [no, name, count, pct] = row;
    const tone = pct >= 90 ? "good" : pct >= 50 ? "warning" : "critical";
    const status = pct >= 90 ? "Complete" : pct >= 50 ? "In Progress" : "Not Started";
    const nf = docCount("masterfile", row._id);
    return `<div class="doc-card">
      <div class="top"><span class="sec">SECTION ${esc(no)}</span>${statusPill(status)}</div>
      <div class="title">${esc(name)}</div>
      <div class="count">${esc(count)}</div>
      <div class="progress"><span style="width:${Math.max(0, Math.min(100, +pct || 0))}%; background:var(--status-${tone});"></span></div>
      <button class="btn" type="button" data-mf-files="${esc(row._id || "")}" style="margin-top:10px;padding:4px 10px;font-size:11px;">
        Files${nf ? ` · ${nf}` : ""}</button>
    </div>`;
  }).join("") : `<p class="muted">No master-file sections tracked yet.</p>`;
  $("masterfile-grid").querySelectorAll("[data-mf-files]").forEach((b) => (b.onclick = () => {
    const r = mf.find((x) => String(x._id) === b.dataset.mfFiles);
    if (r) attachmentsModal("masterfile", r._id, "Files — " + (r[1] || "section " + r[0]));
  }));
  const gb = $("mf-general-btn");
  if (gb) gb.textContent = "General documents" + (generalFiles ? ` · ${generalFiles}` : "");
}

const BENE_TABS = [
  { id: "register", label: "Master Register" },
  { id: "verification", label: "Verification" },
  { id: "households", label: "Households" },
  { id: "succession", label: "Succession" },
  { id: "deceased", label: "Deceased Members" },
  { id: "disputes", label: "Duplicate / Conflict" },
  { id: "evidence", label: "Verification Evidence" },
];
const BENE_PANELS = {
  register: renderBeneRegister, verification: renderBeneVerification, households: renderBeneHouseholds,
  succession: renderBeneSuccession, deceased: renderBeneDeceased, disputes: renderBeneDisputes, evidence: renderBeneEvidence,
};
/* rollups: use the live register when it has rows, else the figures singleton */
function beneRollup() {
  const reg = DATA.beneficiaryCentre.register || [];
  if (!reg.length) return { ...DATA.beneficiary, fromRegister: false };
  const active = reg.filter((r) => r[8] !== "Removed");
  const c = (p) => active.filter(p).length;
  return {
    total: active.length,
    verified: c((r) => r[9] === "Verified"),
    pending: c((r) => r[9] === "Pending"),
    disputed: c((r) => r[9] === "Disputed" || r[9] === "Rejected"),
    female: c((r) => /^f/i.test(r[2])),
    male: c((r) => /^m/i.test(r[2])),
    households: new Set(active.map((r) => r[5]).filter(Boolean)).size,
    succession: (DATA.beneficiaryCentre.succession || []).filter((s) => !["Registered", "Rejected"].includes(s[6])).length,
    fromRegister: true,
  };
}
function renderBeneficiary() {
  const strip = $("beneficiary-subtabs");
  strip.innerHTML = subtabStrip("beneficiary", BENE_TABS);
  wireSubtabs(strip);
  const cur = SUBTAB.beneficiary || "register";
  (BENE_PANELS[cur] || renderBeneRegister)($("beneficiary-body"));
}
const BENE_STATUSES = ["Active", "Deceased", "Removed", "Transferred"];
const VERIF_STATUSES = ["Verified", "Pending", "Disputed", "Rejected"];

function beneStats() {
  const b = beneRollup();
  const t = b.total || 1;
  return [
    statTile("On Register", (b.total || 0).toLocaleString(), b.fromRegister ? "Live count from records" : "From figures", ""),
    statTile("Verified", (b.verified || 0).toLocaleString(), fmtPct(b.verified / t * 100) + " of active", "good"),
    statTile("Pending", (b.pending || 0).toLocaleString(), fmtPct(b.pending / t * 100) + " of active", b.pending ? "warning" : "good"),
    statTile("Disputed / Rejected", (b.disputed || 0).toLocaleString(), fmtPct(b.disputed / t * 100) + " of active", b.disputed ? "critical" : "good"),
  ];
}
function renderBeneRegister(host) {
  mountRegister(host, {
    title: "Master Beneficiary Register", importKey: "beneficiaries", stats: beneStats,
    hint: "One row per registered member. Status and verification drive the Beneficiaries domain of your score.",
    columns: [{ label: "Ref." }, { label: "Full name" }, { label: "Gender" }, { label: "DOB" }, { label: "Household" },
      { label: "Contact" }, { label: "Joined" }, { label: "Status" }, { label: "Verification" }],
    rows: () => DATA.beneficiaryCentre.register,
    empty: "No beneficiaries captured yet — Import a spreadsheet or add them.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`,
      `<span style="font-weight:600;">${esc(r[1])}</span>`, esc(r[2]), `<span class="mono">${esc(r[3])}</span>`,
      `<span class="mono">${esc(r[5])}</span>`, esc(r[6]), `<span class="mono">${esc(r[7])}</span>`,
      statusPill(r[8]), statusPill(r[9])],
    manage: () => listEditor(BENE_EDITORS.register()),
  });
}
function renderBeneVerification(host) {
  const b = beneRollup();
  const t = b.total || 1;
  const reg = DATA.beneficiaryCentre.register || [];
  const byStatus = VERIF_STATUSES.map((s) => ({ s, n: reg.filter((r) => r[9] === s && r[8] !== "Removed").length }));
  const evidence = docCount("beneficiary", null);
  host.innerHTML = `
    <div class="grid grid-4">${beneStats().join("")}</div>
    <div class="split split-bene" style="margin-top:18px;">
      <div class="card">
        <div class="card-head"><h3>Verification status</h3>${CAN_EDIT ? `<button class="btn" id="bene-edit-figures" type="button">Edit fallback figures</button>` : ""}</div>
        <div class="chart-wrap">${donut([
          { value: b.verified, color: "var(--status-good)" },
          { value: b.pending, color: "var(--status-warning)" },
          { value: b.disputed, color: "var(--status-critical)" },
        ])}<div class="legend">
          <span class="sw"><i style="background:var(--status-good)"></i>Verified</span>
          <span class="sw"><i style="background:var(--status-warning)"></i>Pending</span>
          <span class="sw"><i style="background:var(--status-critical)"></i>Disputed / Rejected</span></div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Breakdown</h3>
          <button class="btn view-ok" id="bene-evidence-btn" type="button">Evidence library${evidence ? ` · ${evidence}` : ""}</button></div>
        <table><tbody>${byStatus.map((x) => `<tr><td>${statusPill(x.s)}</td>
          <td class="num mono" style="font-weight:600;">${x.n}</td>
          <td style="color:var(--ink-muted);">${fmtPct(x.n / t * 100)}</td></tr>`).join("")}</tbody></table>
        <dl class="kv" style="margin-top:14px;">
          <dt>Households represented</dt><dd>${(b.households || 0).toLocaleString()}</dd>
          <dt>Female / Male</dt><dd>${b.female || 0} / ${b.male || 0}</dd>
          <dt>Succession cases open</dt><dd>${b.succession || 0}</dd>
        </dl>
      </div>
    </div>`;
  const ef = host.querySelector("#bene-edit-figures");
  if (ef) ef.onclick = editBeneficiary;
  host.querySelector("#bene-evidence-btn").onclick = () => attachmentsModal("beneficiary", null, "Beneficiary verification evidence");
}
function renderBeneHouseholds(host) {
  const reg = DATA.beneficiaryCentre.register || [];
  mountRegister(host, {
    title: "Household Records", importKey: "households",
    hint: "Each household and its head; members are linked from the register by household ref.",
    columns: [{ label: "Ref." }, { label: "Head of household" }, { label: "Members", cls: "num" }, { label: "On register", cls: "num" },
      { label: "Village" }, { label: "Portion" }, { label: "Contact" }, { label: "Status" }],
    rows: () => DATA.beneficiaryCentre.households,
    empty: "No households recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`,
      `<span style="font-weight:600;">${esc(r[1])}</span>`, `<span class="mono">${esc(r[2])}</span>`,
      `<span class="mono">${reg.filter((x) => x[5] === r[0] && x[8] !== "Removed").length}</span>`,
      esc(r[3]), esc(r[4]), esc(r[5]), statusPill(r[6])],
    manage: () => listEditor(BENE_EDITORS.households()),
  });
}
function renderBeneSuccession(host) {
  const s = DATA.beneficiaryCentre.succession;
  const open = s.filter((r) => !["Registered", "Rejected"].includes(r[6])).length;
  mountRegister(host, {
    title: "Succession Cases", importKey: "succession_cases",
    hint: "Transfer of membership on the death of a beneficiary.",
    stats: () => [
      statTile("Cases", s.length, "On record", ""),
      statTile("Open", open, "Not yet registered", open ? "warning" : "good"),
      statTile("Registered", s.filter((r) => r[6] === "Registered").length, "Completed", "good"),
      statTile("Awaiting nominee", s.filter((r) => !r[3] || /not yet/i.test(r[3])).length, "No successor named", ""),
    ],
    columns: [{ label: "Deceased ref." }, { label: "Deceased" }, { label: "Date of death" }, { label: "Successor" }, { label: "Relationship" }, { label: "Lodged" }, { label: "Status" }],
    rows: () => s,
    empty: "No succession cases recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span style="font-weight:600;">${esc(r[1])}</span>`,
      `<span class="mono">${esc(r[2])}</span>`, esc(r[3]), esc(r[4]), `<span class="mono">${esc(r[5])}</span>`, statusPill(r[6])],
    manage: () => listEditor(BENE_EDITORS.succession()),
  });
}
function renderBeneDeceased(host) {
  const reg = DATA.beneficiaryCentre.register || [];
  const dead = reg.filter((r) => r[8] === "Deceased");
  const sMap = {};
  (DATA.beneficiaryCentre.succession || []).forEach((s) => { if (s[0]) sMap[s[0]] = s[6]; });
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Deceased on register", dead.length, "Status = Deceased", "")}
      ${statTile("Succession lodged", dead.filter((r) => sMap[r[0]]).length, "Linked case exists", "")}
      ${statTile("No succession case", dead.filter((r) => !sMap[r[0]]).length, "Needs a case opened", dead.filter((r) => !sMap[r[0]]).length ? "warning" : "good")}
      ${statTile("Registered successions", Object.values(sMap).filter((v) => v === "Registered").length, "Completed transfers", "good")}
    </div>
    <div class="card-head" style="margin:18px 0 10px;"><div><h3 style="font-size:13px;">Deceased Members</h3>
      <span class="hint">Set a member's status to "Deceased" in the Master Register; open a case in Succession.</span></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Ref.</th><th>Full name</th><th>Household</th><th>Joined</th><th>Succession case</th></tr></thead>
      <tbody>${dead.length ? dead.map((r) => `<tr>
        <td class="mono" style="color:var(--ink-muted);">${esc(r[0])}</td>
        <td style="font-weight:600;">${esc(r[1])}</td>
        <td class="mono">${esc(r[5])}</td>
        <td class="mono">${esc(r[7])}</td>
        <td>${sMap[r[0]] ? statusPill(sMap[r[0]]) : `<span class="pill critical">None</span>`}</td>
      </tr>`).join("") : emptyRow(5, "No members marked deceased.")}</tbody>
    </table></div>`;
}
const DISPUTE_TYPES = ["Duplicate", "Identity", "Membership", "Boundary", "Other"];
function renderBeneDisputes(host) {
  const d = DATA.beneficiaryCentre.disputes;
  const open = d.filter((r) => !["Resolved"].includes(r[5])).length;
  mountRegister(host, {
    title: "Duplicate / Conflict Cases", importKey: "beneficiary_disputes",
    hint: "Duplicate records, identity mismatches, membership claims and boundary disputes.",
    stats: () => [
      statTile("Cases", d.length, "On record", ""),
      statTile("Open", open, "Unresolved", open ? "critical" : "good"),
      statTile("Duplicates", d.filter((r) => r[1] === "Duplicate").length, "Suspected duplicate records", ""),
      statTile("Resolved", d.filter((r) => r[5] === "Resolved").length, "Closed out", "good"),
    ],
    columns: [{ label: "Ref." }, { label: "Type" }, { label: "Parties" }, { label: "Description" }, { label: "Raised" }, { label: "Status" }],
    rows: () => d,
    empty: "No cases recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
      esc(r[2]), `<span style="color:var(--ink-2);min-width:220px;display:inline-block;">${esc(r[3])}</span>`,
      `<span class="mono">${esc(r[4])}</span>`, statusPill(r[5])],
    manage: () => listEditor(BENE_EDITORS.disputes()),
  });
}
function renderBeneEvidence(host) {
  mountFileList(host, "beneficiary", null, "Verification Evidence",
    "Certified IDs, proof of residence, verification meeting minutes and the signed beneficiary list.");
}

function renderAssets() {
  const a = DATA.assets;
  const active = a.land.filter((r) => r[4] === "Active").length;
  const leases = a.leases || [];
  const alloc = a.allocations || [];
  const leaseAlert = leases.filter((r) => ["Expiring Soon", "Expired", "Under Negotiation"].includes(r[7])).length;
  const allocHa = alloc.reduce((s, r) => s + (+r[3] || 0), 0);
  $("assets-stats").innerHTML = [
    statTile("Land Portions", a.land.length, (+DATA.cpa.landExtent || 0).toLocaleString() + " ha total", ""),
    statTile("Portions Actively Used", active + " / " + a.land.length, "", "good"),
    statTile("Active Leases", leases.filter((r) => r[7] === "Active").length + " / " + leases.length, leaseAlert ? leaseAlert + " need attention" : "All current", leaseAlert ? "warning" : "good"),
    statTile("Land Allocated to Beneficiaries", allocHa.toLocaleString() + " ha", alloc.length + " allocation" + (alloc.length === 1 ? "" : "s"), ""),
  ].join("");
  $("assets-land").innerHTML = a.land.length ? a.land.map(([p, use, ha, lease, status]) =>
    `<tr><td style="font-weight:600;">${esc(p)}</td><td>${esc(use)}</td><td class="num mono">${(+ha || 0).toLocaleString()}</td><td style="color:var(--ink-2);">${esc(lease)}</td><td>${statusPill(status)}</td></tr>`).join("") : emptyRow(5, "No land portions recorded.");
  $("assets-movable").innerHTML = a.movable.length ? a.movable.map(([cls, count, cond]) =>
    `<tr><td>${esc(cls)}</td><td class="num mono">${esc(count)}</td><td style="color:var(--ink-2);">${esc(cond)}</td></tr>`).join("") : emptyRow(3, "No movable assets recorded.");
  $("assets-permits").innerHTML = a.permits.length ? a.permits.map(([name, valid, status]) =>
    `<tr><td>${esc(name)}</td><td class="mono">${esc(valid)}</td><td>${statusPill(status)}</td></tr>`).join("") : emptyRow(3, "No permits recorded.");

  $("assets-leases").innerHTML = leases.length ? leases.map(([party, portion, use, ha, start, end, rental, status]) =>
    `<tr><td style="font-weight:600;">${esc(party)}</td><td>${esc(portion)}</td><td style="color:var(--ink-2);">${esc(use)}</td><td class="num mono">${(+ha || 0).toLocaleString()}</td><td class="mono">${esc(start)} – ${esc(end)}</td><td class="num mono">${(+rental || 0).toLocaleString()}</td><td>${statusPill(status)}</td></tr>`).join("") : emptyRow(7, "No land leases recorded.");

  $("assets-allocations").innerHTML = alloc.length ? alloc.map(([bene, portion, purpose, ha, date, ref, status]) =>
    `<tr><td style="font-weight:600;">${esc(bene)}</td><td>${esc(portion)}</td><td style="color:var(--ink-2);">${esc(purpose)}</td><td class="num mono">${(+ha || 0).toLocaleString()}</td><td class="mono">${esc(date)}</td><td class="mono">${esc(ref)}</td><td>${statusPill(status)}</td></tr>`).join("") : emptyRow(7, "No beneficiary land allocations recorded.");
}

function renderFinance() {
  const f = DATA.finance;
  const netYtd = f.ytdIncomeActual - f.ytdExpActual;
  const pctOf = (a, b) => (b ? fmtPct(a / b * 100) : "0%");
  $("finance-stats").innerHTML = [
    statTile("Annual Budget", fmtR(f.annualBudget), "Total planned expenditure", ""),
    statTile("YTD Income", fmtR(f.ytdIncomeActual), pctOf(f.ytdIncomeActual, f.ytdIncomeBudget) + " of YTD budget", f.ytdIncomeActual >= f.ytdIncomeBudget * 0.9 ? "good" : "warning"),
    statTile("YTD Expenditure", fmtR(f.ytdExpActual), pctOf(f.ytdExpActual, f.ytdExpBudget) + " of YTD budget", f.ytdExpActual <= f.ytdExpBudget ? "good" : "warning"),
    statTile("Cash Balance", fmtR(f.cashBalance), (netYtd >= 0 ? "+" : "") + fmtR(netYtd) + " YTD net position", netYtd >= 0 ? "good" : "critical"),
  ].join("");
  lineChart("finance-line", f.cashMonths, f.cashTrend);
  $("finance-bars").innerHTML = f.categories.length ? barRows(
    f.categories.map(([name, budget, actual]) => ({
      label: name, value: actual, max: budget || 1,
      cls: budget && actual / budget > 1 ? "critical" : budget && actual / budget < 0.4 ? "warning" : "",
    })),
    { fmtVal: (it) => (it.max ? fmtPct(it.value / it.max * 100) : "—") }
  ) : `<p class="muted">No budget categories recorded.</p>`;
}

function renderProjects() {
  const p = DATA.projects;
  const totalBudget = p.reduce((s, r) => s + (+r[2] || 0), 0);
  const totalSpent = p.reduce((s, r) => s + (+r[3] || 0), 0);
  $("projects-stats").innerHTML = [
    statTile("Active Projects", p.length, "In pipeline", ""),
    statTile("Total Project Budget", fmtR(totalBudget), "", ""),
    statTile("Total Spent", fmtR(totalSpent), (totalBudget ? fmtPct(totalSpent / totalBudget * 100) : "0%") + " of pipeline budget", ""),
    statTile("At Risk", p.filter((r) => r[5] === "At Risk").length, "Needs Committee attention", p.filter((r) => r[5] === "At Risk").length ? "warning" : "good"),
  ].join("");
  const tbody = $("projects-body");
  tbody.innerHTML = p.length ? p.map(([name, stage, budget, spent, pct, status], i) => `
    <tr>
      <td style="font-weight:600;">${esc(name)}</td>
      <td><span class="pill brand">${esc(stage)}</span></td>
      <td class="num mono">${(+budget || 0).toLocaleString()}</td>
      <td class="num mono">${(+spent || 0).toLocaleString()}</td>
      <td style="min-width:140px;"><div class="progress"><span style="width:${Math.max(0, Math.min(100, +pct || 0))}%"></span></div></td>
      <td>${statusPill(status)}</td>
      <td><div class="row-actions">
        <button type="button" data-e="${i}" title="Edit" aria-label="Edit project">${PENCIL}</button>
        <button type="button" data-d="${i}" title="Delete" aria-label="Delete project">${TRASH}</button>
      </div></td>
    </tr>`).join("") : emptyRow(7, "No projects in the pipeline yet.");
  tbody.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editProject(+b.dataset.e)));
  tbody.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => deleteProject(+b.dataset.d)));
}

function renderImpact() {
  const i = DATA.impact;
  const hTotal = i.hectaresTotal || 1;
  const yr = new Date().getFullYear();
  $("impact-stats").innerHTML = [
    statTile(`Jobs Created (FTE) — ${yr}`, i.jobsThisYear, i.jobsCumulative + " cumulative since Gate 2", "good"),
    statTile("Households Benefiting", i.householdsBenefit, fmtPct(i.householdsBenefit / (i.householdsTotal || 1) * 100) + " of represented households", ""),
    statTile("Enterprise Revenue", fmtR(i.revenue), "Annual, CPA-run enterprises", ""),
    statTile("Training Beneficiaries", i.training, "This year", ""),
  ].join("");
  $("impact-bars").innerHTML = i.jobsByYear.length ? barRows(
    i.jobsByYear.map(([y, v]) => ({ label: y, value: v, max: Math.max(1, ...i.jobsByYear.map((x) => x[1])) })),
    { fmtVal: (it) => it.value + " FTE" }
  ) : `<p class="muted">No yearly job figures recorded.</p>`;
  const pct = i.hectaresActive / hTotal * 100;
  $("impact-land-bar").style.width = Math.max(0, Math.min(100, pct)) + "%";
  $("impact-land-val").textContent = fmtPct(pct);
  $("impact-land-note").textContent =
    `${(+i.hectaresActive || 0).toLocaleString()} ha of the CPA's ${(+i.hectaresTotal || 0).toLocaleString()} ha land extent is under active agricultural, forestry or livestock production this year.`;
}

/* ============ Executive Dashboard ============ */
function domainByName(n) { return DATA.score.domains.find((d) => d.name === n) || { achieved: 0, weight: 1 }; }
function healthTone(pct) { return pct >= 75 ? "good" : pct >= 45 ? "warning" : "critical"; }

function renderExec() {
  const total = scoreTotal();
  const band = maturityBand(total);
  const stage = DATA.gates.find((g) => g.state === "current") || DATA.gates[0] || { n: 1, name: "Assess" };
  const jb = JOURNEY.find((s) => s.n === stage.n) || JOURNEY[0];

  $("exec-hero").innerHTML = `
    <div class="exec-hero-card">
      <div class="ehc-num">${total}<span>/100</span></div>
      <div class="ehc-lbl">Institutional Score</div>
      <div class="pill brand" style="margin-top:8px;">${esc(band.name)} band</div>
    </div>
    <div class="exec-hero-card">
      <div class="ehc-num">${stage.n}<span>/7</span></div>
      <div class="ehc-lbl">Current Stage — ${esc(jb.key)}</div>
      <div class="hint" style="margin-top:8px;max-width:34ch;">${esc(jb.blurb)}</div>
    </div>`;

  // health indicators — one per domain group
  const H = [
    ["Governance", ["Governance"]],
    ["Beneficiaries", ["Beneficiaries"]],
    ["Administration", ["Administration"]],
    ["Finance", ["Finance"]],
    ["Land & Assets", ["Land & Assets"]],
    ["Productivity", ["Productivity"]],
    ["Commercial", ["Commercialisation"]],
    ["Compliance", ["Compliance"]],
  ];
  $("exec-health").innerHTML = H.map(([label, names]) => {
    const w = names.reduce((s, n) => s + (+domainByName(n).weight || 0), 0) || 1;
    const a = names.reduce((s, n) => s + (+domainByName(n).achieved || 0), 0);
    const pct = Math.round((a / w) * 100);
    return `<div class="health-cell">
      <div class="hc-top"><span>${esc(label)}</span><span class="mono">${pct}%</span></div>
      <div class="bar-track"><div class="bar-fill ${healthTone(pct)}" style="width:${Math.max(3, pct)}%"></div></div>
    </div>`;
  }).join("");

  // critical actions
  const now = new Date();
  const crit = DATA.actions
    .map((a) => ({ a, days: a[4] ? (new Date(a[4]) - now) / 86400000 : 999 }))
    .filter((x) => x.a[5] === "Overdue" || (x.a[5] !== "Completed" && x.days <= 30))
    .sort((x, y) => x.days - y.days).slice(0, 6);
  $("exec-actions").innerHTML = crit.length ? crit.map(({ a }) => `
    <li><span class="ea-cat">${esc(a[1] || "—")}</span>
      <span class="ea-desc">${esc(a[2])}</span>
      <span>${statusPill(a[5])}</span>
      <span class="mono ea-due">${esc(a[4] || "")}</span></li>`).join("")
    : `<li class="muted">No overdue or imminent actions. </li>`;

  // governance deadlines — from actions in the Governance category with a future date
  const deadlines = DATA.actions
    .filter((a) => a[5] !== "Completed" && a[4] && new Date(a[4]) >= now)
    .sort((x, y) => new Date(x[4]) - new Date(y[4])).slice(0, 5);
  $("exec-deadlines").innerHTML = deadlines.length ? deadlines.map((a) => `
    <li><span class="mono ea-due">${esc(a[4])}</span><span class="ea-desc">${esc(a[2])}</span>
      <span class="ea-cat">${esc(a[3] || a[1] || "")}</span></li>`).join("")
    : `<li class="muted">No upcoming deadlines recorded.</li>`;

  // financial alerts
  const f = DATA.finance;
  const fa = [];
  if (f.ytdExpActual > f.ytdExpBudget) fa.push(["critical", `Expenditure is over YTD budget by ${fmtR(f.ytdExpActual - f.ytdExpBudget)}.`]);
  if (f.ytdIncomeActual < f.ytdIncomeBudget * 0.9) fa.push(["warning", `Income is ${fmtPct((1 - f.ytdIncomeActual / (f.ytdIncomeBudget || 1)) * 100)} below the YTD income budget.`]);
  const runway = f.ytdExpActual ? f.cashBalance / (f.ytdExpActual / 9) : null;  // rough months
  if (runway != null && runway < 3) fa.push(["critical", `Cash runway is about ${runway.toFixed(1)} months at the current burn rate.`]);
  (f.categories || []).forEach(([n, b, ac]) => { if (b && ac / b > 1.1) fa.push(["warning", `"${n}" is ${fmtPct((ac / b - 1) * 100)} over its annual budget.`]); });
  $("exec-finance").innerHTML = fa.length ? fa.slice(0, 5).map(([tone, m]) =>
    `<li>${pill(tone === "critical" ? "Alert" : "Watch", tone)}<span class="ea-desc">${esc(m)}</span></li>`).join("")
    : `<li class="muted">No financial alerts — budget and cash within tolerance.</li>`;

  // project status
  const p = DATA.projects;
  $("exec-projects").innerHTML = p.length ? p.slice(0, 6).map(([name, stg, budget, spent, pct, status]) => `
    <li><span class="ea-desc">${esc(name)}</span>
      <span class="pill brand">${esc(stg)}</span>
      <span style="min-width:90px;"><div class="progress"><span style="width:${Math.max(0, Math.min(100, +pct || 0))}%"></span></div></span>
      <span>${statusPill(status)}</span></li>`).join("")
    : `<li class="muted">No projects in the pipeline.</li>`;

  // recent documents
  renderExecDocs();
}

async function renderExecDocs() {
  const el = $("exec-docs");
  if (!el) return;
  try {
    const { data } = await repo.recentDocs(orgId, 6);
    el.innerHTML = (data && data.length) ? data.map((d) => `
      <li><span class="ea-cat">${esc(d.section)}</span>
        <span class="ea-desc">${esc(d.name)}</span>
        <span class="mono ea-due">${esc((d.uploaded_at || "").slice(0, 10))}</span></li>`).join("")
      : `<li class="muted">No documents uploaded yet.</li>`;
  } catch (e) { el.innerHTML = `<li class="muted">Couldn't load documents.</li>`; }
}

/* ============ CPA360 Journey ============ */
function renderJourney() {
  const curN = (DATA.gates.find((g) => g.state === "current") || { n: 1 }).n;
  $("journey-list").innerHTML = JOURNEY.map((s) => {
    const g = DATA.gates.find((x) => x.n === s.n) || { state: "upcoming", name: s.key };
    const cls = g.state === "done" ? "done" : g.state === "current" ? "current" : "";
    return `<div class="journey-step ${cls}">
      <div class="js-rail"><div class="js-dot">${g.state === "done" ? "✓" : s.n}</div></div>
      <div class="js-body">
        <div class="js-head"><h3>${esc((g.name || s.key).toUpperCase())}</h3>
          ${g.state === "current" ? '<span class="pill brand">Current stage</span>' : g.state === "done" ? '<span class="pill good">Complete</span>' : ""}</div>
        <p>${esc(s.blurb)}</p>
      </div>
    </div>`;
  }).join("");
  const cur = JOURNEY.find((s) => s.n === curN) || JOURNEY[0];
  $("journey-note").innerHTML =
    `This CPA is at <strong>Stage ${curN} — ${esc(cur.key)}</strong>. ` +
    (curN < 7 ? `Next: <strong>${esc(JOURNEY[curN].key)}</strong>.` : `The final stage — focus on sustaining investment readiness.`);
}
function editJourney() {
  const cur = DATA.gates.find((g) => g.state === "current") || DATA.gates[0];
  openModal("Set current stage", [
    { key: "stage", label: "Current stage", type: "select",
      options: JOURNEY.map((s) => `${s.n} — ${s.key}`),
      value: `${cur.n} — ${(JOURNEY.find((s) => s.n === cur.n) || {}).key || cur.name}` },
  ], (out) => {
    const n = parseInt(out.stage);
    DATA.gates.forEach((g) => {
      const j = JOURNEY.find((s) => s.n === g.n);
      if (j) g.name = j.key;
      g.state = g.n < n ? "done" : g.n === n ? "current" : "upcoming";
    });
    commit("gates");
  });
}

/* ============ Institutional Performance ============ */
function critFor(name) { return (DATA.score.criteria || []).filter((c) => c.domain === name); }
function domainScore(d) {
  if (d.detailed) return Math.round(critFor(d.name).reduce((s, c) => s + (+c.achieved || 0), 0));
  return +d.achieved || 0;
}
function renderScore() {
  const total = DATA.score.domains.reduce((s, d) => s + domainScore(d), 0);
  const band = maturityBand(total);
  $("score-gauge").innerHTML = scoreGauge(total, 100);
  $("score-band-pill").textContent = band.name + " maturity band";
  const sd = $("score-doc-btn");
  if (sd) sd.textContent = "Assessment doc" + (docCount("score", null) ? ` · ${docCount("score", null)}` : "");

  $("score-domains").innerHTML = DATA.score.domains.map((d) => {
    const sc = domainScore(d);
    const pct = Math.round((sc / (d.weight || 1)) * 100);
    const crits = critFor(d.name);
    const rows = d.detailed && crits.length ? `<ul class="crit-list">${crits.map((c) => {
      const cp = Math.round((+c.achieved || 0) / (c.weight || 1) * 100);
      return `<li><span class="crit-name">${esc(c.name)}</span>
        <span class="bar-track sm"><span class="bar-fill ${healthTone(cp)}" style="width:${Math.max(3, cp)}%"></span></span>
        <span class="mono crit-val">${(+c.achieved || 0)}/${c.weight}</span></li>`;
    }).join("")}</ul>` : "";
    return `<div class="domain-card">
      <div class="dc-head">
        <div><h3>${esc(d.name)}</h3><span class="hint">${d.detailed ? crits.length + " criteria" : "single score"}</span></div>
        <div class="dc-score"><span class="num">${sc}</span><span class="mono">/${d.weight}</span>
          <button class="btn dc-edit" data-domain="${esc(d.name)}" type="button">Score</button></div>
      </div>
      <div class="bar-track"><div class="bar-fill ${healthTone(pct)}" style="width:${Math.max(3, pct)}%"></div></div>
      ${rows}
    </div>`;
  }).join("");
  $("score-domains").querySelectorAll(".dc-edit").forEach((b) => (b.onclick = () => editDomain(b.dataset.domain)));

  $("score-bands").innerHTML = DATA.score.bands.map(([b, r, dsc]) => {
    const here = b === band.name;
    return `<tr${here ? ' style="background:var(--brand-tint);"' : ""}>
      <td style="font-weight:700;">${esc(b)}${here ? ' &nbsp;<span class="pill brand">Current</span>' : ""}</td>
      <td class="mono">${esc(r)}</td><td style="color:var(--ink-2);">${esc(dsc)}</td></tr>`;
  }).join("");
}
function editDomain(name) {
  const d = DATA.score.domains.find((x) => x.name === name);
  if (!d) return;
  const crits = critFor(name);
  const fields = [
    { key: "detailed", label: "Scoring method", type: "select", options: ["Single score", "Detailed rubric"],
      value: d.detailed ? "Detailed rubric" : "Single score" },
  ];
  if (crits.length) {
    crits.forEach((c, i) => fields.push({
      key: "c" + i, label: `${c.name} (of ${c.weight})`, type: "number", value: +c.achieved || 0,
    }));
  }
  fields.push({ key: "single", label: `Overall domain score (of ${d.weight}) — used for "Single score"`, type: "number", value: +d.achieved || 0 });
  openModal(`Score — ${name}`, fields, (out) => {
    d.detailed = out.detailed === "Detailed rubric";
    crits.forEach((c, i) => {
      let v = parseFloat(out["c" + i]);
      if (!isNaN(v)) c.achieved = Math.max(0, Math.min(c.weight, v));
    });
    let sv = parseFloat(out.single);
    if (!isNaN(sv)) d.achieved = Math.max(0, Math.min(d.weight, sv));
    if (d.detailed && crits.length) d.achieved = Math.round(crits.reduce((s, c) => s + (+c.achieved || 0), 0));
    commit("score");
  });
}

/* ============ Productivity Centre (scaffold) ============ */
function renderProductivity() {
  $("productivity-body").innerHTML = comingSoon("Productivity Centre", [
    "Enterprises — crops, orchards, timber, livestock",
    "Water — sources, allocation and usage",
    "Labour, inputs and harvest records",
    "Sales and cost of production per enterprise",
  ], "Productivity ties directly into the Productivity domain of your institutional score.");
}
function comingSoon(title, items, foot) {
  return `<div class="card coming-soon">
    <h3>${esc(title)} — being built</h3>
    <p class="hint">This register is part of the CPA360™ build sequence. It will capture:</p>
    <ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>
    ${foot ? `<p class="hint" style="margin-top:10px;">${esc(foot)}</p>` : ""}
  </div>`;
}

const RENDERERS = {
  exec: renderExec, score: renderScore, journey: renderJourney,
  profile: renderProfile, beneficiary: renderBeneficiary, finance: renderFinance,
  assets: renderAssets, productivity: renderProductivity, projects: renderProjects,
  masterfile: renderMasterFile, actions: renderActions, impact: renderImpact,
};

/* CSV import specs — map spreadsheet columns onto each collection's row shape */
const IMPORT = {
  actions: {
    title: "actions", section: "actions", arr: () => DATA.actions,
    targets: [
      { k: "ref", label: "Ref" }, { k: "category", label: "Category" },
      { k: "description", label: "Action", required: true }, { k: "owner", label: "Owner" },
      { k: "due", label: "Due date" }, { k: "status", label: "Status" },
    ],
    make: (v) => {
      const r = [v.ref || nextActionRef(), v.category || "Governance", v.description,
        v.owner || "", v.due || "", ACTION_STATUSES.includes(v.status) ? v.status : "Not Started"];
      return r;
    },
  },
  committee: {
    title: "EXCO & office bearers", section: "committee", arr: () => DATA.committee,
    targets: [{ k: "body", label: "Body (EXCO / Office Bearer)" }, { k: "role", label: "Role", required: true },
      { k: "name", label: "Name", required: true }, { k: "term", label: "Term" }],
    make: (v) => [v.role, v.name, v.term || "", v.body || "EXCO"],
  },
  gov_committees: {
    title: "sub-committees", section: "gov_committees", arr: () => DATA.governance.committees,
    targets: [{ k: "name", label: "Committee", required: true }, { k: "mandate", label: "Mandate" }, { k: "chair", label: "Chair" },
      { k: "members", label: "Members" }, { k: "cadence", label: "Cadence" }, { k: "status", label: "Status" }],
    make: (v) => [v.name, v.mandate || "", v.chair || "", parseFloat(v.members) || 0, v.cadence || "", v.status || "Active"],
  },
  gov_resolutions: {
    title: "resolutions", section: "gov_resolutions", arr: () => DATA.governance.resolutions,
    targets: [{ k: "ref", label: "Ref" }, { k: "date", label: "Date" }, { k: "meeting", label: "Meeting" },
      { k: "decision", label: "Decision", required: true }, { k: "responsible", label: "Responsible" },
      { k: "due", label: "Due date" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", v.date || "", v.meeting || "", v.decision, v.responsible || "", v.due || "", v.status || "Open"],
  },
  gov_meetings: {
    title: "meetings", section: "gov_meetings", arr: () => DATA.governance.meetings,
    targets: [{ k: "kind", label: "Type (EXCO / AGM / SGM)" }, { k: "date", label: "Date", required: true }, { k: "venue", label: "Venue" },
      { k: "quorum", label: "Quorum" }, { k: "attendance", label: "Attendance" }, { k: "minutes", label: "Minutes status" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.kind || "EXCO", v.date || "", v.venue || "", v.quorum || "", parseFloat(v.attendance) || 0, v.minutes || "Pending", v.notes || ""],
  },
  gov_coi: {
    title: "conflict-of-interest declarations", section: "gov_coi", arr: () => DATA.governance.coi,
    targets: [{ k: "member", label: "Member", required: true }, { k: "position", label: "Position" }, { k: "interest", label: "Interest" },
      { k: "nature", label: "Nature" }, { k: "declared", label: "Declared on" }, { k: "status", label: "Status" }],
    make: (v) => [v.member, v.position || "", v.interest || "", v.nature || "", v.declared || "", v.status || "Declared"],
  },
  gov_calendar: {
    title: "governance calendar", section: "gov_calendar", arr: () => DATA.governance.calendar,
    targets: [{ k: "item", label: "Item", required: true }, { k: "category", label: "Category" }, { k: "due", label: "Due date" },
      { k: "recurrence", label: "Recurrence" }, { k: "responsible", label: "Responsible" }, { k: "status", label: "Status" }],
    make: (v) => [v.item, v.category || "Statutory", v.due || "", v.recurrence || "", v.responsible || "", v.status || "Upcoming"],
  },
  beneficiaries: {
    title: "beneficiaries", section: "beneficiaries", arr: () => DATA.beneficiaryCentre.register,
    targets: [{ k: "ref", label: "Register no." }, { k: "name", label: "Full name", required: true }, { k: "gender", label: "Gender" },
      { k: "dob", label: "Date of birth" }, { k: "idm", label: "ID (masked)" }, { k: "hh", label: "Household ref" },
      { k: "contact", label: "Contact" }, { k: "joined", label: "Joined on" }, { k: "status", label: "Status" }, { k: "verif", label: "Verification" }],
    make: (v) => [v.ref || "", v.name, v.gender || "", v.dob || "", v.idm || "", v.hh || "", v.contact || "", v.joined || "",
      ["Active", "Deceased", "Removed", "Transferred"].includes(v.status) ? v.status : "Active",
      ["Verified", "Pending", "Disputed", "Rejected"].includes(v.verif) ? v.verif : "Pending", ""],
  },
  households: {
    title: "households", section: "households", arr: () => DATA.beneficiaryCentre.households,
    targets: [{ k: "ref", label: "Household ref" }, { k: "head", label: "Head of household", required: true }, { k: "members", label: "Members" },
      { k: "village", label: "Village" }, { k: "portion", label: "Portion" }, { k: "contact", label: "Contact" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", v.head, parseFloat(v.members) || 0, v.village || "", v.portion || "", v.contact || "", v.status || "Active"],
  },
  succession_cases: {
    title: "succession cases", section: "succession_cases", arr: () => DATA.beneficiaryCentre.succession,
    targets: [{ k: "dref", label: "Deceased ref" }, { k: "dname", label: "Deceased name", required: true }, { k: "dod", label: "Date of death" },
      { k: "succ", label: "Successor" }, { k: "rel", label: "Relationship" }, { k: "lodged", label: "Lodged on" }, { k: "status", label: "Status" }],
    make: (v) => [v.dref || "", v.dname, v.dod || "", v.succ || "", v.rel || "", v.lodged || "", v.status || "Lodged", ""],
  },
  beneficiary_disputes: {
    title: "duplicate / conflict cases", section: "beneficiary_disputes", arr: () => DATA.beneficiaryCentre.disputes,
    targets: [{ k: "ref", label: "Case ref" }, { k: "dtype", label: "Type" }, { k: "parties", label: "Parties" },
      { k: "desc", label: "Description" }, { k: "raised", label: "Raised on" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", v.dtype || "Duplicate", v.parties || "", v.desc || "", v.raised || "", v.status || "Open", ""],
  },
  masterfile: {
    title: "master-file sections", section: "masterfile", arr: () => DATA.masterFile,
    targets: [{ k: "no", label: "Section no." }, { k: "name", label: "Name", required: true },
      { k: "count", label: "Document count" }, { k: "pct", label: "Completeness %" }],
    make: (v) => [v.no || "", v.name, v.count || "", Math.max(0, Math.min(100, parseFloat(v.pct) || 0))],
  },
  land: {
    title: "land portions", section: "land", arr: () => DATA.assets.land,
    targets: [{ k: "portion", label: "Portion", required: true }, { k: "use", label: "Primary use" },
      { k: "ha", label: "Extent (ha)" }, { k: "lease", label: "Lease / tenure" }, { k: "status", label: "Status" }],
    make: (v) => [v.portion, v.use || "", parseFloat(v.ha) || 0, v.lease || "", v.status || "Active"],
  },
  leases: {
    title: "land leases", section: "leases", arr: () => DATA.assets.leases,
    targets: [{ k: "party", label: "Lessee / party", required: true }, { k: "portion", label: "Land / portion" },
      { k: "use", label: "Land use" }, { k: "ha", label: "Area (ha)" }, { k: "start", label: "Start date" },
      { k: "end", label: "End date" }, { k: "rental", label: "Annual rental" }, { k: "status", label: "Status" }],
    make: (v) => [v.party, v.portion || "", v.use || "", parseFloat(v.ha) || 0, v.start || "", v.end || "",
      parseFloat((v.rental || "").replace(/[^\d.-]/g, "")) || 0, v.status || "Active"],
  },
  allocations: {
    title: "beneficiary land allocations", section: "allocations", arr: () => DATA.assets.allocations,
    targets: [{ k: "beneficiary", label: "Beneficiary / household", required: true }, { k: "portion", label: "Land / portion" },
      { k: "purpose", label: "Purpose" }, { k: "ha", label: "Area (ha)" }, { k: "date", label: "Allocated on" },
      { k: "ref", label: "Agreement ref." }, { k: "status", label: "Status" }],
    make: (v) => [v.beneficiary, v.portion || "", v.purpose || "", parseFloat(v.ha) || 0, v.date || "", v.ref || "", v.status || "Active"],
  },
  movable: {
    title: "movable assets", section: "movable", arr: () => DATA.assets.movable,
    targets: [{ k: "cls", label: "Asset class", required: true }, { k: "count", label: "Count" }, { k: "cond", label: "Condition" }],
    make: (v) => [v.cls, parseFloat(v.count) || 0, v.cond || ""],
  },
  permits: {
    title: "permits", section: "permits", arr: () => DATA.assets.permits,
    targets: [{ k: "name", label: "Permit / license", required: true }, { k: "valid", label: "Valid until" }, { k: "status", label: "Status" }],
    make: (v) => [v.name, v.valid || "", v.status || "Valid"],
  },
  categories: {
    title: "budget categories", section: "categories", arr: () => DATA.finance.categories,
    targets: [{ k: "name", label: "Category", required: true }, { k: "budget", label: "Annual budget" }, { k: "actual", label: "YTD actual" }],
    make: (v) => [v.name, parseFloat((v.budget || "").replace(/[^\d.-]/g, "")) || 0, parseFloat((v.actual || "").replace(/[^\d.-]/g, "")) || 0],
  },
  projects: {
    title: "projects", section: "projects", arr: () => DATA.projects,
    targets: [{ k: "name", label: "Project", required: true }, { k: "stage", label: "Stage" },
      { k: "budget", label: "Budget" }, { k: "spent", label: "Spent" }, { k: "pct", label: "Progress %" }, { k: "status", label: "Status" }],
    make: (v) => [v.name, v.stage || "Concept", parseFloat((v.budget || "").replace(/[^\d.-]/g, "")) || 0,
      parseFloat((v.spent || "").replace(/[^\d.-]/g, "")) || 0,
      Math.max(0, Math.min(100, parseFloat(v.pct) || 0)), v.status || "Not Started"],
  },
};

/* listEditor configs for the Governance Centre registers */
const GOV_EDITORS = {
  committees: () => ({
    title: "Standing committees", arr: DATA.governance.committees, section: "gov_committees",
    rowLabel: (r) => `${r[0] || "—"} — ${r[5]}`,
    blank: () => ["", "", "", 0, "Monthly", "Active"],
    fields: (r) => [
      { key: "name", label: "Committee name", type: "text", value: r[0], required: true },
      { key: "mandate", label: "Mandate", type: "textarea", value: r[1] },
      { key: "chair", label: "Chair", type: "text", value: r[2] },
      { key: "members", label: "Member count", type: "number", value: r[3], min: 0 },
      { key: "cadence", label: "Meeting cadence", type: "text", value: r[4] },
      { key: "status", label: "Status", type: "select", options: ["Active", "Forming", "Dormant", "Disbanded"], value: r[5] },
    ],
    write: (r, o) => { r[0] = o.name; r[1] = o.mandate; r[2] = o.chair; r[3] = parseFloat(o.members) || 0; r[4] = o.cadence; r[5] = o.status; },
  }),
  resolutions: () => ({
    title: "Resolutions", arr: DATA.governance.resolutions, section: "gov_resolutions",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${(r[3] || "").slice(0, 50)}`,
    blank: () => ["", new Date().toISOString().slice(0, 10), "", "", "", "", "Open"],
    fields: (r) => [
      { key: "ref", label: "Reference", type: "text", value: r[0] },
      { key: "date", label: "Date", type: "date", value: r[1] },
      { key: "meeting", label: "Meeting", type: "text", value: r[2] },
      { key: "decision", label: "Decision", type: "textarea", value: r[3], required: true },
      { key: "responsible", label: "Responsible", type: "text", value: r[4] },
      { key: "due", label: "Due date", type: "date", value: r[5] },
      { key: "status", label: "Status", type: "select", options: ["Open", "In Progress", "Adopted", "Implemented", "Closed", "Lapsed"], value: r[6] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.date; r[2] = o.meeting; r[3] = o.decision; r[4] = o.responsible; r[5] = o.due; r[6] = o.status; },
  }),
  meetings: () => ({
    title: "Meetings", arr: DATA.governance.meetings, section: "gov_meetings",
    rowLabel: (r) => `${r[0]} — ${r[1] || "?"}`,
    blank: () => ["EXCO", new Date().toISOString().slice(0, 10), "", "Quorate", 0, "Pending", ""],
    fields: (r) => [
      { key: "kind", label: "Type", type: "select", options: ["EXCO", "Committee", "AGM", "SGM", "Special"], value: r[0] },
      { key: "date", label: "Date", type: "date", value: r[1] },
      { key: "venue", label: "Venue", type: "text", value: r[2] },
      { key: "quorum", label: "Quorum", type: "select", options: ["Quorate", "Inquorate", "N/A"], value: r[3] || "Quorate" },
      { key: "attendance", label: "Attendance", type: "number", value: r[4], min: 0 },
      { key: "minutes", label: "Minutes status", type: "select", options: ["Pending", "Draft", "Adopted"], value: r[5] },
      { key: "notes", label: "Notes", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.kind; r[1] = o.date; r[2] = o.venue; r[3] = o.quorum; r[4] = parseFloat(o.attendance) || 0; r[5] = o.minutes; r[6] = o.notes; },
  }),
  coi: () => ({
    title: "Conflict-of-interest declarations", arr: DATA.governance.coi, section: "gov_coi",
    rowLabel: (r) => `${r[0] || "—"} — ${r[5]}`,
    blank: () => ["", "", "", "", new Date().toISOString().slice(0, 10), "Declared"],
    fields: (r) => [
      { key: "member", label: "Member", type: "text", value: r[0], required: true },
      { key: "position", label: "Position", type: "text", value: r[1] },
      { key: "interest", label: "Interest / entity", type: "text", value: r[2] },
      { key: "nature", label: "Nature of the interest", type: "textarea", value: r[3] },
      { key: "declared", label: "Declared on", type: "date", value: r[4] },
      { key: "status", label: "Status", type: "select", options: ["Declared", "Managed", "Recused", "Outstanding", "Closed"], value: r[5] },
    ],
    write: (r, o) => { r[0] = o.member; r[1] = o.position; r[2] = o.interest; r[3] = o.nature; r[4] = o.declared; r[5] = o.status; },
  }),
  calendar: () => ({
    title: "Governance calendar", arr: DATA.governance.calendar, section: "gov_calendar",
    rowLabel: (r) => `${r[0] || "—"} — ${r[2] || "no date"}`,
    blank: () => ["", "Statutory", "", "Annual", "", "Upcoming"],
    fields: (r) => [
      { key: "item", label: "Item", type: "text", value: r[0], required: true },
      { key: "category", label: "Category", type: "select", options: ["Statutory", "Reporting", "Meeting", "Internal"], value: r[1] },
      { key: "due", label: "Due date", type: "date", value: r[2] },
      { key: "recurrence", label: "Recurrence", type: "text", value: r[3] },
      { key: "responsible", label: "Responsible", type: "text", value: r[4] },
      { key: "status", label: "Status", type: "select", options: ["Upcoming", "In Progress", "Done", "Overdue"], value: r[5] },
    ],
    write: (r, o) => { r[0] = o.item; r[1] = o.category; r[2] = o.due; r[3] = o.recurrence; r[4] = o.responsible; r[5] = o.status; },
  }),
};

/* listEditor configs for the Beneficiary Centre registers */
const BENE_EDITORS = {
  register: () => ({
    title: "Master Beneficiary Register", arr: DATA.beneficiaryCentre.register, section: "beneficiaries",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${r[1]} · ${r[9]}`,
    blank: () => ["", "", "Female", "", "", "", "", new Date().toISOString().slice(0, 10), "Active", "Pending", ""],
    fields: (r) => [
      { key: "ref", label: "Register / member no.", type: "text", value: r[0] },
      { key: "name", label: "Full name", type: "text", value: r[1], required: true },
      { key: "gender", label: "Gender", type: "select", options: ["Female", "Male", "Other", "Unspecified"], value: r[2] || "Female" },
      { key: "dob", label: "Date of birth", type: "date", value: r[3] },
      { key: "idm", label: "ID (masked, e.g. ****1234)", type: "text", value: r[4] },
      { key: "hh", label: "Household ref.", type: "text", value: r[5] },
      { key: "contact", label: "Contact", type: "text", value: r[6] },
      { key: "joined", label: "Joined on", type: "date", value: r[7] },
      { key: "status", label: "Status", type: "select", options: BENE_STATUSES, value: r[8] },
      { key: "verif", label: "Verification", type: "select", options: VERIF_STATUSES, value: r[9] },
      { key: "notes", label: "Notes", type: "textarea", value: r[10] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.name; r[2] = o.gender; r[3] = o.dob; r[4] = o.idm; r[5] = o.hh; r[6] = o.contact; r[7] = o.joined; r[8] = o.status; r[9] = o.verif; r[10] = o.notes; },
  }),
  households: () => ({
    title: "Household records", arr: DATA.beneficiaryCentre.households, section: "households",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${r[1]}`,
    blank: () => ["", "", 0, "", "Portion 1", "", "Active"],
    fields: (r) => [
      { key: "ref", label: "Household ref.", type: "text", value: r[0] },
      { key: "head", label: "Head of household", type: "text", value: r[1], required: true },
      { key: "members", label: "Members in household", type: "number", value: r[2], min: 0 },
      { key: "village", label: "Village / area", type: "text", value: r[3] },
      { key: "portion", label: "Portion", type: "text", value: r[4] },
      { key: "contact", label: "Contact", type: "text", value: r[5] },
      { key: "status", label: "Status", type: "select", options: ["Active", "Relocated", "Dissolved"], value: r[6] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.head; r[2] = parseFloat(o.members) || 0; r[3] = o.village; r[4] = o.portion; r[5] = o.contact; r[6] = o.status; },
  }),
  succession: () => ({
    title: "Succession cases", arr: DATA.beneficiaryCentre.succession, section: "succession_cases",
    rowLabel: (r) => `${r[1]} → ${r[3] || "?"} (${r[6]})`,
    blank: () => ["", "", "", "", "", new Date().toISOString().slice(0, 10), "Lodged", ""],
    fields: (r) => [
      { key: "dref", label: "Deceased member ref.", type: "text", value: r[0] },
      { key: "dname", label: "Deceased name", type: "text", value: r[1], required: true },
      { key: "dod", label: "Date of death", type: "date", value: r[2] },
      { key: "succ", label: "Nominated successor", type: "text", value: r[3] },
      { key: "rel", label: "Relationship", type: "text", value: r[4] },
      { key: "lodged", label: "Lodged on", type: "date", value: r[5] },
      { key: "status", label: "Status", type: "select", options: ["Lodged", "Verifying", "Approved", "Rejected", "Registered"], value: r[6] },
      { key: "notes", label: "Notes", type: "textarea", value: r[7] },
    ],
    write: (r, o) => { r[0] = o.dref; r[1] = o.dname; r[2] = o.dod; r[3] = o.succ; r[4] = o.rel; r[5] = o.lodged; r[6] = o.status; r[7] = o.notes; },
  }),
  disputes: () => ({
    title: "Duplicate / conflict cases", arr: DATA.beneficiaryCentre.disputes, section: "beneficiary_disputes",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${r[1]} · ${r[5]}`,
    blank: () => ["", "Duplicate", "", "", new Date().toISOString().slice(0, 10), "Open", ""],
    fields: (r) => [
      { key: "ref", label: "Case ref.", type: "text", value: r[0] },
      { key: "dtype", label: "Type", type: "select", options: DISPUTE_TYPES, value: r[1] },
      { key: "parties", label: "Parties", type: "text", value: r[2] },
      { key: "desc", label: "Description", type: "textarea", value: r[3] },
      { key: "raised", label: "Raised on", type: "date", value: r[4] },
      { key: "status", label: "Status", type: "select", options: ["Open", "Mediation", "Escalated", "Resolved"], value: r[5] },
      { key: "res", label: "Resolution", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.dtype; r[2] = o.parties; r[3] = o.desc; r[4] = o.raised; r[5] = o.status; r[6] = o.res; },
  }),
};

const BUTTONS = {
  "edit-identity-btn": editIdentity, "edit-journey-btn": editJourney,
  "edit-committee-btn": editCommittee, "add-action-btn": () => editAction(null), "edit-masterfile-btn": editMasterFile,
  "edit-beneficiary-btn": editBeneficiary, "edit-land-btn": editLand, "edit-movable-btn": editMovable,
  "edit-leases-btn": editLeases, "edit-allocations-btn": editAllocations,
  "import-leases-btn": () => importModal(IMPORT.leases),
  "import-allocations-btn": () => importModal(IMPORT.allocations),
  "edit-permits-btn": editPermits, "edit-finance-btn": editFinanceFigures, "edit-categories-btn": editCategories,
  "add-project-btn": () => editProject(null), "edit-jobs-btn": editJobsByYear, "edit-impact-btn": editImpactFigures,
  "score-doc-btn": () => attachmentsModal("score", null, "Institutional Score — assessment document"),
  "mf-general-btn": () => attachmentsModal("general", null, "CPA — general documents"),
  "import-actions-btn": () => importModal(IMPORT.actions),
  "import-committee-btn": () => importModal(IMPORT.committee),
  "import-masterfile-btn": () => importModal(IMPORT.masterfile),
  "import-land-btn": () => importModal(IMPORT.land),
  "import-movable-btn": () => importModal(IMPORT.movable),
  "import-permits-btn": () => importModal(IMPORT.permits),
  "import-categories-btn": () => importModal(IMPORT.categories),
  "import-projects-btn": () => importModal(IMPORT.projects),
};

/* ============ lifecycle ============ */
function renderCurrent() {
  try { RENDERERS[currentView](); } catch (e) { console.error(e); }
  applyRoleGate();
}
function applyRoleGate() {
  if (CAN_EDIT || !container) return;
  container.querySelectorAll(".inline-select").forEach((s) => { s.disabled = true; });
  container.querySelectorAll(".row-actions, .dc-edit").forEach((e) => e.remove());
}

async function commit(section) {
  if (!CAN_EDIT || !orgId) return;
  suppressRemoteUntil = Date.now() + 2500;
  try {
    await repo.saveSection(orgId, section, DATA);
  } catch (e) {
    toast("Couldn't save: " + (e?.message || e), true);
    try { DATA = await repo.loadOrg(orgId); } catch (_) {}
  }
  suppressRemoteUntil = Date.now() + 1500;
  renderCurrent();
  if (onChange) onChange();
}

export function setOnChange(fn) { onChange = fn; }

export async function initDashboard({ orgId: oid, role, preload, noRealtime }) {
  orgId = oid;
  CAN_EDIT = role !== "viewer";
  DATA = preload || (await repo.loadOrg(orgId));
  if (channel) repo.unsubscribe(channel);
  if (noRealtime) { channel = null; return; }
  channel = repo.subscribe(orgId, async () => {
    if (Date.now() < suppressRemoteUntil) return;               // our own write echoing back
    if (document.querySelector(".modal-scrim")) { pendingRemote = true; return; }
    try {
      DATA = await repo.loadOrg(orgId);
      renderCurrent();
      if (onChange) onChange();
    } catch (e) {}
  });
}

export function destroyDashboard() {
  if (channel) { repo.unsubscribe(channel); channel = null; }
  DATA = null; orgId = null; container = null;
  rendered.clear();
}

export function mountView(el, viewId) {
  container = el;
  el.classList.add("cpa-dash");
  el.innerHTML = VIEW_HTML;
  currentView = NAV.some((n) => n.id === viewId) ? viewId : "exec";
  if (!CAN_EDIT) {
    // viewers keep read-only affordances (.view-ok = open the document viewer);
    // everything else that edits or imports goes away
    el.querySelectorAll("#actions-toolbar, #projects-toolbar").forEach((e) => e.remove());
    el.querySelectorAll('.card-head .btn:not(.view-ok), [id^="import-"]').forEach((e) => e.remove());
  }
  Object.entries(BUTTONS).forEach(([id, fn]) => {
    const b = el.querySelector("#" + id);
    if (b) b.addEventListener("click", fn);
  });
  el.querySelectorAll("[data-goto]").forEach((b) =>
    b.addEventListener("click", () => { location.hash = b.dataset.goto; }));
  el.querySelectorAll("svg:not([aria-label])").forEach((s) => { s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false"); });
  rendered.clear();
  showView(currentView);
}

export function showView(name) {
  if (!RENDERERS[name]) name = "exec";
  currentView = name;
  container.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + name));
  if (!rendered.has(name)) { renderCurrent(); rendered.add(name); }
  else applyRoleGate();
  window.scrollTo({ top: 0 });
}

export function printPack() {
  Object.keys(RENDERERS).forEach((k) => { if (!rendered.has(k)) { try { RENDERERS[k](); rendered.add(k); } catch (e) {} } });
  applyRoleGate();
  const d = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
  const ph = container.querySelector("#print-header");
  if (ph) ph.innerHTML =
    `<div style="font-family:var(--font-display);font-weight:800;font-size:17px;">CPA360™ Command Center</div>
     <div style="font-size:12px;color:#444;margin-top:2px;">${esc(DATA.cpa.name)} · ${esc(DATA.cpa.reg)} · Generated ${d}</div>`;
  window.print();
}

/* poll: apply a deferred remote refresh once modals are closed */
setInterval(async () => {
  if (pendingRemote && orgId && !document.querySelector(".modal-scrim")) {
    pendingRemote = false;
    try { DATA = await repo.loadOrg(orgId); renderCurrent(); } catch (e) {}
  }
}, 1500);

/* ============ view markup (verbatim from the Command Center) ============ */
const VIEW_HTML = `
  <div class="print-only" id="print-header"></div>

  <section class="view" id="view-exec">
    <div class="exec-hero" id="exec-hero"></div>
    <div class="section-title">Overall health indicators</div>
    <div class="health-grid" id="exec-health"></div>
    <div class="grid grid-2" style="margin-top:18px;">
      <div class="card"><div class="card-head"><h3>Critical actions</h3>
        <button class="btn view-ok" data-goto="#/v/actions" type="button">Open tracker</button></div>
        <ul class="exec-list" id="exec-actions"></ul></div>
      <div class="card"><div class="card-head"><h3>Upcoming governance deadlines</h3></div>
        <ul class="exec-list" id="exec-deadlines"></ul></div>
    </div>
    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card"><div class="card-head"><h3>Financial alerts</h3>
        <button class="btn view-ok" data-goto="#/v/finance" type="button">Open finance</button></div>
        <ul class="exec-list" id="exec-finance"></ul></div>
      <div class="card"><div class="card-head"><h3>Project status</h3>
        <button class="btn view-ok" data-goto="#/v/projects" type="button">Open projects</button></div>
        <ul class="exec-list" id="exec-projects"></ul></div>
    </div>
    <div class="card" style="margin-top:14px;"><div class="card-head"><h3>Recent documents</h3>
      <button class="btn view-ok" data-goto="#/v/masterfile" type="button">Master File</button></div>
      <ul class="exec-list" id="exec-docs"></ul></div>
  </section>

  <section class="view hidden" id="view-journey">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head"><h3>Where this CPA is on the journey</h3>
        <button class="btn" id="edit-journey-btn" type="button">Set current stage</button></div>
      <p class="hint" id="journey-note" style="margin:2px 0 0;"></p>
    </div>
    <div class="journey" id="journey-list"></div>
  </section>

  <section class="view hidden" id="view-productivity">
    <div id="productivity-body"></div>
  </section>

  <section class="view hidden" id="view-profile">
    <div id="governance-subtabs"></div>
    <div id="governance-body"></div>
  </section>

  <section class="view hidden" id="view-score">
    <div class="split split-score">
      <div class="card" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div id="score-gauge"></div>
        <div class="pill brand" id="score-band-pill" style="margin-top:10px;">Developing maturity band</div>
        <button class="btn view-ok" id="score-doc-btn" type="button" style="margin-top:12px;">Assessment doc</button>
      </div>
      <div class="card">
        <div class="card-head"><h3>The 100-point CPA360™ score</h3>
          <span class="hint">Score each domain — single number, or the weighted rubric.</span></div>
        <div class="domain-grid" id="score-domains"></div>
      </div>
    </div>
    <div class="section-title">Maturity Bands</div>
    <div class="table-wrap"><table>
      <thead><tr><th>Band</th><th>Score Range</th><th>What it Means</th></tr></thead>
      <tbody id="score-bands"></tbody>
    </table></div>
  </section>

  <section class="view hidden" id="view-actions">
    <div class="grid grid-4" id="actions-stats"></div>
    <div id="actions-toolbar" style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-top:18px; flex-wrap:wrap;">
      <div class="filter-row" id="actions-filters"></div>
      <span style="display:flex;gap:6px;">
        <button class="btn" id="import-actions-btn" type="button">Import CSV</button>
        <button class="btn primary" id="add-action-btn" type="button">+ Add action</button>
      </span>
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Ref.</th><th>Category</th><th>Action</th><th>Owner</th><th>Due Date</th><th>Status</th><th aria-label="Row actions"></th></tr></thead>
      <tbody id="actions-body"></tbody>
    </table></div>
  </section>

  <section class="view hidden" id="view-masterfile">
    <div class="grid grid-4" id="masterfile-stats"></div>
    <div class="card-head" style="margin:20px 0 12px;"><h3 style="font-size:13px;">Master File Sections</h3>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn view-ok" id="mf-general-btn" type="button">General documents</button>
        <button class="btn" id="import-masterfile-btn" type="button">Import CSV</button>
        <button class="btn" id="edit-masterfile-btn" type="button">Manage sections</button>
      </span>
    </div>
    <div class="doc-grid" id="masterfile-grid"></div>
  </section>

  <section class="view hidden" id="view-beneficiary">
    <div id="beneficiary-subtabs"></div>
    <div id="beneficiary-body"></div>
  </section>

  <section class="view hidden" id="view-assets">
    <div class="grid grid-4" id="assets-stats"></div>
    <div class="card-head" style="margin:22px 0 10px;"><h3 style="font-size:13px;">Land Portions</h3>
      <span style="display:flex;gap:6px;">
        <button class="btn" id="import-land-btn" type="button">Import CSV</button>
        <button class="btn" id="edit-land-btn" type="button">Manage</button>
      </span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Portion</th><th>Primary Use</th><th class="num">Extent (ha)</th><th>Lease / Tenure</th><th>Status</th></tr></thead>
      <tbody id="assets-land"></tbody>
    </table></div>

    <div class="card-head" style="margin:22px 0 10px;"><h3 style="font-size:13px;">Land Leases</h3>
      <span style="display:flex;gap:6px;">
        <button class="btn" id="import-leases-btn" type="button">Import CSV</button>
        <button class="btn" id="edit-leases-btn" type="button">Manage</button>
      </span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Lessee / Party</th><th>Land / Portion</th><th>Land Use</th><th class="num">Area (ha)</th><th>Term</th><th class="num">Annual Rental (R)</th><th>Status</th></tr></thead>
      <tbody id="assets-leases"></tbody>
    </table></div>

    <div class="card-head" style="margin:22px 0 10px;"><h3 style="font-size:13px;">Land Allocated to Beneficiaries</h3>
      <span style="display:flex;gap:6px;">
        <button class="btn" id="import-allocations-btn" type="button">Import CSV</button>
        <button class="btn" id="edit-allocations-btn" type="button">Manage</button>
      </span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Beneficiary / Household</th><th>Land / Portion</th><th>Purpose</th><th class="num">Area (ha)</th><th>Allocated On</th><th>Agreement Ref.</th><th>Status</th></tr></thead>
      <tbody id="assets-allocations"></tbody>
    </table></div>

    <div class="grid grid-2" style="margin-top:20px;">
      <div>
        <div class="card-head" style="margin-bottom:8px;"><h3 style="font-size:13px;">Movable Assets</h3>
          <span style="display:flex;gap:6px;">
            <button class="btn" id="import-movable-btn" type="button">Import</button>
            <button class="btn" id="edit-movable-btn" type="button">Manage</button>
          </span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Asset Class</th><th class="num">Count</th><th>Condition</th></tr></thead>
          <tbody id="assets-movable"></tbody>
        </table></div>
      </div>
      <div>
        <div class="card-head" style="margin-bottom:8px;"><h3 style="font-size:13px;">Permits &amp; Licenses</h3>
          <span style="display:flex;gap:6px;">
            <button class="btn" id="import-permits-btn" type="button">Import</button>
            <button class="btn" id="edit-permits-btn" type="button">Manage</button>
          </span></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Permit / License</th><th>Valid Until</th><th>Status</th></tr></thead>
          <tbody id="assets-permits"></tbody>
        </table></div>
      </div>
    </div>
  </section>

  <section class="view hidden" id="view-finance">
    <div class="grid grid-4" id="finance-stats"></div>
    <div class="split split-finance" style="margin-top:14px;">
      <div class="card">
        <div class="card-head"><h3>Cash Balance — Trailing 12 Months</h3><button class="btn" id="edit-finance-btn" type="button">Edit figures</button></div>
        <div id="finance-line" class="chart-wrap"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Budget Used by Category</h3>
          <span style="display:flex;gap:6px;">
            <button class="btn" id="import-categories-btn" type="button">Import</button>
            <button class="btn" id="edit-categories-btn" type="button">Manage</button>
          </span></div>
        <div id="finance-bars"></div>
      </div>
    </div>
  </section>

  <section class="view hidden" id="view-projects">
    <div class="grid grid-4" id="projects-stats"></div>
    <div id="projects-toolbar" style="display:flex; justify-content:flex-end; gap:6px; margin-top:16px;">
      <button class="btn" id="import-projects-btn" type="button">Import CSV</button>
      <button class="btn primary" id="add-project-btn" type="button">+ Add project</button>
    </div>
    <div class="table-wrap" style="margin-top:10px;"><table>
      <thead><tr><th>Project</th><th>Stage</th><th class="num">Budget (R)</th><th class="num">Spent (R)</th><th>Progress</th><th>Status</th><th aria-label="Row actions"></th></tr></thead>
      <tbody id="projects-body"></tbody>
    </table></div>
  </section>

  <section class="view hidden" id="view-impact">
    <div class="grid grid-4" id="impact-stats"></div>
    <div class="split split-impact" style="margin-top:14px;">
      <div class="card">
        <div class="card-head"><h3>Jobs Created (FTE) — by Year</h3><button class="btn" id="edit-jobs-btn" type="button">Manage</button></div>
        <div id="impact-bars"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Land Under Active Production</h3><button class="btn" id="edit-impact-btn" type="button">Edit figures</button></div>
        <div style="padding-top:6px;">
          <div class="bar-row" style="grid-template-columns:1fr 90px;">
            <div class="progress"><span id="impact-land-bar" style="width:0%"></span></div>
            <div class="val" id="impact-land-val"></div>
          </div>
        </div>
        <p style="font-size:12px; color:var(--ink-2); margin-top:10px;" id="impact-land-note"></p>
      </div>
    </div>
  </section>
`;
