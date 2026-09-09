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
  "In Progress": "warning", "Pending": "warning", "Pending Verification": "warning", "Expiring Soon": "warning", "At Risk": "warning", "Under Renewal": "warning",
  "Overdue": "critical", "Disputed": "critical", "Delayed": "critical", "Vacant": "critical",
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
  { id: "profile", label: "CPA Profile", group: "Institutional", eyebrow: "Institutional", title: "CPA Profile", sub: "Institutional identity, standing and current gate status at a glance." },
  { id: "score", label: "Institutional Score", group: "Institutional", eyebrow: "Institutional", title: "Institutional Score Dashboard", sub: "CPA360™ Institutional Performance Index — a standardised 100-point maturity score (IP-03)." },
  { id: "actions", label: "Action Tracker", group: "Institutional", eyebrow: "Institutional", title: "Action Tracker", sub: "Open items from resolutions, assessments and Committee decisions, in one place." },
  { id: "masterfile", label: "Digital Master File", group: "Records", eyebrow: "Records", title: "Digital Master File", sub: "Document management mirrored from the CPA360™ Master File Index (CPA360-ADM-04)." },
  { id: "beneficiary", label: "Beneficiary Database", group: "Records", eyebrow: "Records", title: "Beneficiary Database", sub: "Verification status of the Master Beneficiary Register (IP-05 Beneficiary Toolkit)." },
  { id: "assets", label: "Land & Asset Database", group: "Records", eyebrow: "Records", title: "Land & Asset Database", sub: "Land portions, leases, movable assets and permits (IP-05 Land & Assets Toolkit)." },
  { id: "finance", label: "Financial Dashboard", group: "Performance", eyebrow: "Performance", title: "Financial Dashboard", sub: "Budget, cash position and spend by category." },
  { id: "projects", label: "Project Dashboard", group: "Performance", eyebrow: "Performance", title: "Project Dashboard", sub: "Pipeline and delivery status across the CPA360™ Projects Toolkit." },
  { id: "impact", label: "Impact Dashboard", group: "Performance", eyebrow: "Performance", title: "Impact Dashboard", sub: "Institutional M&E — the outcomes CPA360™ implementation is producing on the ground." },
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
const scoreTotal = () => DATA.score.domains.reduce((s, d) => s + (+d.achieved || 0), 0);
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
function editScore() {
  openModal("Update domain scores", DATA.score.domains.map((d, i) => ({ key: "d" + i, label: `${d.name} (of ${d.weight})`, type: "number", value: d.achieved })), (out) => {
    DATA.score.domains.forEach((d, i) => {
      let v = +out["d" + i];
      if (isNaN(v)) v = d.achieved;
      d.achieved = Math.max(0, Math.min(d.weight, v));
    });
    commit("score");
  });
}
function editGates() {
  const cur = DATA.gates.find((g) => g.state === "current") || DATA.gates[0];
  openModal("Set current gate", [
    { key: "gate", label: "Current gate", type: "select", options: DATA.gates.map((g) => `${g.n} — ${g.name}`), value: `${cur.n} — ${cur.name}` },
  ], (out) => {
    const n = parseInt(out.gate);
    DATA.gates.forEach((g) => { g.state = g.n < n ? "done" : g.n === n ? "current" : "upcoming"; });
    commit("gates");
  });
}
function editCommittee() {
  listEditor({
    title: "Management committee", arr: DATA.committee, section: "committee",
    rowLabel: (r) => `${r[1] || "—"} · ${r[0]}`,
    blank: () => ["Additional Member", "", new Date().getFullYear() + " – present"],
    fields: (r) => [
      { key: "role", label: "Role / portfolio", type: "text", value: r[0], required: true },
      { key: "name", label: "Name", type: "text", value: r[1], required: true },
      { key: "term", label: "Term", type: "text", value: r[2] },
    ],
    write: (r, o) => { r[0] = o.role; r[1] = o.name; r[2] = o.term; },
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

function renderProfile() {
  const c = DATA.cpa;
  const total = scoreTotal();
  const gCur = DATA.gates.find((g) => g.state === "current") || DATA.gates[DATA.gates.length - 1] || { n: "–", name: "—" };
  $("profile-stats").innerHTML = [
    statTile("Institutional Score", total + " / 100", maturityBand(total).name + " band", ""),
    statTile("Current Gate", `${gCur.n} of ${DATA.gates.length}`, `${gCur.name} — in progress`, "warning"),
    statTile("Verified Members", (+c.members || 0).toLocaleString(), "Master Beneficiary Register", ""),
    statTile("Land Extent", (+c.landExtent || 0).toLocaleString() + " ha", c.portions + " registered portions", ""),
  ].join("");

  const now = new Date();
  const overdue = DATA.actions.filter((a) => a[5] === "Overdue");
  const dueSoon = DATA.actions.filter((a) => {
    if (a[5] === "Completed" || !a[4]) return false;
    const days = (new Date(a[4]) - now) / 86400000;
    return days >= 0 && days <= 45;
  });
  const renewals = DATA.assets.land.filter((l) => l[4] === "Under Renewal");
  const parts = [];
  if (overdue.length) parts.push(`<strong>${overdue.length} action${overdue.length > 1 ? "s" : ""} overdue</strong>`);
  if (dueSoon.length) parts.push(`${dueSoon.length} due within 45 days`);
  if (renewals.length) parts.push(`${renewals.length} lease${renewals.length > 1 ? "s" : ""} under renewal (${esc(renewals.map((r) => r[0]).join(", "))})`);
  $("profile-alerts").innerHTML = parts.length ? `
    <div class="callout" style="margin-top:14px;">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3.5 22 20H2z"/><path d="M12 10v4M12 17.2v.1"/></svg>
      <div>Attention needed — ${parts.join(" · ")}. Open the <a href="#/v/actions" style="font-weight:600;text-decoration:underline;">Action Tracker</a>.</div>
    </div>` : "";

  $("profile-gates").innerHTML = DATA.gates.map((g) => `
    <div class="gate-step ${g.state === "done" ? "done" : g.state === "current" ? "current" : ""}">
      <div class="connector"></div>
      <div class="chip">${g.state === "done" ? ICONS.good.replace('viewBox="0 0 24 24"', 'viewBox="0 0 24 24" style="width:15px;height:15px"') : g.n}</div>
      <div class="lbl">${esc(g.name)}</div>
    </div>`).join("");

  const yrs = new Date().getFullYear() - (+c.established || new Date().getFullYear());
  $("profile-identity").innerHTML = `
    <dt>Legal name</dt><dd>${esc(c.name)}</dd>
    <dt>Registration no.</dt><dd class="mono">${esc(c.reg)}</dd>
    <dt>Region</dt><dd>${esc(c.region)}</dd>
    <dt>Established</dt><dd>${esc(c.established)}${c.established ? ` (${yrs} year${yrs === 1 ? "" : "s"} operating)` : ""}</dd>
    <dt>Land extent</dt><dd>${(+c.landExtent || 0).toLocaleString()} ha across ${esc(c.portions)} portions</dd>
    <dt>Verified members</dt><dd>${(+c.members || 0).toLocaleString()}</dd>`;

  $("committee-hint").textContent = `${DATA.committee.length} elected office-bearers`;
  $("profile-committee").innerHTML = DATA.committee.length
    ? `<table><tbody>${DATA.committee.map(([role, name, term]) =>
        `<tr><td style="color:var(--ink-2);font-size:12px;">${esc(role)}</td><td style="font-weight:600;">${esc(name)}</td><td style="color:var(--ink-muted);font-size:11.5px;">${esc(term)}</td></tr>`).join("")}</tbody></table>`
    : `<p class="muted">No committee members recorded.</p>`;
}

function renderScore() {
  const total = scoreTotal();
  const band = maturityBand(total);
  $("score-gauge").innerHTML = scoreGauge(total, 100);
  $("score-band-pill").textContent = band.name + " maturity band";
  const sd = $("score-doc-btn");
  if (sd) sd.textContent = "Assessment doc" + (docCount("score", null) ? ` · ${docCount("score", null)}` : "");
  $("score-bars").innerHTML = barRows(
    DATA.score.domains.map((d) => ({ label: d.name, value: +d.achieved || 0, max: d.weight })),
    { fmtVal: (it) => it.value + " / " + it.max });
  $("score-bands").innerHTML = DATA.score.bands.map(([b, r, d]) => {
    const here = b === band.name;
    return `<tr${here ? ' style="background:var(--brand-tint);"' : ""}>
      <td style="font-weight:700;">${esc(b)}${here ? ' &nbsp;<span class="pill brand">Current</span>' : ""}</td>
      <td class="mono">${esc(r)}</td><td style="color:var(--ink-2);">${esc(d)}</td></tr>`;
  }).join("");
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

function renderBeneficiary() {
  const b = DATA.beneficiary;
  const t = b.total || 1;
  $("beneficiary-stats").innerHTML = [
    statTile("Total Registered", b.total.toLocaleString(), "Master Beneficiary Register", ""),
    statTile("Verified", b.verified.toLocaleString(), fmtPct(b.verified / t * 100) + " of total", "good"),
    statTile("Pending Verification", b.pending.toLocaleString(), fmtPct(b.pending / t * 100) + " of total", "warning"),
    statTile("Disputed", b.disputed.toLocaleString(), fmtPct(b.disputed / t * 100) + " of total", "critical"),
  ].join("");
  $("beneficiary-donut").innerHTML = donut([
    { value: b.verified, color: "var(--status-good)" },
    { value: b.pending, color: "var(--status-warning)" },
    { value: b.disputed, color: "var(--status-critical)" },
  ]) + `<div class="legend">
    <span class="sw"><i style="background:var(--status-good)"></i>Verified</span>
    <span class="sw"><i style="background:var(--status-warning)"></i>Pending</span>
    <span class="sw"><i style="background:var(--status-critical)"></i>Disputed</span></div>`;
  $("beneficiary-gender").innerHTML = barRows([
    { label: "Female", value: b.female, max: t, cls: "s2" },
    { label: "Male", value: b.male, max: t },
  ], { fmtVal: (it) => it.value.toLocaleString() + " (" + fmtPct(it.value / t * 100) + ")" });
  $("beneficiary-household").innerHTML = `
    <dt>Households represented</dt><dd>${(b.households || 0).toLocaleString()}</dd>
    <dt>Succession cases pending</dt><dd>${b.succession}</dd>
    <dt>Avg. members per household</dt><dd>${b.households ? (b.total / b.households).toFixed(1) : "—"}</dd>`;
}

function renderAssets() {
  const a = DATA.assets;
  const active = a.land.filter((r) => r[4] === "Active").length;
  $("assets-stats").innerHTML = [
    statTile("Land Portions", a.land.length, (+DATA.cpa.landExtent || 0).toLocaleString() + " ha total", ""),
    statTile("Portions Actively Used", active + " / " + a.land.length, "", "good"),
    statTile("Leases Under Renewal", a.land.filter((r) => r[4] === "Under Renewal").length, "See Action Tracker", "warning"),
    statTile("Movable Assets Logged", a.movable.reduce((s, r) => s + (+r[1] || 0), 0), "Vehicles, equipment, buildings", ""),
  ].join("");
  $("assets-land").innerHTML = a.land.length ? a.land.map(([p, use, ha, lease, status]) =>
    `<tr><td style="font-weight:600;">${esc(p)}</td><td>${esc(use)}</td><td class="num mono">${(+ha || 0).toLocaleString()}</td><td style="color:var(--ink-2);">${esc(lease)}</td><td>${statusPill(status)}</td></tr>`).join("") : emptyRow(5, "No land portions recorded.");
  $("assets-movable").innerHTML = a.movable.length ? a.movable.map(([cls, count, cond]) =>
    `<tr><td>${esc(cls)}</td><td class="num mono">${esc(count)}</td><td style="color:var(--ink-2);">${esc(cond)}</td></tr>`).join("") : emptyRow(3, "No movable assets recorded.");
  $("assets-permits").innerHTML = a.permits.length ? a.permits.map(([name, valid, status]) =>
    `<tr><td>${esc(name)}</td><td class="mono">${esc(valid)}</td><td>${statusPill(status)}</td></tr>`).join("") : emptyRow(3, "No permits recorded.");
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

const RENDERERS = {
  profile: renderProfile, score: renderScore, actions: renderActions, masterfile: renderMasterFile,
  beneficiary: renderBeneficiary, assets: renderAssets, finance: renderFinance, projects: renderProjects, impact: renderImpact,
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
    title: "committee members", section: "committee", arr: () => DATA.committee,
    targets: [{ k: "role", label: "Role", required: true }, { k: "name", label: "Name", required: true }, { k: "term", label: "Term" }],
    make: (v) => [v.role, v.name, v.term || ""],
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

const BUTTONS = {
  "edit-identity-btn": editIdentity, "edit-score-btn": editScore, "edit-gates-btn": editGates,
  "edit-committee-btn": editCommittee, "add-action-btn": () => editAction(null), "edit-masterfile-btn": editMasterFile,
  "edit-beneficiary-btn": editBeneficiary, "edit-land-btn": editLand, "edit-movable-btn": editMovable,
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
  container.querySelectorAll(".row-actions").forEach((e) => e.remove());
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
  currentView = NAV.some((n) => n.id === viewId) ? viewId : "profile";
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
  el.querySelectorAll("svg:not([aria-label])").forEach((s) => { s.setAttribute("aria-hidden", "true"); s.setAttribute("focusable", "false"); });
  rendered.clear();
  showView(currentView);
}

export function showView(name) {
  if (!RENDERERS[name]) name = "profile";
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

  <section class="view" id="view-profile">
    <div class="grid grid-4" id="profile-stats"></div>
    <div id="profile-alerts"></div>
    <div class="section-title">Gate Progress — CPA360™ Gate System</div>
    <div class="card" style="overflow-x:auto;">
      <div class="card-head" style="margin-bottom:14px;"><h3 style="font-size:13px;">CPA360™ Gate System</h3><button class="btn" id="edit-gates-btn" type="button">Set current gate</button></div>
      <div class="gate-stepper" id="profile-gates"></div>
    </div>
    <div class="grid grid-2" style="margin-top:16px;">
      <div class="card">
        <div class="card-head"><h3>Institutional Identity</h3><button class="btn" id="edit-identity-btn" type="button">Edit</button></div>
        <dl class="kv" id="profile-identity"></dl>
      </div>
      <div class="card">
        <div class="card-head"><h3>Management Committee</h3>
          <span style="display:flex;gap:6px;">
            <button class="btn" id="import-committee-btn" type="button">Import</button>
            <button class="btn" id="edit-committee-btn" type="button">Manage</button>
          </span></div>
        <div class="hint" id="committee-hint" style="margin:-4px 0 8px;">elected office-bearers</div>
        <div id="profile-committee"></div>
      </div>
    </div>
  </section>

  <section class="view hidden" id="view-score">
    <div class="split split-score">
      <div class="card" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
        <div id="score-gauge"></div>
        <div class="pill brand" id="score-band-pill" style="margin-top:10px;">Developing maturity band</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Score by Toolkit Domain</h3>
          <span style="display:flex;gap:6px;">
            <button class="btn view-ok" id="score-doc-btn" type="button">Assessment doc</button>
            <button class="btn" id="edit-score-btn" type="button">Update scores</button>
          </span>
        </div>
        <div id="score-bars"></div>
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
    <div class="split split-bene">
      <div class="grid grid-2" id="beneficiary-stats" style="align-content:start;"></div>
      <div class="card">
        <div class="card-head"><h3>Verification Status</h3><button class="btn" id="edit-beneficiary-btn" type="button">Edit figures</button></div>
        <div id="beneficiary-donut" class="chart-wrap"></div>
      </div>
    </div>
    <div class="grid grid-2" style="margin-top:14px;">
      <div class="card">
        <div class="card-head"><h3>Membership by Gender</h3><span class="hint">Verified &amp; pending members</span></div>
        <div id="beneficiary-gender"></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Household &amp; Succession</h3></div>
        <dl class="kv" id="beneficiary-household"></dl>
      </div>
    </div>
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
