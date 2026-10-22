/* CPA360 — Beneficiaries → Family Trees.
   Every household gets an automatically-built family tree (ODI and spouse at the top, descendants beneath, lineage
   from each member's recorded parent), plus charts. Open any household for the full chart, change its colours, zoom,
   fix lineage by clicking a person, and download it as a PHOTO (PNG) or a PDF — or download every household at once
   as a Family Tree Book. Layout lives in family-tree-layout.js, drawing in family-tree-svg.js, PDF in pdf-write.js. */
import { householdPeople, layoutFamily, NODE_W } from "./family-tree-layout.js";
import { treeSvg, themeFor, THEMES, familyTitle } from "./family-tree-svg.js";
import { makePdf } from "./pdf-write.js";
import { listGroups, listTotals, listCsv, listHtml } from "./family-tree-list.js";

const UI = { q: "", filter: "all", sort: "name", shown: 24, theme: "brand", ids: false, paper: "fit" };
const FILTERS = [["all", "All households"], ["desc", "With descendants"], ["odionly", "ODI only (no family recorded)"], ["virtual", "Named on the household record, not yet on the register"], ["pending", "Members awaiting verification"], ["deceased", "With deceased members"], ["noodi", "No ODI recorded"]];
const today = () => new Date().toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
const safe = (s) => String(s || "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 60) || "tree";

function build(ctx, hh) {
  const people = householdPeople(hh, ctx.register());
  const L = layoutFamily(people), odi = String(hh[2] || hh[1] || "").trim();
  return { hh, people, L, odi, title: familyTitle(odi, hh[0]), hasOdi: !L.nodes.some((n) => n.p.placeholder) };
}
const svgFor = (ctx, b, mode, o = {}) => {
  const cpa = ctx.cpa();
  return treeSvg(b.L, { mode, theme: themeFor(UI.theme, cpa), title: b.title, subtitle: `Household ${b.hh[0]}${b.odi ? " · ODI " + b.odi : ""}`, cpaName: cpa.name || "", logo: cpa.logoDataUrl || "", date: today(), showIds: UI.ids, ...o });
};

/* ------------------------------------------------------------------------------ exports --- */
async function svgToCanvas(s, scale) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("The chart couldn't be drawn")); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.svg); });
  const c = document.createElement("canvas"); c.width = Math.round(s.width * scale); c.height = Math.round(s.height * scale);
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
const scaleFor = (w) => Math.min(3, Math.max(1.5, 3200 / w));
const toBlob = (c, type, q) => new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't create the picture"))), type, q));
function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
const PAPER = { fit: (s) => ({ pageW: Math.round(s.width * 0.75), pageH: Math.round(s.height * 0.75), margin: 0 }), a4: () => ({ pageW: 842, pageH: 595, margin: 22 }), a3: () => ({ pageW: 1191, pageH: 842, margin: 30 }) };

