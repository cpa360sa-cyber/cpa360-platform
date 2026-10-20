/* CPA360 — draws a family tree as an SVG string (pure; no DOM). Used on screen, as the thumbnails on the Family
   Trees tab, and rasterised for the PNG / PDF downloads.
   Look: a heritage-style chart — each person a card with a coloured role ribbon (colour = generation), the ODI in
   a deep brand-coloured card with a gold star, rounded elbow connectors, interlocked rings between spouses,
   dashed cards for people only named on the household record, and a "household at a glance" strip of charts
   (people per generation, verification, gender) under the tree. */
import { NODE_W, NODE_H } from "./family-tree-layout.js";

export const THEMES = {
  brand: (p, s) => ({ name: "Brand colours", primary: p, secondary: s, accent: "#b98a2e", paper: "#f7f5ef", ink: "#14203a", muted: "#667085", gens: [p, s, "#2a8f9d", "#3a6ea5", "#7b5ea7", "#b5654a", "#7d8590"] }),
  heritage: () => ({ name: "Heritage", primary: "#5b3a1e", secondary: "#8a5a2b", accent: "#c9a227", paper: "#fbf6ea", ink: "#2b2118", muted: "#7a6a58", gens: ["#5b3a1e", "#8a5a2b", "#a97c50", "#6b8f71", "#4d7c8a", "#8c6bb1", "#7d7468"] }),
  forest: () => ({ name: "Forest", primary: "#17432f", secondary: "#2f7d4f", accent: "#d6a93a", paper: "#f3f7f1", ink: "#12241b", muted: "#58705f", gens: ["#17432f", "#2f7d4f", "#4f9a7a", "#3c8aa5", "#6a7fbf", "#a8794a", "#7a8780"] }),
  mono: () => ({ name: "Black & white (printing)", primary: "#222", secondary: "#444", accent: "#888", paper: "#ffffff", ink: "#111", muted: "#555", gens: ["#222", "#444", "#555", "#666", "#777", "#888", "#999"] }),
};
export const themeFor = (id, cpa) => (THEMES[id] || THEMES.brand)(cpa && cpa.brandPrimary || "#1c3a68", cpa && cpa.brandSecondary || "#2f7d4f");

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const FONT = "'Public Sans','Segoe UI',Helvetica,Arial,sans-serif";
const GEN_NAME = (g) => (g === 0 ? "ODI" : g === 1 ? "Children" : g === 2 ? "Grandchildren" : g === 3 ? "Great-grandchildren" : `Generation ${g}`);

export function wrapName(name, per = 17) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean), lines = [""];
  words.forEach((w) => {
    const cur = lines[lines.length - 1];
    if (!cur) lines[lines.length - 1] = w;
    else if ((cur + " " + w).length <= per) lines[lines.length - 1] = cur + " " + w;
    else if (lines.length < 2) lines.push(w);
    else lines[1] += " " + w;
  });
  return lines.map((l, i) => (l.length > per + (i ? 1 : 0) ? l.slice(0, per - 1) + "…" : l)).slice(0, 2);
}
const initials = (name) => String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
const fit = (s, max) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);
const roleLabel = (p, n) => (p.placeholder ? "ODI" : p.role === "ODI" ? "ODI" : p.role === "Spouse" ? "SPOUSE" : p.role === "Family Representative" ? "FAMILY REP." : p.role === "Other family member" ? (n.ext ? "FAMILY" : n.gen === 2 ? "GRANDCHILD" : n.gen === 3 ? "GREAT-GRANDCHILD" : n.gen >= 4 ? "DESCENDANT" : "FAMILY MEMBER") : String(p.role || "Member").replace(" Descendant", " DESC.").toUpperCase());
const starPath = (cx, cy, r) => { let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rad = i % 2 ? r * 0.45 : r; d += (i ? "L" : "M") + (cx + rad * Math.cos(a)).toFixed(1) + " " + (cy + rad * Math.sin(a)).toFixed(1); } return d + "Z"; };

