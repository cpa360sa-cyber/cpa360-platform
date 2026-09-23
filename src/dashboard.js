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
const ATTENDEES = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3"/><path d="M2 20c0-3.3 3.1-6 7-6s7 2.7 7 6"/><circle cx="17.5" cy="9" r="2.3"/><path d="M15.6 13c2.7.5 4.9 2.5 4.9 6"/></svg>';
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M8 5v14l11-7z"/></svg>';
const AUDIO_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/></svg>';
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><path d="M7 3h7l5 5v13H7z"/><path d="M13 3v6h6"/></svg>';

const STATUS_TONE = {
  "Completed": "good", "Verified": "good", "Active": "good", "On Track": "good", "Complete": "good", "Valid": "good", "Paid": "good",
  "Implemented": "good", "Adopted": "good", "Closed": "good", "Quorate": "good", "Managed": "good", "Recused": "good", "Done": "good",
  "Adopted": "good", "Actioned": "good", "Filled": "good", "Approved": "good",
  "In Progress": "warning", "Pending": "warning", "Pending Verification": "warning", "Expiring Soon": "warning", "At Risk": "warning", "Under Renewal": "warning",
  "Open": "warning", "Draft": "warning", "Forming": "warning", "Upcoming": "warning", "Declared": "warning", "Scheduled": "warning",
  "Under Review": "warning", "On leave": "warning", "Archived": "warning", "Frozen": "warning",
  "Overdue": "critical", "Disputed": "critical", "Delayed": "critical", "Vacant": "critical", "Inquorate": "critical", "Outstanding": "critical", "Expired": "critical",
  "Not Started": "neutral", "Retired": "neutral", "Exited": "neutral", "Disposed": "neutral",
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
  { id: "administration", label: "Administration", group: "Operations", eyebrow: "Operations", title: "Administration Centre", sub: "Correspondence, the delegation-of-authority matrix, policies & SOPs and the institutional records index." },
  { id: "hr", label: "HR", group: "Operations", eyebrow: "Operations", title: "HR Centre", sub: "Staff register, positions and the organogram, and monthly payroll summaries." },
  { id: "finance", label: "Finance & Procurement", group: "Operations", eyebrow: "Operations", title: "Finance & Procurement", sub: "Budget, transactions, requisitions, purchase orders, suppliers, payments and procurement compliance." },
  { id: "assets", label: "Land & Assets", group: "Operations", eyebrow: "Operations", title: "Land & Assets", sub: "Land parcels, allocations, leases, permits, infrastructure, the asset register and maintenance." },
  { id: "productivity", label: "Productivity Centre", group: "Operations", eyebrow: "Operations", title: "Productivity Centre", sub: "Crops, orchards, timber, livestock, water, labour, inputs, harvest, sales and cost of production." },
  { id: "projects", label: "Projects & Commercialisation", group: "Operations", eyebrow: "Operations", title: "Projects & Commercialisation", sub: "Project pipeline and scorecards, business cases, funding readiness, markets, partnerships and revenue." },
  { id: "masterfile", label: "CPA Master File", group: "Records", eyebrow: "Records", title: "CPA Master File", sub: "The complete institutional record, indexed to the CPA360™ Master File structure." },
  { id: "gallery", label: "Gallery / Media", group: "Records", eyebrow: "Records", title: "Gallery & Media", sub: "Photos, videos and audio — meeting evidence, site visits, verification photos — organized automatically by date." },
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
const EMPTY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M9 13h6"/></svg>';
const emptyRow = (cols, msg) => `<tr><td colspan="${cols}"><div class="state">${EMPTY_SVG}<p>${esc(msg)}</p></div></td></tr>`;
const stateHtml = (kind, msg, action) =>
  `<div class="state">${kind === "loading" ? '<span class="spinner"></span>' : kind === "error"
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>' : EMPTY_SVG}
    <p>${esc(msg)}</p>${action || ""}</div>`;
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
  const gid = "sg" + Math.round(size) + "_" + value;
  const num = size >= 150 ? 34 : Math.round(size * 0.22);
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Score ${value} out of ${max}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="var(--brand)"/><stop offset="1" stop-color="var(--brand-2)"/></linearGradient></defs>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="13"/>
    <circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${gid})" stroke-width="13"
      stroke-linecap="round" stroke-dasharray="${dash} ${circ}" transform="rotate(-90 ${c} ${c})"/>
    <text x="${c}" y="${c - 2}" text-anchor="middle" font-family="Libre Franklin, sans-serif" font-weight="800" font-size="${num}" fill="var(--ink)">${value}</text>
    <text x="${c}" y="${c + 16}" text-anchor="middle" font-family="Public Sans, sans-serif" font-size="11" fill="var(--ink-muted)">of ${max} points</text></svg>`;
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
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${total.toLocaleString()} members">
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
  if (f.type === "info")
    return `<div class="field"><label>${esc(f.label)}</label><div class="hint" style="padding:8px 0 2px;">${v}</div></div>`;
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
function openModal(title, fields, onSave, saveLabel) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3>
    <div class="modal-body">${fields.map(fieldHtml).join("")}</div>
    <div class="modal-foot">
      <button class="btn" data-act="cancel" type="button">Cancel</button>
      <button class="btn primary" data-act="save" type="button">${esc(saveLabel || "Save")}</button>
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
      if (f.type === "info") return;
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

/* Reusable file manager. section: 'masterfile'|'action'|'score'|'general'|....
   opts.accept: input "accept" attribute (e.g. "application/pdf,.pdf") to steer the file
   picker; opts.match: a RegExp tested against the chosen file's name/type before upload
   (client-side only — the storage bucket itself accepts any file type). Both optional. */
function attachmentsModal(section, refId, title, opts) {
  opts = opts || {};
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <h3>${esc(title)}</h3>
    <div class="modal-body" style="display:block;">
      <div id="att-list">${stateHtml("loading", "Loading…")}</div>
      ${CAN_EDIT ? `<label class="btn primary" style="margin-top:12px;display:inline-flex;cursor:pointer;">
        ${esc(opts.label || "Upload a file")}<input type="file" id="att-file" hidden${opts.accept ? ` accept="${esc(opts.accept)}"` : ""}></label>
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
        </div>`).join("") : stateHtml("empty", "No files yet.");
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
      listEl.innerHTML = stateHtml("error", "Couldn't load files. " + (e.message || e));
    }
  }
  refresh();

  const fileInput = scrim.querySelector("#att-file");
  if (fileInput) fileInput.onchange = async () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (opts.match && !opts.match.test(f.name) && !opts.match.test(f.type)) {
      msg.textContent = opts.matchMsg || "Unsupported file type."; fileInput.value = ""; return;
    }
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
      <div id="fl-list">${stateHtml("loading", "Loading documents…")}</div>
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
          </span></td></tr>`).join("")}</tbody></table></div>` : stateHtml("empty", "No documents here yet.");
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
    } catch (e) { listEl.innerHTML = stateHtml("error", "Couldn't load documents. " + (e.message || e)); }
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

/* ============ spreadsheet (XLSX) import — no library: a minimal in-browser
   .xlsx reader. An .xlsx is a zip of XML parts; this walks the zip's central
   directory, inflates just the two parts needed (styles + the first
   worksheet's shared strings + cells) with the browser's built-in
   DecompressionStream, and returns the same row-array shape parseCSV() does
   so the rest of the import flow (column mapping, etc.) is untouched. */
function zipEntries(buf) {
  const dv = new DataView(buf), bytes = new Uint8Array(buf);
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("Not a valid .xlsx file.");
  const total = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const entries = {};
  for (let n = 0; n < total; n++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const lhOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries[name] = { method, compSize, lhOff };
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { dv, bytes, entries };
}
async function zipReadText(z, name) {
  const e = z.entries[name];
  if (!e) return null;
  const nameLen = z.dv.getUint16(e.lhOff + 26, true);
  const extraLen = z.dv.getUint16(e.lhOff + 28, true);
  const start = e.lhOff + 30 + nameLen + extraLen;
  const raw = z.bytes.subarray(start, start + e.compSize);
  let out = raw;
  if (e.method !== 0) {
    const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    out = new Uint8Array(await new Response(stream).arrayBuffer());
  }
  return new TextDecoder("utf-8").decode(out);
}
const colToIndex = (ref) => {
  const m = /^([A-Z]+)/.exec(ref || "");
  if (!m) return 0;
  let n = 0;
  for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
function excelSerialToISODate(n) {
  const days = Math.floor(+n);
  const ms = Math.round((+n - days) * 86400000);
  return new Date(Date.UTC(1899, 11, 30) + days * 86400000 + ms).toISOString().slice(0, 10);
}
const BUILTIN_DATE_FMTS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);
async function xlsxDateStyles(z) {
  const xml = await zipReadText(z, "xl/styles.xml");
  if (!xml) return [];
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const custom = {};
  doc.querySelectorAll("numFmts > numFmt").forEach((n) => { custom[n.getAttribute("numFmtId")] = n.getAttribute("formatCode") || ""; });
  const isDateFmt = (id) => {
    if (BUILTIN_DATE_FMTS.has(+id)) return true;
    const code = custom[id];
    return !!code && !/general/i.test(code) && /[ymdhs]/i.test(code.replace(/\[[^\]]*\]/g, ""));
  };
  return Array.from(doc.querySelectorAll("cellXfs > xf")).map((xf) => isDateFmt(xf.getAttribute("numFmtId") || "0"));
}
async function parseXLSX(buf) {
  if (typeof DecompressionStream === "undefined")
    throw new Error("This browser can't read Excel files — try Chrome, Edge or Safari 16.4+, or export as CSV.");
  const z = zipEntries(buf);
  const sstXml = await zipReadText(z, "xl/sharedStrings.xml");
  const sst = [];
  if (sstXml) {
    new DOMParser().parseFromString(sstXml, "application/xml").querySelectorAll("si").forEach((si) => {
      sst.push(Array.from(si.querySelectorAll("t")).map((t) => t.textContent).join(""));
    });
  }
  const dateStyles = await xlsxDateStyles(z);
  const sheetName = z.entries["xl/worksheets/sheet1.xml"]
    ? "xl/worksheets/sheet1.xml"
    : Object.keys(z.entries).find((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  const sheetXml = sheetName && await zipReadText(z, sheetName);
  if (!sheetXml) throw new Error("No worksheet found in that file.");
  const doc = new DOMParser().parseFromString(sheetXml, "application/xml");
  const rows = [];
  doc.querySelectorAll("row").forEach((rowEl) => {
    const cells = [];
    rowEl.querySelectorAll("c").forEach((c) => {
      const idx = colToIndex(c.getAttribute("r"));
      const type = c.getAttribute("t");
      const styleIdx = c.getAttribute("s");
      let val = "";
      if (type === "inlineStr") {
        val = Array.from(c.querySelectorAll("is t")).map((t) => t.textContent).join("");
      } else {
        const vEl = c.querySelector("v");
        if (vEl) {
          if (type === "s") val = sst[+vEl.textContent] || "";
          else if (!type || type === "n") {
            val = vEl.textContent;
            if (styleIdx != null && dateStyles[+styleIdx] && val !== "") val = excelSerialToISODate(val);
          } else val = vEl.textContent;
        }
      }
      while (cells.length < idx) cells.push("");
      cells[idx] = val;
    });
    rows.push(cells);
  });
  return rows.filter((r) => r.some((v) => (v || "").trim() !== ""));
}

/* cfg: { title, targets:[{k,label,required}], make:(obj)=>row, arr:()=>array, section } */
function importModal(cfg) {
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash";
  scrim.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="Import ${esc(cfg.title)}">
    <h3>Import ${esc(cfg.title)} from a spreadsheet</h3>
    <div class="modal-body" style="display:block;">
      <p style="margin:0 0 10px;font-size:12px;color:var(--ink-2);">
        Upload a <strong>.csv</strong> or <strong>.xlsx</strong> spreadsheet. Match its columns to the fields below.</p>
      <label class="btn" style="cursor:pointer;display:inline-flex;">Choose file<input type="file" id="imp-file"
        accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden></label>
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
    msg.textContent = "Reading…";
    let rows;
    try {
      rows = /\.xlsx$/i.test(f.name) ? await parseXLSX(await f.arrayBuffer()) : parseCSV(await f.text());
    } catch (err) {
      msg.textContent = "Couldn't read that file — " + (err.message || err);
      return;
    }
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
    const built = dataRows.map((r, idx) => {
      const obj = {};
      cfg.targets.forEach((t) => { obj[t.k] = pick[t.k] == null ? "" : (r[pick[t.k]] || "").trim(); });
      return cfg.make(obj, idx);
    }).filter(Boolean);
    const arr = cfg.arr();
    if (scrim.querySelector("#imp-replace").checked) arr.length = 0;
    built.forEach((row) => arr.push(row));
    const extra = cfg.afterImport ? (cfg.afterImport(built) || "") : "";
    commit(cfg.section);
    toast(`Imported ${built.length} row(s) into ${cfg.title}.${extra}`);
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
  return `<div class="subtabs" role="tablist" aria-label="Sections">${tabs.map((t) => {
    const on = t.id === cur;
    return `<button type="button" role="tab" aria-selected="${on}" data-subtab="${section}:${t.id}" class="${on ? "active" : ""}">${esc(t.label)}</button>`;
  }).join("")}</div>`;
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
/* Bulk filter + multi-select state, kept outside mountRegister so it survives
   the full-innerHTML re-renders this app does after every change. Opt-in via
   cfg.bulkKey — every existing mountRegister call that doesn't set it renders
   exactly as before. */
const BULK_STATE = {};
function bulkState(key) { return (BULK_STATE[key] ||= { selected: new Set(), filter: null, filterSeen: new Set(), filterOpen: false }); }
function filterPopoverHtml(values, activeSet, label) {
  return `<div class="reg-filter-pop" data-reg-filterpop>
    <div class="reg-filter-head">${esc(label)}<span><button type="button" data-fall>All</button> · <button type="button" data-fnone>None</button></span></div>
    ${values.map((v) => `<label><input type="checkbox" data-fval="${esc(v)}" ${activeSet.has(v) ? "checked" : ""}> ${esc(v)}</label>`).join("")}
  </div>`;
}

function mountRegister(host, cfg) {
  const allRows = cfg.rows();
  const bulk = cfg.bulkKey ? bulkState(cfg.bulkKey) : null;      // filtering — available to everyone
  const canDelete = bulk && CAN_EDIT;                            // selecting + deleting — editors only
  const rid = cfg.rowId || ((r) => r._id);

  let rows = allRows;
  let distinctVals = [];
  if (bulk && cfg.filterCol != null) {
    distinctVals = [...new Set(allRows.map((r) => r[cfg.filterCol]).filter((v) => v != null && v !== ""))];
    distinctVals.forEach((v) => { if (!bulk.filterSeen.has(v)) { bulk.filterSeen.add(v); (bulk.filter ||= new Set()).add(v); } });
    if (!bulk.filter) bulk.filter = new Set(distinctVals);
    rows = allRows.filter((r) => bulk.filter.has(r[cfg.filterCol]));
  }

  const selectedCount = canDelete ? [...bulk.selected].filter((id) => rows.some((r) => String(rid(r)) === id)).length : 0;
  const allChecked = canDelete && rows.length > 0 && rows.every((r) => bulk.selected.has(String(rid(r))));

  const tools = [];
  if (CAN_EDIT && cfg.importKey) tools.push(`<button class="btn" data-reg-import type="button">Import CSV / Excel</button>`);
  if (bulk && distinctVals.length > 1) {
    const on = bulk.filter.size < distinctVals.length;
    tools.push(`<button class="btn${on ? " active" : ""}" data-reg-filter type="button">Filter${on ? ` · ${bulk.filter.size}/${distinctVals.length}` : ""}</button>`);
  }
  if (CAN_EDIT) tools.push(`<button class="btn" data-reg-manage type="button">Manage</button>`);
  if (CAN_EDIT && cfg.extraTools) tools.push(...cfg.extraTools);
  if (canDelete) tools.push(`<button class="btn danger" data-reg-delsel type="button"${selectedCount ? "" : " disabled"}>Delete selected${selectedCount ? ` (${selectedCount})` : ""}</button>`);

  host.innerHTML = `
    ${cfg.stats ? `<div class="grid grid-4">${cfg.stats().join("")}</div>` : ""}
    <div class="card-head" style="margin:${cfg.stats ? "18px" : "2px"} 0 10px;">
      <div><h3 style="font-size:13px;">${esc(cfg.title)}</h3>${cfg.hint ? `<span class="hint">${esc(cfg.hint)}</span>` : ""}</div>
      <span style="display:flex;gap:6px;position:relative;">${tools.join("")}
        ${bulk && distinctVals.length > 1 && bulk.filterOpen ? filterPopoverHtml(distinctVals, bulk.filter, cfg.filterLabel || "Filter") : ""}
      </span>
    </div>
    <div class="table-wrap${rows.length > 12 ? " scroll" : ""}"><table>
      <thead><tr>
        ${canDelete ? `<th class="chk"><input type="checkbox" data-reg-selall ${allChecked ? "checked" : ""} aria-label="Select all"></th>` : ""}
        ${cfg.columns.map((c) => `<th class="${c.cls || ""}">${esc(c.label)}</th>`).join("")}
      </tr></thead>
      <tbody>${rows.length
        ? rows.map((r) => {
            const id = String(rid(r));
            const chk = canDelete ? `<td class="chk"><input type="checkbox" data-reg-sel="${esc(id)}" ${bulk.selected.has(id) ? "checked" : ""} aria-label="Select row"></td>` : "";
            return `<tr>${chk}${cfg.cell(r).map((cell, i) => `<td class="${cfg.columns[i].cls || ""}">${cell}</td>`).join("")}</tr>`;
          }).join("")
        : emptyRow(cfg.columns.length + (canDelete ? 1 : 0), cfg.empty || "Nothing recorded yet.")}</tbody>
    </table></div>`;
  const mb = host.querySelector("[data-reg-manage]");
  if (mb) mb.onclick = cfg.manage;
  const ib = host.querySelector("[data-reg-import]");
  if (ib) ib.onclick = () => importModal(IMPORT[cfg.importKey]);

  if (canDelete) {
    host.querySelectorAll("[data-reg-sel]").forEach((cb) => (cb.onclick = () => {
      if (cb.checked) bulk.selected.add(cb.dataset.regSel); else bulk.selected.delete(cb.dataset.regSel);
      cfg.rerender();
    }));
    const selAll = host.querySelector("[data-reg-selall]");
    if (selAll) selAll.onclick = () => {
      rows.forEach((r) => { const id = String(rid(r)); if (selAll.checked) bulk.selected.add(id); else bulk.selected.delete(id); });
      cfg.rerender();
    };
    const delBtn = host.querySelector("[data-reg-delsel]");
    if (delBtn) delBtn.onclick = () => {
      const ids = new Set([...bulk.selected].filter((id) => rows.some((r) => String(rid(r)) === id)));
      if (!ids.size) return;
      confirmModal(`Delete ${ids.size} selected record${ids.size > 1 ? "s" : ""}? This can't be undone.`, () => {
        const arr = cfg.rows();
        for (let i = arr.length - 1; i >= 0; i--) { if (ids.has(String(rid(arr[i])))) arr.splice(i, 1); }
        ids.forEach((id) => bulk.selected.delete(id));
        commit(cfg.section);   // commit() re-renders internally once the save round-trips
        toast(`Deleted ${ids.size} record${ids.size > 1 ? "s" : ""}.`);
      });
    };
  }
  if (bulk) {
    const filterBtn = host.querySelector("[data-reg-filter]");
    if (filterBtn) filterBtn.onclick = () => { bulk.filterOpen = !bulk.filterOpen; cfg.rerender(); };
    const pop = host.querySelector("[data-reg-filterpop]");
    if (pop) {
      pop.querySelectorAll("[data-fval]").forEach((cb) => (cb.onchange = () => {
        if (cb.checked) bulk.filter.add(cb.dataset.fval); else bulk.filter.delete(cb.dataset.fval);
        cfg.rerender();
      }));
      pop.querySelector("[data-fall]").onclick = () => { bulk.filter = new Set(distinctVals); cfg.rerender(); };
      pop.querySelector("[data-fnone]").onclick = () => { bulk.filter = new Set(); cfg.rerender(); };
    }
  }
  if (cfg.afterRender) cfg.afterRender(host);
}