async function pagesFor(ctx, builds, paper, onProgress, cancelled) {
  const pages = [];
  for (let i = 0; i < builds.length; i++) {
    if (cancelled && cancelled()) return null;
    const s = svgFor(ctx, builds[i], "full");
    const c = await svgToCanvas(s, scaleFor(s.width));
    const blob = await toBlob(c, "image/jpeg", 0.92);
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), ...PAPER[paper](s) });
    if (onProgress) onProgress(i + 1, builds.length);
    await new Promise((r) => setTimeout(r, 0));          // let the page breathe between charts
  }
  return pages;
}
export async function downloadPng(ctx, b) {
  const s = svgFor(ctx, b, "full"), c = await svgToCanvas(s, scaleFor(s.width));
  saveBlob(await toBlob(c, "image/png"), `Family-Tree-${safe(b.hh[0])}-${safe(b.title)}.png`);
}
export async function downloadPdf(ctx, b, paper = UI.paper) {
  const pages = await pagesFor(ctx, [b], paper);
  saveBlob(new Blob([makePdf(pages, { title: `${b.title} — ${ctx.cpa().name || "CPA"}` })], { type: "application/pdf" }), `Family-Tree-${safe(b.hh[0])}-${safe(b.title)}.pdf`);
}
function coverSvg(ctx, builds) {
  const cpa = ctx.cpa(), th = themeFor(UI.theme, cpa), W = 1684, H = 1191, people = builds.reduce((s, b) => s + b.L.stats.members, 0);
  const e = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const F = "'Public Sans','Segoe UI',Helvetica,Arial,sans-serif";
  const index = builds.slice(0, 46).map((b, i) => `<text x="${i < 23 ? 150 : 880}" y="${650 + (i % 23) * 20}" font-size="14" fill="rgba(255,255,255,.88)" font-family="${F}">${i + 1}. ${e(b.title)} — ${e(b.hh[0])}</text>`).join("");
  return { width: W, height: H, svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${th.primary}"/><stop offset="1" stop-color="${th.secondary}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" fill="url(#g)"/><rect y="${H - 14}" width="${W}" height="14" fill="${th.accent}"/>
    ${cpa.logoDataUrl ? `<rect x="150" y="110" width="120" height="120" rx="22" fill="#fff"/><image href="${e(cpa.logoDataUrl)}" x="160" y="120" width="100" height="100" preserveAspectRatio="xMidYMid meet"/>` : ""}
    <text x="150" y="330" font-size="20" font-weight="800" letter-spacing="4" fill="rgba(255,255,255,.75)" font-family="${F}">${e(String(cpa.name || "").toUpperCase())}</text>
    <text x="150" y="430" font-size="96" font-weight="800" fill="#fff" font-family="${F}">Family Tree Book</text>
    <text x="150" y="490" font-size="26" fill="rgba(255,255,255,.88)" font-family="${F}">${builds.length} household${builds.length === 1 ? "" : "s"} · ${people} people · ${e(today())}</text>
    <rect x="150" y="530" width="140" height="6" rx="3" fill="${th.accent}"/>
    <text x="150" y="610" font-size="13" font-weight="800" letter-spacing="2" fill="rgba(255,255,255,.6)" font-family="${F}">HOUSEHOLDS IN THIS BOOK</text>${index}
    ${builds.length > 46 ? `<text x="880" y="${650 + 23 * 20 + 10}" font-size="13" fill="rgba(255,255,255,.7)" font-family="${F}">… and ${builds.length - 46} more on the following pages</text>` : ""}
    <text x="${W - 150}" y="${H - 50}" text-anchor="end" font-size="14" fill="rgba(255,255,255,.7)" font-family="${F}">Generated by CPA360™ — A GAD Foundation Programme</text></svg>` };
}
async function downloadBook(ctx, builds, paper, onProgress, cancelled) {
  const cs = coverSvg(ctx, builds), cc = await svgToCanvas(cs, 1.4), cb = await toBlob(cc, "image/jpeg", 0.92);
  const pages = [{ jpeg: new Uint8Array(await cb.arrayBuffer()), ...(paper === "fit" ? { pageW: 1191, pageH: 842, margin: 0 } : PAPER[paper]()) }];
  const rest = await pagesFor(ctx, builds, paper, onProgress, cancelled);
  if (!rest) return false;
  saveBlob(new Blob([makePdf(pages.concat(rest), { title: `Family Tree Book — ${ctx.cpa().name || "CPA"}` })], { type: "application/pdf" }), `Family-Tree-Book-${safe(ctx.cpa().name)}-${new Date().toISOString().slice(0, 10)}.pdf`);
  return true;
}

/* ------------------------------------------------------------------------------ overview --- */
const FILTER_TEST = {
  all: () => true, desc: (b) => b.L.gens > 1, odionly: (b) => b.L.stats.members <= 1, virtual: (b) => b.L.stats.notYet > 0,
  pending: (b) => b.L.stats.pending > 0, deceased: (b) => b.L.stats.deceased > 0, noodi: (b) => !b.hasOdi,
};
function donutSvg(parts, size = 120) {
  const total = parts.reduce((s, p) => s + p[1], 0) || 1; let a = -Math.PI / 2; const r1 = size / 2 - 4, r0 = r1 - 20, c = size / 2;
  const arcs = parts.filter((p) => p[1]).map((p) => {
    const a1 = a + (p[1] / total) * Math.PI * 2;
    if (p[1] === total) { const d = `<circle cx="${c}" cy="${c}" r="${(r0 + r1) / 2}" fill="none" stroke="${p[2]}" stroke-width="20"/>`; a = a1; return d; }
    const P = (r, t) => [c + r * Math.cos(t), c + r * Math.sin(t)], [x0, y0] = P(r1, a), [x1, y1] = P(r1, a1 - 0.01), [x2, y2] = P(r0, a1 - 0.01), [x3, y3] = P(r0, a), big = a1 - a > Math.PI ? 1 : 0;
    a = a1; return `<path d="M${x0} ${y0}A${r1} ${r1} 0 ${big} 1 ${x1} ${y1}L${x2} ${y2}A${r0} ${r0} 0 ${big} 0 ${x3} ${y3}Z" fill="${p[2]}"/>`;
  }).join("");
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="Verification chart">${arcs}<text x="${c}" y="${c + 5}" text-anchor="middle" font-size="16" font-weight="800" fill="currentColor">${total === 1 && !parts.some((p) => p[1]) ? 0 : total}</text></svg>`;
}

export function renderFamilyTrees(host, ctx) {
  const { h: u } = ctx, { esc } = u;
  const hhs = ctx.households();
  const builds = hhs.filter((h) => String(h[0] || h[2] || "").trim()).map((h) => build(ctx, h));
  const cache = new Map(builds.map((b) => [b.hh[0], b]));
  const sum = (f) => builds.reduce((s, b) => s + f(b), 0);
  const people = sum((b) => b.L.stats.members), deepest = builds.reduce((m, b) => (b.L.gens > (m ? m.L.gens : 0) ? b : m), null);
  const largest = builds.reduce((m, b) => (b.L.stats.members > (m ? m.L.stats.members : 0) ? b : m), null);
  const sizeBuckets = [["1", (n) => n <= 1], ["2–3", (n) => n >= 2 && n <= 3], ["4–6", (n) => n >= 4 && n <= 6], ["7–10", (n) => n >= 7 && n <= 10], ["11+", (n) => n >= 11]].map(([l, f]) => [l, builds.filter((b) => f(b.L.stats.members)).length]);
  const genBuckets = [1, 2, 3, 4].map((g) => [g === 4 ? "4+ generations" : `${g} generation${g > 1 ? "s" : ""}`, builds.filter((b) => (g === 4 ? b.L.gens >= 4 : b.L.gens === g)).length]);
  const ver = [["Verified", sum((b) => b.L.stats.verified), "#16803c"], ["Pending", sum((b) => b.L.stats.pending), "#e0a21a"], ["Deceased", sum((b) => b.L.stats.deceased), "#9aa3ad"]];
  const bars = (items, color) => { const mx = Math.max(1, ...items.map((i) => i[1])); return items.map(([l, n]) => `<div class="ftb-row"><span class="ftb-l">${esc(l)}</span><span class="ftb-t"><i style="width:${(n / mx) * 100}%;background:${color}"></i></span><b>${n}</b></div>`).join(""); };

  host.innerHTML = `
    <div class="grid grid-4">
      ${u.statTile("Households", builds.length, "Each has its own tree", "")}
      ${u.statTile("People in the trees", people, `${sum((b) => b.L.stats.onRegister)} on the register`, "good")}
      ${u.statTile("Largest family", largest ? largest.L.stats.members : 0, largest ? largest.title : "—", "")}
      ${u.statTile("Deepest lineage", deepest ? deepest.L.gens : 0, deepest ? `generations · ${deepest.title}` : "—", "")}
    </div>
    <div class="card" style="margin-top:14px;">
      <div class="card-head"><div><h3>The community at a glance</h3><span class="hint">Built automatically from the household records and the Master Register.</span></div></div>
      <div class="ft-ov">
        <div><div class="ft-ovh">Households by size</div>${bars(sizeBuckets, "var(--brand)")}</div>
        <div><div class="ft-ovh">Lineage depth</div>${bars(genBuckets, "var(--brand-2)")}</div>
        <div><div class="ft-ovh">Verification</div><div style="display:flex;gap:12px;align-items:center;">${donutSvg(ver)}<div class="hint" style="line-height:1.9;">${ver.map((v) => `<span style="color:${v[2]}">&#9679;</span> ${v[0]} <b>${v[1]}</b>`).join("<br>")}</div></div></div>
      </div>
    </div>
    <div class="card" style="margin-top:14px;">
      <div class="card-head" style="gap:8px;"><div><h3>Household family trees</h3><span class="hint">Open a tree to see it full size, fix lineage and download it. Descendants without a recorded parent hang under the ODI.</span></div>
        <span style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn" id="ft-list" title="The same list as the Beneficiary Master Register, grouped by household — PDF, Word or CSV (Excel)">Export as a list</button>
        <button type="button" class="btn primary" id="ft-book">Download all as a PDF book</button></span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <input type="search" id="ft-q" placeholder="Search ODI, household or member name…" value="${esc(UI.q)}" style="flex:1;min-width:220px;">
        <select id="ft-f">${FILTERS.map(([v, l]) => `<option value="${v}"${v === UI.filter ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>
        <select id="ft-s"><option value="name"${UI.sort === "name" ? " selected" : ""}>Sort: name</option><option value="size"${UI.sort === "size" ? " selected" : ""}>Sort: biggest family</option><option value="ref"${UI.sort === "ref" ? " selected" : ""}>Sort: household no.</option></select></div>
      <div id="ft-grid"></div>
    </div>`;

  const visible = () => {
    const q = UI.q.trim().toLowerCase();
    return builds.filter((b) => FILTER_TEST[UI.filter](b) && (!q || [b.hh[0], b.odi, b.title, ...b.people.map((p) => p.name)].some((s) => String(s || "").toLowerCase().includes(q))))
      .sort((a, b) => (UI.sort === "size" ? b.L.stats.members - a.L.stats.members : UI.sort === "ref" ? String(a.hh[0]).localeCompare(String(b.hh[0]), undefined, { numeric: true }) : a.odi.localeCompare(b.odi)));
  };
  function paintGrid() {
    const list = visible(), grid = host.querySelector("#ft-grid"), shown = list.slice(0, UI.shown);
    grid.innerHTML = !builds.length ? `<div class="state"><p>No households yet — add them under Households (or import a register) and their family trees appear here automatically.</p></div>`
      : !list.length ? `<div class="state"><p>No households match that search or filter.</p></div>`
      : `<div class="ftc-grid">${shown.map((b) => {
        const st = b.L.stats, mini = treeSvg(b.L, { mode: "mini", theme: themeFor(UI.theme, ctx.cpa()) }).svg;
        return `<div class="ftc" data-hh="${esc(b.hh[0])}">
          <button type="button" class="ftc-svg" data-open="${esc(b.hh[0])}" aria-label="Open the ${esc(b.title)} tree">${mini}</button>
          <div class="ftc-body"><div class="ftc-t"><b>${esc(b.title)}</b><span class="mono hint">${esc(b.hh[0])}</span></div>
            <div class="ftc-chips"><span>${st.members} member${st.members === 1 ? "" : "s"}</span><span>${b.L.gens} gen.</span>${st.deceased ? `<span>† ${st.deceased}</span>` : ""}${st.pending ? `<span class="warn">${st.pending} pending</span>` : ""}${st.notYet ? `<span class="warn">${st.notYet} not on register</span>` : ""}${!b.hasOdi ? `<span class="bad">no ODI</span>` : ""}</div>
            <div class="ftc-act"><button type="button" class="btn small primary" data-open="${esc(b.hh[0])}">Open tree</button><button type="button" class="btn small" data-png="${esc(b.hh[0])}" title="Download as a picture (PNG)">Photo</button><button type="button" class="btn small" data-pdf="${esc(b.hh[0])}" title="Download as a PDF">PDF</button></div></div></div>`;
      }).join("")}</div>${list.length > shown.length ? `<div style="text-align:center;margin-top:12px;"><button type="button" class="btn" id="ft-more">Show more (${list.length - shown.length} more)</button></div>` : ""}
      <p class="hint" style="margin-top:8px;">${list.length} of ${builds.length} households</p>`;
    grid.querySelectorAll("[data-open]").forEach((el) => (el.onclick = () => openDetail(ctx, cache.get(el.dataset.open))));
    const busy = (btn, fn) => async () => { const old = btn.textContent; btn.disabled = true; btn.textContent = "…"; try { await fn(); } catch (e) { u.toast("Couldn't create the file: " + ((e && e.message) || e), true); } btn.disabled = false; btn.textContent = old; };
    grid.querySelectorAll("[data-png]").forEach((el) => (el.onclick = busy(el, () => downloadPng(ctx, cache.get(el.dataset.png)))));
    grid.querySelectorAll("[data-pdf]").forEach((el) => (el.onclick = busy(el, () => downloadPdf(ctx, cache.get(el.dataset.pdf)))));
    const more = grid.querySelector("#ft-more"); if (more) more.onclick = () => { UI.shown += 24; paintGrid(); };
  }
  paintGrid();
  host.querySelector("#ft-q").oninput = (e) => { UI.q = e.target.value; UI.shown = 24; paintGrid(); };
  host.querySelector("#ft-f").onchange = (e) => { UI.filter = e.target.value; UI.shown = 24; paintGrid(); };
  host.querySelector("#ft-s").onchange = (e) => { UI.sort = e.target.value; paintGrid(); };
  host.querySelector("#ft-book").onclick = () => bookDialog(ctx, visible());
  host.querySelector("#ft-list").onclick = () => listDialog(ctx, visible(), builds);
}

/* ------------------------------------------------------------------------------ list export --- */
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function exportList(ctx, builds, o) {
  const { h: u } = ctx, cpa = ctx.cpa();
  const groups = listGroups(builds, { order: o.order, members: o.members, virtual: o.virtual, fmtDay: u.fmtDay });
  const t = listTotals(groups);
  if (!t.members) { u.toast("Nobody matches those choices.", true); return false; }
  const scopeNote = [o.scopeLabel, o.members === "active" ? "active members only" : o.members === "verified" ? "verified members only" : ""].filter(Boolean).join(", ");
  const base = `Family-Tree-List-${safe(cpa.name)}-${o.asAt}`, lo = { cpa, mode: o.format, asAt: o.asAt, ids: o.ids, scopeNote, esc: u.esc };
  if (o.format === "csv") { saveBlob(new Blob([listCsv(groups, { ids: o.ids })], { type: "text/csv;charset=utf-8" }), base + ".csv"); u.toast(`CSV exported — ${t.members} people in ${t.households} household${t.households === 1 ? "" : "s"}.`); return true; }
  if (o.format === "word") { saveBlob(new Blob([listHtml(groups, lo)], { type: "application/msword;charset=utf-8" }), base + ".doc"); u.toast(`Word document exported — ${t.members} people in ${t.households} household${t.households === 1 ? "" : "s"}.`); return true; }
  const url = URL.createObjectURL(new Blob([listHtml(groups, { ...lo, mode: "print" })], { type: "text/html" })), w = window.open(url, "_blank");
  if (!w) { u.toast("Please allow pop-ups to open the print view.", true); URL.revokeObjectURL(url); return false; }
  w.opener = null;
  w.addEventListener("load", () => { setTimeout(() => { try { w.print(); } catch (e) { /* the print bar still works */ } }, 700); setTimeout(() => URL.revokeObjectURL(url), 120000); });
  return true;
}
/** list = the households to offer by default (what the tab is showing); all = every household (omit for a single household). */
function listDialog(ctx, list, all) {
  const { h: u } = ctx, { esc } = u, many = !!all && all.length > list.length;
  if (!list.length) { u.toast("There are no households to export — adjust the search or filter.", true); return; }
  const one = list.length === 1 && !all;
  const { scrim, close } = u.govModal(one ? `Export ${list[0].title} as a list` : "Export the family trees as a list", `
    <p class="hint" style="margin:0 0 10px;">The same list as the Beneficiary Master Register — <b>every column</b> — with the <b>household name</b> on a banner for each household and on every row, and each family in tree order (ODI first, then their children and grandchildren).</p>
    <div class="cm-filters">
      ${one ? "" : `<div class="field"><label for="ls-scope">Households</label><select id="ls-scope"><option value="shown">The ${list.length} household${list.length === 1 ? "" : "s"} shown now</option>${many ? `<option value="all">All ${all.length} households</option>` : ""}</select></div>`}
      <div class="field"><label for="ls-mem">People</label><select id="ls-mem"><option value="all">Everyone (incl. deceased)</option><option value="active">Active members only</option><option value="verified">Verified members only</option></select></div>
      <div class="field"><label for="ls-ord">Order</label><select id="ls-ord"><option value="name">By household name</option><option value="ref">By household number</option></select></div>
      <div class="field"><label for="ls-fmt">Format</label><select id="ls-fmt"><option value="print">PDF (print view)</option><option value="word">Word (.doc)</option><option value="csv">CSV (Excel)</option></select></div>
      <div class="field"><label for="ls-asat">As at</label><input type="date" id="ls-asat" value="${localDay()}"></div></div>
    <label class="cm-check"><input type="checkbox" id="ls-ids" checked> Include the ID number column (masked — last 4 digits only, as on the register)</label>
    <label class="cm-check"><input type="checkbox" id="ls-virt" checked> Include people named on the household record who aren't on the register yet</label>`,
    `<button class="btn" data-act="close" type="button">Close</button><button class="btn primary" id="ls-go" type="button">Export</button>`, 560);
  const $s = (q) => scrim.querySelector(q);
  $s("#ls-go").onclick = () => {
    const scope = one ? "shown" : $s("#ls-scope").value, picked = scope === "all" ? all : list;
    const ok = exportList(ctx, picked, {
      order: $s("#ls-ord").value, members: $s("#ls-mem").value, format: $s("#ls-fmt").value, asAt: $s("#ls-asat").value || localDay(),
      ids: $s("#ls-ids").checked, virtual: $s("#ls-virt").checked,
      scopeLabel: one ? list[0].title : scope === "all" ? `all ${all.length} households` : `${list.length} household${list.length === 1 ? "" : "s"}`,
    });
    if (ok) close();
  };
}

/* ------------------------------------------------------------------------------ book dialog --- */
function bookDialog(ctx, list) {
  const { h: u } = ctx, { esc } = u;
  if (!list.length) { u.toast("There are no households to download — adjust the search or filter.", true); return; }
  const { scrim, close } = u.govModal("Download a Family Tree Book", `
    <p class="hint" style="margin:0 0 10px;">A single PDF with a cover page and one family tree per household — <b>${list.length} household${list.length === 1 ? "" : "s"}</b> (the ones currently shown; change the search or filter to choose others).${list.length > 60 ? " <b>That's a lot — it may take a few minutes.</b>" : ""}</p>
    <div class="cm-filters"><div class="field"><label for="bk-theme">Colours</label><select id="bk-theme">${Object.entries(THEMES).map(([k, f]) => `<option value="${k}"${k === UI.theme ? " selected" : ""}>${esc(f("#1c3a68", "#2f7d4f").name)}</option>`).join("")}</select></div>
      <div class="field"><label for="bk-paper">Page size</label><select id="bk-paper"><option value="fit">Fit each tree (recommended)</option><option value="a4">A4 landscape</option><option value="a3">A3 landscape</option></select></div></div>
    <label class="cm-check"><input type="checkbox" id="bk-ids"${UI.ids ? " checked" : ""}> Show the last 4 digits of ID numbers (leave off if the book will be shared)</label>
    <div id="bk-prog" style="margin-top:12px;"></div>`,
    `<button class="btn" id="bk-cancel" type="button">Cancel</button><button class="btn primary" id="bk-go" type="button">Create the PDF</button>`, 520);
  const $s = (q) => scrim.querySelector(q); let stop = false, running = false;
  $s("#bk-cancel").onclick = () => { if (running) { stop = true; $s("#bk-cancel").disabled = true; } else close(); };
  $s("#bk-go").onclick = async () => {
    UI.theme = $s("#bk-theme").value; UI.ids = $s("#bk-ids").checked; UI.paper = $s("#bk-paper").value;
    running = true; $s("#bk-go").disabled = true; $s("#bk-cancel").textContent = "Stop";
    const prog = $s("#bk-prog");
    try {
      const ok = await downloadBook(ctx, list, UI.paper, (i, n) => { prog.innerHTML = `<div class="hint">Drawing tree ${i} of ${n}…</div><progress max="${n}" value="${i}" style="width:100%;"></progress>`; }, () => stop);
      if (ok) { u.toast("Family Tree Book downloaded."); close(); } else { prog.textContent = "Stopped — nothing was downloaded."; $s("#bk-cancel").disabled = false; $s("#bk-cancel").textContent = "Close"; running = false; }
    } catch (e) { prog.textContent = "Couldn't create the PDF: " + ((e && e.message) || e); $s("#bk-go").disabled = false; running = false; $s("#bk-cancel").disabled = false; $s("#bk-cancel").textContent = "Close"; }
  };
}

/* ------------------------------------------------------------------------------ one household --- */
function openDetail(ctx, b0) {
  const { h: u } = ctx, { esc } = u;
  let zoom = 0;     // 0 = fit the window
  const hhRef = b0.hh[0];
  const cur = () => build(ctx, ctx.households().find((x) => x[0] === hhRef) || b0.hh);
  const { scrim, close } = u.govModal(b0.title, `
    <div class="ftv-bar">
      <label>Colours <select id="fv-theme">${Object.entries(THEMES).map(([k, f]) => `<option value="${k}"${k === UI.theme ? " selected" : ""}>${esc(f("#1c3a68", "#2f7d4f").name)}</option>`).join("")}</select></label>
      <label class="cm-check" style="margin:0;"><input type="checkbox" id="fv-ids"${UI.ids ? " checked" : ""}> ID endings</label>
      <span style="margin-left:auto;display:flex;gap:4px;align-items:center;"><button class="btn small" id="fv-out" type="button" title="Zoom out">&minus;</button><button class="btn small" id="fv-fit" type="button">Fit</button><button class="btn small" id="fv-in" type="button" title="Zoom in">+</button></span></div>
    <div class="ftv-stage" id="fv-stage" tabindex="0" aria-label="Family tree chart"></div>
    <p class="hint" style="margin:8px 0 0;">Click a person to set their parent (lineage), edit them or add them to the register. People without a recorded parent hang under the ODI.</p>`,
    `<label style="margin-right:auto;font-size:12px;">PDF page <select id="fv-paper"><option value="fit">fit the tree</option><option value="a4">A4 landscape</option><option value="a3">A3 landscape</option></select></label>
     <button class="btn" data-act="close" type="button">Close</button><button class="btn" id="fv-list" type="button" title="This household's members as a list — PDF, Word or CSV">Export as a list</button><button class="btn" id="fv-png" type="button">Download photo (PNG)</button><button class="btn primary" id="fv-pdf" type="button">Download PDF</button>`, 1180);
  const $s = (q) => scrim.querySelector(q), stage = $s("#fv-stage");
  $s("#fv-paper").value = UI.paper;
  function paint() {
    const b = cur(), s = svgFor(ctx, b, "full");
    stage.innerHTML = s.svg;
    const svg = stage.querySelector("svg"), avail = Math.max(320, stage.clientWidth - 8);
    const z = zoom || Math.min(1, avail / s.width);
    svg.style.width = Math.round(s.width * z) + "px"; svg.style.height = "auto"; svg.removeAttribute("height");
    stage.querySelectorAll(".ftn").forEach((g) => { g.style.cursor = "pointer"; g.onclick = () => openPerson(ctx, b, g.dataset.pid, paint); });
  }
  paint();
  $s("#fv-theme").onchange = (e) => { UI.theme = e.target.value; paint(); };
  $s("#fv-ids").onchange = (e) => { UI.ids = e.target.checked; paint(); };
  $s("#fv-in").onclick = () => { zoom = Math.min(2.5, (zoom || Math.min(1, (stage.clientWidth - 8) / svgFor(ctx, cur(), "full").width)) * 1.25); paint(); };
  $s("#fv-out").onclick = () => { zoom = Math.max(0.2, (zoom || Math.min(1, (stage.clientWidth - 8) / svgFor(ctx, cur(), "full").width)) / 1.25); paint(); };
  $s("#fv-fit").onclick = () => { zoom = 0; paint(); };
  $s("#fv-paper").onchange = (e) => { UI.paper = e.target.value; };
  const run = (id, fn) => { $s(id).onclick = async () => { const btn = $s(id), old = btn.textContent; btn.disabled = true; btn.textContent = "Creating…"; try { await fn(); } catch (e) { u.toast("Couldn't create the file: " + ((e && e.message) || e), true); } btn.disabled = false; btn.textContent = old; }; };
  $s("#fv-list").onclick = () => listDialog(ctx, [cur()], null);
  run("#fv-png", () => downloadPng(ctx, cur()));
  run("#fv-pdf", () => downloadPdf(ctx, cur(), UI.paper));
}

/* a person on the chart: set parent / edit / add to the register */
function openPerson(ctx, b, key, repaint) {
  const { h: u } = ctx, { esc } = u;
  const node = b.L.nodes.find((n) => String(n.p.key) === key); if (!node) return;
  const p = node.p, row = p.row, kids = new Set();
  // everyone below this person can't become their parent
  const walk = (ref) => b.people.forEach((q) => { if (q.parentRef && q.parentRef === ref && !kids.has(q.ref)) { kids.add(q.ref); walk(q.ref); } });
  if (p.ref) walk(p.ref);
  const candidates = b.people.filter((q) => q !== p && !q.virtual && q.ref && !kids.has(q.ref));
  const isOdi = p.role === "ODI" || p.placeholder || p.role === "Spouse";
  const { scrim, close } = u.govModal(p.name, `
    <div class="hint" style="margin-bottom:8px;">${esc(p.role || "Member")}${p.famRep ? " · Family representative" : ""} · ${esc(p.status)} · ${p.virtual ? "named on the household record only" : esc(p.verification) + " verification"}${p.ref && !p.virtual ? " · " + esc(p.ref) : ""}</div>
    ${p.virtual && !p.placeholder ? `<p class="hint">${esc(p.name)} is named on the household record but isn't on the Master Register yet. Add them to place them in the register and set their lineage.</p>` : ""}
    ${row && !isOdi && ctx.canEdit ? `<div class="field"><label for="pp-par">Child of</label><select id="pp-par"><option value="">— the ODI (default) —</option>${candidates.map((q) => `<option value="${esc(q.ref)}"${q.ref === p.parentRef ? " selected" : ""}>${esc(q.name)} · ${esc(q.role || "member")}</option>`).join("")}</select></div>` : ""}
    <div id="pp-msg" class="hint"></div>`,
    `<button class="btn" data-act="close" type="button">Close</button>${row && ctx.canEdit ? '<button class="btn" id="pp-edit" type="button">Edit member</button>' : ""}${p.virtual && !p.placeholder && ctx.canEdit ? '<button class="btn primary" id="pp-add" type="button">Add to the register</button>' : ""}`, 460);
  const $s = (q) => scrim.querySelector(q);
  const par = $s("#pp-par");
  if (par) par.onchange = async () => {
    row[14] = par.value; $s("#pp-msg").textContent = "Saving…";
    try { await ctx.commit("beneficiaries"); close(); repaint(); } catch (e) { $s("#pp-msg").textContent = "Couldn't save: " + ((e && e.message) || e); }
  };
  const ed = $s("#pp-edit"); if (ed) ed.onclick = () => { close(); ctx.editMember(row, repaint); };
  const add = $s("#pp-add");
  if (add) add.onclick = async () => {
    add.disabled = true;
    ctx.register().push([p.ref, p.name, "Unspecified", "", "", b.hh[0], "", "", "Active", "Pending", `Added from the household record on ${new Date().toISOString().slice(0, 10)}.`, p.role || "", "", false, ""]);
    try { await ctx.commit("beneficiaries"); u.toast(`${p.name} added to the register.`); close(); repaint(); } catch (e) { add.disabled = false; $s("#pp-msg").textContent = "Couldn't save: " + ((e && e.message) || e); }
  };
}