function nodeSvg(n, th, o) {
  const p = n.p, isOdi = n.gen === 0 && !n.spouse && !n.ext, dead = p.status === "Deceased";
  const col = n.ext ? th.gens[6] : th.gens[Math.min(n.gen, 5)];
  const x = n.x, y = n.y, w = n.w, h = n.h;
  if (o.mini) return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="22" fill="${dead ? "#c9ced4" : isOdi ? th.primary : col}" ${p.virtual ? `fill-opacity=".35" stroke="${col}" stroke-width="6" stroke-dasharray="16 10"` : ""}/>`;
  const fill = isOdi && !dead ? `url(#odiGrad)` : dead ? "#eef0f2" : "#ffffff";
  const ink = isOdi && !dead ? "#ffffff" : dead ? "#6b7280" : th.ink, sub = isOdi && !dead ? "rgba(255,255,255,.82)" : th.muted;
  const lines = wrapName(p.name, 16), ribbonH = 22;
  const born = p.dob ? String(p.dob).slice(0, 4) : "";
  const idTxt = o.showIds && p.idm ? "ID ••••" + String(p.idm).replace(/\D/g, "").slice(-4) : "";
  const meta = [dead ? "† deceased" : born ? "b. " + born : "", idTxt].filter(Boolean).join("  ·  ");
  const ver = p.virtual || dead ? "" : p.verification === "Verified"
    ? `<circle cx="${w - 15}" cy="11" r="7.5" fill="#fff"/><path d="M${w - 19} 11.2l2.8 2.8 5.2-5.6" fill="none" stroke="#16803c" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<circle cx="${w - 15}" cy="11" r="7.5" fill="#fff"/><circle cx="${w - 15}" cy="11" r="3.2" fill="#e0a21a"/>`;
  const fr = p.famRep && p.role !== "Family Representative" ? `<g transform="translate(${w - 62} 3.5)"><rect width="30" height="15" rx="7.5" fill="${th.accent}"/><text x="15" y="11" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="${FONT}" letter-spacing=".5">REP</text></g>` : "";
  const star = isOdi && !dead ? `<path d="${starPath(14, 11, 7)}" fill="${th.accent}" transform="translate(0 0)"/>` : "";
  return `<g transform="translate(${x} ${y})" data-pid="${esc(p.key || "")}" class="ftn">
    <rect width="${w}" height="${h}" rx="14" fill="${fill}" stroke="${dead ? "#b9c0c8" : col}" stroke-width="${isOdi ? 2.4 : 1.6}" ${p.virtual ? 'stroke-dasharray="6 4"' : ""} filter="url(#cardShadow)"/>
    <path d="M0 14a14 14 0 0 1 14-14h${w - 28}a14 14 0 0 1 14 14v${ribbonH - 14}h-${w}z" fill="${dead ? "#9aa3ad" : col}"/>
    ${star}<text x="${isOdi ? 25 : 12}" y="15.5" font-size="10" font-weight="800" letter-spacing=".9" fill="#fff" font-family="${FONT}">${esc(roleLabel(p, n))}${dead ? " †" : ""}</text>${fr}${ver}
    <circle cx="26" cy="${ribbonH + 30}" r="16" fill="${dead ? "#dde1e5" : isOdi ? "rgba(255,255,255,.18)" : col}" fill-opacity="${isOdi || dead ? 1 : 0.14}"/>
    <text x="26" y="${ribbonH + 35}" text-anchor="middle" font-size="12.5" font-weight="800" fill="${dead ? "#6b7280" : isOdi ? "#fff" : col}" font-family="${FONT}">${esc(initials(p.name))}</text>
    ${lines.map((l, i) => `<text x="50" y="${ribbonH + 23 + i * 15 + (lines.length === 1 ? 6 : 0)}" font-size="13" font-weight="700" fill="${ink}" font-family="${FONT}">${esc(l)}</text>`).join("")}
    ${meta ? `<text x="50" y="${ribbonH + 24 + lines.length * 15 + (lines.length === 1 ? 6 : 0)}" font-size="10" fill="${sub}" font-family="${FONT}">${esc(meta)}</text>` : ""}
    ${p.virtual ? `<text x="${w - 8}" y="${h - 6}" text-anchor="end" font-size="8.5" font-style="italic" fill="${sub}" font-family="${FONT}">not yet on the register</text>` : ""}
  </g>`;
}