/* ============ section editors ============ */
function nextActionRef() {
  const yr = new Date().getFullYear();
  const nums = DATA.actions.map((a) => { const m = /(\d+)\s*$/.exec(a[0] || ""); return m ? +m[1] : 0; });
  return `CPA360-ACT-${yr}-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}
function householdMaxSeq() {
  return Math.max(0, ...DATA.beneficiaryCentre.households.map((h) => { const m = /(\d+)\s*$/.exec(h[0] || ""); return m ? +m[1] : 0; }));
}
function nextHouseholdRef() { return `MCPA-${String(householdMaxSeq() + 1).padStart(3, "0")}`; }
/* Enforced ID masking: keeps only the last 4 characters typed, replaces the
   rest with *. Idempotent — re-saving an already-masked value (e.g. ****1234)
   produces the same result, so it's safe to run on every save. */
function maskId(raw) {
  const s = (raw || "").trim();
  if (s.length <= 4) return s;
  return "*".repeat(s.length - 4) + s.slice(-4);
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
  openModal("Master File completeness (%)",
    DATA.masterFile.map((r, i) => ({ key: "c" + i, label: r[1], type: "number", value: r[3], min: 0, max: 100 })),
    (out) => {
      DATA.masterFile.forEach((r, i) => {
        const v = parseFloat(out["c" + i]);
        if (!isNaN(v)) r[3] = Math.max(0, Math.min(100, v));
      });
      commit("masterfile");
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
/* ============ Timber Permit workflow (Permits & Licences) ============
   A permit row can carry an optional application→verification→issuance
   workflow, used when commodity = "Timber" (water use / grazing /
   environmental permits just ignore these fields and behave exactly as
   before). Modelled on the real DFFE "Application for a Licence Regarding
   Protected/Indigenous Trees" (National Forests Act 84 of 1998) structure —
   applicant particulars, site description, species/quantity table, method
   statement, attachments checklist, declaration, office-use verification —
   but generated as the CPA's OWN internal permit, not a government form:
   it explicitly does not replace any statutory licence the applicant may
   still need. */
const PERMIT_COMMODITIES = ["Other", "Timber", "Water Use", "Grazing", "Environmental"];
const PERMIT_STAGES = ["Not Started", "Form Downloaded", "Application Submitted", "Under Verification", "Approved", "Rejected", "Issued"];
const PERMIT_PURPOSES = ["Commercial sale", "Own use", "Land clearing", "Other"];

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.rel = "noopener";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
function permitDocCss() {
  const primary = DATA.cpa.brandPrimary || "#1c3a68";
  const secondary = DATA.cpa.brandSecondary || "#2f7d4f";
  return `
    body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1f1f1f;line-height:1.45;margin:2.2cm 2cm;}
    .hdr{border-bottom:2.5pt solid ${primary};padding-bottom:6pt;margin-bottom:16pt;display:flex;align-items:center;gap:12pt;}
    .hdr-logo{max-height:46pt;max-width:150pt;}
    .brand{font-size:8.5pt;letter-spacing:1.6pt;text-transform:uppercase;color:${secondary};font-weight:bold;}
    h1{font-size:16pt;color:${primary};margin:3pt 0 2pt;}
    .sub{color:#555;font-size:9.5pt;margin:0;}
    h2{font-size:11.5pt;color:#fff;background:${primary};padding:4pt 8pt;margin:14pt 0 6pt;}
    p{margin:4pt 0;}
    table{border-collapse:collapse;width:100%;margin:6pt 0;font-size:9.5pt;}
    th,td{border:.75pt solid #b3b3b3;padding:5pt 7pt;text-align:left;vertical-align:top;}
    th{background:#eef2f7;color:${primary};}
    .fill{color:#8a8a8a;}
    .note{font-size:9pt;color:#666;font-style:italic;}
    .warn{font-size:9.5pt;background:#fff6e5;border:.75pt solid #e8c468;padding:8pt 10pt;margin:10pt 0;}
    .foot{margin-top:22pt;border-top:.75pt solid #d8d8d8;padding-top:6pt;font-size:8.5pt;color:#777;}
    .sig td{height:32pt;}
    .cert{border:3pt double ${primary};padding:22pt;margin-top:10pt;}
    .cert h1{text-align:center;font-size:20pt;}
    .cert .no{text-align:center;font-size:11pt;color:${secondary};font-weight:bold;letter-spacing:1pt;margin-bottom:14pt;}
  `;
}
function permitDocShell(title, sub, bodyHtml) {
  const logo = DATA.cpa.logoDataUrl ? `<img class="hdr-logo" src="${DATA.cpa.logoDataUrl}" alt="">` : "";
  const cpaName = esc(DATA.cpa.name || "");
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${permitDocCss()}</style></head>
<body>
<div class="hdr">${logo}<div><div class="brand">${cpaName || "CPA360&trade;"}</div><h1>${esc(title)}</h1><p class="sub">${esc(sub || "")}</p></div></div>
${bodyHtml}
<div class="foot">${cpaName} &middot; generated by CPA360&trade; &mdash; A GAD Foundation Programme.
${DATA.cpa.brandFooter ? esc(DATA.cpa.brandFooter) + " &middot; " : ""}This document is issued under the CPA's own institutional
governance and does not replace any licence required by the National Forests Act, 84 of 1998, or other applicable legislation.</div>
</body></html>`;
}
function nextPermitNumber() {
  const yr = new Date().getFullYear();
  const nums = (DATA.assets.permits || [])
    .filter((p) => p[11] && p[11].startsWith(`TMB-${yr}-`))
    .map((p) => +p[11].split("-")[2] || 0);
  return `TMB-${yr}-${String(Math.max(0, ...nums) + 1).padStart(3, "0")}`;
}
function permitApplicationBodyHtml(r) {
  const field = (label, val) => `<tr><td style="width:36%;font-weight:600;">${esc(label)}</td><td>${val ? esc(val) : '<span class="fill">________________________________</span>'}</td></tr>`;
  return `
<p class="warn"><b>Please read carefully.</b> This is ${esc(DATA.cpa.name || "the CPA")}'s own internal permit application for
harvesting timber on its communal land. Completing and lodging this form does <b>not</b> exempt the applicant from any
licence required under the National Forests Act, 84 of 1998, or other legislation (e.g. NEMA, provincial permits) — the
applicant remains solely responsible for their own statutory compliance.</p>

<h2>A &nbsp;Particulars of Applicant</h2>
<table>
  ${field("Full name of applicant", r[4])}
  ${field("ID or passport number", "")}
  ${field("Postal address", "")}
  ${field("Physical address", "")}
  ${field("E-mail address", r[5])}
  ${field("Telephone / cellular number", "")}
  ${field("Are you a CPA member, or a representative/contractor acting for one?", "")}
</table>

<h2>B &nbsp;Site &amp; Harvesting Details</h2>
<table>
  ${field("Portion / site reference", r[6])}
  ${field("Nearest town or village", "")}
  ${field("Period for which the permit is required (from &ndash; to)", r[1])}
  ${field("Purpose of harvesting", r[9])}
</table>

<h2>C &nbsp;Timber Species &amp; Quantity</h2>
<p class="note">Add rows or attach a separate schedule if the space below is not sufficient.</p>
<table>
  <tr><th>No.</th><th>Species (scientific / common name)</th><th>Quantity (estimated volume / number of trees or logs)</th><th>Condition</th></tr>
  ${[1, 2, 3, 4].map((n) => `<tr><td>${n}</td><td>${n === 1 && r[7] ? esc(r[7]) : "&nbsp;"}</td><td>${n === 1 && r[8] ? esc(r[8]) : "&nbsp;"}</td><td>&nbsp;</td></tr>`).join("")}
</table>

<h2>D &nbsp;Method Statement</h2>
<p>How will the harvesting/felling be carried out (method, equipment, timing)?</p>
<p class="fill">_____________________________________________________________________________________</p>
<p>Transport arrangements from the harvesting site to its destination:</p>
<p class="fill">_____________________________________________________________________________________</p>
<p>If for sale — buyer/purchaser name, address and contact details:</p>
<p class="fill">_____________________________________________________________________________________</p>

<h2>E &nbsp;Attachments</h2>
<table>
  <tr><td style="width:80%;">Certified copy of applicant's ID or passport</td><td>Yes&nbsp;&#9744;&nbsp;&nbsp;No&nbsp;&#9744;</td></tr>
  <tr><td>Proof of CPA membership, or authorisation to act as a representative/contractor</td><td>Yes&nbsp;&#9744;&nbsp;&nbsp;No&nbsp;&#9744;</td></tr>
  <tr><td>Site map / GPS coordinates of the harvesting area</td><td>Yes&nbsp;&#9744;&nbsp;&nbsp;No&nbsp;&#9744;</td></tr>
  <tr><td>Any National Forests Act (or other statutory) licence already obtained, or proof an application has been lodged</td><td>Yes&nbsp;&#9744;&nbsp;&nbsp;No&nbsp;&#9744;</td></tr>
  <tr><td>List of buyers/retailers, if the timber is being sold</td><td>Yes&nbsp;&#9744;&nbsp;&nbsp;No&nbsp;&#9744;</td></tr>
</table>

<h2>Declaration by Applicant</h2>
<p>I, the undersigned, declare that all particulars furnished in this application are true and correct, and confirm that I
remain responsible for obtaining any licence required by law before commencing any harvesting activity.</p>
<table class="sig"><tr><th>Signature</th><th>Full name</th><th>Date</th></tr><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></table>

<h2>For CPA use only &mdash; Verification</h2>
<table class="sig">
  <tr><th>Received by</th><th>Date received</th><th>Recommended? (Y/N)</th></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
  <tr><th>Approved/rejected by (EXCO / Land Committee)</th><th>Decision</th><th>Date</th></tr>
  <tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>
</table>`;
}
function permitCertificateBodyHtml(r) {
  const validRange = `${r[12] ? esc(r[12]) : esc((r[1] || "").split(" to ")[0] || "")}${r[1] ? " &ndash; " + esc(r[1]) : ""}`;
  return `
<div class="cert">
  <h1>Timber Harvesting Permit</h1>
  <div class="no">Permit No. ${esc(r[11] || "")}</div>
  <p>This permit is issued by <b>${esc(DATA.cpa.name || "the CPA")}</b> to:</p>
  <table>
    <tr><td style="width:36%;font-weight:600;">Holder</td><td>${esc(r[4] || "")}</td></tr>
    <tr><td style="font-weight:600;">Contact</td><td>${esc(r[5] || "")}</td></tr>
    <tr><td style="font-weight:600;">Site / portion</td><td>${esc(r[6] || "")}</td></tr>
    <tr><td style="font-weight:600;">Species authorised</td><td>${esc(r[7] || "")}</td></tr>
    <tr><td style="font-weight:600;">Quantity authorised</td><td>${esc(r[8] || "")}</td></tr>
    <tr><td style="font-weight:600;">Purpose</td><td>${esc(r[9] || "")}</td></tr>
    <tr><td style="font-weight:600;">Valid</td><td>${validRange}</td></tr>
  </table>
  <h2 style="margin-top:14pt;">Conditions</h2>
  <ol>
    <li>This permit is issued under ${esc(DATA.cpa.name || "the CPA")}'s own institutional governance and land-allocation
      authority. It does <b>not</b> constitute, and does not replace, any licence required under the National Forests Act,
      84 of 1998, or any other applicable legislation — the holder remains solely responsible for obtaining any such
      statutory licence before commencing harvesting.</li>
    <li>Harvesting is confined strictly to the species, quantity and site specified above.</li>
    <li>This permit may be suspended or revoked by ${esc(DATA.cpa.name || "the CPA")} for breach of its conditions.</li>
    ${r[13] ? `<li>${esc(r[13])}</li>` : ""}
  </ol>
  <table class="sig" style="margin-top:16pt;"><tr><th>Signature</th><th>Name</th><th>Capacity</th><th>Date issued</th></tr>
    <tr><td>&nbsp;</td><td>&nbsp;</td><td>EXCO / Land Committee</td><td>${esc((r[12] || "").slice(0, 10))}</td></tr></table>
</div>`;
}
function printHtmlDoc(title, bodyHtml) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${permitDocCss()}</style></head>
    <body>${bodyHtml}</body></html>`;
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const w = window.open(url, "_blank");
  if (!w) { toast("Please allow pop-ups to print this document.", true); URL.revokeObjectURL(url); return; }
  w.opener = null;
  w.addEventListener("load", () => { w.print(); setTimeout(() => URL.revokeObjectURL(url), 4000); });
}
function downloadPermitApplication(r) {
  const html = permitDocShell("Timber Harvesting Permit Application", DATA.cpa.name || "", permitApplicationBodyHtml(r));
  downloadFile(`Timber-Permit-Application-${(r[4] || r[0] || "form").replace(/[^\w\- ]+/g, "_")}.doc`, html, "application/msword");
  if (r.__index != null && (DATA.assets.permits[r.__index][10] === "Not Started")) {
    DATA.assets.permits[r.__index][10] = "Form Downloaded";
    commit("permits");
  }
}
function downloadPermitCertificate(r, asPrint) {
  const bodyHtml = permitCertificateBodyHtml(r);
  if (asPrint) { printHtmlDoc(`Permit ${r[11] || ""}`, bodyHtml); return; }
  const html = permitDocShell("Timber Harvesting Permit", `Permit ${r[11] || ""}`, bodyHtml);
  downloadFile(`Timber-Permit-${(r[11] || r[4] || "certificate").replace(/[^\w\- ]+/g, "_")}.doc`, html, "application/msword");
}
function issuePermit(idx) {
  const r = DATA.assets.permits[idx];
  if (!r[11]) r[11] = nextPermitNumber();
  r[10] = "Issued"; r[2] = "Valid";
  if (!r[1]) r[1] = "";
  commit("permits");
  toast(`Permit ${r[11]} issued.`);
  downloadPermitCertificate(r, false);
}
async function emailPermitToApplicant(idx) {
  const r = DATA.assets.permits[idx];
  if (!(r[5] || "").trim()) { toast("Add the applicant's e-mail address first (Manage → edit this row).", true); return; }
  const bodyHtml = permitCertificateBodyHtml(r);
  const html = permitDocShell("Timber Harvesting Permit", `Permit ${r[11] || ""}`, bodyHtml);
  toast("Sending…");
  try {
    await repo.sendPermitEmail({
      orgId, to: r[5], subject: `${DATA.cpa.name || "CPA360"} — Timber Harvesting Permit ${r[11] || ""}`,
      html: `<p>Dear ${esc(r[4] || "Applicant")},</p><p>Please find attached your timber harvesting permit, ${esc(r[11] || "")}.</p>${bodyHtml}`,
      filename: `Timber-Permit-${r[11] || ""}.doc`,
      fileBase64: btoa(unescape(encodeURIComponent(html))),
    });
    await repo.markPermitEmailed(r._id);
    r[13] = new Date().toISOString();
    toast(`Permit emailed to ${r[5]}.`);
    renderCurrent();
  } catch (e) {
    toast("Couldn't send: " + (e.message || e), true);
  }
}
function editPermits() {
  listEditor({
    title: "Permits & licences", arr: DATA.assets.permits, section: "permits",
    rowLabel: (r) => `${r[0] || "—"} — ${r[2]}`,
    blank: () => ["", "", "Not Started", "Other", "", "", "", "", "", "", "Not Started", "", "", ""],
    fields: (r) => [
      { key: "name", label: "Permit / licence", type: "text", value: r[0], required: true },
      { key: "commodity", label: "Commodity", type: "select", options: PERMIT_COMMODITIES, value: r[3] || "Other" },
      { key: "valid", label: "Valid until (or period, e.g. \"12 months\")", type: "text", value: r[1] },
      { key: "status", label: "Status", type: "select", options: ["Valid", "Expiring Soon", "Under Renewal", "Not Started"], value: r[2] },
      { key: "applicantName", label: "Applicant name", type: "text", value: r[4] },
      { key: "applicantEmail", label: "Applicant e-mail (for the issued permit)", type: "text", value: r[5] },
      { key: "siteRef", label: "Site / portion reference", type: "text", value: r[6] },
      { key: "species", label: "Species", type: "text", value: r[7] },
      { key: "quantity", label: "Quantity", type: "text", value: r[8] },
      { key: "purpose", label: "Purpose", type: "select", options: ["", ...PERMIT_PURPOSES], value: r[9] },
      { key: "stage", label: "Workflow stage", type: "select", options: PERMIT_STAGES, value: r[10] || "Not Started" },
      { key: "permitNo", label: "Permit number (auto-assigned on issue if left blank)", type: "text", value: r[11] },
      { key: "decision", label: "Decision / verification notes", type: "textarea", value: r[12] },
    ],
    write: (r, o) => {
      r[0] = o.name; r[1] = o.valid; r[2] = o.status; r[3] = o.commodity;
      r[4] = o.applicantName; r[5] = o.applicantEmail; r[6] = o.siteRef; r[7] = o.species; r[8] = o.quantity;
      r[9] = o.purpose; r[10] = o.stage; r[11] = o.permitNo; r[12] = o.decision;
    },
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
const BUSINESS_CASE_STATES = ["None", "Concept note", "Draft", "Complete", "Approved", "Funded"];
const IMPACT_RATINGS = ["Low", "Medium", "High"];
function editProject(idx) {
  const p = idx == null ? null : DATA.projects[idx];
  openModal(p ? "Edit project" : "Add project", [
    { key: "name", label: "Project", type: "text", value: p ? p[0] : "", required: true },
    { key: "stage", label: "Stage", type: "select", options: PROJECT_STAGES, value: p ? p[1] : "Concept" },
    { key: "budget", label: "Budget (R)", type: "number", value: p ? p[2] : 0, min: 0 },
    { key: "spent", label: "Spent (R)", type: "number", value: p ? p[3] : 0, min: 0 },
    { key: "pct", label: "Progress %", type: "number", value: p ? p[4] : 0, min: 0, max: 100 },
    { key: "status", label: "Status", type: "select", options: PROJECT_STATUSES, value: p ? p[5] : "Not Started" },
    { key: "bc", label: "Business case", type: "select", options: BUSINESS_CASE_STATES, value: p ? p[6] : "None" },
    { key: "funder", label: "Funder", type: "text", value: p ? p[7] : "" },
    { key: "cofund", label: "Co-funding secured (R)", type: "number", value: p ? p[8] : 0, min: 0 },
    { key: "rdy", label: "Funding readiness %", type: "number", value: p ? p[9] : 0, min: 0, max: 100 },
    { key: "impact", label: "Expected impact", type: "select", options: IMPACT_RATINGS, value: p ? p[10] : "Medium" },
  ], (out) => {
    const row = [out.name, out.stage, parseFloat(out.budget) || 0, parseFloat(out.spent) || 0,
      Math.max(0, Math.min(100, parseFloat(out.pct) || 0)), out.status,
      out.bc || "None", out.funder, parseFloat(out.cofund) || 0,
      Math.max(0, Math.min(100, parseFloat(out.rdy) || 0)), out.impact || "Medium"];
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
/* A resolution can always be saved with no attachments — these are two
   optional, independently-tracked evidence slots layered on top of the row
   via the generic documents store (section "resolution" / "resolution-attendance"). */
function resDocCellHtml(refId) {
  const doc = docCount("resolution", refId);
  const att = docCount("resolution-attendance", refId);
  const chip = (kind, icon, n, label) => `<button type="button" class="doc-chip${n ? "" : " missing"}"
      data-res-${kind}="${esc(refId)}" title="${label}${n ? ` — ${n} file${n > 1 ? "s" : ""} attached` : " — missing"}"
      aria-label="${label}${n ? "" : ", missing"}">${icon}${n ? `<span>${n}</span>` : ""}</button>`;
  return `<div class="row-actions doc-chips">
    ${chip("doc", CLIP, doc, "Signed resolution")}
    ${chip("att", ATTENDEES, att, "Attendance register")}
  </div>`;
}
function renderGovResolutions(host) {
  const rows = DATA.governance.resolutions;
  const open = rows.filter((r) => !["Implemented", "Adopted", "Closed"].includes(r[6])).length;
  const missingDoc = rows.filter((r) => docCount("resolution", r._id) === 0).length;
  mountRegister(host, {
    title: "Resolutions Register", importKey: "gov_resolutions",
    hint: "Decisions of the EXCO and general meetings — with their implementation status. Attach the signed resolution and the meeting's attendance register once they're available; a resolution can be recorded before either is ready.",
    stats: () => [
      statTile("Resolutions", rows.length, "On record", ""),
      statTile("Still Open", open, "Not yet implemented", open ? "warning" : "good"),
      statTile("Implemented", rows.length - open, "Closed out", "good"),
      statTile("Missing Signed Copy", missingDoc, "No resolution document attached", missingDoc ? "warning" : "good"),
    ],
    columns: [{ label: "Ref." }, { label: "Date" }, { label: "Meeting" }, { label: "Decision" }, { label: "Responsible" }, { label: "Due" }, { label: "Status" }, { label: "Documents" }],
    rows: () => rows,
    empty: "No resolutions recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`,
      esc(r[2]), `<span style="min-width:220px;display:inline-block;">${esc(r[3])}</span>`, esc(r[4]), `<span class="mono">${esc(r[5])}</span>`,
      statusPill(r[6]), resDocCellHtml(r._id)],
    manage: () => listEditor(GOV_EDITORS.resolutions()),
    afterRender: (h) => {
      h.querySelectorAll("[data-res-doc]").forEach((b) => (b.onclick = () => {
        const r = rows.find((x) => String(x._id) === b.dataset.resDoc);
        attachmentsModal("resolution", r._id, "Signed resolution — " + (r[0] || r[3].slice(0, 40)));
      }));
      h.querySelectorAll("[data-res-att]").forEach((b) => (b.onclick = () => {
        const r = rows.find((x) => String(x._id) === b.dataset.resAtt);
        attachmentsModal("resolution-attendance", r._id, "Attendance register — " + (r[0] || r[3].slice(0, 40)));
      }));
    },
  });
}
/* A meeting can always be saved with no attachment — the scanned attendance
   register is an optional evidence slot layered on top of the row via the
   generic documents store (section "meeting-attendance"), same pattern as
   the Resolutions register's doc chips. */
function meetingDocCellHtml(refId) {
  const att = docCount("meeting-attendance", refId);
  return `<div class="row-actions doc-chips">
    <button type="button" class="doc-chip${att ? "" : " missing"}"
      data-meet-att="${esc(refId)}" title="Attendance register${att ? ` — ${att} file${att > 1 ? "s" : ""} attached` : " — missing"}"
      aria-label="Attendance register${att ? "" : ", missing"}">${ATTENDEES}${att ? `<span>${att}</span>` : ""}</button>
  </div>`;
}
function renderGovMeetings(host) { renderGovMeetingList(host, null); }
function renderGovAgm(host) { renderGovMeetingList(host, ["AGM", "SGM"]); }
function renderGovMeetingList(host, kinds) {
  const all = DATA.governance.meetings;
  const rows = kinds ? all.filter((r) => kinds.includes(r[0])) : all;
  const nextAgm = (DATA.governance.calendar || []).find((r) => /general meeting/i.test(r[0]));
  mountRegister(host, {
    title: kinds ? "AGM / SGM Records" : "Meetings Register", importKey: "gov_meetings",
    hint: (kinds && nextAgm ? `Next AGM due ${nextAgm[2] || "—"}. ` : (kinds ? "Annual and special general meetings. " : "All governance meetings and their minute status. "))
      + "Attach the scanned attendance register once it's available — a meeting can be recorded before it's ready.",
    columns: [{ label: "Type" }, { label: "Date" }, { label: "Venue" }, { label: "Quorum" }, { label: "Attendance", cls: "num" }, { label: "Minutes" }, { label: "Notes" }, { label: "Attendance reg." }],
    rows: () => rows,
    empty: kinds ? "No general meetings recorded." : "No meetings recorded.",
    cell: (r) => [`<span class="pill brand">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`, esc(r[2]),
      statusPill(r[3] || "Pending"), `<span class="mono">${esc(r[4] || "")}</span>`, statusPill(r[5]), `<span style="color:var(--ink-2);">${esc(r[6])}</span>`,
      meetingDocCellHtml(r._id)],
    manage: () => listEditor(GOV_EDITORS.meetings()),
    afterRender: (h) => {
      h.querySelectorAll("[data-meet-att]").forEach((b) => (b.onclick = () => {
        const r = rows.find((x) => String(x._id) === b.dataset.meetAtt);
        attachmentsModal("meeting-attendance", r._id, "Attendance register — " + (r[0] || "Meeting") + " " + (r[1] || ""), {
          accept: "application/pdf,.pdf", label: "Upload the scanned register (PDF)",
          match: /\.pdf$|^application\/pdf$/i, matchMsg: "Please choose a PDF file.",
        });
      }));
    },
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

const MF_BLURB = {
  Governance: "Constitution, registration, EXCO, minutes, resolutions, the DoA matrix.",
  Beneficiaries: "The Master Beneficiary Register, verification evidence, household and succession records.",
  Land: "Title deeds, the SG diagram, the land audit, allocation and lease agreements.",
  Assets: "The asset register, infrastructure records, valuations and maintenance logs.",
  Finance: "Budgets, cashbooks, bank statements, annual financial statements and audit reports.",
  HR: "Employment contracts, payroll, policies, the organogram.",
  Projects: "Business cases, funding agreements, progress and completion reports.",
  Productivity: "Production plans and records, enterprise agreements, water-use licences.",
  Commercial: "Market agreements, offtake contracts, partnership MOUs, revenue records.",
  Compliance: "Statutory returns, regulatory permits, DALRRD reports, the policy framework.",
  Performance: "Institutional assessments, the CPA360 scorecard, M&E and board packs.",
};
function renderMasterFile() {
  const mf = DATA.masterFile;
  const avg = mf.length ? Math.round(mf.reduce((s, r) => s + (+r[3] || 0), 0) / mf.length) : 0;
  const complete = mf.filter((r) => r[3] >= 90).length;
  const totalFiles = Object.values((DATA._docCounts || {}).masterfile || {}).reduce((s, n) => s + n, 0)
    + (((DATA._docCounts || {}).general || {})._ || 0);
  $("masterfile-stats").innerHTML = [
    statTile("Categories", mf.length, "The CPA360™ Master File structure", ""),
    statTile("Overall Completeness", avg + "%", "Average across categories", avg >= 70 ? "good" : avg >= 40 ? "warning" : "critical"),
    statTile("Categories Complete", complete + " / " + mf.length, "≥ 90% complete", complete === mf.length ? "good" : ""),
    statTile("Documents Filed", totalFiles, "Across all categories", ""),
  ].join("");
  $("masterfile-grid").innerHTML = mf.length ? mf.map((row) => {
    const [no, name, , pct] = row;
    const tone = pct >= 90 ? "good" : pct >= 50 ? "warning" : "critical";
    const status = pct >= 90 ? "Complete" : pct >= 40 ? "In Progress" : "Not Started";
    const nf = docCount("masterfile", row._id);
    return `<div class="doc-card">
      <div class="top"><span class="sec">${esc(no)}</span>${statusPill(status)}</div>
      <div class="title">${esc(name)}</div>
      <div class="count" style="min-height:32px;">${esc(MF_BLURB[name] || "")}</div>
      <div class="progress"><span style="width:${Math.max(0, Math.min(100, +pct || 0))}%; background:var(--status-${tone});"></span></div>
      <div class="hint" style="margin-top:4px;">${pct}% complete · ${nf} file${nf === 1 ? "" : "s"}</div>
      <button class="btn ${CAN_EDIT ? "" : "view-ok"}" type="button" data-mf-files="${esc(row._id || "")}" style="margin-top:8px;padding:4px 10px;font-size:11px;">
        Open files</button>
    </div>`;
  }).join("") : `<p class="muted">No master-file categories — reload the page.</p>`;
  $("masterfile-grid").querySelectorAll("[data-mf-files]").forEach((b) => (b.onclick = () => {
    const r = mf.find((x) => String(x._id) === b.dataset.mfFiles);
    if (r) attachmentsModal("masterfile", r._id, r[1] + " — Master File documents");
  }));
  const gb = $("mf-general-btn");
  if (gb) gb.textContent = "General documents" + ((((DATA._docCounts || {}).general || {})._ || 0) ? ` · ${((DATA._docCounts || {}).general || {})._}` : "");
}

/* ============ Gallery / Media ============
   A media item is just a `documents` row (section "gallery", ref_id null) —
   the storage/RLS model is identical to every other attachment in the app.
   What's bespoke here: kind detection (image/video/audio), an auto-organize
   pass that groups everything into month folders by "date taken" (EXIF for
   JPEGs, else the file's own last-modified date, else upload date), and an
   in-browser lightbox so files can be browsed without downloading. */
const MEDIA_EXT = {
  image: ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "bmp", "svg"],
  video: ["mp4", "mov", "webm", "m4v", "avi", "mkv"],
  audio: ["mp3", "wav", "m4a", "aac", "ogg", "opus", "flac"],
};
function mediaKind(mime, name) {
  const m = (mime || "").toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  const ext = (name || "").split(".").pop().toLowerCase();
  for (const k of Object.keys(MEDIA_EXT)) if (MEDIA_EXT[k].includes(ext)) return k;
  return "other";
}
/* Best-effort EXIF "date taken" reader for JPEGs — reads just the first
   128KB (the EXIF block always sits at the very start of the file, long
   before pixel data), walks the JPEG marker chain to APP1, then the TIFF
   IFD0 → Exif SubIFD for tag 0x9003 (DateTimeOriginal). Any failure at any
   step returns null and the caller falls back to the file's own date —
   this is a nice-to-have, never something upload correctness depends on. */
async function readExifDate(file) {
  try {
    const buf = await file.slice(0, 131072).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return null;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      if (view.getUint8(offset) !== 0xff) return null;
      const marker = view.getUint8(offset + 1);
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) { offset += 2; continue; }
      if (marker === 0xda) return null; // start of scan — image data follows, no more markers to scan
      if (offset + 4 > view.byteLength) return null;
      const segLen = view.getUint16(offset + 2);
      if (marker === 0xe1 && offset + 4 + 6 <= view.byteLength && view.getUint32(offset + 4) === 0x45786966) {
        const tiffStart = offset + 4 + 6;
        if (tiffStart + 8 > view.byteLength) return null;
        const little = view.getUint16(tiffStart) === 0x4949;
        const g16 = (o) => view.getUint16(o, little);
        const g32 = (o) => view.getUint32(o, little);
        const readIfd = (ifdOffset) => {
          if (ifdOffset + 2 > view.byteLength) return {};
          const count = g16(ifdOffset);
          const entries = {};
          for (let i = 0; i < count; i++) {
            const eo = ifdOffset + 2 + i * 12;
            if (eo + 12 > view.byteLength) break;
            entries[g16(eo)] = { numValues: g32(eo + 4), valueOffset: eo + 8 };
          }
          return entries;
        };
        const readAscii = (entry) => {
          let start = entry.valueOffset;
          const len = entry.numValues;
          if (len > 4) start = tiffStart + g32(entry.valueOffset);
          if (start + len > view.byteLength) return "";
          let s = "";
          for (let i = 0; i < len - 1; i++) s += String.fromCharCode(view.getUint8(start + i));
          return s;
        };
        const ifd0 = readIfd(tiffStart + g32(tiffStart + 4));
        let dateStr = "";
        if (ifd0[0x8769]) {
          const exifIfd = readIfd(tiffStart + g32(ifd0[0x8769].valueOffset));
          dateStr = (exifIfd[0x9003] && readAscii(exifIfd[0x9003])) || (exifIfd[0x9004] && readAscii(exifIfd[0x9004])) || "";
        }
        if (!dateStr && ifd0[0x0132]) dateStr = readAscii(ifd0[0x0132]);
        const m = /^(\d{4}):(\d{2}):(\d{2})/.exec(dateStr);
        return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
      }
      offset += 2 + segLen;
    }
  } catch (e) { /* not a JPEG, truncated, or malformed — fall back below */ }
  return null;
}
async function fileTakenOn(file, kind) {
  if (kind === "image") {
    const exif = await readExifDate(file);
    if (exif) return exif;
  }
  if (file.lastModified) {
    const d = new Date(file.lastModified);
    if (!isNaN(d) && d.getFullYear() > 1990) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}
function galleryMonthKey(doc) {
  const raw = doc.taken_on || (doc.uploaded_at || "").slice(0, 10);
  const d = raw ? new Date(raw + (raw.length === 10 ? "T00:00:00" : "")) : null;
  if (!d || isNaN(d)) return { label: "Undated", sort: "0000-00" };
  return { label: d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" }), sort: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` };
}
let GALLERY = { docs: [], urls: new Map(), filter: "all" };
function galleryTileHtml(doc, i) {
  const kind = mediaKind(doc.mime, doc.name);
  const url = GALLERY.urls.get(doc.path);
  let thumb;
  if (kind === "image" && url) thumb = `<img src="${esc(url)}" loading="lazy" alt="">`;
  else if (kind === "video" && url) thumb = `<video src="${esc(url)}#t=0.5" preload="metadata" muted playsinline></video><span class="gallery-play">${PLAY_ICON}</span>`;
  else if (kind === "audio") thumb = `<span class="gallery-ic audio">${AUDIO_ICON}</span>`;
  else thumb = `<span class="gallery-ic">${FILE_ICON}</span>`;
  return `<button type="button" class="gallery-tile" data-gi="${i}" title="${esc(doc.name)}">
    <span class="gallery-thumb">${thumb}</span>
    <span class="gallery-name">${esc(doc.name)}</span>
  </button>`;
}
function paintGallery() {
  const host = $("gallery-body");
  if (!host) return;
  const filtered = GALLERY.filter === "all" ? GALLERY.docs : GALLERY.docs.filter((d) => mediaKind(d.mime, d.name) === GALLERY.filter);
  const counts = { image: 0, video: 0, audio: 0, other: 0 };
  GALLERY.docs.forEach((d) => { counts[mediaKind(d.mime, d.name)] = (counts[mediaKind(d.mime, d.name)] || 0) + 1; });
  const groups = new Map();
  filtered.forEach((d) => {
    const g = galleryMonthKey(d);
    if (!groups.has(g.sort)) groups.set(g.sort, { label: g.label, items: [] });
    groups.get(g.sort).items.push(d);
  });
  const sortedKeys = [...groups.keys()].sort((a, b) => b.localeCompare(a));
  const indexOf = new Map(filtered.map((d, i) => [d, i]));
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Total files", GALLERY.docs.length, "Images, video & audio", "")}
      ${statTile("Images", counts.image || 0, "", "")}
      ${statTile("Videos", counts.video || 0, "", "")}
      ${statTile("Audio", counts.audio || 0, "", "")}
    </div>
    <div class="card-head" style="margin:18px 0 12px;">
      <div><h3 style="font-size:13px;">Media</h3>
        <span class="hint">Auto-organized into month folders by the date each file was taken (read from the photo itself where
          possible) — not the date it was uploaded. Click any tile to preview it in full, without downloading.</span></div>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        ${["all", "image", "video", "audio"].map((k) => `<button class="btn${GALLERY.filter === k ? " active" : ""}" data-gfilter="${k}" type="button">${k === "all" ? "All" : k[0].toUpperCase() + k.slice(1) + "s"}</button>`).join("")}
        ${CAN_EDIT ? `<label class="btn primary" style="cursor:pointer;display:inline-flex;">Upload media<input type="file" id="gallery-file" accept="image/*,video/*,audio/*" multiple hidden></label>` : ""}
      </span>
    </div>
    <div id="gallery-msg" style="font-size:11.5px;color:var(--ink-muted);margin-bottom:8px;"></div>
    <div id="gallery-groups">
      ${filtered.length ? sortedKeys.map((k) => {
        const g = groups.get(k);
        return `<div class="gallery-group">
          <div class="gallery-group-head"><h4>${esc(g.label)}</h4><span class="hint">${g.items.length} file${g.items.length === 1 ? "" : "s"}</span></div>
          <div class="gallery-grid">${g.items.map((d) => galleryTileHtml(d, indexOf.get(d))).join("")}</div>
        </div>`;
      }).join("") : stateHtml("empty", GALLERY.docs.length ? "No files match this filter." : "No media uploaded yet — add photos, video or audio with “Upload media”.")}
    </div>`;

  host.querySelectorAll("[data-gfilter]").forEach((b) => (b.onclick = () => { GALLERY.filter = b.dataset.gfilter; paintGallery(); }));
  host.querySelectorAll("[data-gi]").forEach((b) => (b.onclick = () => openLightbox(filtered, +b.dataset.gi)));
  const fi = host.querySelector("#gallery-file");
  if (fi) fi.onchange = () => uploadGalleryFiles([...fi.files], host.querySelector("#gallery-msg"), fi);
}
async function refreshGallery() {
  const host = $("gallery-body");
  if (host && !GALLERY.docs.length) host.innerHTML = stateHtml("loading", "Loading gallery…");
  try {
    const docs = await repo.listDocs(orgId, "gallery", null);
    const urlMap = await repo.docPreviewUrls(docs.map((d) => d.path)).catch(() => new Map());
    GALLERY.docs = docs;
    GALLERY.urls = urlMap;
    paintGallery();
  } catch (e) {
    if (host) host.innerHTML = stateHtml("error", "Couldn't load the gallery. " + (e.message || e));
  }
}
function renderGallery() { refreshGallery(); }
async function uploadGalleryFiles(files, msgEl, input) {
  if (!files.length) return;
  const max = 200 * 1048576;
  let ok = 0, failed = 0;
  for (const f of files) {
    if (f.size > max) { failed++; continue; }
    if (msgEl) msgEl.textContent = `Uploading ${f.name}… (${ok + failed + 1}/${files.length})`;
    try {
      const kind = mediaKind(f.type, f.name);
      const takenOn = await fileTakenOn(f, kind);
      await repo.uploadDoc(orgId, "gallery", null, f, { taken_on: takenOn });
      bumpDocCount("gallery", null, 1);
      ok++;
    } catch (e) { failed++; }
  }
  if (input) input.value = "";
  if (msgEl) msgEl.textContent = failed ? `Uploaded ${ok}, ${failed} failed (max 200 MB each).` : `Uploaded ${ok} file${ok === 1 ? "" : "s"}.`;
  await refreshGallery();
  if (onChange) onChange();
}
/* Lightbox — browse full-size without opening a new tab or downloading;
   Prev/Next and Esc/arrow keys move within the currently filtered set. */
function openLightbox(list, index) {
  let i = index;
  const scrim = document.createElement("div");
  scrim.className = "modal-scrim cpa-dash lightbox-scrim";
  document.body.appendChild(scrim);
  const close = () => { document.removeEventListener("keydown", onKey); scrim.remove(); };
  const onKey = (e) => {
    if (e.key === "Escape") close();
    else if (e.key === "ArrowLeft") show(i - 1);
    else if (e.key === "ArrowRight") show(i + 1);
  };
  document.addEventListener("keydown", onKey);
  function show(n) {
    i = (n + list.length) % list.length;
    const d = list[i];
    const kind = mediaKind(d.mime, d.name);
    const url = GALLERY.urls.get(d.path) || "";
    const media = kind === "image" ? `<img src="${esc(url)}" alt="${esc(d.name)}">`
      : kind === "video" ? `<video src="${esc(url)}" controls autoplay></video>`
      : kind === "audio" ? `<div class="lightbox-audio">${AUDIO_ICON}<audio src="${esc(url)}" controls autoplay></audio></div>`
      : `<div class="lightbox-audio">${FILE_ICON}<p class="hint">Preview isn't available for this file type.</p></div>`;
    scrim.innerHTML = `
      <div class="lightbox" role="dialog" aria-modal="true" aria-label="${esc(d.name)}">
        <button class="lightbox-close" data-act="close" type="button" aria-label="Close">&times;</button>
        ${list.length > 1 ? `<button class="lightbox-nav prev" data-act="prev" type="button" aria-label="Previous">&#8249;</button>
        <button class="lightbox-nav next" data-act="next" type="button" aria-label="Next">&#8250;</button>` : ""}
        <div class="lightbox-media">${media}</div>
        <div class="lightbox-info">
          <div><b>${esc(d.name)}</b><span class="hint">${esc(galleryMonthKey(d).label)} · ${fmtBytes(d.size)}</span></div>
          <span class="row-actions">
            <a class="btn" href="${esc(url)}" download="${esc(d.name)}" target="_blank" rel="noopener">Download</a>
            ${CAN_EDIT ? `<button class="btn danger" data-act="delete" type="button">Delete</button>` : ""}
          </span>
        </div>
      </div>`;
    scrim.querySelector('[data-act="close"]').onclick = close;
    scrim.addEventListener("click", (e) => { if (e.target === scrim) close(); }, { once: true });
    const prevBtn = scrim.querySelector('[data-act="prev"]'); if (prevBtn) prevBtn.onclick = () => show(i - 1);
    const nextBtn = scrim.querySelector('[data-act="next"]'); if (nextBtn) nextBtn.onclick = () => show(i + 1);
    const delBtn = scrim.querySelector('[data-act="delete"]');
    if (delBtn) delBtn.onclick = () => confirmModal(`Delete "${d.name}"? This can't be undone.`, async () => {
      try {
        await repo.deleteDoc(d);
        bumpDocCount("gallery", null, -1);
        close();
        await refreshGallery();
        if (onChange) onChange();
      } catch (e) { toast("Couldn't delete: " + (e.message || e), true); }
    });
  }
  show(i);
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
/* Every person in a household's family tree — the ODI, the Family
   Representative, each descendant — is a real beneficiary; this is the
   structured "which one are they" tag, set automatically when extracted
   from Household Records (see extractOneHousehold) or picked manually for
   a beneficiary added straight into the register. */
const HOUSEHOLD_ROLES = ["", "ODI", "Family Representative", "1st Descendant", "2nd Descendant", "3rd Descendant", "4th Descendant"];
const BENEFIT_BASIS_OPTIONS = ["", "Per Household", "Per Capita"];

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
    columns: [{ label: "Ref." }, { label: "Full name" }, { label: "Family position" }, { label: "Gender" }, { label: "DOB" }, { label: "Household" },
      { label: "Contact" }, { label: "Joined" }, { label: "Status" }, { label: "Verification" }],
    rows: () => DATA.beneficiaryCentre.register,
    empty: "No beneficiaries captured yet — Import a spreadsheet or add them.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`,
      `<span style="font-weight:600;">${esc(r[1])}</span>`, r[11] ? `<span class="pill neutral">${esc(r[11])}</span>` : "—",
      esc(r[2]), `<span class="mono">${esc(r[3])}</span>`,
      `<span class="mono">${esc(r[5])}</span>`, esc(r[6]), `<span class="mono">${esc(r[7])}</span>`,
      statusPill(r[8]), statusPill(r[9])],
    manage: () => listEditor(BENE_EDITORS.register()),
    bulkKey: "bene-register", filterCol: 8, filterLabel: "Status", section: "beneficiaries",
    rerender: () => renderBeneRegister(host),
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
/* Each household is a family tree rooted at its ODI: the ODI, the Family
   Representative and up to 4 descendants — is a real beneficiary. Each
   becomes its own row in the Master Beneficiary Register, tagged with its
   Family position (see HOUSEHOLD_ROLES) so 1st/2nd/3rd/4th Descendant is a
   proper field, not a number you have to infer. Keyed by <household
   ref>-<slot>, so running it again after editing a household updates the
   same beneficiary rather than duplicating; status/verification already set
   on an existing extracted beneficiary is left alone. Mutates
   DATA.beneficiaryCentre.register directly — caller commits. */
function extractOneHousehold(h, reg) {
  const hhRef = h[0];
  const slots = [
    { suffix: "ODI", name: h[2], id: h[3], role: "ODI" },
    { suffix: "REP", name: h[1], id: "", role: "Family Representative" },
    { suffix: "D1", name: h[4], id: h[5], role: "1st Descendant" },
    { suffix: "D2", name: h[6], id: h[7], role: "2nd Descendant" },
    { suffix: "D3", name: h[8], id: h[9], role: "3rd Descendant" },
    { suffix: "D4", name: h[10], id: h[11], role: "4th Descendant" },
  ];
  let created = 0, updated = 0;
  slots.forEach((s) => {
    const name = (s.name || "").trim();
    if (!name) return;
    const ref = `${hhRef}-${s.suffix}`;
    const note = `Extracted as ${s.role} of household ${hhRef}.`;
    const existing = reg.find((r) => r[0] === ref);
    if (existing) {
      existing[1] = name; existing[4] = maskId(s.id); existing[5] = hhRef; existing[10] = note; existing[11] = s.role;
      updated++;
    } else {
      reg.push([ref, name, "Unspecified", "", maskId(s.id), hhRef, "", "", "Active", "Pending", note, s.role]);
      created++;
    }
  });
  return { created, updated };
}
function extractHouseholdsAsBeneficiaries() {
  const bulk = bulkState("bene-households");
  const households = DATA.beneficiaryCentre.households;
  const chosen = households.filter((h) => bulk.selected.has(String(h._id)));
  if (!chosen.length) { toast("Select one or more households first (the checkbox on the left of each row).", true); return; }

  const reg = DATA.beneficiaryCentre.register;
  let created = 0, updated = 0;
  chosen.forEach((h) => { const r = extractOneHousehold(h, reg); created += r.created; updated += r.updated; });
  if (!created && !updated) { toast("Nothing to extract — the selected household(s) have no names filled in yet.", true); return; }
  commit("beneficiaries");
  toast(`Extracted ${created} new beneficiar${created === 1 ? "y" : "ies"}${updated ? `, updated ${updated} existing` : ""}.`);
}
function renderBeneHouseholds(host) {
  const reg = DATA.beneficiaryCentre.register || [];
  const bulk = bulkState("bene-households");
  const selN = DATA.beneficiaryCentre.households.filter((h) => bulk.selected.has(String(h._id))).length;
  mountRegister(host, {
    title: "Household Records", importKey: "households",
    hint: "Households are a summary/rollup of the family — a household is not itself a beneficiary. Member names and "
      + "IDs live in the Master Beneficiary Register (filter it by Household ref. to see who's in a household); "
      + "“Members” below is a live count from there, not typed in by hand. Importing a spreadsheet here also "
      + "creates each ODI, Family Representative and descendant as a beneficiary automatically. After manual edits, "
      + "select households below and use “Extract” to re-sync the Master Register.",
    columns: [{ label: "Household ID" }, { label: "ODI" }, { label: "Household Head" },
      { label: "Members", cls: "num" }, { label: "Verification" }, { label: "Dispute" }, { label: "Resident?" }, { label: "Status" }],
    rows: () => DATA.beneficiaryCentre.households,
    empty: "No households recorded.",
    cell: (r) => {
      // ID numbers are masked-entry fields (see the Add/Edit form) and — same as the
      // Master Beneficiary Register — never surfaced in the list view, only there.
      const members = reg.filter((x) => x[5] === r[0] && x[8] !== "Removed").length;
      return [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`,
        `<span style="font-weight:600;">${esc(r[2])}</span>`,
        esc(r[1]), `<span class="mono">${members}</span>`,
        statusPill(r[17] || "Pending"),
        r[22] ? pill(r[23] ? `Disputed (${esc(r[23])})` : "Disputed", "critical") : pill("None", "neutral"),
        pill(r[13] ? "Resident" : "Not resident", r[13] ? "good" : "neutral"), statusPill(r[12])];
    },
    manage: () => listEditor(BENE_EDITORS.households()),
    bulkKey: "bene-households", filterCol: 12, filterLabel: "Status", section: "households",
    rerender: () => renderBeneHouseholds(host),
    extraTools: [`<button class="btn" data-reg-extract type="button"${selN ? "" : " disabled"}>Extract${selN ? ` (${selN})` : ""} → Beneficiaries</button>`],
    afterRender: (h) => {
      const b = h.querySelector("[data-reg-extract]");
      if (b) b.onclick = () => extractHouseholdsAsBeneficiaries();
    },
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
    bulkKey: "bene-succession", filterCol: 6, filterLabel: "Status", section: "succession_cases",
    rerender: () => renderBeneSuccession(host),
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
    bulkKey: "bene-disputes", filterCol: 5, filterLabel: "Status", section: "beneficiary_disputes",
    rerender: () => renderBeneDisputes(host),
  });
}
function renderBeneEvidence(host) {
  mountFileList(host, "beneficiary", null, "Verification Evidence",
    "Certified IDs, proof of residence, verification meeting minutes and the signed beneficiary list.");
}

/* ============ Administration Centre ============ */
const ADMIN_TABS = [
  { id: "overview", label: "Overview" },
  { id: "correspondence", label: "Correspondence" },
  { id: "doa", label: "Delegation of Authority" },
  { id: "policies", label: "Policies & SOPs" },
  { id: "records", label: "Records Index" },
];
const ADMIN_PANELS = {
  overview: renderAdminOverview, correspondence: renderAdminCorr, doa: renderAdminDoa,
  policies: renderAdminPolicies, records: renderAdminRecords,
};
function renderAdministration() {
  const strip = $("administration-subtabs");
  strip.innerHTML = subtabStrip("administration", ADMIN_TABS);
  wireSubtabs(strip);
  (ADMIN_PANELS[SUBTAB.administration || "overview"] || renderAdminOverview)($("administration-body"));
}
function renderAdminOverview(host) {
  const d = DATA.score.domains.find((x) => x.name === "Administration") || { achieved: 0, weight: 10 };
  const crits = critFor("Administration");
  const now = new Date();
  const corrOpen = DATA.admin.correspondence.filter((r) => !["Closed"].includes(r[8])).length;
  const polDue = DATA.admin.policies.filter((r) => r[4] && new Date(r[4]) < now).length;
  const polDraft = DATA.admin.policies.filter((r) => ["Draft", "Under Review"].includes(r[6])).length;
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Administration Score", `${domainScore(d)} / ${d.weight}`, "Institutional Performance domain", "")}
      ${statTile("Open correspondence", corrOpen, "Awaiting action or reply", corrOpen ? "warning" : "good")}
      ${statTile("Policies & SOPs", DATA.admin.policies.length, `${polDraft} in draft / review`, polDraft ? "warning" : "good")}
      ${statTile("Delegation lines", DATA.admin.doa.length, "In the authority matrix", "")}
    </div>
    ${polDue ? `<div class="callout" style="margin-top:14px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3.5 22 20H2z"/><path d="M12 10v4M12 17.2v.1"/></svg>
      <div>${polDue} polic${polDue > 1 ? "ies are" : "y is"} past their review date. Open the Policies &amp; SOPs tab.</div></div>` : ""}
    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-head"><h3>Administration rubric</h3>
          <button class="btn view-ok" data-goto="#/v/score" type="button">Score this domain</button></div>
        ${crits.length ? `<ul class="crit-list">${crits.map((c) => {
          const cp = Math.round((+c.achieved || 0) / (c.weight || 1) * 100);
          return `<li><span class="crit-name">${esc(c.name)}</span>
            <span class="bar-track sm"><span class="bar-fill ${healthTone(cp)}" style="width:${Math.max(3, cp)}%"></span></span>
            <span class="mono crit-val">${(+c.achieved || 0)}/${c.weight}</span></li>`;
        }).join("")}</ul>` : `<p class="muted">Score this domain on Institutional Performance.</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h3>Records at a glance</h3>
          <button class="btn view-ok" data-goto="#/v/masterfile" type="button">Master File</button></div>
        <dl class="kv">
          <dt>Record series tracked</dt><dd>${DATA.admin.records.length}</dd>
          <dt>Digital or hybrid</dt><dd>${DATA.admin.records.filter((r) => r[2] !== "Physical").length}</dd>
          <dt>Archived series</dt><dd>${DATA.admin.records.filter((r) => r[6] === "Archived").length}</dd>
        </dl>
        <p class="hint" style="margin-top:10px;">The Records Index lists where each record series lives and who is responsible; the Master File holds the documents themselves.</p>
      </div>
    </div>`;
}
const CORR_STATUSES = ["Open", "Actioned", "Closed", "Overdue"];
function renderAdminCorr(host) {
  const c = DATA.admin.correspondence;
  const now = new Date();
  const overdue = c.filter((r) => r[8] === "Overdue" || (r[6] && new Date(r[6]) < now && r[8] !== "Closed")).length;
  mountRegister(host, {
    title: "Correspondence Register", importKey: "admin_correspondence",
    hint: "Incoming and outgoing letters, notices and emails — and whether they've been dealt with.",
    stats: () => [
      statTile("Items", c.length, "This period", ""),
      statTile("Open", c.filter((r) => r[8] === "Open").length, "Awaiting action", ""),
      statTile("Overdue reply", overdue, "Past the response date", overdue ? "critical" : "good"),
      statTile("Incoming / Outgoing", c.filter((r) => r[1] === "Incoming").length + " / " + c.filter((r) => r[1] === "Outgoing").length, "", ""),
    ],
    columns: [{ label: "Ref." }, { label: "Dir." }, { label: "Date" }, { label: "Party" }, { label: "Subject" }, { label: "Response due" }, { label: "Owner" }, { label: "Status" }],
    rows: () => c,
    empty: "No correspondence recorded.",
    cell: (r) => {
      const late = r[6] && new Date(r[6]) < now && r[8] !== "Closed";
      return [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`,
        `<span class="pill ${r[1] === "Incoming" ? "neutral" : "brand"}">${esc(r[1])}</span>`, `<span class="mono">${esc(r[2])}</span>`,
        esc(r[3]), `<span style="min-width:200px;display:inline-block;">${esc(r[4])}</span>`,
        `<span class="mono" style="${late ? "color:var(--status-critical);font-weight:700;" : ""}">${esc(r[6])}</span>`, esc(r[7]), statusPill(r[8])];
    },
    manage: () => listEditor(ADMIN_EDITORS.correspondence()),
  });
}
function renderAdminDoa(host) {
  mountRegister(host, {
    title: "Delegation of Authority Matrix", importKey: "admin_doa",
    hint: "Who may approve what, and up to what value — the CPA's authorisation framework.",
    columns: [{ label: "Function / decision" }, { label: "Category" }, { label: "Threshold" }, { label: "Approver" }, { label: "Secondary" }, { label: "Reference" }],
    rows: () => DATA.admin.doa,
    empty: "No delegation lines recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
      esc(r[2]), esc(r[3]), esc(r[4]) || "—", `<span class="mono" style="color:var(--ink-muted);">${esc(r[5])}</span>`],
    manage: () => listEditor(ADMIN_EDITORS.doa()),
  });
}
const POLICY_STATUSES = ["Draft", "Adopted", "Under Review", "Retired"];
function renderAdminPolicies(host) {
  const p = DATA.admin.policies;
  const now = new Date();
  const due = p.filter((r) => r[4] && new Date(r[4]) < now).length;
  mountRegister(host, {
    title: "Policies & SOPs", importKey: "admin_policies",
    hint: "The institutional policy framework — versions, adoption and review dates.",
    stats: () => [
      statTile("Policies", p.length, "On the register", ""),
      statTile("Adopted", p.filter((r) => r[6] === "Adopted").length, "In force", "good"),
      statTile("Draft / under review", p.filter((r) => ["Draft", "Under Review"].includes(r[6])).length, "Not yet in force", ""),
      statTile("Review overdue", due, "Past the review date", due ? "critical" : "good"),
    ],
    columns: [{ label: "Policy / SOP" }, { label: "Category" }, { label: "Version" }, { label: "Adopted" }, { label: "Review due" }, { label: "Owner" }, { label: "Status" }],
    rows: () => p,
    empty: "No policies recorded.",
    cell: (r) => {
      const late = r[4] && new Date(r[4]) < now;
      return [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
        `<span class="mono">${esc(r[2])}</span>`, `<span class="mono">${esc(r[3]) || "—"}</span>`,
        `<span class="mono" style="${late ? "color:var(--status-critical);font-weight:700;" : ""}">${esc(r[4]) || "—"}</span>`, esc(r[5]), statusPill(r[6])];
    },
    manage: () => listEditor(ADMIN_EDITORS.policies()),
    extraTools: [`<button class="btn" data-policy-pdf type="button">Upload PDF</button>`],
    afterRender: (h) => {
      const b = h.querySelector("[data-policy-pdf]");
      if (b) b.onclick = () => attachmentsModal("admin_policies", null, "Policies & SOPs — PDF documents", {
        accept: "application/pdf,.pdf", label: "Upload a PDF",
        match: /\.pdf$|^application\/pdf$/i, matchMsg: "Please choose a PDF file.",
      });
    },
  });
}
const MEDIA = ["Physical", "Digital", "Both"];
const RECORD_STATUSES = ["Current", "Archived", "Disposed"];
function renderAdminRecords(host) {
  mountRegister(host, {
    title: "Institutional Records Index", importKey: "admin_records",
    hint: "Every record series — where it lives, who keeps it, and how long it's retained.",
    columns: [{ label: "Record series" }, { label: "Contents" }, { label: "Medium" }, { label: "Location" }, { label: "Custodian" }, { label: "Retention" }, { label: "Status" }],
    rows: () => DATA.admin.records,
    empty: "No record series recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span style="color:var(--ink-2);">${esc(r[1])}</span>`,
      `<span class="pill neutral">${esc(r[2])}</span>`, esc(r[3]), esc(r[4]), `<span class="mono">${esc(r[5])}</span>`, statusPill(r[6])],
    manage: () => listEditor(ADMIN_EDITORS.records()),
  });
}

/* ============ HR Centre ============ */
const HR_TABS = [
  { id: "overview", label: "Overview" },
  { id: "staff", label: "Staff" },
  { id: "positions", label: "Positions" },
  { id: "payroll", label: "Payroll" },
  { id: "records", label: "HR Records" },
];
const HR_PANELS = { overview: renderHrOverview, staff: renderHrStaff, positions: renderHrPositions, payroll: renderHrPayroll, records: renderHrRecords };
function renderHR() {
  const strip = $("hr-subtabs");
  strip.innerHTML = subtabStrip("hr", HR_TABS);
  wireSubtabs(strip);
  (HR_PANELS[SUBTAB.hr || "overview"] || renderHrOverview)($("hr-body"));
}
function renderHrOverview(host) {
  const s = DATA.hr.staff, pos = DATA.hr.positions, pay = DATA.hr.payroll;
  const active = s.filter((r) => r[7] === "Active" || r[7] === "On leave");
  const vac = pos.filter((r) => r[5] === "Vacant").length;
  const latest = pay[pay.length - 1];
  const byType = ["Permanent", "Fixed-term", "Seasonal", "Contractor"].map((t) => ({ t, n: active.filter((r) => r[3] === t).length })).filter((x) => x.n);
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Active staff", active.length, `${s.filter((r) => r[7] === "On leave").length} on leave`, "")}
      ${statTile("Positions", pos.length, `${vac} vacant`, vac ? "warning" : "good")}
      ${statTile("Latest payroll (net)", latest ? fmtR(latest[4]) : "—", latest ? `${esc(latest[0])} · ${esc(latest[7])}` : "No runs recorded", latest && latest[7] === "Paid" ? "good" : "warning")}
      ${statTile("Permanent share", active.length ? fmtPct(active.filter((r) => r[3] === "Permanent").length / active.length * 100) : "—", "of the active workforce", "")}
    </div>
    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-head"><h3>Workforce composition</h3></div>
        ${byType.length ? barRows(byType.map((x) => ({ label: x.t, value: x.n, max: Math.max(1, ...byType.map((y) => y.n)) })),
          { fmtVal: (it) => it.value + "" }) : `<p class="muted">No active staff recorded.</p>`}
      </div>
      <div class="card">
        <div class="card-head"><h3>HR documents</h3>
          <button class="btn view-ok" data-goto="#/v/hr/records" type="button">Open HR Records</button></div>
        <dl class="kv">
          <dt>Employment contracts</dt><dd>Filed per staff member in HR Records</dd>
          <dt>HR policy</dt><dd>${esc((DATA.admin.policies.find((r) => r[1] === "HR") || [null, null, null, null, null, null, "not yet drafted"])[6])}</dd>
          <dt>Master File — HR</dt><dd>${(DATA.masterFile.find((m) => m[1] === "HR") || [null, null, null, 0])[3]}% complete</dd>
        </dl>
      </div>
    </div>`;
}
const EMP_TYPES = ["Permanent", "Fixed-term", "Seasonal", "Contractor"];
const STAFF_STATUSES = ["Active", "On leave", "Exited"];
function renderHrStaff(host) {
  const s = DATA.hr.staff;
  mountRegister(host, {
    title: "Staff Register", importKey: "hr_staff",
    hint: "Everyone the CPA employs or contracts — role, employment basis and status.",
    stats: () => [
      statTile("On the register", s.length, "All records", ""),
      statTile("Active", s.filter((r) => r[7] === "Active").length, "Currently working", "good"),
      statTile("On leave", s.filter((r) => r[7] === "On leave").length, "", ""),
      statTile("Exited", s.filter((r) => r[7] === "Exited").length, "Historic", ""),
    ],
    columns: [{ label: "Ref." }, { label: "Name" }, { label: "Position" }, { label: "Type" }, { label: "Start" }, { label: "Reports to" }, { label: "Band" }, { label: "Status" }],
    rows: () => s,
    empty: "No staff recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span style="font-weight:600;">${esc(r[1])}</span>`,
      esc(r[2]), `<span class="pill neutral">${esc(r[3])}</span>`, `<span class="mono">${esc(r[4])}</span>`, esc(r[5]), `<span class="mono">${esc(r[6])}</span>`, statusPill(r[7])],
    manage: () => listEditor(HR_EDITORS.staff()),
  });
}
const POS_STATUSES = ["Filled", "Vacant", "Frozen"];
function renderHrPositions(host) {
  const p = DATA.hr.positions;
  const hc = p.reduce((s, r) => s + (r[5] === "Filled" ? (+r[4] || 0) : 0), 0);
  mountRegister(host, {
    title: "Positions & Organogram", importKey: "hr_positions",
    hint: "The establishment — every position, who it reports to, and whether it's filled.",
    stats: () => [
      statTile("Positions", p.length, "In the establishment", ""),
      statTile("Filled", p.filter((r) => r[5] === "Filled").length, `${hc} budgeted heads`, "good"),
      statTile("Vacant", p.filter((r) => r[5] === "Vacant").length, "To recruit", p.filter((r) => r[5] === "Vacant").length ? "warning" : "good"),
      statTile("Frozen", p.filter((r) => r[5] === "Frozen").length, "On hold", ""),
    ],
    columns: [{ label: "Position" }, { label: "Department" }, { label: "Reports to" }, { label: "Incumbent" }, { label: "Heads", cls: "num" }, { label: "Status" }],
    rows: () => p,
    empty: "No positions recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), esc(r[2]), esc(r[3]) || "—",
      `<span class="mono">${esc(r[4])}</span>`, statusPill(r[5])],
    manage: () => listEditor(HR_EDITORS.positions()),
  });
}
const PAYROLL_STATUSES = ["Draft", "Approved", "Paid"];
function renderHrPayroll(host) {
  const p = DATA.hr.payroll;
  const ytd = p.filter((r) => r[7] === "Paid").reduce((s, r) => s + (+r[4] || 0), 0);
  mountRegister(host, {
    title: "Payroll Summaries", importKey: "hr_payroll",
    hint: "Monthly payroll totals and the statutory references — not individual pay slips.",
    stats: () => [
      statTile("Runs recorded", p.length, "This year", ""),
      statTile("Net paid (YTD)", fmtR(ytd), p.filter((r) => r[7] === "Paid").length + " runs settled", "good"),
      statTile("Awaiting approval", p.filter((r) => r[7] === "Draft").length, "Draft runs", p.filter((r) => r[7] === "Draft").length ? "warning" : "good"),
      statTile("Latest headcount", p.length ? p[p.length - 1][1] : 0, "On the last run", ""),
    ],
    columns: [{ label: "Period" }, { label: "Heads", cls: "num" }, { label: "Gross", cls: "num" }, { label: "Deductions", cls: "num" }, { label: "Net", cls: "num" }, { label: "PAYE ref" }, { label: "UIF ref" }, { label: "Status" }],
    rows: () => p,
    empty: "No payroll runs recorded.",
    cell: (r) => [`<span class="mono" style="font-weight:600;">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`,
      `<span class="mono">${(+r[2] || 0).toLocaleString()}</span>`, `<span class="mono">${(+r[3] || 0).toLocaleString()}</span>`,
      `<span class="mono">${(+r[4] || 0).toLocaleString()}</span>`, `<span class="mono">${esc(r[5])}</span>`, `<span class="mono">${esc(r[6])}</span>`, statusPill(r[7])],
    manage: () => listEditor(HR_EDITORS.payroll()),
  });
}
function renderHrRecords(host) {
  mountFileList(host, "hr", null, "HR Records",
    "Employment contracts, the HR policy, leave records, disciplinary records and the organogram.");
}

const ASSET_TABS = [
  { id: "parcels", label: "Land Parcels" },
  { id: "allocations", label: "Allocations" },
  { id: "leases", label: "Leases" },
  { id: "permits", label: "Permits" },
  { id: "infrastructure", label: "Infrastructure" },
  { id: "register", label: "Asset Register" },
  { id: "maintenance", label: "Maintenance" },
];
const ASSET_PANELS = {
  parcels: renderAssetParcels, allocations: renderAssetAllocations, leases: renderAssetLeases,
  permits: renderAssetPermits, infrastructure: renderAssetInfra, register: renderAssetRegister, maintenance: renderAssetMaint,
};
function renderAssets() {
  const strip = $("assets-subtabs");
  strip.innerHTML = subtabStrip("assets", ASSET_TABS);
  wireSubtabs(strip);
  const cur = SUBTAB.assets || "parcels";
  (ASSET_PANELS[cur] || renderAssetParcels)($("assets-body"));
}
function renderAssetParcels(host) {
  const a = DATA.assets;
  const active = a.land.filter((r) => r[4] === "Active").length;
  mountRegister(host, {
    title: "Land Parcels", importKey: "land",
    hint: "The registered portions that make up the CPA's land holding.",
    stats: () => [
      statTile("Parcels", a.land.length, (+DATA.cpa.landExtent || 0).toLocaleString() + " ha total", ""),
      statTile("Actively used", active + " / " + a.land.length, "", "good"),
      statTile("Under renewal", a.land.filter((r) => r[4] === "Under Renewal").length, "See Leases / Action Tracker", "warning"),
      statTile("Vacant / disputed", a.land.filter((r) => ["Vacant", "Disputed"].includes(r[4])).length, "", ""),
    ],
    columns: [{ label: "Portion" }, { label: "Primary use" }, { label: "Extent (ha)", cls: "num" }, { label: "Lease / tenure" }, { label: "Status" }],
    rows: () => a.land,
    empty: "No land parcels recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), `<span class="mono">${(+r[2] || 0).toLocaleString()}</span>`,
      `<span style="color:var(--ink-2);">${esc(r[3])}</span>`, statusPill(r[4])],
    manage: editLand,
  });
}
function renderAssetAllocations(host) {
  const alloc = DATA.assets.allocations || [];
  mountRegister(host, {
    title: "Land Allocated to Beneficiaries", importKey: "allocations",
    hint: "Residential, cropping and grazing allocations to members and groups.",
    stats: () => [
      statTile("Allocations", alloc.length, "On record", ""),
      statTile("Area allocated", alloc.reduce((s, r) => s + (+r[3] || 0), 0).toLocaleString() + " ha", "", ""),
      statTile("Active", alloc.filter((r) => r[6] === "Active").length, "", "good"),
      statTile("Pending / disputed", alloc.filter((r) => ["Pending", "Under Dispute"].includes(r[6])).length, "", alloc.filter((r) => ["Pending", "Under Dispute"].includes(r[6])).length ? "warning" : "good"),
    ],
    columns: [{ label: "Beneficiary / household" }, { label: "Portion" }, { label: "Purpose" }, { label: "Area (ha)", cls: "num" }, { label: "Allocated on" }, { label: "Agreement ref." }, { label: "Status" }],
    rows: () => alloc,
    empty: "No allocations recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), `<span style="color:var(--ink-2);">${esc(r[2])}</span>`,
      `<span class="mono">${(+r[3] || 0).toLocaleString()}</span>`, `<span class="mono">${esc(r[4])}</span>`, `<span class="mono">${esc(r[5])}</span>`, statusPill(r[6])],
    manage: editAllocations,
  });
}
function renderAssetLeases(host) {
  const leases = DATA.assets.leases || [];
  const alert = leases.filter((r) => ["Expiring Soon", "Expired", "Under Negotiation"].includes(r[7])).length;
  mountRegister(host, {
    title: "Land Leases", importKey: "leases",
    hint: "Third parties leasing CPA land, the term and the annual rental due.",
    stats: () => [
      statTile("Leases", leases.length, "On record", ""),
      statTile("Active", leases.filter((r) => r[7] === "Active").length, "", "good"),
      statTile("Need attention", alert, "Expiring / expired / negotiating", alert ? "warning" : "good"),
      statTile("Annual rental", fmtR(leases.filter((r) => r[7] === "Active").reduce((s, r) => s + (+r[6] || 0), 0)), "From active leases", ""),
    ],
    columns: [{ label: "Lessee / party" }, { label: "Portion" }, { label: "Land use" }, { label: "Area (ha)", cls: "num" }, { label: "Term" }, { label: "Annual rental", cls: "num" }, { label: "Status" }],
    rows: () => leases,
    empty: "No leases recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), `<span style="color:var(--ink-2);">${esc(r[2])}</span>`,
      `<span class="mono">${(+r[3] || 0).toLocaleString()}</span>`, `<span class="mono">${esc(r[4])} – ${esc(r[5])}</span>`,
      `<span class="mono">${(+r[6] || 0).toLocaleString()}</span>`, statusPill(r[7])],
    manage: editLeases,
  });
}
function permitActionsHtml(r, idx) {
  const stage = r[10] || "Not Started";
  const btns = [];
  if ((r[3] || "Other") === "Timber") {
    btns.push(`<button type="button" class="btn small" data-permit-app="${idx}">Application form</button>`);
    if (stage === "Under Verification" || stage === "Application Submitted") {
      btns.push(`<button type="button" class="btn small good" data-permit-issue="${idx}">Approve &amp; issue</button>`);
    }
    if (stage === "Issued") {
      btns.push(`<button type="button" class="btn small" data-permit-cert="${idx}">Certificate (Word)</button>`);
      btns.push(`<button type="button" class="btn small" data-permit-print="${idx}">Print / PDF</button>`);
      btns.push(`<button type="button" class="btn small${r[13] ? " active" : ""}" data-permit-email="${idx}">${r[13] ? "Re-email" : "Email applicant"}</button>`);
    }
  }
  return `<span style="display:flex;flex-wrap:wrap;gap:4px;">${btns.join("")}</span>`;
}
function renderAssetPermits(host) {
  const p = DATA.assets.permits;
  const timber = p.filter((r) => (r[3] || "Other") === "Timber");
  const pending = timber.filter((r) => ["Application Submitted", "Under Verification"].includes(r[10])).length;
  const issued = timber.filter((r) => r[10] === "Issued").length;
  mountRegister(host, {
    title: "Permits & Licences", importKey: "permits",
    hint: "Water use, grazing, environmental and other regulatory authorisations — plus the full Timber permit application-to-issuance workflow.",
    stats: timber.length ? () => [
      statTile("Timber permits", timber.length, "Total on record", ""),
      statTile("Awaiting verification", pending, "Applications to review", pending ? "warning" : "good"),
      statTile("Issued", issued, "Active timber permits", ""),
      statTile("Docs attached", timber.filter((r) => docCount("permit-application", r._id)).length, "Application forms uploaded", ""),
    ] : null,
    columns: [{ label: "Permit / licence" }, { label: "Commodity" }, { label: "Applicant" }, { label: "Valid until" }, { label: "Stage" }, { label: "Status" }, { label: "Docs" }, { label: "Actions" }],
    rows: () => p,
    empty: "No permits recorded.",
    cell: (r) => [
      `<span style="font-weight:600;">${esc(r[0] || r[11] || "—")}</span>`,
      esc(r[3] || "Other"),
      esc(r[4] || "—"),
      `<span class="mono">${esc(r[1])}</span>`,
      `<span class="pill">${esc(r[10] || "Not Started")}</span>`,
      statusPill(r[2]),
      docChip("permit-application", r._id, "Application documents"),
      permitActionsHtml(r, p.indexOf(r)),
    ],
    manage: editPermits,
  });
  wireDocChips(host, p, (r) => r[0] || r[4] || "Permit");
  host.querySelectorAll("[data-permit-app]").forEach((b) => (b.onclick = () => {
    const idx = +b.dataset.permitApp;
    p[idx].__index = idx;
    downloadPermitApplication(p[idx]);
  }));
  host.querySelectorAll("[data-permit-issue]").forEach((b) => (b.onclick = () => issuePermit(+b.dataset.permitIssue)));
  host.querySelectorAll("[data-permit-cert]").forEach((b) => (b.onclick = () => downloadPermitCertificate(p[+b.dataset.permitCert], false)));
  host.querySelectorAll("[data-permit-print]").forEach((b) => (b.onclick = () => downloadPermitCertificate(p[+b.dataset.permitPrint], true)));
  host.querySelectorAll("[data-permit-email]").forEach((b) => (b.onclick = () => emailPermitToApplicant(+b.dataset.permitEmail)));
}
const INFRA_TYPES = ["Water", "Roads", "Buildings", "Fencing", "Energy", "Other"];
const CONDITIONS = ["Good", "Fair", "Poor", "Non-functional"];
function renderAssetInfra(host) {
  const inf = DATA.assets.infrastructure || [];
  const poor = inf.filter((r) => ["Poor", "Non-functional"].includes(r[5])).length;
  mountRegister(host, {
    title: "Infrastructure", importKey: "infrastructure",
    hint: "Fixed improvements on the land — water, roads, buildings, fencing, energy.",
    stats: () => [
      statTile("Assets", inf.length, "Fixed improvements", ""),
      statTile("Replacement value", fmtR(inf.reduce((s, r) => s + (+r[4] || 0), 0)), "Total on record", ""),
      statTile("Poor / non-functional", poor, "Needs capital attention", poor ? "critical" : "good"),
      statTile("Water infrastructure", inf.filter((r) => r[1] === "Water").length, "Boreholes, tanks, reticulation", ""),
    ],
    columns: [{ label: "Asset" }, { label: "Type" }, { label: "Location" }, { label: "Installed", cls: "num" }, { label: "Value", cls: "num" }, { label: "Condition" }, { label: "Status" }],
    rows: () => inf,
    empty: "No infrastructure recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`, esc(r[2]),
      `<span class="mono">${esc(r[3] || "")}</span>`, `<span class="mono">${(+r[4] || 0).toLocaleString()}</span>`, statusPill(r[5]), `<span style="color:var(--ink-2);">${esc(r[6])}</span>`],
    manage: () => listEditor(ASSET_EDITORS.infrastructure()),
  });
}
function renderAssetRegister(host) {
  const m = DATA.assets.movable;
  mountRegister(host, {
    title: "Movable Asset Register", importKey: "movable",
    hint: "Vehicles, plant, equipment and other movable items.",
    stats: () => [
      statTile("Asset classes", m.length, "Grouped lines", ""),
      statTile("Items logged", m.reduce((s, r) => s + (+r[1] || 0), 0), "Total count", ""),
      statTile("Infrastructure value", fmtR((DATA.assets.infrastructure || []).reduce((s, r) => s + (+r[4] || 0), 0)), "See Infrastructure tab", ""),
      statTile("Maintenance open", (DATA.assets.maintenance || []).filter((r) => r[7] !== "Completed").length, "Tasks outstanding", ""),
    ],
    columns: [{ label: "Asset class" }, { label: "Count", cls: "num" }, { label: "Condition" }],
    rows: () => m,
    empty: "No movable assets recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`, `<span style="color:var(--ink-2);">${esc(r[2])}</span>`],
    manage: editMovable,
  });
}
const MAINT_STATUSES = ["Scheduled", "In Progress", "Completed", "Overdue"];
function renderAssetMaint(host) {
  const mx = DATA.assets.maintenance || [];
  const now = new Date();
  const overdue = mx.filter((r) => r[7] !== "Completed" && r[3] && new Date(r[3]) < now).length;
  mountRegister(host, {
    title: "Maintenance Plan", importKey: "asset_maintenance",
    hint: "Planned and completed maintenance across infrastructure and movable assets.",
    stats: () => [
      statTile("Tasks", mx.length, "This cycle", ""),
      statTile("Completed", mx.filter((r) => r[7] === "Completed").length, "Closed out", "good"),
      statTile("Overdue", overdue, "Past the scheduled date", overdue ? "critical" : "good"),
      statTile("Planned spend", fmtR(mx.filter((r) => r[7] !== "Completed").reduce((s, r) => s + (+r[5] || 0), 0)), "Outstanding tasks", ""),
    ],
    columns: [{ label: "Asset" }, { label: "Kind" }, { label: "Task" }, { label: "Scheduled" }, { label: "Completed" }, { label: "Cost", cls: "num" }, { label: "Responsible" }, { label: "Status" }],
    rows: () => mx,
    empty: "No maintenance tasks recorded.",
    cell: (r) => {
      const late = r[7] !== "Completed" && r[3] && new Date(r[3]) < now;
      return [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
        `<span style="min-width:180px;display:inline-block;">${esc(r[2])}</span>`,
        `<span class="mono" style="${late ? "color:var(--status-critical);font-weight:700;" : ""}">${esc(r[3])}</span>`,
        `<span class="mono">${esc(r[4])}</span>`, `<span class="mono">${(+r[5] || 0).toLocaleString()}</span>`, esc(r[6]), statusPill(r[7])];
    },
    manage: () => listEditor(ASSET_EDITORS.maintenance()),
  });
}

const FIN_TABS = [
  { id: "budget", label: "Budget" },
  { id: "transactions", label: "Transactions" },
  { id: "bills", label: "Bills" },
  { id: "quotes", label: "Quotations" },
  { id: "requisitions", label: "Requisitions" },
  { id: "pos", label: "Purchase Orders" },
  { id: "grn", label: "Goods/Services Received" },
  { id: "contracts", label: "Contracts" },
  { id: "suppliers", label: "Suppliers" },
  { id: "payments", label: "Payments" },
  { id: "bankrecon", label: "Bank Reconciliations" },
  { id: "close", label: "Month-End Close" },
  { id: "afs", label: "Annual Financial Statements" },
  { id: "memberpay", label: "Members' Remuneration" },
  { id: "bva", label: "Budget vs Actual" },
  { id: "compliance", label: "Procurement Compliance" },
];
const FIN_PANELS = {
  budget: renderFinBudget, transactions: renderFinTransactions, bills: renderFinBills, quotes: renderFinQuotes,
  requisitions: renderFinRequisitions, pos: renderFinPOs, grn: renderFinGrn, contracts: renderFinContracts,
  suppliers: renderFinSuppliers, payments: renderFinPayments, bankrecon: renderFinBankRecon, close: renderFinClose,
  afs: renderFinAfs, memberpay: renderFinMemberPay,
  bva: renderFinBVA, compliance: renderFinCompliance,
};
function renderFinance() {
  const strip = $("finance-subtabs");
  strip.innerHTML = subtabStrip("finance", FIN_TABS);
  wireSubtabs(strip);
  const cur = SUBTAB.finance || "budget";
  (FIN_PANELS[cur] || renderFinBudget)($("finance-body"));
}

/* actual spend per category: the entered YTD figure is authoritative; when a
   category has no entered actual we roll it up from the transactions ledger. */
function categoryActual(name) {
  const cat = DATA.finance.categories.find((c) => c[0] === name);
  const entered = cat ? +cat[2] || 0 : 0;
  if (entered) return entered;
  return (DATA.finProc.transactions || [])
    .filter((t) => t[2] === name && t[3] === "Expense")
    .reduce((s, t) => s + (+t[4] || 0), 0);
}
function ledgerByCategory(name) {
  return (DATA.finProc.transactions || [])
    .filter((t) => t[2] === name && t[3] === "Expense")
    .reduce((s, t) => s + (+t[4] || 0), 0);
}