function edgeSvg(e, th, mini) {
  const col = th.gens[Math.min(e.gen, 5)], mid = e.y1 + (e.y2 - e.y1) / 2, r = Math.min(14, Math.abs(e.x2 - e.x1) / 2, (e.y2 - e.y1) / 4);
  const sw = mini ? 7 : 2.2;
  if (Math.abs(e.x2 - e.x1) < 1) return `<path d="M${e.x1} ${e.y1}V${e.y2}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity=".85"/>`;
  const dir = e.x2 > e.x1 ? 1 : -1;
  return `<path d="M${e.x1} ${e.y1}V${mid - r}Q${e.x1} ${mid} ${e.x1 + dir * r} ${mid}H${e.x2 - dir * r}Q${e.x2} ${mid} ${e.x2} ${mid + r}V${e.y2}" fill="none" stroke="${col}" stroke-width="${sw}" stroke-linecap="round" opacity=".85"/>`;
}

const arc = (cx, cy, r0, r1, a0, a1) => {
  const p = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)], large = a1 - a0 > Math.PI ? 1 : 0;
  const [x0, y0] = p(r1, a0), [x1, y1] = p(r1, a1), [x2, y2] = p(r0, a1), [x3, y3] = p(r0, a0);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r1} ${r1} 0 ${large} 1 ${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}A${r0} ${r0} 0 ${large} 0 ${x3.toFixed(1)} ${y3.toFixed(1)}Z`;
};
/** the "household at a glance" strip: people per generation · verification donut · gender */
function glanceSvg(st, th, x, y, w) {
  const colW = w / 3, T = (tx, ty, s, o = "") => `<text x="${tx}" y="${ty}" font-family="${FONT}" ${o}>${esc(s)}</text>`;
  const maxG = Math.max(1, ...st.byGen);
  const bars = st.byGen.map((n, g) => { const bw = (n / maxG) * (colW - 150); return `${T(x + 4, y + 52 + g * 22, GEN_NAME(g), `font-size="11" fill="${th.muted}"`)}<rect x="${x + 112}" y="${y + 40 + g * 22}" width="${Math.max(3, bw)}" height="13" rx="6.5" fill="${th.gens[Math.min(g, 5)]}"/>${T(x + 118 + Math.max(3, bw), y + 51 + g * 22, String(n), `font-size="11" font-weight="700" fill="${th.ink}"`)}`; }).join("");
  const parts = [["Verified", st.verified, "#16803c"], ["Pending", st.pending, "#e0a21a"], ["Deceased", st.deceased, "#9aa3ad"]];
  const total = Math.max(1, parts.reduce((s, q) => s + q[1], 0));
  let a = -Math.PI / 2; const cx = x + colW + 62, cy = y + 88;
  const slices = parts.filter((q) => q[1]).map((q) => { const a1 = a + (q[1] / total) * Math.PI * 2; const d = q[1] === total ? `<circle cx="${cx}" cy="${cy}" r="44" fill="none" stroke="${q[2]}" stroke-width="18"/>` : `<path d="${arc(cx, cy, 26, 44, a, a1 - 0.012)}" fill="${q[2]}"/>`; a = a1; return d; }).join("");
  const legend = parts.map((q, i) => `<circle cx="${cx + 66}" cy="${y + 64 + i * 22}" r="5" fill="${q[2]}"/>${T(cx + 76, y + 68 + i * 22, `${q[0]} ${q[1]}`, `font-size="11" fill="${th.ink}"`)}`).join("");
  const gx = x + colW * 2 + 10, gt = Math.max(1, st.female + st.male);
  const gbar = (lab, n, col, i) => `${T(gx, y + 62 + i * 34, lab, `font-size="11" fill="${th.muted}"`)}<rect x="${gx}" y="${y + 68 + i * 34}" width="${colW - 60}" height="12" rx="6" fill="${th.gens[0]}" fill-opacity=".08"/><rect x="${gx}" y="${y + 68 + i * 34}" width="${Math.max(n ? 8 : 0, (n / gt) * (colW - 60))}" height="12" rx="6" fill="${col}"/>${T(gx + colW - 52, y + 78 + i * 34, String(n), `font-size="11" font-weight="700" fill="${th.ink}"`)}`;
  const heads = ["People per generation", "Verification", "Gender"].map((s, i) => T(x + i * colW + (i === 2 ? 10 : 4), y + 18, s.toUpperCase(), `font-size="10" font-weight="800" letter-spacing="1" fill="${th.muted}"`)).join("");
  return `<g>${heads}${bars}${slices}${T(cx, cy + 5, String(st.members), `font-size="15" font-weight="800" text-anchor="middle" fill="${th.ink}"`)}${legend}${gbar("Female", st.female, th.gens[1], 0)}${gbar("Male", st.male, th.gens[3], 1)}${T(gx, y + 140, `${st.onRegister} on the register · ${st.notYet} named on the household record only`, `font-size="10" fill="${th.muted}"`)}</g>`;
}

/** layout (from layoutFamily) → { svg, width, height }.  o: { mode:"full"|"mini", theme, title, subtitle, cpaName, logo, date, showIds, glance } */
export function treeSvg(L, o = {}) {
  const th = o.theme || themeFor("brand"), mini = o.mode === "mini";
  if (mini) {
    const pad = 40, W = L.width + pad * 2, H = L.height + pad * 2;
    return { width: W, height: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet"><g transform="translate(${pad} ${pad})">${L.edges.map((e) => edgeSvg(e, th, true)).join("")}${L.marriages.map((m) => `<path d="M${m.x1} ${m.y}H${m.x2}" stroke="${th.accent}" stroke-width="8"/>`).join("")}${L.nodes.map((n) => nodeSvg(n, th, { mini: true })).join("")}</g></svg>` };
  }
  const pad = 56, headH = 128, glanceH = o.glance === false ? 0 : 168, legendH = 108;
  const treeW = Math.max(L.width, 1040 - pad * 2), W = treeW + pad * 2, offX = pad + (treeW - L.width) / 2;
  const treeY = headH + 46, glanceY = treeY + L.height + 44, legendY = glanceY + glanceH + 18, H = legendY + legendH;
  const st = L.stats, odi = L.nodes.find((n) => n.p.key === L.rootKey);
  const logo = o.logo ? `<rect x="${pad}" y="26" width="72" height="72" rx="14" fill="#fff"/><image href="${esc(o.logo)}" x="${pad + 6}" y="32" width="60" height="60" preserveAspectRatio="xMidYMid meet"/>` : `<circle cx="${pad + 36}" cy="62" r="36" fill="rgba(255,255,255,.14)"/><path d="${starPath(pad + 36, 62, 20)}" fill="${th.accent}"/>`;
  const tx = pad + 92;
  const chip = (i, label, val) => `<g transform="translate(${W - pad - 4 - (3 - i) * 120} 34)"><rect width="110" height="56" rx="12" fill="rgba(255,255,255,.14)"/><text x="55" y="27" text-anchor="middle" font-size="20" font-weight="800" fill="#fff" font-family="${FONT}">${esc(val)}</text><text x="55" y="45" text-anchor="middle" font-size="9.5" letter-spacing=".8" fill="rgba(255,255,255,.8)" font-family="${FONT}">${esc(label)}</text></g>`;
  const leg = [
    [`<path d="${starPath(8, 8, 8)}" fill="${th.accent}"/>`, "Original dweller (ODI)"],
    [`<rect width="26" height="14" y="1" rx="7" fill="${th.accent}"/><text x="13" y="11.5" text-anchor="middle" font-size="8.5" font-weight="800" fill="#fff" font-family="${FONT}">REP</text>`, "Family representative"],
    [`<circle cx="8" cy="8" r="8" fill="#16803c"/><path d="M4.5 8.2l2.4 2.4 4.4-4.8" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`, "Verified"],
    [`<circle cx="8" cy="8" r="8" fill="#e0a21a"/>`, "Pending verification"],
    [`<rect width="16" height="16" rx="4" fill="#9aa3ad"/>`, "† Deceased"],
    [`<rect x="1" y="1" width="14" height="14" rx="4" fill="none" stroke="${th.muted}" stroke-dasharray="3 2"/>`, "Not yet on the register"],
  ];
  let lx = pad, ly = legendY + 8;
  const legend = leg.map(([ic, lb]) => {
    const off = lb.startsWith("Family rep") ? 34 : 24, wItem = off + lb.length * 6 + 26;
    if (lx + wItem > W - pad && lx > pad) { lx = pad; ly += 26; }
    const g = `<g transform="translate(${lx} ${ly})">${ic}<text x="${off}" y="12" font-size="11" fill="${th.ink}" font-family="${FONT}">${esc(lb)}</text></g>`; lx += wItem; return g;
  }).join("");
  const genKey = Array.from({ length: Math.min(L.gens, 6) }, (_, g) => g).map((g, i) => `<g transform="translate(${pad + i * 150} ${ly + 30})"><rect width="16" height="6" y="4" rx="3" fill="${th.gens[g]}"/><text x="22" y="11" font-size="10.5" fill="${th.muted}" font-family="${FONT}">${esc(GEN_NAME(g))}</text></g>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
  <defs>
    <linearGradient id="odiGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${th.primary}"/><stop offset="1" stop-color="${th.secondary}"/></linearGradient>
    <linearGradient id="headGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${th.primary}"/><stop offset="1" stop-color="${th.secondary}"/></linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#14203a" flood-opacity=".16"/></filter>
    <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.1" fill="${th.primary}" fill-opacity=".09"/></pattern>
  </defs>
  <rect width="${W}" height="${H}" fill="${th.paper}"/><rect width="${W}" height="${H}" fill="url(#dots)"/>
  <rect width="${W}" height="${headH}" fill="url(#headGrad)"/><rect y="${headH - 5}" width="${W}" height="5" fill="${th.accent}"/>
  ${logo}
  <text x="${tx}" y="48" font-size="10.5" font-weight="800" letter-spacing="1.6" fill="rgba(255,255,255,.78)">${esc(fit(String(o.cpaName || "").toUpperCase(), 40))}</text>
  <text x="${tx}" y="82" font-size="${String(o.title || "").length > 20 ? 24 : 30}" font-weight="800" fill="#fff">${esc(fit(o.title || "Family tree", 32))}</text>
  <text x="${tx}" y="106" font-size="13" fill="rgba(255,255,255,.85)">${esc(o.subtitle || "")}</text>
  ${chip(0, "MEMBERS", st.members)}${chip(1, "GENERATIONS", L.gens)}${chip(2, "VERIFIED", st.verified)}
  <g transform="translate(${offX} ${treeY})">${L.edges.map((e) => edgeSvg(e, th)).join("")}
    ${L.marriages.map((m) => `<path d="M${m.x1} ${m.y}H${m.x2}" stroke="${th.accent}" stroke-width="2.4"/><circle cx="${(m.x1 + m.x2) / 2 - 4}" cy="${m.y}" r="6" fill="${th.paper}" stroke="${th.accent}" stroke-width="2"/><circle cx="${(m.x1 + m.x2) / 2 + 4}" cy="${m.y}" r="6" fill="none" stroke="${th.accent}" stroke-width="2"/>`).join("")}
    ${L.hasExtended ? `<text x="0" y="${L.nodes.filter((n) => n.ext).reduce((m, n) => Math.min(m, n.y), 1e9) - 18}" font-size="10.5" font-weight="800" letter-spacing="1.2" fill="${th.muted}">EXTENDED FAMILY &amp; OTHERS — LINEAGE NOT RECORDED</text>` : ""}
    ${L.nodes.map((n) => nodeSvg(n, th, { showIds: o.showIds })).join("")}</g>
  ${glanceH ? `<line x1="${pad}" x2="${W - pad}" y1="${glanceY - 14}" y2="${glanceY - 14}" stroke="${th.primary}" stroke-opacity=".15"/><g transform="translate(0 0)">${glanceSvg(st, th, pad, glanceY, W - pad * 2)}</g>` : ""}
  ${legend}${genKey}
  <text x="${W - pad}" y="${H - 10}" text-anchor="end" font-size="9.5" fill="${th.muted}">${esc(o.date || "")} · generated by CPA360™ — A GAD Foundation Programme</text>
</svg>`;
  return { svg, width: W, height: H };
}

export const familyTitle = (odiName, ref) => {
  const w = String(odiName || "").trim().split(/\s+/).filter(Boolean);
  return w.length ? `The ${w[w.length - 1]} Family` : `Household ${ref || ""}`.trim();
};