function renderFinBudget(host) {
  const f = DATA.finance;
  const netYtd = f.ytdIncomeActual - f.ytdExpActual;
  const pctOf = (a, b) => (b ? fmtPct(a / b * 100) : "0%");
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Annual Budget", fmtR(f.annualBudget), "Total planned expenditure", "")}
      ${statTile("YTD Income", fmtR(f.ytdIncomeActual), pctOf(f.ytdIncomeActual, f.ytdIncomeBudget) + " of YTD budget", f.ytdIncomeActual >= f.ytdIncomeBudget * 0.9 ? "good" : "warning")}
      ${statTile("YTD Expenditure", fmtR(f.ytdExpActual), pctOf(f.ytdExpActual, f.ytdExpBudget) + " of YTD budget", f.ytdExpActual <= f.ytdExpBudget ? "good" : "warning")}
      ${statTile("Cash Balance", fmtR(f.cashBalance), (netYtd >= 0 ? "+" : "") + fmtR(netYtd) + " YTD net position", netYtd >= 0 ? "good" : "critical")}
    </div>
    <div class="split split-finance" style="margin-top:14px;">
      <div class="card">
        <div class="card-head"><h3>Cash Balance — Trailing 12 Months</h3>${CAN_EDIT ? `<button class="btn" id="fin-edit-figures" type="button">Edit figures</button>` : ""}</div>
        <div id="finance-line" class="chart-wrap"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Budget Used by Category</h3>
          <span style="display:flex;gap:6px;">
            ${CAN_EDIT ? `<button class="btn" id="fin-import-cats" type="button">Import</button><button class="btn" id="fin-manage-cats" type="button">Manage</button>` : ""}
          </span></div>
        <div id="finance-bars"></div>
      </div>
    </div>`;
  lineChart("finance-line", f.cashMonths, f.cashTrend);
  $("finance-bars").innerHTML = f.categories.length ? barRows(
    f.categories.map(([name, budget]) => {
      const actual = categoryActual(name);
      return { label: name, value: actual, max: budget || 1,
        cls: budget && actual / budget > 1 ? "critical" : budget && actual / budget < 0.4 ? "warning" : "" };
    }),
    { fmtVal: (it) => (it.max ? fmtPct(it.value / it.max * 100) : "—") }
  ) : `<p class="muted">No budget categories recorded.</p>`;
  const ef = host.querySelector("#fin-edit-figures"); if (ef) ef.onclick = editFinanceFigures;
  const mc = host.querySelector("#fin-manage-cats"); if (mc) mc.onclick = editCategories;
  const ic = host.querySelector("#fin-import-cats"); if (ic) ic.onclick = () => importModal(IMPORT.categories);
}

const TXN_TYPES = ["Income", "Expense"];
function renderFinTransactions(host) {
  const t = DATA.finProc.transactions;
  const inc = t.filter((r) => r[3] === "Income").reduce((s, r) => s + (+r[4] || 0), 0);
  const exp = t.filter((r) => r[3] === "Expense").reduce((s, r) => s + (+r[4] || 0), 0);
  const unrec = t.filter((r) => !r[7]).length;
  mountRegister(host, {
    title: "Transactions Ledger", importKey: "fin_transactions",
    hint: "Every receipt and payment. Expense rows feed Budget vs Actual by category.",
    stats: () => [
      statTile("Income (ledger)", fmtR(inc), t.filter((r) => r[3] === "Income").length + " receipts", "good"),
      statTile("Expenditure (ledger)", fmtR(exp), t.filter((r) => r[3] === "Expense").length + " payments", ""),
      statTile("Net", fmtR(inc - exp), inc - exp >= 0 ? "surplus" : "deficit", inc - exp >= 0 ? "good" : "critical"),
      statTile("Unreconciled", unrec, "Not yet matched to the bank", unrec ? "warning" : "good"),
    ],
    columns: [{ label: "Date" }, { label: "Description" }, { label: "Category" }, { label: "Type" }, { label: "Amount", cls: "num" }, { label: "Method" }, { label: "Ref." }, { label: "Rec." }],
    rows: () => t,
    empty: "No transactions captured.",
    cell: (r) => [`<span class="mono">${esc(r[0])}</span>`, `<span style="font-weight:600;">${esc(r[1])}</span>`, esc(r[2]),
      `<span class="pill ${r[3] === "Income" ? "good" : "neutral"}">${esc(r[3])}</span>`,
      `<span class="mono">${(+r[4] || 0).toLocaleString()}</span>`, esc(r[5]), `<span class="mono">${esc(r[6])}</span>`,
      r[7] ? '<span class="pill good">✓</span>' : '<span class="pill warning">—</span>'],
    manage: () => listEditor(FIN_EDITORS.transactions()),
  });
}
/* Municipal rates, Eskom, water and other recurring bills — distinct from the
   Transactions ledger (money that's already moved): a bill is an outstanding
   obligation, tracked with the scanned/PDF bill attached until it's paid
   down. Outstanding is always amount − amount_paid, never typed by hand, so
   it can't drift out of sync with what's actually been paid. */
const BILL_TYPES = ["Municipality (Rates & Taxes)", "Eskom (Electricity)", "Water", "Sewerage", "Refuse", "Telecoms", "Insurance", "Other"];
const BILL_STATUSES = ["Outstanding", "Partially Paid", "Paid", "Disputed"];
function billOutstanding(r) { return Math.max(0, (+r[6] || 0) - (+r[7] || 0)); }
/* Two independently-tracked evidence slots per bill, same pattern as the
   Resolutions register's "signed resolution" / "attendance register" chips:
   the bill itself, and — once it's been paid — the proof of payment. */
function billDocCellHtml(refId) {
  const doc = docCount("bill", refId);
  const pop = docCount("bill-pop", refId);
  const chip = (kind, n, label) => `<button type="button" class="doc-chip${n ? "" : " missing"}"
      data-bill-${kind}="${esc(refId)}" title="${label}${n ? ` — ${n} file${n > 1 ? "s" : ""} attached` : " — missing"}"
      aria-label="${label}${n ? "" : ", missing"}">${CLIP}${n ? `<span>${n}</span>` : ""}</button>`;
  return `<div class="row-actions doc-chips">
    ${chip("doc", doc, "Bill document")}
    ${chip("pop", pop, "Proof of payment")}
  </div>`;
}
function renderFinBills(host) {
  const rows = DATA.finProc.bills || [];
  const now = new Date();
  const outstandingTotal = rows.reduce((s, r) => s + billOutstanding(r), 0);
  const overdue = rows.filter((r) => billOutstanding(r) > 0 && r[5] && new Date(r[5]) < now).length;
  const missingDoc = rows.filter((r) => docCount("bill", r._id) === 0).length;
  const missingPop = rows.filter((r) => (+r[7] || 0) > 0 && docCount("bill-pop", r._id) === 0).length;
  mountRegister(host, {
    title: "Bills", importKey: "fin_bills",
    hint: "Municipality, Eskom, water and other recurring bills — attach the scanned/PDF bill and, once it's paid, the "
      + "proof of payment, and track what's still owed. “Outstanding” is worked out from Amount − Paid to date, so it "
      + "always matches what you've actually paid.",
    stats: () => [
      statTile("Bills on file", rows.length, "", ""),
      statTile("Total outstanding", fmtR(outstandingTotal), "Across all bills", outstandingTotal ? "warning" : "good"),
      statTile("Overdue", overdue, "Past the due date, still owing", overdue ? "critical" : "good"),
      statTile("Missing the bill document", missingDoc, "No file attached", missingDoc ? "warning" : "good"),
      statTile("Missing proof of payment", missingPop, "Paid something, no POP attached", missingPop ? "warning" : "good"),
    ],
    columns: [{ label: "Bill" }, { label: "Provider" }, { label: "Account no." }, { label: "Bill date" }, { label: "Due" },
      { label: "Amount", cls: "num" }, { label: "Outstanding", cls: "num" }, { label: "Status" }, { label: "Added" }, { label: "Documents" }],
    rows: () => rows,
    empty: "No bills recorded — upload a municipality, Eskom or water bill to get started.",
    cell: (r) => {
      const out = billOutstanding(r);
      const late = out > 0 && r[5] && new Date(r[5]) < now;
      return [`<span class="pill neutral">${esc(r[1])}</span>`, `<span style="font-weight:600;">${esc(r[2]) || "—"}</span>`,
        `<span class="mono" style="color:var(--ink-muted);">${esc(r[3])}</span>`, `<span class="mono">${esc(r[4]) || "—"}</span>`,
        `<span class="mono" style="${late ? "color:var(--status-critical);font-weight:700;" : ""}">${esc(r[5]) || "—"}</span>`,
        `<span class="mono">${fmtR(+r[6] || 0)}</span>`,
        `<span class="mono" style="${out ? "font-weight:700;" : ""}">${fmtR(out)}</span>`,
        statusPill(late ? "Overdue" : r[8]), `<span class="hint">${esc((r[10] || "").slice(0, 10))}</span>`, billDocCellHtml(r._id)];
    },
    manage: () => listEditor(FIN_EDITORS.bills()),
    afterRender: (h) => {
      h.querySelectorAll("[data-bill-doc]").forEach((b) => (b.onclick = () => {
        const r = rows.find((x) => String(x._id) === b.dataset.billDoc);
        attachmentsModal("bill", r._id, "Bill — " + (r[2] || r[1]), {
          accept: "application/pdf,.pdf,image/*", label: "Upload the bill (PDF or photo)",
          match: /\.(pdf|jpe?g|png|heic|webp)$|^(application\/pdf|image\/)/i, matchMsg: "Please choose a PDF or an image.",
        });
      }));
      h.querySelectorAll("[data-bill-pop]").forEach((b) => (b.onclick = () => {
        const r = rows.find((x) => String(x._id) === b.dataset.billPop);
        attachmentsModal("bill-pop", r._id, "Proof of payment — " + (r[2] || r[1]), {
          accept: "application/pdf,.pdf,image/*", label: "Upload proof of payment (PDF or photo)",
          match: /\.(pdf|jpe?g|png|heic|webp)$|^(application\/pdf|image\/)/i, matchMsg: "Please choose a PDF or an image.",
        });
      }));
    },
  });
}
/* Shared single-attachment doc chip for the six registers below — same visual
   as billDocCellHtml's chips, generalized since each of these needs exactly
   one evidence slot (unlike Bills' bill+POP pair). */
function docChip(section, refId, label) {
  const n = docCount(section, refId);
  return `<button type="button" class="doc-chip${n ? "" : " missing"}"
    data-doc-chip="${esc(section)}::${esc(refId)}" title="${esc(label)}${n ? ` — ${n} file${n > 1 ? "s" : ""} attached` : " — missing"}"
    aria-label="${esc(label)}${n ? "" : ", missing"}">${CLIP}${n ? `<span>${n}</span>` : ""}</button>`;
}
function wireDocChips(host, rows, labelFor) {
  host.querySelectorAll("[data-doc-chip]").forEach((b) => (b.onclick = () => {
    const sep = b.dataset.docChip.indexOf("::");
    const section = b.dataset.docChip.slice(0, sep), refId = b.dataset.docChip.slice(sep + 2);
    const r = rows.find((x) => String(x._id) === refId);
    if (r) attachmentsModal(section, r._id, labelFor(r), {
      accept: "application/pdf,.pdf,image/*", label: "Upload (PDF or photo)",
      match: /\.(pdf|jpe?g|png|heic|webp)$|^(application\/pdf|image\/)/i, matchMsg: "Please choose a PDF or an image.",
    });
  }));
}

/* Quotations — competitive-sourcing evidence per requisition (item 3.3 of a
   typical FINCOM agenda). Multiple quotes share one requisition_ref; one is
   marked "selected". */
function renderFinQuotes(host) {
  const rows = DATA.finProc.quotes || [];
  const byReq = {};
  rows.forEach((r) => { if ((r[0] || "").trim()) (byReq[r[0]] ||= []).push(r); });
  const reqRefs = Object.keys(byReq);
  const under3 = reqRefs.filter((k) => byReq[k].length < 3).length;
  const noSelection = reqRefs.filter((k) => !byReq[k].some((r) => r[5])).length;
  mountRegister(host, {
    title: "Quotations", importKey: "fin_quotes",
    hint: "Competitive sourcing evidence — record every quote obtained for a requisition (aim for at least 3) and mark the one selected. Attach the quote document itself.",
    stats: () => [
      statTile("Quotes on file", rows.length, "", ""),
      statTile("Requisitions quoted", reqRefs.length, "Distinct requisition refs", ""),
      statTile("Fewer than 3 quotes", under3, "Below the usual SCM minimum", under3 ? "warning" : "good"),
      statTile("No quote selected", noSelection, "Has quotes but none marked selected", noSelection ? "warning" : "good"),
    ],
    columns: [{ label: "Requisition ref." }, { label: "Description" }, { label: "Supplier" }, { label: "Amount", cls: "num" },
      { label: "Quote date" }, { label: "Selected" }, { label: "Document" }],
    rows: () => rows,
    empty: "No quotes recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0]) || "—"}</span>`, `<span style="font-weight:600;">${esc(r[1])}</span>`,
      esc(r[2]), `<span class="mono">${fmtR(+r[3] || 0)}</span>`, `<span class="mono">${esc(r[4]) || "—"}</span>`,
      r[5] ? pill("Selected", "good") : pill("—", "neutral"), docChip("quote", r._id, "Quote document")],
    manage: () => listEditor(FIN_EDITORS.quotes()),
    afterRender: (h) => wireDocChips(h, rows, (r) => "Quote — " + (r[2] || r[1])),
  });
}

/* Contracts register — signed agreements with suppliers/professionals
   (item 3.4). Distinct from Suppliers, which tracks the entity, not the
   individual agreement's terms/expiry. */
const CONTRACT_STATUSES = ["Active", "Expiring Soon", "Expired", "Terminated"];
function renderFinContracts(host) {
  const rows = DATA.finProc.contracts || [];
  const now = new Date();
  const daysTo = (d) => (new Date(d) - now) / 86400000;
  const in60 = rows.filter((r) => r[5] && r[8] === "Active" && daysTo(r[5]) >= 0 && daysTo(r[5]) <= 60).length;
  const expiredButActive = rows.filter((r) => r[5] && r[8] === "Active" && daysTo(r[5]) < 0).length;
  mountRegister(host, {
    title: "Contracts Register", importKey: "fin_contracts",
    hint: "Signed agreements with suppliers, professionals and service providers — with the actual contract attached, so renewal and expiry never get missed.",
    stats: () => [
      statTile("Contracts on file", rows.length, "", ""),
      statTile("Active", rows.filter((r) => r[8] === "Active").length, "", "good"),
      statTile("Expiring within 60 days", in60, "", in60 ? "warning" : "good"),
      statTile("Expired but marked Active", expiredButActive, "Needs a status update", expiredButActive ? "critical" : "good"),
    ],
    columns: [{ label: "Ref." }, { label: "Party" }, { label: "Type" }, { label: "Start" }, { label: "End" },
      { label: "Value", cls: "num" }, { label: "Status" }, { label: "Document" }],
    rows: () => rows,
    empty: "No contracts recorded.",
    cell: (r) => {
      const late = r[5] && r[8] === "Active" && daysTo(r[5]) < 0;
      return [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0]) || "—"}</span>`, `<span style="font-weight:600;">${esc(r[1])}</span>`,
        esc(r[3]) || "—", `<span class="mono">${esc(r[4]) || "—"}</span>`,
        `<span class="mono" style="${late ? "color:var(--status-critical);font-weight:700;" : ""}">${esc(r[5]) || "—"}</span>`,
        `<span class="mono">${fmtR(+r[6] || 0)}</span>`, statusPill(r[8]), docChip("contract", r._id, "Signed contract")];
    },
    manage: () => listEditor(FIN_EDITORS.contracts()),
    afterRender: (h) => wireDocChips(h, rows, (r) => "Contract — " + r[1]),
  });
}

/* Goods/services received (GRN) — independent confirmation before payment
   (item 3.6): the classic segregation-of-duties control between the person
   who orders and the person who pays. */
const GRN_STATUSES = ["Received", "Partially Received", "Discrepancy", "Rejected"];
function renderFinGrn(host) {
  const rows = DATA.finProc.grn || [];
  const pos = DATA.finProc.pos || [];
  const grnPoRefs = new Set(rows.map((r) => r[1]).filter(Boolean));
  const needingGrn = pos.filter((p) => ["Delivered", "Invoiced", "Paid"].includes(p[6]));
  const missingGrn = needingGrn.filter((p) => !grnPoRefs.has(p[0])).length;
  const discrepancies = rows.filter((r) => r[7] === "Discrepancy").length;
  const withDoc = rows.filter((r) => docCount("grn", r._id) > 0).length;
  mountRegister(host, {
    title: "Goods/Services Received", importKey: "fin_grn",
    hint: "Independent confirmation that what was ordered actually arrived, before it's paid. Cross-checked against Purchase Orders below.",
    stats: () => [
      statTile("GRNs on file", rows.length, "", ""),
      statTile("POs delivered without a GRN", missingGrn, "Paid/invoiced with no receipt confirmed", missingGrn ? "critical" : "good"),
      statTile("Discrepancies", discrepancies, "Received didn't match ordered", discrepancies ? "warning" : "good"),
      statTile("Documents attached", `${withDoc} / ${rows.length}`, "", ""),
    ],
    columns: [{ label: "Ref." }, { label: "PO ref." }, { label: "Description" }, { label: "Received" }, { label: "Received by" },
      { label: "Condition" }, { label: "Status" }, { label: "Document" }],
    rows: () => rows,
    empty: "No goods/services receipts recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0]) || "—"}</span>`, `<span class="mono">${esc(r[1]) || "—"}</span>`,
      `<span style="font-weight:600;">${esc(r[2])}</span>`, `<span class="mono">${esc(r[3]) || "—"}</span>`, esc(r[4]) || "—",
      pill(r[5], r[5] === "Good" ? "good" : ["Poor", "Non-functional"].includes(r[5]) ? "critical" : "warning"),
      statusPill(r[7]), docChip("grn", r._id, "Delivery note / GRN")],
    manage: () => listEditor(FIN_EDITORS.grn()),
    afterRender: (h) => wireDocChips(h, rows, (r) => "GRN — " + r[2]),
  });
}

/* Annual Financial Statements — one row per financial year (item 4): draft →
   audited → adopted by members → filed with DALRRD/CIPC. Also read by the
   Institutional Score's "Annual financial statements / audit" criterion in
   preference to the old admin_records name-matching heuristic. */
const AFS_STATUSES = ["Draft", "Under Audit", "Audited", "Adopted", "Filed"];
function renderFinAfs(host) {
  const rows = [...(DATA.finProc.afs || [])].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const latest = rows[0];
  const notFiled = rows.filter((r) => r[1] === "Adopted" && !r[4] && !r[5]).length;
  const withDoc = rows.filter((r) => docCount("afs", r._id) > 0).length;
  mountRegister(host, {
    title: "Annual Financial Statements", importKey: "fin_afs",
    hint: "One row per financial year — draft, under audit, adopted by members, then filed. Attach the actual AFS document; this feeds the Institutional Score directly.",
    stats: () => [
      statTile("Years on file", rows.length, "", ""),
      statTile("Latest year", latest ? latest[0] : "—", latest ? latest[1] : "", ""),
      statTile("Adopted but not yet filed", notFiled, "", notFiled ? "warning" : "good"),
      statTile("Documents attached", `${withDoc} / ${rows.length}`, "", ""),
    ],
    columns: [{ label: "Financial year" }, { label: "Status" }, { label: "Auditor" }, { label: "Approved by members" },
      { label: "Filed DALRRD" }, { label: "Filed CIPC" }, { label: "Document" }],
    rows: () => rows,
    empty: "No financial years recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, statusPill(r[1]), esc(r[2]) || "—",
      `<span class="mono">${esc(r[3]) || "—"}</span>`, `<span class="mono">${esc(r[4]) || "—"}</span>`, `<span class="mono">${esc(r[5]) || "—"}</span>`,
      docChip("afs", r._id, "AFS document")],
    manage: () => listEditor(FIN_EDITORS.afs()),
    afterRender: (h) => wireDocChips(h, rows, (r) => "Annual Financial Statements — " + r[0]),
  });
}

/* Members' remuneration — payments/benefits to EXCO/committee members
   (item 4.6), a known high-scrutiny area for CPAs. Links to the approving
   resolution by ref. rather than duplicating a document slot — the actual
   resolution document already lives in Governance → Resolutions. */
const MEMBER_PAY_TYPES = ["Sitting Allowance", "Stipend", "Travel/Subsistence", "Other Benefit"];
function renderFinMemberPay(host) {
  const rows = DATA.finProc.memberPay || [];
  const total = rows.reduce((s, r) => s + (+r[3] || 0), 0);
  const noResolution = rows.filter((r) => !(r[5] || "").trim()).length;
  const notDisclosed = rows.filter((r) => !r[6]).length;
  mountRegister(host, {
    title: "Members' Remuneration", importKey: "fin_member_pay",
    hint: "Payments and benefits to EXCO/committee members — a high-scrutiny area. Link each to the resolution that approved it and confirm it was disclosed at the AGM.",
    stats: () => [
      statTile("Total paid to members", fmtR(total), "All periods on file", ""),
      statTile("Payments", rows.length, "", ""),
      statTile("No resolution linked", noResolution, "Approval not referenced", noResolution ? "critical" : "good"),
      statTile("Not disclosed at AGM", notDisclosed, "", notDisclosed ? "warning" : "good"),
    ],
    columns: [{ label: "Member" }, { label: "Role" }, { label: "Type" }, { label: "Amount", cls: "num" },
      { label: "Period" }, { label: "Resolution ref." }, { label: "Disclosed AGM" }],
    rows: () => rows,
    empty: "No member payments recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]) || "—", `<span class="pill neutral">${esc(r[2])}</span>`,
      `<span class="mono">${fmtR(+r[3] || 0)}</span>`, `<span class="mono">${esc(r[4]) || "—"}</span>`,
      (r[5] || "").trim() ? `<span class="mono">${esc(r[5])}</span>` : pill("Missing", "critical"),
      r[6] ? pill("Yes", "good") : pill("No", "warning")],
    manage: () => listEditor(FIN_EDITORS.memberPay()),
  });
}

/* Monthly bank reconciliations — a formal, signed-off statement (item 5.5),
   distinct from the per-transaction "reconciled" checkbox on Transactions. */
const BANKRECON_STATUSES = ["Draft", "Reviewed", "Signed Off"];
function bankReconDiff(r) { return (+r[1] || 0) - (+r[2] || 0); }
function renderFinBankRecon(host) {
  const rows = [...(DATA.finProc.bankRecon || [])].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const unresolved = rows.filter((r) => Math.abs(bankReconDiff(r)) > 1).length;
  const notSignedOff = rows.filter((r) => r[5] !== "Signed Off").length;
  const missingDoc = rows.filter((r) => docCount("bankrecon", r._id) === 0).length;
  mountRegister(host, {
    title: "Bank Reconciliations", importKey: "fin_bank_recon",
    hint: "A formal, signed-off reconciliation for every month — attach the statement itself. This is the first thing an auditor asks for.",
    stats: () => [
      statTile("Months on file", rows.length, "", ""),
      statTile("Unresolved differences", unresolved, "Bank ≠ books by more than R1", unresolved ? "critical" : "good"),
      statTile("Not yet signed off", notSignedOff, "", notSignedOff ? "warning" : "good"),
      statTile("Missing the statement", missingDoc, "No file attached", missingDoc ? "warning" : "good"),
    ],
    columns: [{ label: "Period" }, { label: "Bank balance", cls: "num" }, { label: "Book balance", cls: "num" }, { label: "Difference", cls: "num" },
      { label: "Prepared by" }, { label: "Reviewed by" }, { label: "Status" }, { label: "Document" }],
    rows: () => rows,
    empty: "No bank reconciliations recorded.",
    cell: (r) => {
      const diff = bankReconDiff(r);
      return [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="mono">${fmtR(+r[1] || 0)}</span>`, `<span class="mono">${fmtR(+r[2] || 0)}</span>`,
        `<span class="mono" style="${Math.abs(diff) > 1 ? "color:var(--status-critical);font-weight:700;" : ""}">${fmtR(diff)}</span>`,
        esc(r[3]) || "—", esc(r[4]) || "—", statusPill(r[5]), docChip("bankrecon", r._id, "Reconciliation statement")];
    },
    manage: () => listEditor(FIN_EDITORS.bankRecon()),
    afterRender: (h) => wireDocChips(h, rows, (r) => "Bank Reconciliation — " + r[0]),
  });
}

/* Month-end close checklist (item 5.7/5.8) — ties journals, accruals, bank
   reconciliation and reporting together into one auditable per-month record. */
function closeCompletionPct(r) { const items = [r[1], r[2], r[3], r[4]]; return Math.round(items.filter(Boolean).length / items.length * 100); }
function renderFinClose(host) {
  const rows = [...(DATA.finProc.close || [])].sort((a, b) => String(b[0]).localeCompare(String(a[0])));
  const fullyClosed = rows.filter((r) => closeCompletionPct(r) === 100).length;
  const notSignedOff = rows.filter((r) => !(r[5] || "").trim()).length;
  const latest = rows[0];
  mountRegister(host, {
    title: "Month-End Close Checklist", importKey: "fin_close",
    hint: "Journals posted, accruals raised, bank reconciled, reports issued — one row per month, ticked off and signed.",
    stats: () => [
      statTile("Months tracked", rows.length, "", ""),
      statTile("Fully closed", fullyClosed, "All four steps done", ""),
      statTile("Latest month", latest ? `${closeCompletionPct(latest)}%` : "—", latest ? latest[0] : "", latest && closeCompletionPct(latest) < 100 ? "warning" : "good"),
      statTile("Not signed off", notSignedOff, "", notSignedOff ? "warning" : "good"),
    ],
    columns: [{ label: "Period" }, { label: "Journals" }, { label: "Accruals" }, { label: "Bank rec" }, { label: "Reports" },
      { label: "Complete", cls: "num" }, { label: "Signed off by" }, { label: "Sign-off date" }],
    rows: () => rows,
    empty: "No months tracked yet.",
    cell: (r) => {
      const pct = closeCompletionPct(r);
      const yn = (v) => (v ? pill("Done", "good") : pill("Pending", "warning"));
      return [`<span style="font-weight:600;">${esc(r[0])}</span>`, yn(r[1]), yn(r[2]), yn(r[3]), yn(r[4]),
        `<span class="mono" style="${pct === 100 ? "color:var(--status-good);" : "font-weight:700;"}">${pct}%</span>`,
        esc(r[5]) || "—", `<span class="mono">${esc(r[6]) || "—"}</span>`];
    },
    manage: () => listEditor(FIN_EDITORS.close()),
  });
}
const REQ_STATUSES = ["Submitted", "Approved", "Rejected", "Converted"];
function renderFinRequisitions(host) {
  const q = DATA.finProc.requisitions;
  const pending = q.filter((r) => r[7] === "Submitted").length;
  mountRegister(host, {
    title: "Purchase Requisitions", importKey: "proc_requisitions",
    hint: "Requests to spend — approved before a purchase order is raised.",
    stats: () => [
      statTile("Requisitions", q.length, "This cycle", ""),
      statTile("Awaiting approval", pending, "Submitted, not decided", pending ? "warning" : "good"),
      statTile("Approved / Converted", q.filter((r) => ["Approved", "Converted"].includes(r[7])).length, "Cleared to purchase", "good"),
      statTile("Value requested", fmtR(q.reduce((s, r) => s + (+r[4] || 0), 0)), "All requisitions", ""),
    ],
    columns: [{ label: "Ref." }, { label: "Date" }, { label: "Description" }, { label: "Category" }, { label: "Amount", cls: "num" }, { label: "Requested by" }, { label: "Approved by" }, { label: "Status" }],
    rows: () => q,
    empty: "No requisitions recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`,
      `<span style="font-weight:600;">${esc(r[2])}</span>`, esc(r[3]), `<span class="mono">${(+r[4] || 0).toLocaleString()}</span>`,
      esc(r[5]), esc(r[6]) || "—", statusPill(r[7])],
    manage: () => listEditor(FIN_EDITORS.requisitions()),
  });
}
const PO_STATUSES = ["Open", "Delivered", "Invoiced", "Paid", "Cancelled"];
function renderFinPOs(host) {
  const p = DATA.finProc.pos;
  const noReq = p.filter((r) => !r[5] && r[6] !== "Cancelled").length;
  mountRegister(host, {
    title: "Purchase Orders", importKey: "proc_purchase_orders",
    hint: "Commitments to suppliers. Each should trace back to an approved requisition.",
    stats: () => [
      statTile("Purchase orders", p.length, "This cycle", ""),
      statTile("Open / Delivered", p.filter((r) => ["Open", "Delivered", "Invoiced"].includes(r[6])).length, "Not yet paid", ""),
      statTile("Committed value", fmtR(p.reduce((s, r) => s + (+r[4] || 0), 0)), "All live POs", ""),
      statTile("No requisition", noReq, "Raised without a REQ", noReq ? "critical" : "good"),
    ],
    columns: [{ label: "Ref." }, { label: "Date" }, { label: "Supplier" }, { label: "Description" }, { label: "Amount", cls: "num" }, { label: "Requisition" }, { label: "Status" }],
    rows: () => p,
    empty: "No purchase orders recorded.",
    cell: (r) => [`<span class="mono" style="color:var(--ink-muted);">${esc(r[0])}</span>`, `<span class="mono">${esc(r[1])}</span>`,
      `<span style="font-weight:600;">${esc(r[2])}</span>`, esc(r[3]), `<span class="mono">${(+r[4] || 0).toLocaleString()}</span>`,
      r[5] ? `<span class="mono">${esc(r[5])}</span>` : `<span class="pill critical">none</span>`, statusPill(r[6])],
    manage: () => listEditor(FIN_EDITORS.pos()),
  });
}
const SUPP_STATUSES = ["Active", "Suspended", "Archived"];
const TAX_STATES = ["Valid", "Expired", "None"];
function renderFinSuppliers(host) {
  const s = DATA.finProc.suppliers;
  const noTax = s.filter((r) => r[4] !== "Valid" && r[6] === "Active").length;
  mountRegister(host, {
    title: "Supplier Register", importKey: "proc_suppliers",
    hint: "Vendors the CPA transacts with, and their tax-clearance / B-BBEE standing.",
    stats: () => [
      statTile("Suppliers", s.length, "On the register", ""),
      statTile("Active", s.filter((r) => r[6] === "Active").length, "Approved to transact", "good"),
      statTile("Tax clearance issue", noTax, "Active supplier, no valid TCC", noTax ? "critical" : "good"),
      statTile("Suspended", s.filter((r) => r[6] === "Suspended").length, "Blocked", s.filter((r) => r[6] === "Suspended").length ? "warning" : "good"),
    ],
    columns: [{ label: "Supplier" }, { label: "Category" }, { label: "Contact" }, { label: "Reg. no." }, { label: "Tax clearance" }, { label: "B-BBEE" }, { label: "Status" }],
    rows: () => s,
    empty: "No suppliers recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), `<span class="mono">${esc(r[2])}</span>`,
      `<span class="mono">${esc(r[3])}</span>`, statusPill(r[4] === "Valid" ? "Valid" : r[4] === "Expired" ? "Expired" : "Outstanding"),
      esc(r[5]), statusPill(r[6])],
    manage: () => listEditor(FIN_EDITORS.suppliers()),
  });
}
const PAY_STATUSES = ["Pending", "Paid", "Failed"];
function renderFinPayments(host) {
  const p = DATA.finProc.payments;
  const paid = p.filter((r) => r[7] === "Paid").reduce((s, r) => s + (+r[3] || 0), 0);
  mountRegister(host, {
    title: "Payments", importKey: "fin_payments",
    hint: "Money leaving the account — ideally each references a purchase order.",
    stats: () => [
      statTile("Payments", p.length, "This cycle", ""),
      statTile("Paid", fmtR(paid), p.filter((r) => r[7] === "Paid").length + " settled", "good"),
      statTile("Pending", p.filter((r) => r[7] === "Pending").length, "Awaiting release", p.filter((r) => r[7] === "Pending").length ? "warning" : "good"),
      statTile("Failed", p.filter((r) => r[7] === "Failed").length, "Need to re-issue", p.filter((r) => r[7] === "Failed").length ? "critical" : "good"),
    ],
    columns: [{ label: "Date" }, { label: "Payee" }, { label: "Description" }, { label: "Amount", cls: "num" }, { label: "Method" }, { label: "PO ref." }, { label: "Bank ref." }, { label: "Status" }],
    rows: () => p,
    empty: "No payments recorded.",
    cell: (r) => [`<span class="mono">${esc(r[0])}</span>`, `<span style="font-weight:600;">${esc(r[1])}</span>`, esc(r[2]),
      `<span class="mono">${(+r[3] || 0).toLocaleString()}</span>`, esc(r[4]),
      r[5] ? `<span class="mono">${esc(r[5])}</span>` : "—", `<span class="mono">${esc(r[6])}</span>`, statusPill(r[7])],
    manage: () => listEditor(FIN_EDITORS.payments()),
  });
}
function renderFinBVA(host) {
  const cats = DATA.finance.categories;
  const rows = cats.map(([name, budget]) => {
    const actual = categoryActual(name);
    return { name, budget: +budget || 0, actual, variance: (+budget || 0) - actual };
  });
  const tB = rows.reduce((s, r) => s + r.budget, 0);
  const tA = rows.reduce((s, r) => s + r.actual, 0);
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Total budget", fmtR(tB), "All categories", "")}
      ${statTile("Actual (ledger + entered)", fmtR(tA), fmtPct(tB ? tA / tB * 100 : 0) + " of budget", tA <= tB ? "good" : "critical")}
      ${statTile("Variance", fmtR(tB - tA), tB - tA >= 0 ? "under budget" : "over budget", tB - tA >= 0 ? "good" : "critical")}
      ${statTile("Over budget", rows.filter((r) => r.variance < 0).length, "Categories overspent", rows.filter((r) => r.variance < 0).length ? "warning" : "good")}
    </div>
    <div class="card-head" style="margin:18px 0 10px;"><div><h3 style="font-size:13px;">Budget vs Actual by category</h3>
      <span class="hint">Actual = matching expense transactions where captured, otherwise the entered figure.</span></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Category</th><th class="num">Budget</th><th class="num">Actual (YTD)</th><th class="num">Ledger</th><th class="num">Variance</th><th style="min-width:140px;">Used</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => {
        const pct = r.budget ? Math.round(r.actual / r.budget * 100) : 0;
        const tone = pct > 100 ? "critical" : pct < 40 ? "warning" : "good";
        return `<tr>
          <td style="font-weight:600;">${esc(r.name)}</td>
          <td class="num mono">${r.budget.toLocaleString()}</td>
          <td class="num mono">${r.actual.toLocaleString()}</td>
          <td class="num mono" style="color:var(--ink-muted);">${ledgerByCategory(r.name).toLocaleString()}</td>
          <td class="num mono" style="${r.variance < 0 ? "color:var(--status-critical);font-weight:700;" : ""}">${r.variance.toLocaleString()}</td>
          <td><div class="bar-track"><div class="bar-fill ${tone}" style="width:${Math.max(3, Math.min(100, pct))}%"></div></div>
            <span class="hint">${pct}%</span></td>
        </tr>`;
      }).join("") : emptyRow(6, "No budget categories — add them on the Budget tab.")}</tbody>
    </table></div>`;
}
function renderFinCompliance(host) {
  const s = DATA.finProc.suppliers, q = DATA.finProc.requisitions, p = DATA.finProc.pos, pay = DATA.finProc.payments;
  const pct = (n, d) => (d ? Math.round(n / d * 100) : 100);
  const checks = [
    ["Active suppliers with a valid tax clearance",
      s.filter((r) => r[6] === "Active" && r[4] === "Valid").length, s.filter((r) => r[6] === "Active").length],
    ["Purchase orders linked to a requisition",
      p.filter((r) => r[5]).length, p.filter((r) => r[6] !== "Cancelled").length],
    ["Requisitions with a recorded approver",
      q.filter((r) => r[6] || r[7] === "Rejected").length, q.length],
    ["Payments referencing a purchase order",
      pay.filter((r) => r[5]).length, pay.filter((r) => !/sars|paye|payroll|stipend/i.test(r[1] + r[2])).length],
    ["Transactions reconciled to the bank",
      (DATA.finProc.transactions || []).filter((r) => r[7]).length, (DATA.finProc.transactions || []).length],
  ];
  const overall = Math.round(checks.reduce((a, c) => a + pct(c[1], c[2]), 0) / checks.length);
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Procurement compliance", overall + "%", "Average across checks", overall >= 80 ? "good" : overall >= 50 ? "warning" : "critical")}
      ${statTile("Suppliers OK", pct(checks[0][1], checks[0][2]) + "%", "Valid tax clearance", "")}
      ${statTile("PO → requisition trace", pct(checks[1][1], checks[1][2]) + "%", "Authorised spend", "")}
      ${statTile("Payment → PO trace", pct(checks[3][1], checks[3][2]) + "%", "Excludes statutory", "")}
    </div>
    <div class="card-head" style="margin:18px 0 10px;"><div><h3 style="font-size:13px;">Procurement control checklist</h3>
      <span class="hint">Computed from the suppliers, requisitions, PO and payment registers.</span></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Control</th><th class="num">Met</th><th class="num">Of</th><th style="min-width:160px;">Compliance</th></tr></thead>
      <tbody>${checks.map((c) => {
        const v = pct(c[1], c[2]);
        const tone = v >= 80 ? "good" : v >= 50 ? "warning" : "critical";
        return `<tr><td>${esc(c[0])}</td><td class="num mono">${c[1]}</td><td class="num mono">${c[2]}</td>
          <td><div class="bar-track"><div class="bar-fill ${tone}" style="width:${Math.max(3, v)}%"></div></div>
          <span class="hint">${v}%</span></td></tr>`;
      }).join("")}</tbody>
    </table></div>`;
}

const PROJ_TABS = [
  { id: "pipeline", label: "Pipeline" },
  { id: "scorecards", label: "Scorecards" },
  { id: "cases", label: "Business Cases" },
  { id: "funding", label: "Funding Readiness" },
  { id: "markets", label: "Markets" },
  { id: "partnerships", label: "Partnerships" },
  { id: "revenue", label: "Revenue" },
  { id: "investment", label: "Investment Readiness" },
];
const PROJ_PANELS = {
  pipeline: renderProjPipeline, scorecards: renderProjScorecards, cases: renderProjCases, funding: renderProjFunding,
  markets: renderProjMarkets, partnerships: renderProjPartnerships, revenue: renderProjRevenue, investment: renderProjInvestment,
};
function renderProjects() {
  const strip = $("projects-subtabs");
  strip.innerHTML = subtabStrip("projects", PROJ_TABS);
  wireSubtabs(strip);
  const cur = SUBTAB.projects || "pipeline";
  (PROJ_PANELS[cur] || renderProjPipeline)($("projects-body"));
}
function renderProjPipeline(host) {
  const p = DATA.projects;
  const tB = p.reduce((s, r) => s + (+r[2] || 0), 0), tS = p.reduce((s, r) => s + (+r[3] || 0), 0);
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Projects", p.length, "In the pipeline", "")}
      ${statTile("Total budget", fmtR(tB), "", "")}
      ${statTile("Total spent", fmtR(tS), (tB ? fmtPct(tS / tB * 100) : "0%") + " of pipeline budget", "")}
      ${statTile("At risk", p.filter((r) => r[5] === "At Risk").length, "Needs Committee attention", p.filter((r) => r[5] === "At Risk").length ? "warning" : "good")}
    </div>
    <div id="projects-toolbar" style="display:flex;justify-content:flex-end;gap:6px;margin:16px 0 10px;">
      ${CAN_EDIT ? `<button class="btn" id="proj-import" type="button">Import CSV / Excel</button><button class="btn primary" id="proj-add" type="button">+ Add project</button>` : ""}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Project</th><th>Stage</th><th class="num">Budget</th><th class="num">Spent</th><th style="min-width:130px;">Progress</th><th>Status</th>${CAN_EDIT ? "<th></th>" : ""}</tr></thead>
      <tbody>${p.length ? p.map((r, i) => `<tr>
        <td style="font-weight:600;">${esc(r[0])}</td>
        <td><span class="pill brand">${esc(r[1])}</span></td>
        <td class="num mono">${(+r[2] || 0).toLocaleString()}</td>
        <td class="num mono">${(+r[3] || 0).toLocaleString()}</td>
        <td><div class="progress"><span style="width:${Math.max(0, Math.min(100, +r[4] || 0))}%"></span></div></td>
        <td>${statusPill(r[5])}</td>
        ${CAN_EDIT ? `<td><div class="row-actions">
          <button type="button" data-e="${i}" title="Edit">${PENCIL}</button>
          <button type="button" data-d="${i}" title="Delete">${TRASH}</button></div></td>` : ""}
      </tr>`).join("") : emptyRow(CAN_EDIT ? 7 : 6, "No projects in the pipeline yet.")}</tbody>
    </table></div>`;
  const a = host.querySelector("#proj-add"); if (a) a.onclick = () => editProject(null);
  const im = host.querySelector("#proj-import"); if (im) im.onclick = () => importModal(IMPORT.projects);
  host.querySelectorAll("[data-e]").forEach((b) => (b.onclick = () => editProject(+b.dataset.e)));
  host.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => deleteProject(+b.dataset.d)));
}
function renderProjScorecards(host) {
  const p = DATA.projects;
  host.innerHTML = `
    <div class="card-head" style="margin:2px 0 12px;"><div><h3 style="font-size:13px;">Project Scorecards</h3>
      <span class="hint">Delivery, spend and readiness at a glance. Edit a project on the Pipeline tab.</span></div></div>
    <div class="grid grid-2">${p.length ? p.map((r) => {
      const pct = +r[4] || 0, spendPct = r[2] ? Math.round((+r[3] || 0) / r[2] * 100) : 0;
      const rdy = +r[9] || 0;
      const tone = r[5] === "At Risk" || r[5] === "Delayed" ? "critical" : r[5] === "On Track" || r[5] === "Complete" ? "good" : "warning";
      return `<div class="card">
        <div class="card-head"><h3>${esc(r[0])}</h3>${statusPill(r[5])}</div>
        <dl class="kv">
          <dt>Stage</dt><dd>${esc(r[1])}</dd>
          <dt>Budget</dt><dd>${fmtR(r[2])} · ${spendPct}% spent</dd>
          <dt>Expected impact</dt><dd>${esc(r[10] || "Medium")}</dd>
          <dt>Business case</dt><dd>${esc(r[6] || "None")}</dd>
          <dt>Funder</dt><dd>${esc(r[7]) || "—"}</dd>
        </dl>
        <div style="margin-top:8px;"><span class="hint">Delivery ${pct}%</span>
          <div class="bar-track"><div class="bar-fill ${tone}" style="width:${Math.max(3, pct)}%"></div></div></div>
        <div style="margin-top:6px;"><span class="hint">Funding readiness ${rdy}%</span>
          <div class="bar-track"><div class="bar-fill ${healthTone(rdy)}" style="width:${Math.max(3, rdy)}%"></div></div></div>
      </div>`;
    }).join("") : `<p class="muted">No projects yet.</p>`}</div>`;
}
function renderProjCases(host) {
  const p = DATA.projects;
  const done = p.filter((r) => ["Complete", "Approved", "Funded"].includes(r[6])).length;
  mountRegister(host, {
    title: "Business Cases", hint: "Business-case status per project — set it on the Pipeline tab. Attach documents on the Master File (Projects).",
    stats: () => [
      statTile("Projects", p.length, "In the pipeline", ""),
      statTile("Case complete+", done, "Complete / Approved / Funded", done ? "good" : "warning"),
      statTile("In drafting", p.filter((r) => ["Concept note", "Draft"].includes(r[6])).length, "Concept note / Draft", ""),
      statTile("No case", p.filter((r) => (r[6] || "None") === "None").length, "Not started", p.filter((r) => (r[6] || "None") === "None").length ? "critical" : "good"),
    ],
    columns: [{ label: "Project" }, { label: "Stage" }, { label: "Business case" }, { label: "Budget", cls: "num" }, { label: "Funder" }, { label: "Impact" }],
    rows: () => p,
    empty: "No projects yet.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), statusPill(r[6] || "None"),
      `<span class="mono">${(+r[2] || 0).toLocaleString()}</span>`, esc(r[7]) || "—", esc(r[10] || "Medium")],
    manage: () => listEditor({
      title: "Projects", arr: DATA.projects, section: "projects",
      rowLabel: (r) => `${r[0]} — ${r[6] || "None"}`,
      blank: () => ["", "Concept", 0, 0, 0, "Not Started", "None", "", 0, 0, "Medium"],
      fields: (r) => [
        { key: "name", label: "Project", type: "text", value: r[0], required: true },
        { key: "bc", label: "Business case", type: "select", options: BUSINESS_CASE_STATES, value: r[6] || "None" },
        { key: "funder", label: "Funder", type: "text", value: r[7] },
        { key: "cofund", label: "Co-funding secured (R)", type: "number", value: r[8], min: 0 },
        { key: "rdy", label: "Funding readiness %", type: "number", value: r[9], min: 0, max: 100 },
        { key: "impact", label: "Expected impact", type: "select", options: IMPACT_RATINGS, value: r[10] || "Medium" },
      ],
      write: (r, o) => { r[0] = o.name; r[6] = o.bc; r[7] = o.funder; r[8] = parseFloat(o.cofund) || 0; r[9] = parseFloat(o.rdy) || 0; r[10] = o.impact; },
    }),
  });
}
function renderProjFunding(host) {
  const p = DATA.projects;
  const rows = p.map((r) => {
    const checks = [
      ["Business case", ["Complete", "Approved", "Funded"].includes(r[6])],
      ["Budget defined", (+r[2] || 0) > 0],
      ["Funder engaged", !!r[7]],
      ["Co-funding secured", (+r[8] || 0) > 0],
      ["Readiness ≥ 60%", (+r[9] || 0) >= 60],
    ];
    const met = checks.filter((c) => c[1]).length;
    return { name: r[0], funder: r[7], readiness: +r[9] || 0, met, of: checks.length, checks };
  });
  const avg = rows.length ? Math.round(rows.reduce((s, r) => s + r.readiness, 0) / rows.length) : 0;
  const packUnlocked = stageUnlocked(7);
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Portfolio readiness", avg + "%", "Average across projects", avg >= 60 ? "good" : avg >= 35 ? "warning" : "critical")}
      ${statTile("Funder-linked", rows.filter((r) => r.funder).length + " / " + rows.length, "Have a named funder", "")}
      ${statTile("Fully ready", rows.filter((r) => r.met === r.of).length, "All checks met", rows.filter((r) => r.met === r.of).length ? "good" : "warning")}
      ${statTile("Co-funding", fmtR(p.reduce((s, r) => s + (+r[8] || 0), 0)), "Secured across the pipeline", "")}
    </div>
    <div class="card-head" style="margin:18px 0 10px;"><div><h3 style="font-size:13px;">Funding readiness by project</h3>
      <span class="hint">Computed from the project's business case, budget, funder and co-funding fields.</span></div>
      ${packUnlocked
        ? `<button class="btn primary" id="investor-pack-btn" type="button">Investor Readiness Pack (Word)</button>`
        : `<button class="btn" type="button" disabled title="Unlocks at Stage 7 — Scale, once GAD Foundation confirms this CPA has reached it.">🔒 Investor Readiness Pack</button>`}
    </div>
    <div class="table-wrap"><table>
      <thead><tr><th>Project</th><th>Funder</th><th class="num">Checks met</th><th style="min-width:180px;">Readiness</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => {
        const v = Math.round(r.met / r.of * 100);
        return `<tr><td style="font-weight:600;">${esc(r.name)}</td><td>${esc(r.funder) || "—"}</td>
          <td class="num mono">${r.met} / ${r.of}</td>
          <td><div class="bar-track"><div class="bar-fill ${healthTone(v)}" style="width:${Math.max(3, v)}%"></div></div>
          <span class="hint">${r.checks.filter((c) => !c[1]).map((c) => c[0]).join(", ") || "all met"}</span></td></tr>`;
      }).join("") : emptyRow(4, "No projects yet.")}</tbody>
    </table></div>`;
  const ipb = host.querySelector("#investor-pack-btn");
  if (ipb) ipb.onclick = downloadInvestorPack;
}
/* Investor Readiness Pack — a curated, funder-facing summary. Gated to Stage 7
   (Scale) per the Journey's own definition of that stage ("a bankable business
   plan, investment-grade governance and finance, a funding pipeline"); the
   button in renderProjFunding() only renders when stageUnlocked(7). */
function downloadInvestorPack() {
  if (!stageUnlocked(7)) { toast("This unlocks at Stage 7 — Scale.", true); return; }
  const total = scoreTotal();
  const band = maturityBand(total);
  const exco = (DATA.committee || []).filter((r) => r[3] === "EXCO" || !r[3]);
  const bene = DATA.beneficiary || {};
  const revenue = (DATA.commercial?.revenue || []).filter((r) => r[4] === "Active");
  const recurring = revenue.reduce((s, r) => s + (+r[2] || 0), 0);
  const agreements = (DATA.commercial?.markets || []).filter((r) => ["MOU", "Signed offtake"].includes(r[5]));
  const pipeline = DATA.projects || [];
  const body = `
    <h2>Institutional Snapshot</h2>
    <table>
      <tr><td style="width:36%;font-weight:600;">CPA</td><td>${esc(DATA.cpa.name)}</td></tr>
      <tr><td style="font-weight:600;">Registration</td><td>${esc(DATA.cpa.reg || "—")}</td></tr>
      <tr><td style="font-weight:600;">Region</td><td>${esc(DATA.cpa.region || "—")}</td></tr>
      <tr><td style="font-weight:600;">Land extent</td><td>${esc(DATA.cpa.landExtent || "—")} ha across ${esc(DATA.cpa.portions || "—")} portion(s)</td></tr>
      <tr><td style="font-weight:600;">CPA360&trade; Institutional Score</td><td><b>${total} / 100</b> — ${esc(band.name)}</td></tr>
      <tr><td style="font-weight:600;">CPA360&trade; Journey stage</td><td>Stage 7 — Scale (GAD Foundation-confirmed)</td></tr>
    </table>
    <h2>Governance</h2>
    <table><tr><td style="width:36%;font-weight:600;">EXCO / office bearers</td><td>${exco.length} on record</td></tr>
      <tr><td style="font-weight:600;">Governance domain score</td><td>${domainScore(DATA.score.domains.find((d) => d.name === "Governance") || { achieved: 0 })} / 15</td></tr></table>
    <h2>Beneficiaries</h2>
    <table><tr><td style="width:36%;font-weight:600;">Verified beneficiaries</td><td>${bene.verified || 0} of ${bene.total || 0}</td></tr>
      <tr><td style="font-weight:600;">Households</td><td>${bene.households || 0}</td></tr></table>
    <h2>Finance</h2>
    <table><tr><td style="width:36%;font-weight:600;">Finance domain score</td><td>${domainScore(DATA.score.domains.find((d) => d.name === "Finance") || { achieved: 0 })} / 15</td></tr></table>
    <h2>Commercialisation &amp; Revenue</h2>
    <table>
      <tr><td style="width:36%;font-weight:600;">Active recurring revenue</td><td>${fmtR(recurring)} / year</td></tr>
      <tr><td style="font-weight:600;">Signed market agreements</td><td>${agreements.length}</td></tr>
    </table>
    <h2>Funding Pipeline</h2>
    <table>
      <tr><th>Project</th><th>Stage</th><th>Budget</th><th>Funder</th><th>Readiness</th></tr>
      ${pipeline.length ? pipeline.map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1] || "")}</td><td>${fmtR(r[2] || 0)}</td><td>${esc(r[7] || "—")}</td><td>${esc(r[9] || 0)}%</td></tr>`).join("")
        : `<tr><td colspan="5">No projects on record.</td></tr>`}
    </table>
    <p class="warn">This pack summarises institutional data recorded on CPA360&trade; as at ${new Date().toLocaleDateString("en-ZA", { day: "2-digit", month: "long", year: "numeric" })}.
      It is evidence of institutional readiness, not a guarantee of funding, financial return, or credit approval.</p>`;
  const html = permitDocShell("Investor Readiness Pack", DATA.cpa.name || "", body);
  downloadFile(`Investor-Readiness-Pack-${(DATA.cpa.name || "CPA").replace(/[^\w\- ]+/g, "_")}.doc`, html, "application/msword");
}
const MARKET_STATUSES = ["Exploring", "Negotiating", "Active", "Lapsed"];
const AGREEMENT_STATES = ["None", "Verbal", "MOU", "Signed offtake"];
function renderProjMarkets(host) {
  const m = DATA.commercial.markets;
  mountRegister(host, {
    title: "Markets", importKey: "markets",
    hint: "Buyers and channels for the CPA's produce, livestock and timber.",
    stats: () => [
      statTile("Market links", m.length, "On record", ""),
      statTile("Active", m.filter((r) => r[6] === "Active").length, "Selling now", "good"),
      statTile("With an agreement", m.filter((r) => ["MOU", "Signed offtake"].includes(r[5])).length, "MOU or signed offtake", ""),
      statTile("Exploring", m.filter((r) => r[6] === "Exploring").length, "Early stage", ""),
    ],
    columns: [{ label: "Commodity" }, { label: "Buyer" }, { label: "Channel" }, { label: "Volume" }, { label: "Price basis" }, { label: "Agreement" }, { label: "Status" }],
    rows: () => m,
    empty: "No market links recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, esc(r[1]), esc(r[2]), esc(r[3]), esc(r[4]),
      `<span class="pill ${["MOU", "Signed offtake"].includes(r[5]) ? "good" : "neutral"}">${esc(r[5])}</span>`, statusPill(r[6])],
    manage: () => listEditor(COM_EDITORS.markets()),
  });
}
const PARTNER_TYPES = ["Funder", "Technical", "Market", "Government", "NGO", "Other"];
const PARTNER_STATUSES = ["Prospective", "Active", "Concluded", "Lapsed"];
function renderProjPartnerships(host) {
  const pt = DATA.commercial.partnerships;
  mountRegister(host, {
    title: "Partnerships", importKey: "partnerships",
    hint: "Funders, technical partners, government and market relationships.",
    stats: () => [
      statTile("Partnerships", pt.length, "On record", ""),
      statTile("Active", pt.filter((r) => r[5] === "Active").length, "", "good"),
      statTile("Funders", pt.filter((r) => r[1] === "Funder" || r[1] === "Government").length, "Funding / government", ""),
      statTile("Prospective", pt.filter((r) => r[5] === "Prospective").length, "In discussion", ""),
    ],
    columns: [{ label: "Partner" }, { label: "Type" }, { label: "Purpose" }, { label: "Start" }, { label: "End" }, { label: "Status" }],
    rows: () => pt,
    empty: "No partnerships recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
      `<span style="color:var(--ink-2);">${esc(r[2])}</span>`, `<span class="mono">${esc(r[3])}</span>`, `<span class="mono">${esc(r[4])}</span>`, statusPill(r[5])],
    manage: () => listEditor(COM_EDITORS.partnerships()),
  });
}
const REVENUE_SOURCES = ["Lease", "Enterprise sales", "Grant", "Services", "Other"];
function renderProjRevenue(host) {
  const rv = DATA.commercial.revenue;
  const recurring = rv.filter((r) => r[3] && r[4] === "Active").reduce((s, r) => s + (+r[2] || 0), 0);
  const bySource = REVENUE_SOURCES.map((s) => ({ s, n: rv.filter((r) => r[1] === s && r[4] === "Active").reduce((a, r) => a + (+r[2] || 0), 0) })).filter((x) => x.n > 0);
  mountRegister(host, {
    title: "Revenue Streams", importKey: "revenue_streams",
    hint: "How the CPA earns — leases, enterprise sales, grants and services.",
    stats: () => [
      statTile("Recurring revenue", fmtR(recurring), "Active & recurring, per year", "good"),
      statTile("Streams", rv.filter((r) => r[4] === "Active").length + " active", rv.length + " total on record", ""),
      statTile("Lease income", fmtR(rv.filter((r) => r[1] === "Lease" && r[4] === "Active").reduce((s, r) => s + (+r[2] || 0), 0)), "From land leases", ""),
      statTile("Own vs grant", recurring || bySource.length ? "diversified" : "grant-reliant", "Recurring non-grant revenue " + (recurring ? "in place" : "absent"), recurring ? "good" : "critical"),
    ],
    columns: [{ label: "Stream" }, { label: "Source" }, { label: "Annual amount", cls: "num" }, { label: "Recurring" }, { label: "Status" }],
    rows: () => rv,
    empty: "No revenue streams recorded.",
    cell: (r) => [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
      `<span class="mono">${(+r[2] || 0).toLocaleString()}</span>`, r[3] ? "Yes" : "One-off", statusPill(r[4])],
    manage: () => listEditor(COM_EDITORS.revenue()),
  });
}
function renderProjInvestment(host) {
  const dom = DATA.score.domains.find((d) => d.name === "Investment readiness") || { achieved: 0, weight: 8 };
  const crits = critFor("Investment readiness");
  const p = DATA.projects;
  const rv = DATA.commercial.revenue;
  const ownRev = rv.filter((r) => r[1] !== "Grant" && r[4] === "Active").reduce((s, r) => s + (+r[2] || 0), 0);
  const signals = [
    ["Investment-readiness score", `${domainScore(dom)} / ${dom.weight}`, domainScore(dom) / dom.weight >= 0.6 ? "good" : "warning"],
    ["Own (non-grant) recurring revenue", fmtR(ownRev), ownRev > 0 ? "good" : "critical"],
    ["Projects with a complete business case", p.filter((r) => ["Complete", "Approved", "Funded"].includes(r[6])).length + " / " + p.length, ""],
    ["Signed market agreements", DATA.commercial.markets.filter((r) => r[5] === "Signed offtake").length, ""],
    ["Active partnerships", DATA.commercial.partnerships.filter((r) => r[5] === "Active").length, ""],
  ];
  host.innerHTML = `
    <div class="grid grid-4">${signals.slice(0, 4).map((s) => statTile(s[0], s[1], "", s[2])).join("")}</div>
    <div class="grid grid-2" style="margin-top:18px;">
      <div class="card"><div class="card-head"><h3>Investment-readiness rubric</h3>
        <button class="btn view-ok" data-goto="#/v/score" type="button">Open scorecard</button></div>
        ${crits.length ? `<ul class="crit-list">${crits.map((c) => {
          const cp = Math.round((+c.achieved || 0) / (c.weight || 1) * 100);
          return `<li><span class="crit-name">${esc(c.name)}</span>
            <span class="bar-track sm"><span class="bar-fill ${healthTone(cp)}" style="width:${Math.max(3, cp)}%"></span></span>
            <span class="mono crit-val">${(+c.achieved || 0)}/${c.weight}</span></li>`;
        }).join("")}</ul>` : `<p class="muted">Score this domain on Institutional Performance.</p>`}
      </div>
      <div class="card"><div class="card-head"><h3>Readiness signals</h3></div>
        <table><tbody>${signals.map((s) => `<tr><td>${esc(s[0])}</td>
          <td class="num mono" style="font-weight:600;">${esc(String(s[1]))}</td>
          <td>${s[2] ? pill(s[2] === "good" ? "OK" : s[2] === "critical" ? "Gap" : "Watch", s[2]) : ""}</td></tr>`).join("")}</tbody></table>
      </div>
    </div>`;
  host.querySelectorAll("[data-goto]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.goto; }));
}

function renderImpact() {
  const i = DATA.impact;
  const hTotal = i.hectaresTotal || 1;
  const yr = new Date().getFullYear();
  /* "Dwelling on the Land" is aggregated live from the Household Records
     register's per-household "resident" flag, not a manually-typed figure —
     see the Households tab in the Beneficiary Centre. */
  const residentHH = DATA.beneficiaryCentre.households.filter((h) => h[13]).length;
  $("impact-stats").innerHTML = [
    statTile(`Jobs Created (FTE) — ${yr}`, i.jobsThisYear, i.jobsCumulative + " cumulative since Gate 2", "good"),
    statTile("Households Benefiting", i.householdsBenefit, fmtPct(i.householdsBenefit / (i.householdsTotal || 1) * 100) + " of represented households", ""),
    statTile("Households Dwelling on the Land", residentHH, fmtPct(residentHH / (i.householdsTotal || 1) * 100) + " of represented households live on the farm/in the community", ""),
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

const PRIORITY = (days, status) => status === "Overdue" || days < 0 ? "high" : days <= 14 ? "high" : days <= 45 ? "medium" : "low";
function renderExec() {
  const total = scoreTotal();
  const band = maturityBand(total);
  const bandRow = (DATA.score.bands || []).find((b) => b[0] === band.name) || [band.name, "", ""];
  const stage = DATA.gates.find((g) => g.state === "current") || DATA.gates[0] || { n: 1, name: "Assess" };
  const jb = JOURNEY.find((s) => s.n === stage.n) || JOURNEY[0];
  const now = new Date();
  const alerts = computeAlerts();

  const ns = nextStep();
  $("exec-next").innerHTML = `
    <div class="en-txt"><div class="en-eyebrow">What must happen next</div><div class="en-line">${esc(ns.line)}</div></div>
    <button class="btn primary view-ok" data-goto="${ns.goto}" type="button">${esc(ns.label)}</button>`;

  const closed = DATA.actions.filter((a) => a[5] === "Completed").length;
  const openN = DATA.actions.length - closed;
  const evidence = Object.values((DATA._docCounts || {}).action || {}).reduce((s, n) => s + n, 0);
  const domTone = alerts.some((a) => a.tone === "critical") ? "critical" : alerts.length ? "warning" : "good";

  $("exec-top").innerHTML = `
    <div class="ex-score">
      <div class="es-lbl">CPA360 Institutional Score</div>
      ${scoreGauge(total, 100, 148)}
      <div class="pill brand es-band">${esc(band.name)} band</div>
      <div class="es-desc">${esc(bandRow[2] || "")}</div>
      <button class="btn view-ok" data-goto="#/v/score" type="button">View performance</button>
    </div>
    <div class="ex-cards">
      <div class="ex-card">
        <div class="k">Journey stage</div>
        <div class="v">${stage.n}<span> / 7</span></div>
        <div class="s">${esc(jb.key)}</div>
        <a class="mini view-ok" data-goto="#/v/journey">Open the Journey</a>
      </div>
      <div class="ex-card">
        <div class="k">This cycle</div>
        <div class="v">${closed}<span> closed</span></div>
        <div class="s">${openN} action${openN === 1 ? "" : "s"} still open · ${evidence} evidence file${evidence === 1 ? "" : "s"}</div>
      </div>
      <div class="ex-card">
        <div class="k">Needs attention</div>
        <div class="v">${alerts.length}</div>
        <div class="s ${domTone === "good" ? "good" : domTone}">${alerts.length ? esc(alerts[0].text) : "Nothing outstanding"}</div>
      </div>
    </div>`;

  // priority actions — the centrepiece
  const pri = DATA.actions
    .filter((a) => a[5] !== "Completed")
    .map((a) => ({ a, days: a[4] ? (new Date(a[4]) - now) / 86400000 : 9e9 }))
    .sort((x, y) => x.days - y.days)
    .slice(0, 8);
  $("exec-actions").innerHTML = pri.length ? pri.map(({ a, days }) => {
    const over = a[5] === "Overdue" || (a[4] && days < 0);
    const p = PRIORITY(days, a[5]);
    return `<tr>
      <td data-label="Action" style="min-width:200px;font-weight:600;">${esc(a[2])}</td>
      <td data-label="Owner">${esc(a[3]) || "—"}</td>
      <td data-label="Due" class="mono ${over ? "pa-over" : ""}" style="white-space:nowrap;">${esc(a[4] || "—")}</td>
      <td data-label="Priority"><span class="pa-pri ${p}">${p}</span></td>
      <td data-label="Status">${statusPill(a[5])}</td>
    </tr>`;
  }).join("") : emptyRow(5, "No open actions — every item is closed.");

  // performance by domain
  $("exec-domains").innerHTML = DATA.score.domains.map((d) => {
    const sc = domainScore(d), pct = Math.round((sc / (d.weight || 1)) * 100);
    return `<div class="dom-row">
      <span class="dr-name">${esc(d.name)}</span>
      <span class="bar-track"><span class="bar-fill ${healthTone(pct)}" style="width:${Math.max(3, pct)}%"></span></span>
      <span class="dr-val">${sc}/${d.weight}</span>
    </div>`;
  }).join("");

  // what needs attention
  $("exec-attention").innerHTML = alerts.length
    ? alerts.slice(0, 7).map((x) => `<li>${pill(x.tone === "critical" ? "Risk" : x.tone === "warning" ? "Watch" : "Note", x.tone === "info" ? "neutral" : x.tone)}
        <span class="ea-desc">${esc(x.text)}</span>
        <button class="btn view-ok" data-goto="${x.goto}" type="button" style="padding:3px 9px;font-size:10.5px;">Open</button></li>`).join("")
    : `<li class="muted">Nothing needs attention right now.</li>`;

  // upcoming deadlines — merge action due-dates + governance calendar
  const dl = [
    ...DATA.actions.filter((a) => a[5] !== "Completed" && a[4] && new Date(a[4]) >= now)
      .map((a) => ({ date: a[4], label: a[2], who: a[3] || a[1] || "Action" })),
    ...(DATA.governance?.calendar || []).filter((r) => r[2] && new Date(r[2]) >= now && r[5] !== "Done")
      .map((r) => ({ date: r[2], label: r[0], who: r[1] })),
  ].sort((x, y) => new Date(x.date) - new Date(y.date)).slice(0, 6);
  $("exec-deadlines").innerHTML = dl.length ? dl.map((d) => `
    <li><span class="mono ea-due">${esc(d.date)}</span><span class="ea-desc">${esc(d.label)}</span>
      <span class="ea-cat">${esc(d.who)}</span></li>`).join("")
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

/* ============ CPA360 Journey — stage readiness & gating ============
   Advancing a stage used to be a free-text dropdown any member could set —
   fine while the stage was purely descriptive, unsafe once it also unlocks
   features (a CPA could just declare itself "Stage 7"). Now the client only
   ever *proposes*: it evaluates STAGE_READY[nextStage] against the CPA's own
   live data and, when met, calls flag_stage_review() (server-side, checked
   against the CPA's actual current gate — see migration 0037). Only a GAD
   Foundation reviewer approving that flag (decide_stage_review(), the
   Stage Reviews screen) moves `gates`/`orgs.current_gate`. */
function pctDomain(name) {
  const d = DATA.score.domains.find((x) => x.name === name);
  if (!d || !d.weight) return 0;
  return domainScore(d) / d.weight;
}
const STAGE_READY = {
  2: () => {
    const identity = !!(DATA.cpa.name && DATA.cpa.reg);
    const bene = (DATA.beneficiaryCentre?.register || []).length;
    const scored = scoreTotal() > 0;
    return { ready: identity && bene > 0 && scored,
      detail: `Institutional identity captured: ${identity ? "yes" : "no"}; beneficiary records on file: ${bene}; baseline score computed: ${scored ? "yes" : "no"}.` };
  },
  3: () => {
    const gov = pctDomain("Governance"), comp = pctDomain("Compliance");
    const bank = (DATA.finProc?.bankRecon || []).length > 0;
    return { ready: gov >= 0.6 && comp >= 0.5 && bank,
      detail: `Governance ${Math.round(gov * 100)}% (need 60%); Compliance ${Math.round(comp * 100)}% (need 50%); bank reconciliation on record: ${bank ? "yes" : "no"}.` };
  },
  4: () => {
    const admin = pctDomain("Administration"), fin = pctDomain("Finance");
    const overdue = (DATA.actions || []).filter((a) => a[5] === "Overdue").length;
    return { ready: admin >= 0.65 && fin >= 0.65 && overdue <= 2,
      detail: `Administration ${Math.round(admin * 100)}% (need 65%); Finance ${Math.round(fin * 100)}% (need 65%); overdue actions: ${overdue} (need ≤ 2).` };
  },
  5: () => {
    const admin = pctDomain("Administration");
    const afsOk = (DATA.finProc?.afs || []).some((r) => ["Audited", "Adopted", "Filed"].includes(r[1]));
    const total = scoreTotal();
    return { ready: admin >= 0.8 && afsOk && total >= 71,
      detail: `Administration ${Math.round(admin * 100)}% (need 80%); an adopted/audited/filed AFS on record: ${afsOk ? "yes" : "no"}; total score ${total} (need ≥ 71).` };
  },
  6: () => {
    const prod = pctDomain("Productivity");
    return { ready: prod >= 0.6, detail: `Productivity ${Math.round(prod * 100)}% (need 60%).` };
  },
  7: () => {
    const comm = pctDomain("Commercialisation"), inv = pctDomain("Investment readiness");
    return { ready: comm >= 0.6 && inv >= 0.5,
      detail: `Commercialisation ${Math.round(comm * 100)}% (need 60%); Investment readiness ${Math.round(inv * 100)}% (need 50%).` };
  },
};
function currentStageN() { return (DATA.gates.find((g) => g.state === "current") || DATA.gates[0] || { n: 1 }).n; }
function stageUnlocked(n) { return currentStageN() >= n; }
function pendingStageReview() { return (DATA.stageReviews || []).find((r) => r.status === "pending"); }
async function maybeFlagStageReadiness() {
  if (!DATA || !DATA.gates.length) return;
  const cur = currentStageN();
  if (cur >= 7) return;
  const toStage = cur + 1;
  const rule = STAGE_READY[toStage];
  if (!rule) return;
  const { ready, detail } = rule();
  if (!ready) return;
  if ((DATA.stageReviews || []).some((r) => r.to_stage === toStage && r.status === "pending")) return;
  await repo.flagStageReview(orgId, toStage, { detail, at: new Date().toISOString() });
}
function renderJourney() {
  const curN = currentStageN();
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
  const pending = pendingStageReview();
  const lastHeld = !pending && [...(DATA.stageReviews || [])].reverse().find((r) => r.status === "held");
  $("journey-note").innerHTML =
    `This CPA is at <strong>Stage ${curN} — ${esc(cur.key)}</strong>, confirmed by GAD Foundation. ` +
    (curN < 7 ? `Next: <strong>${esc(JOURNEY[curN].key)}</strong>.` : `The final stage — focus on sustaining investment readiness.`) +
    (pending ? `<br><span class="pill brand" style="margin-top:6px;display:inline-block;">Flagged for review — Stage ${pending.to_stage} (${esc(JOURNEY.find((s) => s.n === pending.to_stage)?.key || "")})</span> A GAD Foundation reviewer will confirm before anything unlocks.` :
     lastHeld ? `<br><span class="pill" style="margin-top:6px;display:inline-block;">Last review (Stage ${lastHeld.to_stage}) was held${lastHeld.decision_note ? ": " + esc(lastHeld.decision_note) : ""}.</span>` : "");
}
function checkStageReadiness() {
  const cur = currentStageN();
  if (cur >= 7) {
    openModal("Stage readiness", [{ key: "i", label: "Status", type: "info", value: "This CPA is already at the final stage (Scale)." }], () => {}, "OK");
    return;
  }
  const toStage = cur + 1;
  const next = JOURNEY.find((s) => s.n === toStage);
  const pending = pendingStageReview();
  const { ready, detail } = STAGE_READY[toStage] ? STAGE_READY[toStage]() : { ready: false, detail: "No readiness rule defined." };
  const fields = [
    { key: "i1", label: `Readiness for Stage ${toStage} — ${next.key}`, type: "info", value: detail },
  ];
  if (pending) {
    fields.push({ key: "i2", label: "Status", type: "info", value: `Already flagged for GAD Foundation review on ${new Date(pending.flagged_at).toLocaleDateString("en-ZA")}.` });
  } else if (ready && CAN_EDIT) {
    fields.push({ key: "i2", label: "Status", type: "info", value: "Criteria met — flagging this CPA for GAD Foundation review now." });
  } else if (ready) {
    fields.push({ key: "i2", label: "Status", type: "info", value: "Criteria met — ask an editor on this CPA to flag it for GAD Foundation review." });
  } else {
    fields.push({ key: "i2", label: "Status", type: "info", value: "Not yet ready — keep building the registers above and this will flag automatically." });
  }
  openModal(`Check readiness — Stage ${toStage}`, fields, () => {
    if (ready && !pending && CAN_EDIT) {
      maybeFlagStageReadiness()
        .then(() => {
          DATA.stageReviews = DATA.stageReviews || [];
          DATA.stageReviews.push({ from_stage: cur, to_stage: toStage, status: "pending", flagged_detail: { detail }, flagged_at: new Date().toISOString() });
          toast(`Flagged for GAD Foundation review — Stage ${toStage}.`);
          renderCurrent();
        })
        .catch((e) => toast("Couldn't flag for review: " + (e?.message || e), true));
    }
  }, "OK");
}

/* ============ Institutional Performance — auto-scored criteria ============
   Each of the 40 default criteria has a rule here that reads the CPA's own
   register data and returns { ratio (0-1), detail (human-readable rationale) }.
   syncAutoScore() applies these to DATA.score.criteria (skipping any a CPA
   has deliberately locked to a manual value — see editDomain()), rolls the
   result up into each "detailed" domain's total, and reports whether
   anything changed so the caller knows whether to persist it. This is what
   makes the 100-point score a live reflection of the registers, not a
   hand-typed number: add a document, verify a household, close a dispute —
   the relevant criterion re-scans on the next commit(). */
const AUTO_SCORE_RULES = {
  Governance: {
    "Constitution & registration current": (D) => {
      const mf = (D.masterFile || []).find((r) => /governance/i.test(r[1] || ""));
      const pct = mf ? (+mf[3] || 0) : 0;
      return { ratio: pct / 100, detail: mf ? `Master File "${mf[1]}" completeness ${pct}%` : "No 'Governance' Master File category found" };
    },
    "EXCO properly constituted & functional": (D) => {
      const n = (D.committee || []).length;
      return { ratio: Math.min(1, n / 5), detail: `${n} EXCO/office-bearer record(s) on file (target 5+)` };
    },
    "Regular minuted committee meetings": (D) => {
      const now = Date.now(), win = 365 * 86400000;
      const recent = (D.governance.meetings || []).filter((r) => r[1] && (now - new Date(r[1]).getTime()) <= win);
      if (!recent.length) return { ratio: 0, detail: "No meetings recorded in the last 12 months" };
      const adopted = recent.filter((r) => r[5] === "Adopted").length;
      return { ratio: adopted / recent.length, detail: `${adopted}/${recent.length} meeting(s) in the last 12 months have adopted minutes` };
    },
    "AGM held annually with quorum": (D) => {
      const agms = (D.governance.meetings || []).filter((r) => r[0] === "AGM" || r[0] === "SGM")
        .sort((a, b) => String(b[1]).localeCompare(String(a[1])));
      if (!agms.length) return { ratio: 0, detail: "No AGM/SGM recorded" };
      const last = agms[0];
      const days = (Date.now() - new Date(last[1]).getTime()) / 86400000;
      if (days > 400) return { ratio: 0, detail: `Last AGM/SGM was ${Math.round(days)} days ago (${last[1]})` };
      return { ratio: last[3] === "Quorate" ? 1 : 0.5, detail: `Last AGM/SGM ${last[1]} — quorum: ${last[3] || "not recorded"}` };
    },
    "Conflict-of-interest register maintained": (D) => {
      const coi = D.governance.coi || [];
      if (!coi.length) return { ratio: 0.5, detail: "No declarations on record yet (baseline credit)" };
      const resolved = coi.filter((r) => !["Outstanding", "Declared"].includes(r[5])).length;
      return { ratio: resolved / coi.length, detail: `${resolved}/${coi.length} declaration(s) managed, recused or closed` };
    },
  },
  Beneficiaries: {
    "Master beneficiary register complete": (D) => {
      // Weighted blend, not an all-or-nothing AND: real recovered paper registers
      // often have IDs for most members but never captured DOB at all — that
      // shouldn't zero out a register that's otherwise substantially complete.
      const reg = D.beneficiaryCentre.register || [];
      if (!reg.length) return { ratio: 0, detail: "Register is empty" };
      const withId = reg.filter((r) => (r[4] || "").trim()).length;
      const withDob = reg.filter((r) => (r[3] || "").trim()).length;
      const ratio = 0.7 * (withId / reg.length) + 0.3 * (withDob / reg.length);
      return { ratio, detail: `${withId}/${reg.length} member(s) have an ID on file, ${withDob}/${reg.length} have a date of birth` };
    },
    "Verification process operating": (D) => {
      const reg = D.beneficiaryCentre.register || [];
      if (!reg.length) return { ratio: 0, detail: "Register is empty" };
      const v = reg.filter((r) => r[9] === "Verified").length;
      return { ratio: v / reg.length, detail: `${v}/${reg.length} member(s) verified` };
    },
    "Household records maintained": (D) => {
      const hh = D.beneficiaryCentre.households || [];
      if (!hh.length) return { ratio: 0, detail: "No households recorded" };
      const v = hh.filter((r) => r[17] === "Verified").length;
      return { ratio: v / hh.length, detail: `${v}/${hh.length} household(s) verified` };
    },
    "Succession & deceased updates current": (D) => {
      const reg = D.beneficiaryCentre.register || [];
      const dead = reg.filter((r) => r[8] === "Deceased");
      if (!dead.length) return { ratio: 1, detail: "No deceased members on the register" };
      const succ = D.beneficiaryCentre.succession || [];
      const withCase = dead.filter((r) => succ.some((s) => s[0] === r[0])).length;
      return { ratio: withCase / dead.length, detail: `${withCase}/${dead.length} deceased member(s) have a succession case lodged` };
    },
    "Dispute / duplicate resolution active": (D) => {
      const d = D.beneficiaryCentre.disputes || [];
      if (!d.length) return { ratio: 1, detail: "No open disputes" };
      const resolved = d.filter((r) => r[5] === "Resolved").length;
      return { ratio: resolved / d.length, detail: `${resolved}/${d.length} dispute case(s) resolved` };
    },
  },
  Administration: {
    "Master file complete & indexed": (D) => {
      const mf = D.masterFile || [];
      if (!mf.length) return { ratio: 0, detail: "Master File index is empty" };
      const avg = mf.reduce((s, r) => s + (+r[3] || 0), 0) / mf.length;
      return { ratio: avg / 100, detail: `Master File average completeness ${Math.round(avg)}%` };
    },
    "Records management system in use": (D) => {
      const n = (D.admin.records || []).length;
      return { ratio: Math.min(1, n / 5), detail: `${n} record series tracked (target 5+)` };
    },
    "Correspondence & resolution tracking": (D) => {
      const c = D.admin.correspondence || [];
      if (!c.length) return { ratio: 0, detail: "No correspondence recorded" };
      const now = Date.now();
      const overdue = c.filter((r) => r[6] && new Date(r[6]).getTime() < now && r[8] !== "Closed").length;
      return { ratio: 1 - overdue / c.length, detail: `${c.length - overdue}/${c.length} correspondence item(s) not overdue` };
    },
    "Delegation of authority matrix in place": (D) => {
      const n = (D.admin.doa || []).length;
      return { ratio: Math.min(1, n / 5), detail: `${n} delegation line(s) recorded (target 5+)` };
    },
  },
  Finance: {
    "Approved annual budget": (D) => {
      const b = +D.finance.annualBudget || 0;
      return { ratio: b > 0 ? 1 : 0, detail: b > 0 ? `Annual budget of R${Math.round(b).toLocaleString()} set` : "No annual budget set" };
    },
    "Bookkeeping current & reconciled": (D) => {
      const t = D.finProc.transactions || [];
      if (!t.length) return { ratio: 0, detail: "No transactions recorded" };
      const r = t.filter((x) => x[7]).length;
      return { ratio: r / t.length, detail: `${r}/${t.length} transaction(s) reconciled to the bank` };
    },
    "Annual financial statements / audit": (D) => {
      // Prefer the dedicated AFS register (Finance → Annual Financial Statements)
      // once it has data — a graduated read of real lifecycle progress, not just
      // a yes/no guess from a Master File record-series name.
      const afs = D.finProc.afs || [];
      if (afs.length) {
        const latest = [...afs].sort((a, b) => String(b[0]).localeCompare(String(a[0])))[0];
        const byStatus = { "Draft": 0.2, "Under Audit": 0.4, "Audited": 0.7, "Adopted": 0.9, "Filed": 1 };
        return { ratio: byStatus[latest[1]] ?? 0, detail: `FY ${latest[0]} status: ${latest[1]}` };
      }
      const rec = (D.admin.records || []).find((r) => /financial statement|audit/i.test(r[0] || ""));
      if (!rec) return { ratio: 0, detail: "No financial year recorded — add one under Finance → Annual Financial Statements" };
      return { ratio: rec[6] === "Current" ? 1 : 0.5, detail: `"${rec[0]}" record series status: ${rec[6]}` };
    },
    "Banking controls & signatories": (D) => {
      const hit = (D.admin.doa || []).some((r) => /bank|signat/i.test((r[0] || "") + (r[1] || "")));
      return { ratio: hit ? 1 : 0, detail: hit ? "Banking/signatory authority found in the delegation matrix" : "No banking or signatory delegation on file" };
    },
    "Budget vs actual monitored": (D) => {
      const cats = D.finance.categories || [];
      if (!cats.length) return { ratio: 0, detail: "No budget categories recorded" };
      const tracked = cats.filter((c) => (+c[2] || 0) > 0).length;
      return { ratio: tracked / cats.length, detail: `${tracked}/${cats.length} budget categor(y/ies) have actuals recorded` };
    },
  },
  "Land & Assets": {
    "Land parcels registered & mapped": (D) => {
      const l = D.assets.land || [];
      if (!l.length) return { ratio: 0, detail: "No land parcels recorded" };
      const mapped = l.filter((r) => (+r[2] || 0) > 0).length;
      return { ratio: mapped / l.length, detail: `${mapped}/${l.length} parcel(s) have a recorded extent (ha)` };
    },
    "Allocations documented": (D) => {
      const n = (D.assets.allocations || []).length;
      return { ratio: Math.min(1, n / 5), detail: `${n} allocation(s) recorded (target 5+)` };
    },
    "Leases formalised & current": (D) => {
      const l = D.assets.leases || [];
      if (!l.length) return { ratio: 0, detail: "No leases recorded" };
      const active = l.filter((r) => r[7] === "Active").length;
      return { ratio: active / l.length, detail: `${active}/${l.length} lease(s) active` };
    },
    "Asset register maintained": (D) => {
      const n = (D.assets.infrastructure || []).length;
      return { ratio: Math.min(1, n / 5), detail: `${n} infrastructure asset(s) recorded (target 5+)` };
    },
    "Maintenance plan in place": (D) => {
      const m = D.assets.maintenance || [];
      if (!m.length) return { ratio: 0, detail: "No maintenance tasks recorded" };
      const now = Date.now();
      const ok = m.filter((r) => r[7] === "Completed" || !r[3] || new Date(r[3]).getTime() >= now).length;
      return { ratio: ok / m.length, detail: `${ok}/${m.length} maintenance task(s) completed or not yet due` };
    },
  },
  Productivity: {
    "Productive enterprises identified": (D) => {
      const n = (D.productivity.enterprises || []).length;
      return { ratio: Math.min(1, n / 3), detail: `${n} enterprise(s) identified (target 3+)` };
    },
    "Land under active production": (D) => {
      const e = D.productivity.enterprises || [];
      if (!e.length) return { ratio: 0, detail: "No enterprises recorded" };
      const active = e.filter((r) => r[6] === "Active").length;
      return { ratio: active / e.length, detail: `${active}/${e.length} enterprise(s) active` };
    },
    "Production records kept": (D) => {
      const n = (D.productivity.records || []).length;
      return { ratio: Math.min(1, n / 6), detail: `${n} production record(s) logged (target 6+)` };
    },
    "Cost of production tracked": (D) => {
      const recs = D.productivity.records || [];
      const hit = recs.some((r) => (+r[6] || 0) > 0);
      return { ratio: hit ? 1 : 0, detail: hit ? "Cost figures present on production records" : "No cost figures recorded on production records" };
    },
    "Water use secured": (D) => {
      const w = D.productivity.water || [];
      if (!w.length) return { ratio: 0, detail: "No water sources recorded" };
      const lic = w.filter((r) => (r[4] || "").trim()).length;
      return { ratio: lic / w.length, detail: `${lic}/${w.length} water source(s) have a licence reference` };
    },
  },
  Commercialisation: {
    "Market linkages established": (D) => {
      const n = (D.commercial.markets || []).length;
      return { ratio: n > 0 ? 1 : 0, detail: n > 0 ? `${n} market link(s) recorded` : "No market links recorded" };
    },
    "Off-take / sales agreements": (D) => {
      const m = D.commercial.markets || [];
      if (!m.length) return { ratio: 0, detail: "No market links recorded" };
      const ag = m.filter((r) => r[5] && r[5] !== "None").length;
      return { ratio: ag / m.length, detail: `${ag}/${m.length} market link(s) have an agreement in place` };
    },
    "Partnerships formalised": (D) => {
      const p = D.commercial.partnerships || [];
      if (!p.length) return { ratio: 0, detail: "No partnerships recorded" };
      const active = p.filter((r) => r[5] === "Active").length;
      return { ratio: active / p.length, detail: `${active}/${p.length} partnership(s) active` };
    },
    "Revenue diversification": (D) => {
      const rev = D.commercial.revenue || [];
      const active = rev.filter((r) => r[3] && r[4] === "Active");
      const distinct = new Set(active.map((r) => r[1])).size;
      return { ratio: Math.min(1, distinct / 3), detail: `${distinct} distinct active recurring revenue source(s) (target 3+)` };
    },
  },
  Compliance: {
    "Statutory returns filed (CIPC / SARS)": (D) => {
      const c = (D.governance.calendar || []).filter((r) => r[1] === "Statutory");
      if (!c.length) return { ratio: 0, detail: "No statutory items tracked on the governance calendar" };
      const done = c.filter((r) => r[5] === "Done").length;
      return { ratio: done / c.length, detail: `${done}/${c.length} statutory calendar item(s) done` };
    },
    "Regulatory permits current": (D) => {
      const p = D.assets.permits || [];
      if (!p.length) return { ratio: 0, detail: "No permits recorded" };
      const valid = p.filter((r) => r[2] === "Valid").length;
      return { ratio: valid / p.length, detail: `${valid}/${p.length} permit(s) valid` };
    },
    "Reporting to DALRRD": (D) => {
      const c = (D.governance.calendar || []).filter((r) => /dalrrd/i.test(r[0] || "") || r[1] === "Reporting");
      if (!c.length) return { ratio: 0, detail: "No DALRRD/reporting items tracked on the governance calendar" };
      const done = c.filter((r) => r[5] === "Done").length;
      return { ratio: done / c.length, detail: `${done}/${c.length} DALRRD/reporting item(s) done` };
    },
    "Policy framework adopted": (D) => {
      const p = D.admin.policies || [];
      if (!p.length) return { ratio: 0, detail: "No policies recorded" };
      const adopted = p.filter((r) => r[6] === "Adopted").length;
      return { ratio: adopted / p.length, detail: `${adopted}/${p.length} polic(y/ies) adopted` };
    },
  },
  "Investment readiness": {
    "Business plan / strategy adopted": (D) => {
      const hit = (D.projects || []).some((r) => ["Approved", "Funded"].includes(r[6]));
      return { ratio: hit ? 1 : 0, detail: hit ? "At least one project has an approved/funded business case" : "No project has an approved or funded business case" };
    },
    "Financials investment-grade": (D) => {
      const hit = (D.commercial.revenue || []).some((r) => r[3] && r[4] === "Active" && !/grant/i.test((r[0] || "") + (r[1] || "")));
      return { ratio: hit ? 1 : 0, detail: hit ? "At least one active, recurring, non-grant revenue stream" : "No active recurring non-grant revenue stream found" };
    },
    "Governance investment-grade": (D) => {
      const gov = (D.score.domains || []).find((x) => x.name === "Governance");
      if (!gov) return { ratio: 0, detail: "Governance domain not found" };
      const sc = domainScore(gov);
      return { ratio: sc / (gov.weight || 1), detail: `Governance domain scoring ${sc}/${gov.weight}` };
    },
    "Funding pipeline identified": (D) => {
      const hit = (D.projects || []).some((r) => (r[7] || "").trim());
      return { ratio: hit ? 1 : 0, detail: hit ? "At least one project has a named funder" : "No project has a named funder" };
    },
  },
};
/* Recomputes every unlocked criterion from AUTO_SCORE_RULES and rolls the
   result up into each "detailed" domain's total. Returns true if anything
   changed, so callers know whether the result needs persisting. Criteria
   with no matching rule (custom/renamed criteria) and any locked by a CPA
   via editDomain() are left untouched. */
function syncAutoScore() {
  if (!DATA || !DATA.score) return false;
  let changed = false;
  (DATA.score.criteria || []).forEach((c) => {
    if (c.locked) return;
    const rule = AUTO_SCORE_RULES[c.domain] && AUTO_SCORE_RULES[c.domain][c.name];
    if (!rule) return;
    let result;
    try { result = rule(DATA); } catch (e) { return; }
    if (!result) return;
    const val = Math.round(Math.max(0, Math.min(1, result.ratio)) * c.weight * 100) / 100;
    if (Math.abs((+c.achieved || 0) - val) > 0.005 || c.note !== result.detail) {
      c.achieved = val; c.note = result.detail; changed = true;
    }
  });
  (DATA.score.domains || []).forEach((d) => {
    if (!d.detailed) return;
    const crits = critFor(d.name);
    if (!crits.length) return;
    const total = Math.round(crits.reduce((s, c) => s + (+c.achieved || 0), 0));
    if (total !== (+d.achieved || 0)) { d.achieved = total; changed = true; }
  });
  return changed;
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
      const hasRule = AUTO_SCORE_RULES[d.name] && AUTO_SCORE_RULES[d.name][c.name];
      const tag = hasRule ? (c.locked ? ` <span class="pill neutral" style="font-size:9px;" title="Manually overridden">manual</span>`
        : ` <span class="pill good" style="font-size:9px;" title="${esc(c.note || "")}">auto</span>`) : "";
      return `<li><span class="crit-name">${esc(c.name)}${tag}</span>
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
/* Criteria with a rule in AUTO_SCORE_RULES are, by default, computed live
   from the CPA's own registers (see syncAutoScore) — shown here read-only
   with the auto-scan's rationale. A CPA that disagrees can switch a
   criterion to "Manual override"; that takes one extra save to unlock the
   number field (this modal has no live re-render), which the mode-select's
   own label makes explicit rather than surprising. Criteria with no rule
   (a renamed or custom criterion) work exactly as before — plain manual entry. */
function editDomain(name) {
  const d = DATA.score.domains.find((x) => x.name === name);
  if (!d) return;
  const crits = critFor(name);
  const rules = AUTO_SCORE_RULES[name] || {};
  const fields = [
    { key: "detailed", label: "Scoring method", type: "select", options: ["Single score", "Detailed rubric"],
      value: d.detailed ? "Detailed rubric" : "Single score" },
  ];
  crits.forEach((c, i) => {
    const rule = rules[c.name];
    if (rule && !c.locked) {
      fields.push({ key: "mode" + i, label: `${c.name} (of ${c.weight})`, type: "select",
        options: ["Auto from data (recommended)", "Manual override — save once to unlock"],
        value: "Auto from data (recommended)" });
      fields.push({ key: "info" + i, label: "  ↳ auto-scan result", type: "info",
        value: `${(+c.achieved || 0)}/${c.weight} — ${c.note || "no data yet"}` });
    } else if (rule && c.locked) {
      fields.push({ key: "mode" + i, label: `${c.name} (of ${c.weight})`, type: "select",
        options: ["Manual override", "Auto from data (recommended)"], value: "Manual override" });
      fields.push({ key: "c" + i, label: "  ↳ manually-set value", type: "number", value: +c.achieved || 0 });
    } else {
      fields.push({ key: "c" + i, label: `${c.name} (of ${c.weight})`, type: "number", value: +c.achieved || 0 });
    }
  });
  fields.push({ key: "single", label: `Overall domain score (of ${d.weight}) — used for "Single score"`, type: "number", value: +d.achieved || 0 });
  openModal(`Score — ${name}`, fields, (out) => {
    d.detailed = out.detailed === "Detailed rubric";
    crits.forEach((c, i) => {
      const rule = rules[c.name];
      if (rule) c.locked = (out["mode" + i] || "").startsWith("Manual");
      if (!rule || c.locked) {
        const v = parseFloat(out["c" + i]);
        if (!isNaN(v)) c.achieved = Math.max(0, Math.min(c.weight, v));
      }
    });
    let sv = parseFloat(out.single);
    if (!isNaN(sv)) d.achieved = Math.max(0, Math.min(d.weight, sv));
    syncAutoScore();
    if (d.detailed && crits.length) d.achieved = Math.round(crits.reduce((s, c) => s + (+c.achieved || 0), 0));
    commit("score");
  });
}

/* ============ Productivity Centre (scaffold) ============ */
const PROD_TABS = [
  { id: "crops", label: "Crops" }, { id: "orchards", label: "Orchards" }, { id: "timber", label: "Timber" },
  { id: "livestock", label: "Livestock" }, { id: "water", label: "Water" }, { id: "labour", label: "Labour" },
  { id: "inputs", label: "Inputs" }, { id: "harvest", label: "Harvest" }, { id: "sales", label: "Sales" },
  { id: "cop", label: "Cost of Production" },
];
const ETYPE_BY_TAB = { crops: "Crop", orchards: "Orchard", timber: "Timber", livestock: "Livestock" };
const RTYPE_BY_TAB = { labour: "Labour", inputs: "Inputs", harvest: "Harvest", sales: "Sales" };
const ENTERPRISE_STATUSES = ["Planned", "Active", "Fallow", "Closed"];
const WATER_SOURCES = ["Borehole", "River", "Dam", "Municipal", "Rainwater"];

function renderProductivity() {
  const strip = $("productivity-subtabs");
  strip.innerHTML = subtabStrip("productivity", PROD_TABS);
  wireSubtabs(strip);
  const cur = SUBTAB.productivity || "crops";
  const host = $("productivity-body");
  if (ETYPE_BY_TAB[cur]) renderProdEnterprise(host, ETYPE_BY_TAB[cur]);
  else if (RTYPE_BY_TAB[cur]) renderProdRecords(host, RTYPE_BY_TAB[cur]);
  else if (cur === "water") renderProdWater(host);
  else renderProdCOP(host);
}
function renderProdEnterprise(host, etype) {
  const all = DATA.productivity.enterprises || [];
  const rows = all.filter((r) => r[0] === etype);
  const label = { Crop: "Crop", Orchard: "Orchard", Timber: "Timber", Livestock: "Livestock" }[etype];
  mountRegister(host, {
    title: label + " Enterprises", importKey: "prod_enterprises",
    hint: `${label} production units — area, scale and who runs each.`,
    stats: () => [
      statTile(label + " units", rows.length, "On record", ""),
      statTile("Active", rows.filter((r) => r[6] === "Active").length, "Currently producing", "good"),
      statTile("Area", rows.reduce((s, r) => s + (+r[3] || 0), 0).toLocaleString() + " ha", "Under this enterprise type", ""),
      statTile("Planned", rows.filter((r) => r[6] === "Planned").length, "Not yet started", rows.filter((r) => r[6] === "Planned").length ? "warning" : "good"),
    ],
    columns: [{ label: "Name" }, { label: "Portion" }, { label: "Area (ha)", cls: "num" }, { label: "Scale" }, { label: "Manager / operator" }, { label: "Status" }],
    rows: () => rows,
    empty: `No ${label.toLowerCase()} enterprises recorded.`,
    cell: (r) => [`<span style="font-weight:600;">${esc(r[1])}</span>`, esc(r[2]), `<span class="mono">${(+r[3] || 0).toLocaleString()}</span>`,
      esc(r[4]), esc(r[5]), statusPill(r[6])],
    manage: () => listEditor(PROD_EDITORS.enterprises(etype)),
  });
}
function renderProdWater(host) {
  const w = DATA.productivity.water || [];
  const over = w.filter((r) => (+r[2] || 0) > 0 && (+r[3] || 0) > (+r[2] || 0)).length;
  const nearLimit = w.filter((r) => (+r[2] || 0) > 0 && (+r[3] || 0) / (+r[2] || 1) >= 0.9 && (+r[3] || 0) <= (+r[2] || 0)).length;
  mountRegister(host, {
    title: "Water Sources", importKey: "prod_water",
    hint: "Boreholes, river abstraction and storage — licensed allocation vs actual use.",
    stats: () => [
      statTile("Sources", w.length, "On record", ""),
      statTile("Licensed allocation", w.reduce((s, r) => s + (+r[2] || 0), 0).toLocaleString() + " m³", "Total per year", ""),
      statTile("Recorded use", w.reduce((s, r) => s + (+r[3] || 0), 0).toLocaleString() + " m³", "Against allocation", ""),
      statTile("Over / near limit", (over + nearLimit), over ? "Over-abstraction risk" : "Monitor in summer", over ? "critical" : nearLimit ? "warning" : "good"),
    ],
    columns: [{ label: "Source" }, { label: "Type" }, { label: "Allocation (m³/yr)", cls: "num" }, { label: "Used (m³)", cls: "num" }, { label: "Used %", cls: "num" }, { label: "Licence ref." }, { label: "Status" }],
    rows: () => w,
    empty: "No water sources recorded.",
    cell: (r) => {
      const pct = (+r[2] || 0) ? Math.round((+r[3] || 0) / (+r[2] || 1) * 100) : 0;
      return [`<span style="font-weight:600;">${esc(r[0])}</span>`, `<span class="pill neutral">${esc(r[1])}</span>`,
        `<span class="mono">${(+r[2] || 0).toLocaleString()}</span>`, `<span class="mono">${(+r[3] || 0).toLocaleString()}</span>`,
        `<span class="mono" style="${pct > 100 ? "color:var(--status-critical);font-weight:700;" : pct >= 90 ? "color:var(--status-warning);" : ""}">${(+r[2] || 0) ? pct + "%" : "—"}</span>`,
        `<span class="mono">${esc(r[4])}</span>`, statusPill(r[5])];
    },
    manage: () => listEditor(PROD_EDITORS.water()),
  });
}
function renderProdRecords(host, rtype) {
  const all = DATA.productivity.records || [];
  const rows = all.filter((r) => r[0] === rtype);
  const total = rows.reduce((s, r) => s + (+r[6] || 0), 0);
  const label = { Labour: "Labour", Inputs: "Input", Harvest: "Harvest", Sales: "Sales" }[rtype];
  mountRegister(host, {
    title: label + " Records", importKey: "prod_records",
    hint: {
      Labour: "Wages and stipends paid on production activities.",
      Inputs: "Seed, fertiliser, feed, chemicals and other production inputs.",
      Harvest: "Recorded output by enterprise and period.",
      Sales: "Revenue from produce, livestock and timber.",
    }[rtype],
    stats: () => [
      statTile("Entries", rows.length, `${label} records`, ""),
      statTile(rtype === "Sales" ? "Revenue" : rtype === "Harvest" ? "Records" : "Cost", rtype === "Harvest" ? rows.length : fmtR(total), "This period set", rtype === "Sales" ? "good" : ""),
      statTile("Enterprises covered", new Set(rows.map((r) => r[1]).filter(Boolean)).size, "Distinct", ""),
      statTile("Latest period", rows.length ? esc(rows[rows.length - 1][2] || "—") : "—", "Most recent entry", ""),
    ],
    columns: [{ label: "Enterprise" }, { label: "Period" }, { label: "Description" }, { label: "Quantity", cls: "num" }, { label: "Unit" }, { label: rtype === "Sales" ? "Revenue" : "Amount", cls: "num" }],
    rows: () => rows,
    empty: `No ${label.toLowerCase()} records recorded.`,
    cell: (r) => [`<span style="font-weight:600;">${esc(r[1])}</span>`, `<span class="mono">${esc(r[2])}</span>`,
      `<span style="color:var(--ink-2);">${esc(r[3])}</span>`, `<span class="mono">${(+r[4] || 0).toLocaleString()}</span>`, esc(r[5]),
      `<span class="mono">${(+r[6] || 0) ? (+r[6]).toLocaleString() : "—"}</span>`],
    manage: () => listEditor(PROD_EDITORS.records(rtype)),
  });
}
function renderProdCOP(host) {
  const ent = DATA.productivity.enterprises || [];
  const rec = DATA.productivity.records || [];
  const names = [...new Set([...ent.map((e) => e[1]), ...rec.map((r) => r[1])].filter(Boolean))];
  const sum = (name, type) => rec.filter((r) => r[1] === name && r[0] === type).reduce((s, r) => s + (+r[6] || 0), 0);
  const rows = names.map((name) => {
    const inputs = sum(name, "Inputs"), labour = sum(name, "Labour"), sales = sum(name, "Sales");
    const cost = inputs + labour;
    return { name, inputs, labour, cost, sales, margin: sales - cost };
  });
  const tCost = rows.reduce((s, r) => s + r.cost, 0), tSales = rows.reduce((s, r) => s + r.sales, 0);
  host.innerHTML = `
    <div class="grid grid-4">
      ${statTile("Enterprises", rows.length, "With cost or sales data", "")}
      ${statTile("Cost of production", fmtR(tCost), "Inputs + labour recorded", "")}
      ${statTile("Enterprise revenue", fmtR(tSales), "Sales recorded", "good")}
      ${statTile("Gross margin", fmtR(tSales - tCost), tSales - tCost >= 0 ? "surplus" : "deficit", tSales - tCost >= 0 ? "good" : "critical")}
    </div>
    <div class="card-head" style="margin:18px 0 10px;"><div><h3 style="font-size:13px;">Cost of production by enterprise</h3>
      <span class="hint">Computed from the Inputs, Labour and Sales records.</span></div></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Enterprise</th><th class="num">Inputs</th><th class="num">Labour</th><th class="num">Total cost</th><th class="num">Sales</th><th class="num">Margin</th></tr></thead>
      <tbody>${rows.length ? rows.map((r) => `<tr>
        <td style="font-weight:600;">${esc(r.name)}</td>
        <td class="num mono">${r.inputs.toLocaleString()}</td>
        <td class="num mono">${r.labour.toLocaleString()}</td>
        <td class="num mono">${r.cost.toLocaleString()}</td>
        <td class="num mono">${r.sales.toLocaleString()}</td>
        <td class="num mono" style="${r.margin < 0 ? "color:var(--status-critical);font-weight:700;" : "color:var(--status-good);"}">${r.margin.toLocaleString()}</td>
      </tr>`).join("") : emptyRow(6, "No production records yet — capture Inputs, Labour and Sales.")}</tbody>
    </table></div>`;
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
  profile: renderProfile, beneficiary: renderBeneficiary, administration: renderAdministration, hr: renderHR,
  finance: renderFinance, assets: renderAssets, productivity: renderProductivity, projects: renderProjects,
  masterfile: renderMasterFile, actions: renderActions, impact: renderImpact, gallery: renderGallery,
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
      { k: "role", label: "Family position (ODI / Family Representative / 1st-4th Descendant)" },
      { k: "contact", label: "Contact" }, { k: "joined", label: "Joined on" }, { k: "status", label: "Status" }, { k: "verif", label: "Verification" }],
    make: (v) => [v.ref || "", v.name, v.gender || "", v.dob || "", maskId(v.idm), v.hh || "", v.contact || "", v.joined || "",
      ["Active", "Deceased", "Removed", "Transferred"].includes(v.status) ? v.status : "Active",
      ["Verified", "Pending", "Disputed", "Rejected"].includes(v.verif) ? v.verif : "Pending", "",
      HOUSEHOLD_ROLES.includes(v.role) ? v.role : (v.role || "")],
  },
  households: {
    title: "households", section: "households", arr: () => DATA.beneficiaryCentre.households,
    targets: [
      { k: "ref", label: "Household ref (blank = auto MCPA-###)" },
      { k: "famrep", label: "Family Representative" },
      { k: "odi", label: "ODI", required: true },
      { k: "odiId", label: "ID no. of ODI (auto-masked)" },
      { k: "d1", label: "1st Descendant" }, { k: "d1id", label: "ID: 1st Descendant (auto-masked)" },
      { k: "d2", label: "2nd Descendant" }, { k: "d2id", label: "ID 2nd Descendant (auto-masked)" },
      { k: "d3", label: "3rd Descendants" }, { k: "d3id", label: "ID 3rd Descendant (auto-masked)" },
      { k: "d4", label: "4th Descendants" }, { k: "d4id", label: "ID 4th Descendants (auto-masked)" },
      { k: "status", label: "Status" }, { k: "resident", label: "Dwells on the farm / in the community (Yes/No)" },
    ],
    make: (v, idx) => [
      (v.ref || "").trim() || `MCPA-${String(householdMaxSeq() + 1 + idx).padStart(3, "0")}`,
      v.famrep || "", v.odi, maskId(v.odiId),
      v.d1 || "", maskId(v.d1id), v.d2 || "", maskId(v.d2id), v.d3 || "", maskId(v.d3id), v.d4 || "", maskId(v.d4id),
      v.status || "Active", !/^(no|n|false|0)$/i.test((v.resident || "").trim()),
      "", "", "", "Pending", "", "", "", "", false, "",
    ],
    // Every household imported here has its own family tree — extract the ODI, Family
    // Representative and each descendant straight into the Master Register too, so one
    // upload correctly produces both the household record AND the individual beneficiaries.
    afterImport: (builtRows) => {
      const reg = DATA.beneficiaryCentre.register;
      let created = 0, updated = 0;
      builtRows.forEach((h) => { const r = extractOneHousehold(h, reg); created += r.created; updated += r.updated; });
      if (!created && !updated) return "";
      commit("beneficiaries");
      return ` Also extracted ${created} new beneficiar${created === 1 ? "y" : "ies"}${updated ? `, updated ${updated} existing` : ""} into the Master Register.`;
    },
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
  fin_transactions: {
    title: "transactions", section: "fin_transactions", arr: () => DATA.finProc.transactions,
    targets: [{ k: "date", label: "Date" }, { k: "desc", label: "Description", required: true }, { k: "cat", label: "Category" },
      { k: "type", label: "Type (Income/Expense)" }, { k: "amount", label: "Amount" }, { k: "method", label: "Method" }, { k: "ref", label: "Reference" }],
    make: (v) => [v.date || "", v.desc, v.cat || "", /^i/i.test(v.type || "") ? "Income" : "Expense",
      parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0, v.method || "EFT", v.ref || "", false],
  },
  fin_bills: {
    title: "bills", section: "fin_bills", arr: () => DATA.finProc.bills,
    targets: [{ k: "ref", label: "Bill / invoice ref." }, { k: "billType", label: "Bill type (Municipality / Eskom / Water / ...)" },
      { k: "provider", label: "Provider", required: true }, { k: "account", label: "Account number" },
      { k: "billDate", label: "Bill date" }, { k: "dueDate", label: "Due date" },
      { k: "amount", label: "Amount" }, { k: "paid", label: "Paid to date" }, { k: "status", label: "Status" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.ref || "", BILL_TYPES.includes(v.billType) ? v.billType : "Other", v.provider, v.account || "",
      v.billDate || "", v.dueDate || "", parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0,
      parseFloat((v.paid || "").replace(/[^\d.-]/g, "")) || 0, BILL_STATUSES.includes(v.status) ? v.status : "Outstanding", v.notes || ""],
  },
  fin_quotes: {
    title: "quotes", section: "fin_quotes", arr: () => DATA.finProc.quotes,
    targets: [{ k: "reqRef", label: "Requisition ref." }, { k: "desc", label: "Description", required: true }, { k: "supplier", label: "Supplier" },
      { k: "amount", label: "Amount" }, { k: "date", label: "Quote date" }, { k: "selected", label: "Selected (Yes/No)" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.reqRef || "", v.desc, v.supplier || "", parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0,
      v.date || "", /^y/i.test(v.selected || ""), v.notes || ""],
  },
  fin_contracts: {
    title: "contracts", section: "fin_contracts", arr: () => DATA.finProc.contracts,
    targets: [{ k: "ref", label: "Contract ref." }, { k: "party", label: "Party", required: true }, { k: "purpose", label: "Purpose" }, { k: "type", label: "Type" },
      { k: "start", label: "Start date" }, { k: "end", label: "End date" }, { k: "value", label: "Value" }, { k: "renewal", label: "Renewal terms" },
      { k: "status", label: "Status" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.ref || "", v.party, v.purpose || "", v.type || "", v.start || "", v.end || "",
      parseFloat((v.value || "").replace(/[^\d.-]/g, "")) || 0, v.renewal || "", CONTRACT_STATUSES.includes(v.status) ? v.status : "Active", v.notes || ""],
  },
  fin_grn: {
    title: "goods/services received", section: "fin_grn", arr: () => DATA.finProc.grn,
    targets: [{ k: "ref", label: "GRN ref." }, { k: "poRef", label: "PO ref." }, { k: "desc", label: "Description", required: true }, { k: "date", label: "Received date" },
      { k: "by", label: "Received by" }, { k: "condition", label: "Condition" }, { k: "discrepancy", label: "Discrepancy" }, { k: "status", label: "Status" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.ref || "", v.poRef || "", v.desc, v.date || "", v.by || "", CONDITIONS.includes(v.condition) ? v.condition : "Good",
      v.discrepancy || "", GRN_STATUSES.includes(v.status) ? v.status : "Received", v.notes || ""],
  },
  fin_afs: {
    title: "annual financial statements", section: "fin_afs", arr: () => DATA.finProc.afs,
    targets: [{ k: "year", label: "Financial year", required: true }, { k: "status", label: "Status" }, { k: "auditor", label: "Auditor" },
      { k: "approved", label: "Approved by members on" }, { k: "dalrrd", label: "Filed with DALRRD on" }, { k: "cipc", label: "Filed with CIPC on" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.year, AFS_STATUSES.includes(v.status) ? v.status : "Draft", v.auditor || "", v.approved || "", v.dalrrd || "", v.cipc || "", v.notes || ""],
  },
  fin_member_pay: {
    title: "members' remuneration", section: "fin_member_pay", arr: () => DATA.finProc.memberPay,
    targets: [{ k: "name", label: "Member name", required: true }, { k: "role", label: "Role" }, { k: "type", label: "Payment type" }, { k: "amount", label: "Amount" },
      { k: "period", label: "Period" }, { k: "resolution", label: "Resolution ref." }, { k: "disclosed", label: "Disclosed at AGM (Yes/No)" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.name, v.role || "", MEMBER_PAY_TYPES.includes(v.type) ? v.type : "Sitting Allowance",
      parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0, v.period || "", v.resolution || "", /^y/i.test(v.disclosed || ""), v.notes || ""],
  },
  fin_bank_recon: {
    title: "bank reconciliations", section: "fin_bank_recon", arr: () => DATA.finProc.bankRecon,
    targets: [{ k: "period", label: "Period", required: true }, { k: "bank", label: "Bank balance" }, { k: "book", label: "Book balance" },
      { k: "prepared", label: "Prepared by" }, { k: "reviewed", label: "Reviewed by" }, { k: "status", label: "Status" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.period, parseFloat((v.bank || "").replace(/[^\d.-]/g, "")) || 0, parseFloat((v.book || "").replace(/[^\d.-]/g, "")) || 0,
      v.prepared || "", v.reviewed || "", BANKRECON_STATUSES.includes(v.status) ? v.status : "Draft", v.notes || ""],
  },
  fin_close: {
    title: "month-end close", section: "fin_close", arr: () => DATA.finProc.close,
    targets: [{ k: "period", label: "Period", required: true }, { k: "journals", label: "Journals posted (Yes/No)" }, { k: "accruals", label: "Accruals done (Yes/No)" },
      { k: "bankRec", label: "Bank rec done (Yes/No)" }, { k: "reports", label: "Reports issued (Yes/No)" }, { k: "signedBy", label: "Signed off by" },
      { k: "signedDate", label: "Sign-off date" }, { k: "notes", label: "Notes" }],
    make: (v) => [v.period, /^y/i.test(v.journals || ""), /^y/i.test(v.accruals || ""), /^y/i.test(v.bankRec || ""), /^y/i.test(v.reports || ""),
      v.signedBy || "", v.signedDate || "", v.notes || ""],
  },
  proc_suppliers: {
    title: "suppliers", section: "proc_suppliers", arr: () => DATA.finProc.suppliers,
    targets: [{ k: "name", label: "Supplier", required: true }, { k: "cat", label: "Category" }, { k: "contact", label: "Contact" },
      { k: "reg", label: "Reg. no." }, { k: "tax", label: "Tax clearance" }, { k: "bee", label: "B-BBEE level" }, { k: "status", label: "Status" }],
    make: (v) => [v.name, v.cat || "", v.contact || "", v.reg || "", ["Valid", "Expired", "None"].includes(v.tax) ? v.tax : "None", v.bee || "", v.status || "Active"],
  },
  proc_requisitions: {
    title: "requisitions", section: "proc_requisitions", arr: () => DATA.finProc.requisitions,
    targets: [{ k: "ref", label: "Ref" }, { k: "date", label: "Date" }, { k: "desc", label: "Description", required: true },
      { k: "cat", label: "Category" }, { k: "amount", label: "Amount" }, { k: "by", label: "Requested by" }, { k: "appr", label: "Approved by" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", v.date || "", v.desc, v.cat || "", parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0,
      v.by || "", v.appr || "", v.status || "Submitted"],
  },
  proc_purchase_orders: {
    title: "purchase orders", section: "proc_purchase_orders", arr: () => DATA.finProc.pos,
    targets: [{ k: "ref", label: "PO ref" }, { k: "date", label: "Date" }, { k: "supplier", label: "Supplier" },
      { k: "desc", label: "Description", required: true }, { k: "amount", label: "Amount" }, { k: "req", label: "Requisition ref" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", v.date || "", v.supplier || "", v.desc, parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0, v.req || "", v.status || "Open"],
  },
  fin_payments: {
    title: "payments", section: "fin_payments", arr: () => DATA.finProc.payments,
    targets: [{ k: "date", label: "Date" }, { k: "payee", label: "Payee", required: true }, { k: "desc", label: "Description" },
      { k: "amount", label: "Amount" }, { k: "method", label: "Method" }, { k: "po", label: "PO ref" }, { k: "bankref", label: "Bank ref" }, { k: "status", label: "Status" }],
    make: (v) => [v.date || "", v.payee, v.desc || "", parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0, v.method || "EFT", v.po || "", v.bankref || "", v.status || "Pending"],
  },
  infrastructure: {
    title: "infrastructure", section: "infrastructure", arr: () => DATA.assets.infrastructure,
    targets: [{ k: "name", label: "Asset", required: true }, { k: "itype", label: "Type" }, { k: "loc", label: "Location" },
      { k: "year", label: "Year installed" }, { k: "value", label: "Value" }, { k: "cond", label: "Condition" }, { k: "status", label: "Status" }],
    make: (v) => [v.name, INFRA_TYPES.includes(v.itype) ? v.itype : "Other", v.loc || "", parseFloat(v.year) || 0,
      parseFloat((v.value || "").replace(/[^\d.-]/g, "")) || 0, CONDITIONS.includes(v.cond) ? v.cond : "Fair", v.status || "In use", ""],
  },
  asset_maintenance: {
    title: "maintenance tasks", section: "asset_maintenance", arr: () => DATA.assets.maintenance,
    targets: [{ k: "asset", label: "Asset", required: true }, { k: "kind", label: "Kind" }, { k: "task", label: "Task", required: true },
      { k: "sched", label: "Scheduled date" }, { k: "done", label: "Completed date" }, { k: "cost", label: "Cost" }, { k: "resp", label: "Responsible" }, { k: "status", label: "Status" }],
    make: (v) => [v.asset, v.kind || "Infrastructure", v.task, v.sched || "", v.done || "",
      parseFloat((v.cost || "").replace(/[^\d.-]/g, "")) || 0, v.resp || "", MAINT_STATUSES.includes(v.status) ? v.status : "Scheduled", ""],
  },
  prod_enterprises: {
    title: "production enterprises", section: "prod_enterprises", arr: () => DATA.productivity.enterprises,
    targets: [{ k: "etype", label: "Type (Crop/Orchard/Timber/Livestock)" }, { k: "name", label: "Name", required: true }, { k: "portion", label: "Portion" },
      { k: "area", label: "Area (ha)" }, { k: "units", label: "Scale" }, { k: "manager", label: "Manager" }, { k: "status", label: "Status" }],
    make: (v) => [["Crop", "Orchard", "Timber", "Livestock", "Other"].includes(v.etype) ? v.etype : "Crop", v.name, v.portion || "",
      parseFloat(v.area) || 0, v.units || "", v.manager || "", ENTERPRISE_STATUSES.includes(v.status) ? v.status : "Active", ""],
  },
  prod_water: {
    title: "water sources", section: "prod_water", arr: () => DATA.productivity.water,
    targets: [{ k: "name", label: "Source", required: true }, { k: "source", label: "Type" }, { k: "alloc", label: "Allocation (m³/yr)" },
      { k: "usage", label: "Used (m³)" }, { k: "lic", label: "Licence ref" }, { k: "status", label: "Status" }],
    make: (v) => [v.name, WATER_SOURCES.includes(v.source) ? v.source : "Borehole", parseFloat((v.alloc || "").replace(/[^\d.-]/g, "")) || 0,
      parseFloat((v.usage || "").replace(/[^\d.-]/g, "")) || 0, v.lic || "", v.status || "Active", ""],
  },
  prod_records: {
    title: "production records", section: "prod_records", arr: () => DATA.productivity.records,
    targets: [{ k: "rtype", label: "Type (Labour/Inputs/Harvest/Sales)" }, { k: "ent", label: "Enterprise" }, { k: "period", label: "Period" },
      { k: "desc", label: "Description", required: true }, { k: "qty", label: "Quantity" }, { k: "unit", label: "Unit" }, { k: "amount", label: "Amount" }],
    make: (v) => [["Labour", "Inputs", "Harvest", "Sales"].includes(v.rtype) ? v.rtype : "Inputs", v.ent || "", v.period || "", v.desc,
      parseFloat(v.qty) || 0, v.unit || "", parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0],
  },
  markets: {
    title: "markets", section: "markets", arr: () => DATA.commercial.markets,
    targets: [{ k: "commodity", label: "Commodity", required: true }, { k: "buyer", label: "Buyer" }, { k: "channel", label: "Channel" },
      { k: "volume", label: "Volume" }, { k: "price", label: "Price basis" }, { k: "agreement", label: "Agreement" }, { k: "status", label: "Status" }],
    make: (v) => [v.commodity, v.buyer || "", v.channel || "Contract", v.volume || "", v.price || "",
      ["None", "Verbal", "MOU", "Signed offtake"].includes(v.agreement) ? v.agreement : "None", v.status || "Exploring", ""],
  },
  partnerships: {
    title: "partnerships", section: "partnerships", arr: () => DATA.commercial.partnerships,
    targets: [{ k: "partner", label: "Partner", required: true }, { k: "ptype", label: "Type" }, { k: "purpose", label: "Purpose" },
      { k: "start", label: "Start date" }, { k: "end", label: "End date" }, { k: "status", label: "Status" }],
    make: (v) => [v.partner, ["Funder", "Technical", "Market", "Government", "NGO", "Other"].includes(v.ptype) ? v.ptype : "Technical",
      v.purpose || "", v.start || "", v.end || "", v.status || "Active", ""],
  },
  revenue_streams: {
    title: "revenue streams", section: "revenue_streams", arr: () => DATA.commercial.revenue,
    targets: [{ k: "stream", label: "Stream", required: true }, { k: "source", label: "Source" }, { k: "amount", label: "Annual amount" },
      { k: "recurring", label: "Recurring (Yes/No)" }, { k: "status", label: "Status" }],
    make: (v) => [v.stream, ["Lease", "Enterprise sales", "Grant", "Services", "Other"].includes(v.source) ? v.source : "Enterprise sales",
      parseFloat((v.amount || "").replace(/[^\d.-]/g, "")) || 0, !/^n/i.test(v.recurring || "y"), v.status || "Active", ""],
  },
  admin_correspondence: {
    title: "correspondence", section: "admin_correspondence", arr: () => DATA.admin.correspondence,
    targets: [{ k: "ref", label: "Ref" }, { k: "dir", label: "Direction" }, { k: "date", label: "Date" }, { k: "party", label: "Party" },
      { k: "subject", label: "Subject", required: true }, { k: "channel", label: "Channel" }, { k: "due", label: "Response due" }, { k: "owner", label: "Owner" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", /^o/i.test(v.dir || "") ? "Outgoing" : "Incoming", v.date || "", v.party || "", v.subject,
      v.channel || "Email", v.due || "", v.owner || "", CORR_STATUSES.includes(v.status) ? v.status : "Open"],
  },
  admin_doa: {
    title: "delegation of authority", section: "admin_doa", arr: () => DATA.admin.doa,
    targets: [{ k: "fn", label: "Function", required: true }, { k: "cat", label: "Category" }, { k: "thr", label: "Threshold" },
      { k: "app", label: "Approver" }, { k: "sec", label: "Secondary approver" }, { k: "ref", label: "Reference" }],
    make: (v) => [v.fn, v.cat || "Finance", v.thr || "", v.app || "", v.sec || "", v.ref || ""],
  },
  admin_policies: {
    title: "policies & SOPs", section: "admin_policies", arr: () => DATA.admin.policies,
    targets: [{ k: "title", label: "Title", required: true }, { k: "cat", label: "Category" }, { k: "ver", label: "Version" },
      { k: "adopted", label: "Adopted on" }, { k: "review", label: "Review due" }, { k: "owner", label: "Owner" }, { k: "status", label: "Status" }],
    make: (v) => [v.title, v.cat || "", v.ver || "", v.adopted || "", v.review || "", v.owner || "", POLICY_STATUSES.includes(v.status) ? v.status : "Draft"],
  },
  admin_records: {
    title: "records index", section: "admin_records", arr: () => DATA.admin.records,
    targets: [{ k: "series", label: "Record series", required: true }, { k: "desc", label: "Contents" }, { k: "medium", label: "Medium" },
      { k: "loc", label: "Location" }, { k: "cust", label: "Custodian" }, { k: "ret", label: "Retention" }, { k: "status", label: "Status" }],
    make: (v) => [v.series, v.desc || "", MEDIA.includes(v.medium) ? v.medium : "Digital", v.loc || "", v.cust || "", v.ret || "",
      RECORD_STATUSES.includes(v.status) ? v.status : "Current"],
  },
  hr_staff: {
    title: "staff", section: "hr_staff", arr: () => DATA.hr.staff,
    targets: [{ k: "ref", label: "Ref" }, { k: "name", label: "Full name", required: true }, { k: "pos", label: "Position" },
      { k: "type", label: "Employment type" }, { k: "start", label: "Start date" }, { k: "reports", label: "Reports to" }, { k: "band", label: "Salary band" }, { k: "status", label: "Status" }],
    make: (v) => [v.ref || "", v.name, v.pos || "", EMP_TYPES.includes(v.type) ? v.type : "Permanent", v.start || "", v.reports || "", v.band || "",
      STAFF_STATUSES.includes(v.status) ? v.status : "Active"],
  },
  hr_positions: {
    title: "positions", section: "hr_positions", arr: () => DATA.hr.positions,
    targets: [{ k: "title", label: "Position", required: true }, { k: "dept", label: "Department" }, { k: "reports", label: "Reports to" },
      { k: "inc", label: "Incumbent" }, { k: "hc", label: "Heads" }, { k: "status", label: "Status" }],
    make: (v) => [v.title, v.dept || "", v.reports || "", v.inc || "", parseFloat(v.hc) || 1, POS_STATUSES.includes(v.status) ? v.status : "Vacant"],
  },
  hr_payroll: {
    title: "payroll", section: "hr_payroll", arr: () => DATA.hr.payroll,
    targets: [{ k: "period", label: "Period", required: true }, { k: "hc", label: "Headcount" }, { k: "gross", label: "Gross" },
      { k: "ded", label: "Deductions" }, { k: "net", label: "Net" }, { k: "paye", label: "PAYE ref" }, { k: "uif", label: "UIF ref" }, { k: "status", label: "Status" }],
    make: (v) => [v.period, parseFloat(v.hc) || 0, parseFloat((v.gross || "").replace(/[^\d.-]/g, "")) || 0,
      parseFloat((v.ded || "").replace(/[^\d.-]/g, "")) || 0, parseFloat((v.net || "").replace(/[^\d.-]/g, "")) || 0,
      v.paye || "", v.uif || "", PAYROLL_STATUSES.includes(v.status) ? v.status : "Draft"],
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
    targets: [{ k: "name", label: "Permit / license", required: true }, { k: "valid", label: "Valid until" }, { k: "status", label: "Status" },
      { k: "commodity", label: "Commodity" }, { k: "applicantName", label: "Applicant name" }, { k: "applicantEmail", label: "Applicant e-mail" },
      { k: "siteRef", label: "Site / portion" }, { k: "species", label: "Species" }, { k: "quantity", label: "Quantity" }, { k: "purpose", label: "Purpose" }],
    make: (v) => [v.name, v.valid || "", v.status || "Valid", v.commodity || "Other", v.applicantName || "", v.applicantEmail || "",
      v.siteRef || "", v.species || "", v.quantity || "", v.purpose || "", "Not Started", "", "", ""],
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
    blank: () => ["", "", "Female", "", "", "", "", new Date().toISOString().slice(0, 10), "Active", "Pending", "", ""],
    fields: (r) => [
      { key: "ref", label: "Register / member no.", type: "text", value: r[0] },
      { key: "name", label: "Full name", type: "text", value: r[1], required: true },
      { key: "gender", label: "Gender", type: "select", options: ["Female", "Male", "Other", "Unspecified"], value: r[2] || "Female" },
      { key: "dob", label: "Date of birth", type: "date", value: r[3] },
      { key: "idm", label: "ID (auto-masked — only the last 4 digits are kept)", type: "text", value: r[4] },
      { key: "hh", label: "Household ref.", type: "text", value: r[5] },
      { key: "role", label: "Family position", type: "select", options: HOUSEHOLD_ROLES, value: r[11] || "" },
      { key: "contact", label: "Contact", type: "text", value: r[6] },
      { key: "joined", label: "Joined on", type: "date", value: r[7] },
      { key: "status", label: "Status", type: "select", options: BENE_STATUSES, value: r[8] },
      { key: "verif", label: "Verification", type: "select", options: VERIF_STATUSES, value: r[9] },
      { key: "notes", label: "Notes", type: "textarea", value: r[10] },
    ],
    write: (r, o) => {
      r[0] = o.ref; r[1] = o.name; r[2] = o.gender; r[3] = o.dob; r[4] = maskId(o.idm); r[5] = o.hh;
      r[6] = o.contact; r[7] = o.joined; r[8] = o.status; r[9] = o.verif; r[10] = o.notes; r[11] = o.role;
    },
  }),
  households: () => ({
    title: "Household records", arr: DATA.beneficiaryCentre.households, section: "households",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${r[2] || r[1] || "Household"}`,
    blank: () => [nextHouseholdRef(), "", "", "", "", "", "", "", "", "", "", "", "Active", true,
      "", "", "", "Pending", "", "", "", "", false, ""],
    fields: (r) => [
      { key: "famrep", label: "Household Head Name", type: "text", value: r[1] },
      { key: "headId", label: "Household Head ID Number (auto-masked — only the last 4 digits are kept)", type: "text", value: r[14] },
      { key: "headPhone", label: "Household Head Phone", type: "text", value: r[15] },
      { key: "headAddress", label: "Household Head Address", type: "textarea", value: r[16] },
      { key: "odi", label: "ODI", type: "text", value: r[2], required: true },
      { key: "odiId", label: "ID no. of ODI (auto-masked — only the last 4 digits are kept)", type: "text", value: r[3] },
      { key: "d1", label: "1st Descendant", type: "text", value: r[4] },
      { key: "d1id", label: "ID: 1st Descendant (auto-masked — only the last 4 digits are kept)", type: "text", value: r[5] },
      { key: "d2", label: "2nd Descendant", type: "text", value: r[6] },
      { key: "d2id", label: "ID 2nd Descendant (auto-masked — only the last 4 digits are kept)", type: "text", value: r[7] },
      { key: "d3", label: "3rd Descendants", type: "text", value: r[8] },
      { key: "d3id", label: "ID 3rd Descendant (auto-masked — only the last 4 digits are kept)", type: "text", value: r[9] },
      { key: "d4", label: "4th Descendants", type: "text", value: r[10] },
      { key: "d4id", label: "ID 4th Descendants (auto-masked — only the last 4 digits are kept)", type: "text", value: r[11] },
      { key: "resident", label: "Dwells on the farm / in the community", type: "select", options: ["Yes", "No"], value: r[13] === false ? "No" : "Yes" },
      { key: "status", label: "Status", type: "select", options: ["Active", "Relocated", "Dissolved"], value: r[12] },
      { key: "verification", label: "Verification Status", type: "select", options: VERIF_STATUSES, value: r[17] || "Pending" },
      { key: "dateRegistered", label: "Date Registered", type: "date", value: r[18] },
      { key: "lastReviewed", label: "Last Reviewed Date", type: "date", value: r[19] },
      { key: "landRef", label: "Land / Site Allocation Reference", type: "text", value: r[20] },
      { key: "benefitBasis", label: "Benefit Basis", type: "select", options: BENEFIT_BASIS_OPTIONS, value: r[21] || "" },
      { key: "disputeFlag", label: "Dispute Flag", type: "select", options: ["No", "Yes"], value: r[22] ? "Yes" : "No" },
      { key: "disputeRef", label: "Dispute Reference (see Duplicate / Conflict Cases)", type: "text", value: r[23] },
    ],
    write: (r, o) => {
      r[1] = o.famrep; r[2] = o.odi; r[3] = maskId(o.odiId);
      r[4] = o.d1; r[5] = maskId(o.d1id); r[6] = o.d2; r[7] = maskId(o.d2id);
      r[8] = o.d3; r[9] = maskId(o.d3id); r[10] = o.d4; r[11] = maskId(o.d4id);
      r[12] = o.status; r[13] = o.resident !== "No";
      r[14] = maskId(o.headId); r[15] = o.headPhone; r[16] = o.headAddress;
      r[17] = o.verification; r[18] = o.dateRegistered; r[19] = o.lastReviewed;
      r[20] = o.landRef; r[21] = o.benefitBasis; r[22] = o.disputeFlag === "Yes"; r[23] = o.disputeRef;
    },
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

/* listEditor configs for the Finance & Procurement registers */
const FIN_EDITORS = {
  transactions: () => ({
    title: "Transactions", arr: DATA.finProc.transactions, section: "fin_transactions",
    rowLabel: (r) => `${r[0] || "?"} — ${r[1]} · ${fmtR(r[4])}`,
    blank: () => [new Date().toISOString().slice(0, 10), "", "", "Expense", 0, "EFT", "", false],
    fields: (r) => [
      { key: "date", label: "Date", type: "date", value: r[0] },
      { key: "desc", label: "Description", type: "text", value: r[1], required: true },
      { key: "cat", label: "Budget category", type: "select", options: ["", ...DATA.finance.categories.map((c) => c[0])], value: r[2] },
      { key: "type", label: "Type", type: "select", options: TXN_TYPES, value: r[3] },
      { key: "amount", label: "Amount (R)", type: "number", value: r[4], min: 0 },
      { key: "method", label: "Method", type: "select", options: ["EFT", "Cash", "Card", "Cheque", "Debit order"], value: r[5] || "EFT" },
      { key: "ref", label: "Reference", type: "text", value: r[6] },
      { key: "rec", label: "Reconciled", type: "select", options: ["No", "Yes"], value: r[7] ? "Yes" : "No" },
    ],
    write: (r, o) => { r[0] = o.date; r[1] = o.desc; r[2] = o.cat; r[3] = o.type; r[4] = parseFloat(o.amount) || 0; r[5] = o.method; r[6] = o.ref; r[7] = o.rec === "Yes"; },
  }),
  bills: () => ({
    title: "Bills", arr: DATA.finProc.bills, section: "fin_bills",
    rowLabel: (r) => `${esc(r[1])} — ${r[2] || "?"} (${fmtR(billOutstanding(r))} outstanding)`,
    blank: () => ["", BILL_TYPES[0], "", "", new Date().toISOString().slice(0, 10), "", 0, 0, "Outstanding", ""],
    fields: (r) => [
      { key: "ref", label: "Bill / invoice ref. (optional)", type: "text", value: r[0] },
      { key: "billType", label: "Bill type", type: "select", options: BILL_TYPES, value: r[1] },
      { key: "provider", label: "Provider (e.g. the municipality's name)", type: "text", value: r[2], required: true },
      { key: "account", label: "Account number", type: "text", value: r[3] },
      { key: "billDate", label: "Bill date", type: "date", value: r[4] },
      { key: "dueDate", label: "Due date", type: "date", value: r[5] },
      { key: "amount", label: "Amount (R)", type: "number", value: r[6], min: 0 },
      { key: "paid", label: "Paid to date (R)", type: "number", value: r[7], min: 0 },
      { key: "status", label: "Status", type: "select", options: BILL_STATUSES, value: r[8] },
      { key: "notes", label: "Notes", type: "textarea", value: r[9] },
    ],
    write: (r, o) => {
      r[0] = o.ref; r[1] = o.billType; r[2] = o.provider; r[3] = o.account; r[4] = o.billDate; r[5] = o.dueDate;
      r[6] = parseFloat(o.amount) || 0; r[7] = parseFloat(o.paid) || 0; r[8] = o.status; r[9] = o.notes;
    },
  }),
  quotes: () => ({
    title: "Quotes", arr: DATA.finProc.quotes, section: "fin_quotes",
    rowLabel: (r) => `${r[2] || "?"} — ${fmtR(r[3])} (${r[0] || "no req ref"})`,
    blank: () => ["", "", "", 0, new Date().toISOString().slice(0, 10), false, ""],
    fields: (r) => [
      { key: "reqRef", label: "Requisition ref.", type: "text", value: r[0] },
      { key: "desc", label: "Description", type: "text", value: r[1], required: true },
      { key: "supplier", label: "Supplier", type: "text", value: r[2] },
      { key: "amount", label: "Amount (R)", type: "number", value: r[3], min: 0 },
      { key: "date", label: "Quote date", type: "date", value: r[4] },
      { key: "selected", label: "Selected", type: "select", options: ["No", "Yes"], value: r[5] ? "Yes" : "No" },
      { key: "notes", label: "Notes", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.reqRef; r[1] = o.desc; r[2] = o.supplier; r[3] = parseFloat(o.amount) || 0; r[4] = o.date; r[5] = o.selected === "Yes"; r[6] = o.notes; },
  }),
  contracts: () => ({
    title: "Contracts", arr: DATA.finProc.contracts, section: "fin_contracts",
    rowLabel: (r) => `${r[1]} — ${r[3] || "Contract"} (${r[8]})`,
    blank: () => ["", "", "", "", "", "", 0, "", "Active", ""],
    fields: (r) => [
      { key: "ref", label: "Contract ref. (optional)", type: "text", value: r[0] },
      { key: "party", label: "Party / supplier", type: "text", value: r[1], required: true },
      { key: "purpose", label: "Purpose", type: "textarea", value: r[2] },
      { key: "type", label: "Contract type", type: "text", value: r[3] },
      { key: "start", label: "Start date", type: "date", value: r[4] },
      { key: "end", label: "End date", type: "date", value: r[5] },
      { key: "value", label: "Value (R)", type: "number", value: r[6], min: 0 },
      { key: "renewal", label: "Renewal terms", type: "text", value: r[7] },
      { key: "status", label: "Status", type: "select", options: CONTRACT_STATUSES, value: r[8] },
      { key: "notes", label: "Notes", type: "textarea", value: r[9] },
    ],
    write: (r, o) => {
      r[0] = o.ref; r[1] = o.party; r[2] = o.purpose; r[3] = o.type; r[4] = o.start; r[5] = o.end;
      r[6] = parseFloat(o.value) || 0; r[7] = o.renewal; r[8] = o.status; r[9] = o.notes;
    },
  }),
  grn: () => ({
    title: "Goods/services received", arr: DATA.finProc.grn, section: "fin_grn",
    rowLabel: (r) => `${r[2]} — ${r[1] || "no PO ref"}`,
    blank: () => ["", "", "", new Date().toISOString().slice(0, 10), "", "Good", "", "Received", ""],
    fields: (r) => [
      { key: "ref", label: "GRN ref. (optional)", type: "text", value: r[0] },
      { key: "poRef", label: "Purchase order ref.", type: "text", value: r[1] },
      { key: "desc", label: "Description", type: "text", value: r[2], required: true },
      { key: "date", label: "Received date", type: "date", value: r[3] },
      { key: "by", label: "Received by", type: "text", value: r[4] },
      { key: "condition", label: "Condition", type: "select", options: CONDITIONS, value: r[5] },
      { key: "discrepancy", label: "Discrepancy (if any)", type: "textarea", value: r[6] },
      { key: "status", label: "Status", type: "select", options: GRN_STATUSES, value: r[7] },
      { key: "notes", label: "Notes", type: "textarea", value: r[8] },
    ],
    write: (r, o) => {
      r[0] = o.ref; r[1] = o.poRef; r[2] = o.desc; r[3] = o.date; r[4] = o.by;
      r[5] = o.condition; r[6] = o.discrepancy; r[7] = o.status; r[8] = o.notes;
    },
  }),
  afs: () => ({
    title: "Annual financial statements", arr: DATA.finProc.afs, section: "fin_afs",
    rowLabel: (r) => `FY ${r[0]} — ${r[1]}`,
    blank: () => [String(new Date().getFullYear()), "Draft", "", "", "", "", ""],
    fields: (r) => [
      { key: "year", label: "Financial year (e.g. 2025/26)", type: "text", value: r[0], required: true },
      { key: "status", label: "Status", type: "select", options: AFS_STATUSES, value: r[1] },
      { key: "auditor", label: "Auditor", type: "text", value: r[2] },
      { key: "approved", label: "Approved by members on", type: "date", value: r[3] },
      { key: "dalrrd", label: "Filed with DALRRD on", type: "date", value: r[4] },
      { key: "cipc", label: "Filed with CIPC on", type: "date", value: r[5] },
      { key: "notes", label: "Notes", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.year; r[1] = o.status; r[2] = o.auditor; r[3] = o.approved; r[4] = o.dalrrd; r[5] = o.cipc; r[6] = o.notes; },
  }),
  memberPay: () => ({
    title: "Members' remuneration", arr: DATA.finProc.memberPay, section: "fin_member_pay",
    rowLabel: (r) => `${r[0]} — ${fmtR(r[3])} (${r[4] || "?"})`,
    blank: () => ["", "", MEMBER_PAY_TYPES[0], 0, "", "", false, ""],
    fields: (r) => [
      { key: "name", label: "Member name", type: "text", value: r[0], required: true },
      { key: "role", label: "Role", type: "text", value: r[1] },
      { key: "type", label: "Payment type", type: "select", options: MEMBER_PAY_TYPES, value: r[2] },
      { key: "amount", label: "Amount (R)", type: "number", value: r[3], min: 0 },
      { key: "period", label: "Period (e.g. 2026 Q2)", type: "text", value: r[4] },
      { key: "resolution", label: "Resolution ref. (see Governance → Resolutions)", type: "text", value: r[5] },
      { key: "disclosed", label: "Disclosed at AGM", type: "select", options: ["No", "Yes"], value: r[6] ? "Yes" : "No" },
      { key: "notes", label: "Notes", type: "textarea", value: r[7] },
    ],
    write: (r, o) => {
      r[0] = o.name; r[1] = o.role; r[2] = o.type; r[3] = parseFloat(o.amount) || 0;
      r[4] = o.period; r[5] = o.resolution; r[6] = o.disclosed === "Yes"; r[7] = o.notes;
    },
  }),
  bankRecon: () => ({
    title: "Bank reconciliations", arr: DATA.finProc.bankRecon, section: "fin_bank_recon",
    rowLabel: (r) => `${r[0]} — ${r[5]}`,
    blank: () => ["", 0, 0, "", "", "Draft", ""],
    fields: (r) => [
      { key: "period", label: "Period (e.g. March 2026)", type: "text", value: r[0], required: true },
      { key: "bank", label: "Bank statement balance (R)", type: "number", value: r[1] },
      { key: "book", label: "Book (ledger) balance (R)", type: "number", value: r[2] },
      { key: "prepared", label: "Prepared by", type: "text", value: r[3] },
      { key: "reviewed", label: "Reviewed by", type: "text", value: r[4] },
      { key: "status", label: "Status", type: "select", options: BANKRECON_STATUSES, value: r[5] },
      { key: "notes", label: "Reconciling items / notes", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.period; r[1] = parseFloat(o.bank) || 0; r[2] = parseFloat(o.book) || 0; r[3] = o.prepared; r[4] = o.reviewed; r[5] = o.status; r[6] = o.notes; },
  }),
  close: () => ({
    title: "Month-end close", arr: DATA.finProc.close, section: "fin_close",
    rowLabel: (r) => `${r[0]} — ${closeCompletionPct(r)}% complete`,
    blank: () => ["", false, false, false, false, "", "", ""],
    fields: (r) => [
      { key: "period", label: "Period (e.g. March 2026)", type: "text", value: r[0], required: true },
      { key: "journals", label: "Journals posted", type: "select", options: ["No", "Yes"], value: r[1] ? "Yes" : "No" },
      { key: "accruals", label: "Accruals done", type: "select", options: ["No", "Yes"], value: r[2] ? "Yes" : "No" },
      { key: "bankRec", label: "Bank reconciliation done", type: "select", options: ["No", "Yes"], value: r[3] ? "Yes" : "No" },
      { key: "reports", label: "Reports issued", type: "select", options: ["No", "Yes"], value: r[4] ? "Yes" : "No" },
      { key: "signedBy", label: "Signed off by", type: "text", value: r[5] },
      { key: "signedDate", label: "Sign-off date", type: "date", value: r[6] },
      { key: "notes", label: "Notes", type: "textarea", value: r[7] },
    ],
    write: (r, o) => {
      r[0] = o.period; r[1] = o.journals === "Yes"; r[2] = o.accruals === "Yes"; r[3] = o.bankRec === "Yes"; r[4] = o.reports === "Yes";
      r[5] = o.signedBy; r[6] = o.signedDate; r[7] = o.notes;
    },
  }),
  suppliers: () => ({
    title: "Suppliers", arr: DATA.finProc.suppliers, section: "proc_suppliers",
    rowLabel: (r) => `${r[0]} — ${r[6]}`,
    blank: () => ["", "", "", "", "None", "", "Active"],
    fields: (r) => [
      { key: "name", label: "Supplier name", type: "text", value: r[0], required: true },
      { key: "cat", label: "Category", type: "text", value: r[1] },
      { key: "contact", label: "Contact", type: "text", value: r[2] },
      { key: "reg", label: "Company reg. no.", type: "text", value: r[3] },
      { key: "tax", label: "Tax clearance", type: "select", options: TAX_STATES, value: r[4] },
      { key: "bee", label: "B-BBEE level", type: "text", value: r[5] },
      { key: "status", label: "Status", type: "select", options: SUPP_STATUSES, value: r[6] },
    ],
    write: (r, o) => { r[0] = o.name; r[1] = o.cat; r[2] = o.contact; r[3] = o.reg; r[4] = o.tax; r[5] = o.bee; r[6] = o.status; },
  }),
  requisitions: () => ({
    title: "Purchase requisitions", arr: DATA.finProc.requisitions, section: "proc_requisitions",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${r[2]} · ${r[7]}`,
    blank: () => ["", new Date().toISOString().slice(0, 10), "", "", 0, "", "", "Submitted"],
    fields: (r) => [
      { key: "ref", label: "Reference", type: "text", value: r[0] },
      { key: "date", label: "Date", type: "date", value: r[1] },
      { key: "desc", label: "Description", type: "text", value: r[2], required: true },
      { key: "cat", label: "Budget category", type: "select", options: ["", ...DATA.finance.categories.map((c) => c[0])], value: r[3] },
      { key: "amount", label: "Amount (R)", type: "number", value: r[4], min: 0 },
      { key: "by", label: "Requested by", type: "text", value: r[5] },
      { key: "appr", label: "Approved by", type: "text", value: r[6] },
      { key: "status", label: "Status", type: "select", options: REQ_STATUSES, value: r[7] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.date; r[2] = o.desc; r[3] = o.cat; r[4] = parseFloat(o.amount) || 0; r[5] = o.by; r[6] = o.appr; r[7] = o.status; },
  }),
  pos: () => ({
    title: "Purchase orders", arr: DATA.finProc.pos, section: "proc_purchase_orders",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${r[2] || "?"} · ${fmtR(r[4])}`,
    blank: () => ["", new Date().toISOString().slice(0, 10), "", "", 0, "", "Open"],
    fields: (r) => [
      { key: "ref", label: "PO reference", type: "text", value: r[0] },
      { key: "date", label: "Date", type: "date", value: r[1] },
      { key: "supplier", label: "Supplier", type: "select", options: ["", ...DATA.finProc.suppliers.map((s) => s[0])], value: r[2] },
      { key: "desc", label: "Description", type: "text", value: r[3], required: true },
      { key: "amount", label: "Amount (R)", type: "number", value: r[4], min: 0 },
      { key: "req", label: "Requisition ref.", type: "select", options: ["", ...DATA.finProc.requisitions.map((q) => q[0]).filter(Boolean)], value: r[5] },
      { key: "status", label: "Status", type: "select", options: PO_STATUSES, value: r[6] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.date; r[2] = o.supplier; r[3] = o.desc; r[4] = parseFloat(o.amount) || 0; r[5] = o.req; r[6] = o.status; },
  }),
  payments: () => ({
    title: "Payments", arr: DATA.finProc.payments, section: "fin_payments",
    rowLabel: (r) => `${r[0] || "?"} — ${r[1]} · ${fmtR(r[3])}`,
    blank: () => [new Date().toISOString().slice(0, 10), "", "", 0, "EFT", "", "", "Pending"],
    fields: (r) => [
      { key: "date", label: "Date", type: "date", value: r[0] },
      { key: "payee", label: "Payee", type: "text", value: r[1], required: true },
      { key: "desc", label: "Description", type: "text", value: r[2] },
      { key: "amount", label: "Amount (R)", type: "number", value: r[3], min: 0 },
      { key: "method", label: "Method", type: "select", options: ["EFT", "Cash", "Card", "Cheque", "Debit order"], value: r[4] || "EFT" },
      { key: "po", label: "PO reference", type: "select", options: ["", ...DATA.finProc.pos.map((x) => x[0]).filter(Boolean)], value: r[5] },
      { key: "bankref", label: "Bank reference", type: "text", value: r[6] },
      { key: "status", label: "Status", type: "select", options: PAY_STATUSES, value: r[7] },
    ],
    write: (r, o) => { r[0] = o.date; r[1] = o.payee; r[2] = o.desc; r[3] = parseFloat(o.amount) || 0; r[4] = o.method; r[5] = o.po; r[6] = o.bankref; r[7] = o.status; },
  }),
};

/* listEditor configs — Land & Assets (infra + maintenance) and Productivity */
const ASSET_EDITORS = {
  infrastructure: () => ({
    title: "Infrastructure", arr: DATA.assets.infrastructure, section: "infrastructure",
    rowLabel: (r) => `${r[0]} — ${r[5]}`,
    blank: () => ["", "Water", "", new Date().getFullYear(), 0, "Fair", "In use", ""],
    fields: (r) => [
      { key: "name", label: "Asset name", type: "text", value: r[0], required: true },
      { key: "itype", label: "Type", type: "select", options: INFRA_TYPES, value: r[1] },
      { key: "loc", label: "Location", type: "text", value: r[2] },
      { key: "year", label: "Year installed", type: "number", value: r[3] },
      { key: "value", label: "Replacement value (R)", type: "number", value: r[4], min: 0 },
      { key: "cond", label: "Condition", type: "select", options: CONDITIONS, value: r[5] },
      { key: "status", label: "Status", type: "text", value: r[6] },
      { key: "notes", label: "Notes", type: "textarea", value: r[7] },
    ],
    write: (r, o) => { r[0] = o.name; r[1] = o.itype; r[2] = o.loc; r[3] = parseFloat(o.year) || 0; r[4] = parseFloat(o.value) || 0; r[5] = o.cond; r[6] = o.status; r[7] = o.notes; },
  }),
  maintenance: () => ({
    title: "Maintenance tasks", arr: DATA.assets.maintenance, section: "asset_maintenance",
    rowLabel: (r) => `${r[0]} — ${r[2]} (${r[7]})`,
    blank: () => ["", "Infrastructure", "", new Date().toISOString().slice(0, 10), "", 0, "", "Scheduled", ""],
    fields: (r) => [
      { key: "asset", label: "Asset", type: "text", value: r[0], required: true },
      { key: "kind", label: "Kind", type: "select", options: ["Infrastructure", "Movable", "Land"], value: r[1] },
      { key: "task", label: "Task", type: "text", value: r[2], required: true },
      { key: "sched", label: "Scheduled date", type: "date", value: r[3] },
      { key: "done", label: "Completed date", type: "date", value: r[4] },
      { key: "cost", label: "Cost (R)", type: "number", value: r[5], min: 0 },
      { key: "resp", label: "Responsible", type: "text", value: r[6] },
      { key: "status", label: "Status", type: "select", options: MAINT_STATUSES, value: r[7] },
      { key: "notes", label: "Notes", type: "textarea", value: r[8] },
    ],
    write: (r, o) => { r[0] = o.asset; r[1] = o.kind; r[2] = o.task; r[3] = o.sched; r[4] = o.done; r[5] = parseFloat(o.cost) || 0; r[6] = o.resp; r[7] = o.status; r[8] = o.notes; },
  }),
};
const PROD_EDITORS = {
  enterprises: (etype) => ({
    title: "Production enterprises", arr: DATA.productivity.enterprises, section: "prod_enterprises",
    rowLabel: (r) => `${r[1]} (${r[0]}) — ${r[6]}`,
    blank: () => [etype || "Crop", "", "", 0, "", "", "Active", ""],
    fields: (r) => [
      { key: "etype", label: "Type", type: "select", options: ["Crop", "Orchard", "Timber", "Livestock", "Other"], value: r[0] || "Crop" },
      { key: "name", label: "Enterprise name", type: "text", value: r[1], required: true },
      { key: "portion", label: "Portion / location", type: "text", value: r[2] },
      { key: "area", label: "Area (ha)", type: "number", value: r[3], min: 0 },
      { key: "units", label: "Scale (e.g. “420 head”, “4 400 trees”)", type: "text", value: r[4] },
      { key: "manager", label: "Manager / operator", type: "text", value: r[5] },
      { key: "status", label: "Status", type: "select", options: ENTERPRISE_STATUSES, value: r[6] },
      { key: "notes", label: "Notes", type: "textarea", value: r[7] },
    ],
    write: (r, o) => { r[0] = o.etype; r[1] = o.name; r[2] = o.portion; r[3] = parseFloat(o.area) || 0; r[4] = o.units; r[5] = o.manager; r[6] = o.status; r[7] = o.notes; },
  }),
  water: () => ({
    title: "Water sources", arr: DATA.productivity.water, section: "prod_water",
    rowLabel: (r) => `${r[0]} (${r[1]})`,
    blank: () => ["", "Borehole", 0, 0, "", "Active", ""],
    fields: (r) => [
      { key: "name", label: "Source name", type: "text", value: r[0], required: true },
      { key: "source", label: "Type", type: "select", options: WATER_SOURCES, value: r[1] },
      { key: "alloc", label: "Licensed allocation (m³/yr)", type: "number", value: r[2], min: 0 },
      { key: "usage", label: "Recorded use (m³)", type: "number", value: r[3], min: 0 },
      { key: "lic", label: "Licence reference", type: "text", value: r[4] },
      { key: "status", label: "Status", type: "select", options: ["Active", "Dormant", "Decommissioned"], value: r[5] },
      { key: "notes", label: "Notes", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.name; r[1] = o.source; r[2] = parseFloat(o.alloc) || 0; r[3] = parseFloat(o.usage) || 0; r[4] = o.lic; r[5] = o.status; r[6] = o.notes; },
  }),
  records: (rtype) => ({
    title: (rtype || "Production") + " records", arr: DATA.productivity.records, section: "prod_records",
    rowLabel: (r) => `${r[0]} · ${r[1] || "—"} — ${r[3]}`,
    blank: () => [rtype || "Inputs", "", "", "", 0, "", 0],
    fields: (r) => [
      { key: "rtype", label: "Record type", type: "select", options: ["Labour", "Inputs", "Harvest", "Sales"], value: r[0] || "Inputs" },
      { key: "ent", label: "Enterprise", type: "select", options: ["", ...DATA.productivity.enterprises.map((e) => e[1])], value: r[1] },
      { key: "period", label: "Period (e.g. “2026 Q1”)", type: "text", value: r[2] },
      { key: "desc", label: "Description", type: "text", value: r[3], required: true },
      { key: "qty", label: "Quantity", type: "number", value: r[4], min: 0 },
      { key: "unit", label: "Unit (kg, tonne, head…)", type: "text", value: r[5] },
      { key: "amount", label: "Amount / value (R)", type: "number", value: r[6], min: 0 },
    ],
    write: (r, o) => { r[0] = o.rtype; r[1] = o.ent; r[2] = o.period; r[3] = o.desc; r[4] = parseFloat(o.qty) || 0; r[5] = o.unit; r[6] = parseFloat(o.amount) || 0; },
  }),
};

/* listEditor configs — Commercialisation registers */
const COM_EDITORS = {
  markets: () => ({
    title: "Markets", arr: DATA.commercial.markets, section: "markets",
    rowLabel: (r) => `${r[0]} → ${r[1] || "?"} (${r[6]})`,
    blank: () => ["", "", "Contract", "", "", "None", "Exploring", ""],
    fields: (r) => [
      { key: "commodity", label: "Commodity", type: "text", value: r[0], required: true },
      { key: "buyer", label: "Buyer", type: "text", value: r[1] },
      { key: "channel", label: "Channel", type: "select", options: ["Contract", "Spot", "Auction", "Local", "Export"], value: r[2] || "Contract" },
      { key: "volume", label: "Volume", type: "text", value: r[3] },
      { key: "price", label: "Price basis", type: "text", value: r[4] },
      { key: "agreement", label: "Agreement", type: "select", options: AGREEMENT_STATES, value: r[5] },
      { key: "status", label: "Status", type: "select", options: MARKET_STATUSES, value: r[6] },
      { key: "notes", label: "Notes", type: "textarea", value: r[7] },
    ],
    write: (r, o) => { r[0] = o.commodity; r[1] = o.buyer; r[2] = o.channel; r[3] = o.volume; r[4] = o.price; r[5] = o.agreement; r[6] = o.status; r[7] = o.notes; },
  }),
  partnerships: () => ({
    title: "Partnerships", arr: DATA.commercial.partnerships, section: "partnerships",
    rowLabel: (r) => `${r[0]} (${r[1]}) — ${r[5]}`,
    blank: () => ["", "Technical", "", "", "", "Active", ""],
    fields: (r) => [
      { key: "partner", label: "Partner", type: "text", value: r[0], required: true },
      { key: "ptype", label: "Type", type: "select", options: PARTNER_TYPES, value: r[1] },
      { key: "purpose", label: "Purpose", type: "textarea", value: r[2] },
      { key: "start", label: "Start date", type: "date", value: r[3] },
      { key: "end", label: "End date", type: "date", value: r[4] },
      { key: "status", label: "Status", type: "select", options: PARTNER_STATUSES, value: r[5] },
      { key: "notes", label: "Notes", type: "textarea", value: r[6] },
    ],
    write: (r, o) => { r[0] = o.partner; r[1] = o.ptype; r[2] = o.purpose; r[3] = o.start; r[4] = o.end; r[5] = o.status; r[6] = o.notes; },
  }),
  revenue: () => ({
    title: "Revenue streams", arr: DATA.commercial.revenue, section: "revenue_streams",
    rowLabel: (r) => `${r[0]} — ${fmtR(r[2])}/yr`,
    blank: () => ["", "Enterprise sales", 0, true, "Active", ""],
    fields: (r) => [
      { key: "stream", label: "Stream", type: "text", value: r[0], required: true },
      { key: "source", label: "Source", type: "select", options: REVENUE_SOURCES, value: r[1] },
      { key: "amount", label: "Annual amount (R)", type: "number", value: r[2], min: 0 },
      { key: "recurring", label: "Recurring", type: "select", options: ["Yes", "No"], value: r[3] ? "Yes" : "No" },
      { key: "status", label: "Status", type: "select", options: ["Projected", "Active", "Ended"], value: r[4] },
      { key: "notes", label: "Notes", type: "textarea", value: r[5] },
    ],
    write: (r, o) => { r[0] = o.stream; r[1] = o.source; r[2] = parseFloat(o.amount) || 0; r[3] = o.recurring === "Yes"; r[4] = o.status; r[5] = o.notes; },
  }),
};

/* listEditor configs — Administration + HR */
const ADMIN_EDITORS = {
  correspondence: () => ({
    title: "Correspondence", arr: DATA.admin.correspondence, section: "admin_correspondence",
    rowLabel: (r) => `${r[0] || "(no ref)"} — ${(r[4] || "").slice(0, 44)}`,
    blank: () => ["", "Incoming", new Date().toISOString().slice(0, 10), "", "", "Email", "", "", "Open"],
    fields: (r) => [
      { key: "ref", label: "Reference", type: "text", value: r[0] },
      { key: "dir", label: "Direction", type: "select", options: ["Incoming", "Outgoing"], value: r[1] },
      { key: "date", label: "Date", type: "date", value: r[2] },
      { key: "party", label: "Party", type: "text", value: r[3] },
      { key: "subject", label: "Subject", type: "text", value: r[4], required: true },
      { key: "channel", label: "Channel", type: "select", options: ["Email", "Letter", "Hand delivery", "Fax", "Other"], value: r[5] || "Email" },
      { key: "due", label: "Response due", type: "date", value: r[6] },
      { key: "owner", label: "Owner", type: "text", value: r[7] },
      { key: "status", label: "Status", type: "select", options: CORR_STATUSES, value: r[8] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.dir; r[2] = o.date; r[3] = o.party; r[4] = o.subject; r[5] = o.channel; r[6] = o.due; r[7] = o.owner; r[8] = o.status; },
  }),
  doa: () => ({
    title: "Delegation of authority", arr: DATA.admin.doa, section: "admin_doa",
    rowLabel: (r) => `${r[0]} (${r[2] || "any"}) → ${r[3] || "?"}`,
    blank: () => ["", "Finance", "", "", "", ""],
    fields: (r) => [
      { key: "fn", label: "Function / decision", type: "text", value: r[0], required: true },
      { key: "cat", label: "Category", type: "select", options: ["Finance", "Land", "HR", "Beneficiary", "Governance", "Projects", "Other"], value: r[1] || "Finance" },
      { key: "thr", label: "Threshold (e.g. “up to R25 000”)", type: "text", value: r[2] },
      { key: "app", label: "Approver", type: "text", value: r[3] },
      { key: "sec", label: "Secondary approver", type: "text", value: r[4] },
      { key: "ref", label: "Policy / resolution reference", type: "text", value: r[5] },
    ],
    write: (r, o) => { r[0] = o.fn; r[1] = o.cat; r[2] = o.thr; r[3] = o.app; r[4] = o.sec; r[5] = o.ref; },
  }),
  policies: () => ({
    title: "Policies & SOPs", arr: DATA.admin.policies, section: "admin_policies",
    rowLabel: (r) => `${r[0]} — ${r[6]}`,
    blank: () => ["", "Governance", "v1.0", "", "", "", "Draft"],
    fields: (r) => [
      { key: "title", label: "Policy / SOP title", type: "text", value: r[0], required: true },
      { key: "cat", label: "Category", type: "text", value: r[1] },
      { key: "ver", label: "Version", type: "text", value: r[2] },
      { key: "adopted", label: "Adopted on", type: "date", value: r[3] },
      { key: "review", label: "Review due", type: "date", value: r[4] },
      { key: "owner", label: "Owner", type: "text", value: r[5] },
      { key: "status", label: "Status", type: "select", options: POLICY_STATUSES, value: r[6] },
    ],
    write: (r, o) => { r[0] = o.title; r[1] = o.cat; r[2] = o.ver; r[3] = o.adopted; r[4] = o.review; r[5] = o.owner; r[6] = o.status; },
  }),
  records: () => ({
    title: "Records index", arr: DATA.admin.records, section: "admin_records",
    rowLabel: (r) => `${r[0]} — ${r[6]}`,
    blank: () => ["", "", "Digital", "", "", "", "Current"],
    fields: (r) => [
      { key: "series", label: "Record series", type: "text", value: r[0], required: true },
      { key: "desc", label: "What it contains", type: "textarea", value: r[1] },
      { key: "medium", label: "Medium", type: "select", options: MEDIA, value: r[2] },
      { key: "loc", label: "Location", type: "text", value: r[3] },
      { key: "cust", label: "Custodian", type: "text", value: r[4] },
      { key: "ret", label: "Retention period", type: "text", value: r[5] },
      { key: "status", label: "Status", type: "select", options: RECORD_STATUSES, value: r[6] },
    ],
    write: (r, o) => { r[0] = o.series; r[1] = o.desc; r[2] = o.medium; r[3] = o.loc; r[4] = o.cust; r[5] = o.ret; r[6] = o.status; },
  }),
};
const HR_EDITORS = {
  staff: () => ({
    title: "Staff register", arr: DATA.hr.staff, section: "hr_staff",
    rowLabel: (r) => `${r[1]} — ${r[2] || "?"} (${r[7]})`,
    blank: () => ["", "", "", "Permanent", "", "", "", "Active"],
    fields: (r) => [
      { key: "ref", label: "Employee ref.", type: "text", value: r[0] },
      { key: "name", label: "Full name", type: "text", value: r[1], required: true },
      { key: "pos", label: "Position", type: "text", value: r[2] },
      { key: "type", label: "Employment type", type: "select", options: EMP_TYPES, value: r[3] },
      { key: "start", label: "Start date", type: "date", value: r[4] },
      { key: "reports", label: "Reports to", type: "text", value: r[5] },
      { key: "band", label: "Salary band", type: "text", value: r[6] },
      { key: "status", label: "Status", type: "select", options: STAFF_STATUSES, value: r[7] },
    ],
    write: (r, o) => { r[0] = o.ref; r[1] = o.name; r[2] = o.pos; r[3] = o.type; r[4] = o.start; r[5] = o.reports; r[6] = o.band; r[7] = o.status; },
  }),
  positions: () => ({
    title: "Positions", arr: DATA.hr.positions, section: "hr_positions",
    rowLabel: (r) => `${r[0]} — ${r[5]}`,
    blank: () => ["", "", "", "", 1, "Vacant"],
    fields: (r) => [
      { key: "title", label: "Position title", type: "text", value: r[0], required: true },
      { key: "dept", label: "Department", type: "text", value: r[1] },
      { key: "reports", label: "Reports to", type: "text", value: r[2] },
      { key: "inc", label: "Incumbent", type: "text", value: r[3] },
      { key: "hc", label: "Budgeted heads", type: "number", value: r[4], min: 0 },
      { key: "status", label: "Status", type: "select", options: POS_STATUSES, value: r[5] },
    ],
    write: (r, o) => { r[0] = o.title; r[1] = o.dept; r[2] = o.reports; r[3] = o.inc; r[4] = parseFloat(o.hc) || 0; r[5] = o.status; },
  }),
  payroll: () => ({
    title: "Payroll summaries", arr: DATA.hr.payroll, section: "hr_payroll",
    rowLabel: (r) => `${r[0]} — ${fmtR(r[4])} (${r[7]})`,
    blank: () => [new Date().toISOString().slice(0, 7), 0, 0, 0, 0, "", "", "Draft"],
    fields: (r) => [
      { key: "period", label: "Period (YYYY-MM)", type: "text", value: r[0], required: true },
      { key: "hc", label: "Headcount", type: "number", value: r[1], min: 0 },
      { key: "gross", label: "Gross (R)", type: "number", value: r[2], min: 0 },
      { key: "ded", label: "Deductions (R)", type: "number", value: r[3], min: 0 },
      { key: "net", label: "Net paid (R)", type: "number", value: r[4], min: 0 },
      { key: "paye", label: "PAYE reference", type: "text", value: r[5] },
      { key: "uif", label: "UIF reference", type: "text", value: r[6] },
      { key: "status", label: "Status", type: "select", options: PAYROLL_STATUSES, value: r[7] },
    ],
    write: (r, o) => { r[0] = o.period; r[1] = parseFloat(o.hc) || 0; r[2] = parseFloat(o.gross) || 0; r[3] = parseFloat(o.ded) || 0; r[4] = parseFloat(o.net) || 0; r[5] = o.paye; r[6] = o.uif; r[7] = o.status; },
  }),
};

const BUTTONS = {
  "edit-identity-btn": editIdentity, "edit-journey-btn": checkStageReadiness,
  "edit-committee-btn": editCommittee, "add-action-btn": () => editAction(null), "edit-masterfile-btn": editMasterFile,
  "edit-beneficiary-btn": editBeneficiary, "edit-land-btn": editLand, "edit-movable-btn": editMovable,
  "edit-leases-btn": editLeases, "edit-allocations-btn": editAllocations,
  "import-leases-btn": () => importModal(IMPORT.leases),
  "import-allocations-btn": () => importModal(IMPORT.allocations),
  "edit-permits-btn": editPermits, "edit-finance-btn": editFinanceFigures, "edit-categories-btn": editCategories,
  "add-project-btn": () => editProject(null), "edit-jobs-btn": editJobsByYear, "edit-impact-btn": editImpactFigures,
  "score-doc-btn": () => attachmentsModal("score", null, "Institutional Score — assessment document"),
  "score-rescan-btn": () => {
    const changed = syncAutoScore();
    if (changed && CAN_EDIT) { commit("score"); toast("Score updated from the latest data."); }
    else { renderScore(); toast(changed ? "Score updated locally (viewer — not saved)." : "Score already reflects the latest data."); }
  },
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
  a11yFixup();
}
/* keep dynamically-rendered content screen-reader friendly */
function a11yFixup() {
  if (!container) return;
  container.querySelectorAll("svg:not([aria-label]):not([aria-hidden])").forEach((s) => {
    s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false");
  });
  container.querySelectorAll("thead th:not([scope])").forEach((th) => th.setAttribute("scope", "col"));
  container.querySelectorAll(".table-wrap.scroll:not([tabindex])").forEach((w) => {
    w.setAttribute("tabindex", "0"); w.setAttribute("role", "region");
    w.setAttribute("aria-label", "Scrollable table");
  });
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
  // The Institutional Score is a live reflection of the other registers —
  // any commit here may have moved an auto-scored criterion, so re-scan and
  // persist the score alongside whatever the caller just saved.
  if (section !== "score") {
    try { if (syncAutoScore()) await repo.saveSection(orgId, "score", DATA); } catch (e) {}
  }
  maybeFlagStageReadiness().catch(() => {});
  suppressRemoteUntil = Date.now() + 1500;
  renderCurrent();
  if (onChange) onChange();
}

export function setOnChange(fn) { onChange = fn; }

export async function initDashboard({ orgId: oid, role, preload, noRealtime }) {
  orgId = oid;
  CAN_EDIT = role !== "viewer";
  DATA = preload || (await repo.loadOrg(orgId));
  try { if (syncAutoScore() && CAN_EDIT) await repo.saveSection(orgId, "score", DATA); } catch (e) {}
  if (CAN_EDIT) maybeFlagStageReadiness().catch(() => {});
  if (channel) repo.unsubscribe(channel);
  if (noRealtime) { channel = null; return; }
  channel = repo.subscribe(orgId, async () => {
    if (Date.now() < suppressRemoteUntil) return;               // our own write echoing back
    if (document.querySelector(".modal-scrim")) { pendingRemote = true; return; }
    try {
      DATA = await repo.loadOrg(orgId);
      try { if (syncAutoScore() && CAN_EDIT) await repo.saveSection(orgId, "score", DATA); } catch (e) {}
      if (CAN_EDIT) maybeFlagStageReadiness().catch(() => {});
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
  // one persistent "this is demo data" note above every view (brief: never
  // present example data as a real client assessment)
  if (isDemoOrg()) {
    const b = document.createElement("div");
    b.className = "illus-banner";
    b.setAttribute("role", "note");
    b.textContent = "Illustrative CPA360 assessment — this workspace is the Kwezi Valley demo dataset, not a real CPA.";
    el.insertBefore(b, el.firstChild);
  }
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
  el.addEventListener("click", (e) => {
    const g = e.target.closest && e.target.closest("[data-goto]");
    if (g && el.contains(g)) location.hash = g.dataset.goto;
  });
  el.querySelectorAll("svg:not([aria-label])").forEach((s) => { s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false"); });
  el.querySelectorAll("thead th:not([scope])").forEach((th) => th.setAttribute("scope", "col"));
  rendered.clear();
  showView(currentView);
}

export function showView(name, tab) {
  if (!RENDERERS[name]) name = "exec";
  currentView = name;
  if (tab) { SUBTAB[name] = tab; rendered.delete(name); }
  container.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + name));
  if (!rendered.has(name)) { renderCurrent(); rendered.add(name); }
  else applyRoleGate();
  window.scrollTo({ top: 0 });
}

/* consolidated "needs attention" list — shared by the shell + exec dashboard */
function computeAlerts() {
  if (!DATA) return [];
  const now = new Date(), a = [];
  const overdue = DATA.actions.filter((x) => x[5] === "Overdue");
  if (overdue.length) a.push({ tone: "critical", text: `${overdue.length} action${overdue.length > 1 ? "s" : ""} overdue`, goto: "#/v/actions" });
  const soon = DATA.actions.filter((x) => {
    if (x[5] === "Completed" || !x[4]) return false;
    const d = (new Date(x[4]) - now) / 86400000; return d >= 0 && d <= 14;
  });
  if (soon.length) a.push({ tone: "warning", text: `${soon.length} action${soon.length > 1 ? "s" : ""} due within 14 days`, goto: "#/v/actions" });
  const gcOver = (DATA.governance?.calendar || []).filter((r) => r[2] && new Date(r[2]) < now && r[5] !== "Done").length;
  if (gcOver) a.push({ tone: "critical", text: `${gcOver} governance-calendar item${gcOver > 1 ? "s" : ""} past due`, goto: "#/v/profile" });
  const lease = (DATA.assets.leases || []).filter((r) => ["Expiring Soon", "Expired"].includes(r[7])).length;
  if (lease) a.push({ tone: "warning", text: `${lease} land lease${lease > 1 ? "s" : ""} expiring or expired`, goto: "#/v/assets" });
  const unrec = (DATA.finProc?.transactions || []).filter((r) => !r[7]).length;
  if (unrec) a.push({ tone: "info", text: `${unrec} transaction${unrec > 1 ? "s" : ""} not reconciled`, goto: "#/v/finance" });
  const disp = (DATA.beneficiaryCentre?.disputes || []).filter((r) => r[5] !== "Resolved").length;
  if (disp) a.push({ tone: "warning", text: `${disp} beneficiary dispute${disp > 1 ? "s" : ""} open`, goto: "#/v/beneficiary" });
  const pend = (DATA.beneficiaryCentre?.register || []).filter((r) => r[9] === "Pending").length;
  if (pend) a.push({ tone: "info", text: `${pend} beneficiar${pend > 1 ? "ies" : "y"} pending verification`, goto: "#/v/beneficiary" });
  const noReqPO = (DATA.finProc?.pos || []).filter((r) => !r[5] && r[6] !== "Cancelled").length;
  if (noReqPO) a.push({ tone: "critical", text: `${noReqPO} purchase order${noReqPO > 1 ? "s" : ""} with no requisition`, goto: "#/v/finance/pos" });
  const maintOver = (DATA.assets.maintenance || []).filter((r) => r[7] !== "Completed" && r[3] && new Date(r[3]) < now).length;
  if (maintOver) a.push({ tone: "warning", text: `${maintOver} maintenance task${maintOver > 1 ? "s" : ""} overdue`, goto: "#/v/assets/maintenance" });
  const curGate = DATA.gates.find((g) => g.state === "current");
  if (curGate && curGate.updated_at) {
    const stalledDays = Math.floor((now - new Date(curGate.updated_at)) / 86400000);
    if (stalledDays >= 90)
      a.push({ tone: "warning", text: `No progress on Stage ${curGate.n} (${curGate.name}) in ${stalledDays} days`, goto: "#/v/journey" });
  }
  return a;
}

function isDemoOrg() {
  return DATA && (DATA.cpa.reg === "CPA 2005/0000142/00" || /kwezi valley/i.test(DATA.cpa.name || ""));
}
function nextStep() {
  const now = new Date();
  const overdue = DATA.actions.filter((x) => x[5] === "Overdue");
  if (overdue.length)
    return { line: `Clear ${overdue.length} overdue action${overdue.length > 1 ? "s" : ""} — start with "${(overdue[0][2] || "").slice(0, 60)}".`, label: "Open Action Tracker", goto: "#/v/actions" };
  const lowest = [...DATA.score.domains].sort((x, y) => domainScore(x) / (x.weight || 1) - domainScore(y) / (y.weight || 1))[0];
  if (lowest && domainScore(lowest) / (lowest.weight || 1) < 0.45)
    return { line: `${lowest.name} is your weakest domain at ${domainScore(lowest)}/${lowest.weight}. Focus improvement here.`, label: "View performance", goto: "#/v/score" };
  const cur = DATA.gates.find((g) => g.state === "current") || { n: 7 };
  if (cur.n < 7) {
    const nxt = JOURNEY.find((s) => s.n === cur.n + 1);
    return { line: `Systems are holding. Work toward Stage ${cur.n + 1}: ${nxt ? nxt.key : ""} — ${nxt ? nxt.blurb : ""}`, label: "Open the Journey", goto: "#/v/journey" };
  }
  return { line: `You're at the final stage. Sustain investment readiness and keep the score above 85.`, label: "View performance", goto: "#/v/score" };
}

/* headline snapshot for the shell (journey strip, notifications, topbar) */
export function dashSummary() {
  if (!DATA) return null;
  const total = scoreTotal();
  const band = maturityBand(total);
  const cur = DATA.gates.find((g) => g.state === "current") || DATA.gates[0] || { n: 1, name: "Assess" };
  return {
    score: total, band: band.name, stageN: cur.n, stageName: cur.name,
    journey: DATA.gates.map((g) => ({ n: g.n, name: g.name, state: g.state })),
    alerts: computeAlerts().slice(0, 6),
    cpaName: DATA.cpa.name,
  };
}

export function printPack() {
  Object.keys(RENDERERS).forEach((k) => { if (!rendered.has(k)) { try { RENDERERS[k](); rendered.add(k); } catch (e) {} } });
  applyRoleGate();
  const d = new Date().toLocaleDateString("en-ZA", { year: "numeric", month: "long", day: "numeric" });
  const ph = container.querySelector("#print-header");
  // Brand Box: the CPA's own logo/colors on the printed board pack, when set — see #/brand.
  const primary = DATA.cpa.brandPrimary || "#132a4f";
  const logo = DATA.cpa.logoDataUrl ? `<img src="${DATA.cpa.logoDataUrl}" alt="" style="max-height:38px;max-width:140px;">` : "";
  if (ph) ph.innerHTML =
    `<div style="display:flex;align-items:center;gap:10px;">
       ${logo}
       <div>
         <div style="font-family:var(--font-display);font-weight:800;font-size:17px;color:${esc(primary)};">${esc(DATA.cpa.name)}</div>
         <div style="font-size:12px;color:#444;margin-top:2px;">${esc(DATA.cpa.reg)} · Generated ${d}
           ${DATA.cpa.brandFooter ? " · " + esc(DATA.cpa.brandFooter) : ""} · CPA360&trade; Command Center</div>
       </div>
     </div>`;
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
    <div class="ex-next" id="exec-next"></div>
    <div class="exec-top" id="exec-top"></div>

    <div class="card exec-priority">
      <div class="card-head"><div><h3>Priority actions</h3>
        <span class="hint">The open items that need the Committee's attention, most urgent first.</span></div>
        <button class="btn view-ok" data-goto="#/v/actions" type="button">Open Action Tracker</button></div>
      <div class="table-wrap"><table>
        <thead><tr><th>Action</th><th>Owner</th><th>Due</th><th>Priority</th><th>Status</th></tr></thead>
        <tbody id="exec-actions"></tbody>
      </table></div>
    </div>

    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card"><div class="card-head"><h3>Performance by domain</h3>
        <button class="btn view-ok" data-goto="#/v/score" type="button">View performance</button></div>
        <div id="exec-domains"></div></div>
      <div class="card"><div class="card-head"><h3>What needs attention</h3></div>
        <ul class="exec-list" id="exec-attention"></ul></div>
    </div>

    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card"><div class="card-head"><h3>Upcoming deadlines</h3></div>
        <ul class="exec-list" id="exec-deadlines"></ul></div>
      <div class="card"><div class="card-head"><h3>Financial alerts</h3>
        <button class="btn view-ok" data-goto="#/v/finance" type="button">Open finance</button></div>
        <ul class="exec-list" id="exec-finance"></ul></div>
    </div>

    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card"><div class="card-head"><h3>Project status</h3>
        <button class="btn view-ok" data-goto="#/v/projects" type="button">Open projects</button></div>
        <ul class="exec-list" id="exec-projects"></ul></div>
      <div class="card"><div class="card-head"><h3>Recent documents</h3>
        <button class="btn view-ok" data-goto="#/v/masterfile" type="button">Master File</button></div>
        <ul class="exec-list" id="exec-docs"></ul></div>
    </div>
  </section>

  <section class="view hidden" id="view-journey">
    <div class="card" style="margin-bottom:16px;">
      <div class="card-head"><h3>Where this CPA is on the journey</h3>
        <button class="btn" id="edit-journey-btn" type="button">Check readiness</button></div>
      <p class="hint" id="journey-note" style="margin:2px 0 0;"></p>
    </div>
    <div class="journey" id="journey-list"></div>
  </section>

  <section class="view hidden" id="view-productivity">
    <div id="productivity-subtabs"></div>
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
          <span class="hint">Most criteria auto-scan your registers live — add a document, verify a household, close
            a dispute, and its criterion updates on its own. Switch a criterion to manual only if you have a good
            reason the data doesn't capture.</span></div>
        <button class="btn view-ok" id="score-rescan-btn" type="button">Rescan now</button>
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
        <button class="btn" id="import-actions-btn" type="button">Import CSV / Excel</button>
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
    <div class="card-head" style="margin:20px 0 12px;"><h3 style="font-size:13px;">The 11 Master File categories</h3>
      <span style="display:flex;gap:6px;flex-wrap:wrap;">
        <button class="btn view-ok" id="mf-general-btn" type="button">General documents</button>
        <button class="btn" id="edit-masterfile-btn" type="button">Set completeness</button>
      </span>
    </div>
    <div class="doc-grid" id="masterfile-grid"></div>
  </section>

  <section class="view hidden" id="view-gallery">
    <div id="gallery-body"></div>
  </section>

  <section class="view hidden" id="view-beneficiary">
    <div id="beneficiary-subtabs"></div>
    <div id="beneficiary-body"></div>
  </section>

  <section class="view hidden" id="view-administration">
    <div id="administration-subtabs"></div>
    <div id="administration-body"></div>
  </section>

  <section class="view hidden" id="view-hr">
    <div id="hr-subtabs"></div>
    <div id="hr-body"></div>
  </section>

  <section class="view hidden" id="view-assets">
    <div id="assets-subtabs"></div>
    <div id="assets-body"></div>
  </section>

  <section class="view hidden" id="view-finance">
    <div id="finance-subtabs"></div>
    <div id="finance-body"></div>
  </section>

  <section class="view hidden" id="view-projects">
    <div id="projects-subtabs"></div>
    <div id="projects-body"></div>
  </section>

  <section class="view hidden" id="view-impact">
    <div class="grid grid-5" id="impact-stats"></div>
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
