/* CPA360 — Beneficiaries → "Verification report".
   A dated progress report on verifying the Master Beneficiary Register, for the board, the AGM, funders or the
   Department: a dashboard page (headline figures, status split, progress over time, by generation) followed by
   progress per household, data-quality gaps, who was verified in the period, optionally who is still outstanding,
   and a sign-off block. Pure functions (no DOM, no network) so they can be unit-tested; dashboard.js does the
   dialog and the download.
   Register row: [0 ref,1 name,2 gender,3 dob,4 id_masked,5 household,6 contact,7 joined,8 status,9 verification,
                  10 notes,11 role,12 verified_on,13 optout,14 parent_ref]
   Household row: [0 ref,1 family rep,2 odi name,…,17 verification status]
   The base for every percentage is the ACTIVE membership (deceased, removed and transferred members are counted
   separately) — that is who still has to be verified. Dates are ISO yyyy-mm-dd. */

const natCmp = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const fmtPct = (n, d) => `${pct(n, d).toFixed(1).replace(/\.0$/, "")}%`;
const iso = (s) => (/^\d{4}-\d{2}-\d{2}/.test(String(s || "")) ? String(s).slice(0, 10) : "");
const addDays = (d, n) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const mondayOf = (d) => { const x = new Date(d + "T00:00:00Z"); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x.toISOString().slice(0, 10); };
const longDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" }) : "");
const shortDate = (d) => (d ? new Date(d + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "short" }) : "");

export const GEN_LABELS = ["ODI", "1st descendants", "2nd descendants", "3rd descendants", "4th descendants", "5th descendants", "6th descendants"];
/** 0 = ODI, 1–6 = descendant generation, null = not known (family rep without a generation, spouse, unlinked…). */
export function generationOf(r) {
  if (r[11] === "ODI" || /-ODI$/.test(r[0] || "")) return 0;
  const m = /-D(\d+)-\d+$/.exec(r[0] || "") || /^(\d+)(?:st|nd|rd|th) Descendant/.exec(r[11] || "");
  return m ? Math.min(+m[1], 6) : null;
}
const isVer = (r) => r[9] === "Verified";
const isDisp = (r) => r[9] === "Disputed" || r[9] === "Rejected";

/** All the numbers. o: { asAt: "yyyy-mm-dd", from: "yyyy-mm-dd" (start of the reporting period), households: rows } */
export function verificationStats(reg, o = {}) {
  const asAt = iso(o.asAt) || new Date().toISOString().slice(0, 10);
  const from = iso(o.from) || addDays(asAt, -30);
  // a verification dated after the report date is treated as not yet done on that date
  const verOn = (r) => isVer(r) && (!iso(r[12]) || iso(r[12]) <= asAt);
  const all = reg.filter((r) => String(r[1] || "").trim() || r[0]);
  const active = all.filter((r) => (r[8] || "Active") === "Active");
  const c = (arr, f) => arr.filter(f).length;
  const verified = c(active, verOn), disputed = c(active, isDisp), pending = active.length - verified - disputed;

  // progress over time: cumulative verified active members, week by week
  const dated = active.filter((r) => verOn(r) && iso(r[12])).map((r) => iso(r[12])).sort();
  const undated = c(active, (r) => verOn(r) && !iso(r[12]));
  const weeks = [];
  if (dated.length || undated) {
    let wk = mondayOf(dated[0] || asAt), cum = undated, i = 0;
    const last = mondayOf(asAt);
    while (wk <= last) {
      const end = addDays(wk, 6);
      let n = 0;
      while (i < dated.length && dated[i] <= end) { n++; i++; }
      cum += n;
      weeks.push({ week: wk, added: n, cumulative: cum });
      wk = addDays(wk, 7);
    }
  }
  const inPeriod = active.filter((r) => verOn(r) && iso(r[12]) >= from && iso(r[12]) <= asAt)
    .sort((a, b) => natCmp(iso(b[12]), iso(a[12])) || natCmp(a[0], b[0]));
  const last7 = c(active, (r) => verOn(r) && iso(r[12]) > addDays(asAt, -7));

  // by generation
  const gens = GEN_LABELS.map((label, g) => ({ label, g, total: 0, verified: 0 }));
  const genUnknown = { label: "Position not recorded", g: null, total: 0, verified: 0 };
  active.forEach((r) => { const g = generationOf(r); const b = g == null ? genUnknown : gens[g]; b.total++; if (verOn(r)) b.verified++; });
  const byGeneration = [...gens.filter((x) => x.total), ...(genUnknown.total ? [genUnknown] : [])];

  // by household
  const hhName = new Map((o.households || []).map((h) => [h[0], h[2] || ""]));
  const groups = new Map();
  all.forEach((r) => { const k = String(r[5] || "").trim(); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const byHousehold = [...groups.entries()].map(([ref, ms]) => {
    const act = ms.filter((r) => (r[8] || "Active") === "Active");
    const odi = ms.find((r) => generationOf(r) === 0);
    const v = c(act, verOn), d = c(act, isDisp);
    return {
      ref, odi: odi ? odi[1] : hhName.get(ref) || "", members: act.length, verified: v, disputed: d, pending: act.length - v - d,
      deceased: c(ms, (r) => r[8] === "Deceased"), pct: pct(v, act.length),
      state: !act.length ? "No active members" : v === act.length ? "Fully verified" : v ? "In progress" : "Not started",
    };
  }).filter((h) => h.members || h.deceased).sort((a, b) => (!a.ref) - (!b.ref) || natCmp(a.ref, b.ref));
  const linked = byHousehold.filter((h) => h.ref && h.members);
  const hh = { total: linked.length, full: c(linked, (h) => h.state === "Fully verified"), some: c(linked, (h) => h.state === "In progress"), none: c(linked, (h) => h.state === "Not started") };

  // data quality (active members)
  const quality = [
    { label: "No ID number on file", n: c(active, (r) => !/\d{4}\s*$/.test(String(r[4] || ""))) },
    { label: "No date of birth", n: c(active, (r) => !iso(r[3])) },
    { label: "Not linked to an ODI household", n: c(active, (r) => !String(r[5] || "").trim()) },
    { label: "Family position not recorded", n: genUnknown.total },
    { label: "No contact number", n: c(active, (r) => !String(r[6] || "").trim()) },
    { label: "Flagged for follow-up in the notes", n: c(active, (r) => /FLAG/.test(r[10] || "")) },
  ];
  const outstanding = active.filter((r) => !verOn(r)).sort((a, b) => (!String(a[5] || "")) - (!String(b[5] || "")) || natCmp(a[5], b[5]) || natCmp(a[0], b[0]));

  return {
    asAt, from, total: all.length, active: active.length, verified, pending, disputed,
    deceased: c(all, (r) => r[8] === "Deceased"), removed: c(all, (r) => r[8] === "Removed" || r[8] === "Transferred"),
    undated, weeks, inPeriod, last7, byGeneration, byHousehold, hh, quality, outstanding,
  };
}

/* ---------------- charts (inline SVG, print-safe; <title> gives a hover tooltip on screen) ---------------- */
const C = { good: "#0ca30c", warning: "#fab219", critical: "#d03b3b", blue: "#2a78d6", track: "#e8e6e1", grid: "#e4e2dd", ink: "#1a1a1a", muted: "#6b6b6b", surface: "#ffffff" };

/** One 100% bar split into Verified / Pending / Disputed, 2px surface gaps between segments, rounded ends. */
export function statusBarSvg(s, w = 640) {
  const parts = [["Verified", s.verified, C.good], ["Pending", s.pending, C.warning], ["Disputed / rejected", s.disputed, C.critical]].filter((p) => p[1] > 0);
  const tot = s.active || 1, h = 22, gap = 2;
  let x = 0;
  const segs = parts.map(([label, n, col], i) => {
    const wd = Math.max(2, (n / tot) * w - (i < parts.length - 1 ? gap : 0));
    const r = `<rect x="${x.toFixed(1)}" y="0" width="${wd.toFixed(1)}" height="${h}" rx="4" fill="${col}"><title>${esc(label)}: ${n} (${fmtPct(n, tot)})</title></rect>`;
    x += wd + gap;
    return r;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" role="img" aria-label="Verification status of ${s.active} active members">${segs}</svg>`;
}

/** Cumulative verified members per week: a 2px line with 8px markers, recessive grid, the last value labelled. */
export function progressLineSvg(weeks, w = 640, h = 220) {
  if (!weeks.length) return `<p class="muted">No verifications recorded yet.</p>`;
  const pl = 44, pr = 56, pt = 14, pb = 34, iw = w - pl - pr, ih = h - pt - pb;
  const max = Math.max(1, ...weeks.map((p) => p.cumulative));
  const step = niceStep(max), top = Math.ceil(max / step) * step;
  const X = (i) => pl + (weeks.length === 1 ? iw / 2 : (i / (weeks.length - 1)) * iw), Y = (v) => pt + ih - (v / top) * ih;
  let grid = "";
  for (let v = 0; v <= top; v += step) grid += `<line x1="${pl}" x2="${w - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${C.grid}" stroke-width="1"/><text x="${pl - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${v}</text>`;
  const every = Math.max(1, Math.ceil(weeks.length / 8));
  const xl = weeks.map((p, i) => (i % every === 0 || i === weeks.length - 1 ? `<text x="${X(i).toFixed(1)}" y="${h - 12}" text-anchor="middle" class="ax">${esc(shortDate(p.week))}</text>` : "")).join("");
  const path = weeks.map((p, i) => `${i ? "L" : "M"}${X(i).toFixed(1)},${Y(p.cumulative).toFixed(1)}`).join(" ");
  const dots = weeks.map((p, i) => `<circle cx="${X(i).toFixed(1)}" cy="${Y(p.cumulative).toFixed(1)}" r="4" fill="${C.blue}" stroke="${C.surface}" stroke-width="2"><title>Week of ${esc(longDate(p.week))}: ${p.cumulative} verified in total (+${p.added} that week)</title></circle>`).join("");
  const lp = weeks[weeks.length - 1];
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="Cumulative verified members by week">${grid}${xl}
    <line x1="${pl}" x2="${w - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#bdbbb5" stroke-width="1"/>
    <path d="${path}" fill="none" stroke="${C.blue}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}
    <text x="${(X(weeks.length - 1) + 8).toFixed(1)}" y="${(Y(lp.cumulative) + 4).toFixed(1)}" class="lbl">${lp.cumulative}</text></svg>`;
}

/** New verifications per week: thin bars, 4px rounded tops anchored on the baseline. */
export function weeklyBarsSvg(weeks, w = 640, h = 150) {
  if (!weeks.length) return "";
  const pl = 44, pr = 56, pt = 12, pb = 30, iw = w - pl - pr, ih = h - pt - pb;
  const max = Math.max(1, ...weeks.map((p) => p.added)), step = niceStep(max), top = Math.ceil(max / step) * step;
  const bw = Math.max(3, Math.min(28, iw / weeks.length - 4));
  const X = (i) => pl + (i + 0.5) * (iw / weeks.length), Y = (v) => pt + ih - (v / top) * ih;
  let grid = "";
  for (let v = 0; v <= top; v += step) grid += `<line x1="${pl}" x2="${w - pr}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${C.grid}"/><text x="${pl - 6}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" class="ax">${v}</text>`;
  const every = Math.max(1, Math.ceil(weeks.length / 8));
  const bars = weeks.map((p, i) => {
    const y = Y(p.added), hh = Y(0) - y;
    const shape = p.added ? `<path d="M${(X(i) - bw / 2).toFixed(1)},${Y(0)} V${(y + 4).toFixed(1)} q0,-4 4,-4 H${(X(i) + bw / 2 - 4).toFixed(1)} q4,0 4,4 V${Y(0)} Z" fill="${C.blue}"/>` : "";
    return `<g>${hh > 0 ? shape : ""}<rect x="${(X(i) - iw / weeks.length / 2).toFixed(1)}" y="${pt}" width="${(iw / weeks.length).toFixed(1)}" height="${ih}" fill="transparent"><title>Week of ${esc(longDate(p.week))}: ${p.added} verified</title></rect>${i % every === 0 || i === weeks.length - 1 ? `<text x="${X(i).toFixed(1)}" y="${h - 10}" text-anchor="middle" class="ax">${esc(shortDate(p.week))}</text>` : ""}</g>`;
  }).join("");
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" width="100%" role="img" aria-label="New verifications per week">${grid}<line x1="${pl}" x2="${w - pr}" y1="${Y(0)}" y2="${Y(0)}" stroke="#bdbbb5"/>${bars}</svg>`;
}
function niceStep(max) {
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw || 1)), n = raw / p;
  return Math.max(1, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p);
}
/** A progress bar for a table cell. */
export const progressBar = (n, d) => `<div class="pb" title="${n} of ${d} verified (${fmtPct(n, d)})"><span style="width:${d ? Math.max(n ? 2 : 0, (n / d) * 100).toFixed(1) : 0}%"></span></div>`;

/* ---------------- the document ---------------- */
/** o: { cpa:{name, reg, region, logoDataUrl, brandPrimary, brandSecondary}, asAt, from, mode: "print"|"word",
 *       outstanding: bool, signers:{chair, secretary}, docNo } */
export function verificationReportHtml(s, o = {}) {
  const cpa = o.cpa || {}, word = o.mode === "word";
  const primary = cpa.brandPrimary || "#1c3a68", secondary = cpa.brandSecondary || "#2f7d4f";
  const cssStr = (t) => String(t).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const title = "Beneficiary Verification Report";
  const tile = (label, value, sub, tone) => `<td class="tile"><div class="tl">${esc(label)}</div><div class="tv${tone ? " " + tone : ""}">${esc(value)}</div>${sub ? `<div class="ts">${esc(sub)}</div>` : ""}</td>`;
  const legend = [["Verified", s.verified, C.good, "✓"], ["Pending", s.pending, C.warning, "…"], ["Disputed / rejected", s.disputed, C.critical, "!"]]
    .map(([l, n, col, ic]) => `<span class="lg"><i style="background:${col}"></i><b>${ic}</b> ${esc(l)} <span class="num">${n.toLocaleString("en-ZA")}</span> <span class="muted">(${fmtPct(n, s.active)})</span></span>`).join("");
  const genRows = s.byGeneration.map((g) => `<tr><td>${esc(g.label)}</td><td class="r">${g.total}</td><td class="r">${g.verified}</td><td class="bar">${progressBar(g.verified, g.total)}</td><td class="r">${fmtPct(g.verified, g.total)}</td></tr>`).join("");
  const hhRows = s.byHousehold.map((h, i) => `<tr class="${h.state === "Fully verified" ? "done" : ""}"><td class="r">${i + 1}</td><td class="mono">${esc(h.ref || "—")}</td><td>${esc(h.ref ? h.odi : "Not linked to an ODI household")}</td>
    <td class="r">${h.members}</td><td class="r">${h.verified}</td><td class="r">${h.pending}</td><td class="r">${h.disputed || ""}</td><td class="bar">${progressBar(h.verified, h.members)}</td><td class="r">${h.members ? fmtPct(h.verified, h.members) : "—"}</td><td>${esc(h.state)}</td></tr>`).join("");
  const qRows = s.quality.map((q) => `<tr><td>${esc(q.label)}</td><td class="r">${q.n.toLocaleString("en-ZA")}</td><td class="r muted">${fmtPct(q.n, s.active)}</td></tr>`).join("");
  const recent = s.inPeriod.map((r, i) => `<tr><td class="r">${i + 1}</td><td class="mono">${esc(r[0])}</td><td>${esc(r[1])}</td><td class="mono">${esc(r[5] || "—")}</td><td>${esc(r[11] || "")}</td><td>${esc(longDate(iso(r[12])))}</td></tr>`).join("");
  const outRows = o.outstanding ? s.outstanding.map((r, i) => `<tr><td class="r">${i + 1}</td><td class="mono">${esc(r[0])}</td><td>${esc(r[1])}</td><td class="mono">${esc(r[5] || "—")}</td><td>${esc(r[11] || "")}</td><td>${esc(r[9] || "Pending")}</td></tr>`).join("") : "";
  const pace = s.weeks.length >= 2 ? Math.round(s.weeks.slice(-4).reduce((a, w) => a + w.added, 0) / Math.min(4, s.weeks.length)) : 0;
  const left = s.active - s.verified;
  const eta = pace > 0 ? Math.ceil(left / pace) : null;
  const css = `
    ${word ? "@page Section1{size:595.3pt 841.9pt;margin:40pt 36pt;} div.Section1{page:Section1;}"
      : `@page{size:A4;margin:15mm 13mm 17mm;
          @top-left{content:"${cssStr(title)}";font:8pt Calibri,Arial,sans-serif;color:#666;}
          @top-right{content:"${cssStr(cpa.name || "")}";font:8pt Calibri,Arial,sans-serif;color:#666;}
          @bottom-left{content:"${cssStr(o.docNo || "")}";font:8pt Calibri,Arial,sans-serif;color:#666;}
          @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Calibri,Arial,sans-serif;color:#666;}}`}
    body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:${C.ink};font-size:10pt;margin:0;background:#fff;}
    .bar-top{position:sticky;top:0;background:#14203a;color:#fff;padding:9px 14px;font-size:12px;display:flex;gap:12px;align-items:center;z-index:9;}
    .bar-top button{background:#b98a2e;color:#fff;border:0;border-radius:7px;padding:7px 14px;font-weight:700;cursor:pointer;}
    @media print{.bar-top{display:none}}
    .wrap{max-width:780px;margin:0 auto;padding:${word ? "0" : "18px 16px 40px"};}
    .hdr{border-bottom:3pt solid ${primary};padding-bottom:8pt;margin-bottom:12pt;} .hdr table{width:100%;border:0;} .hdr td{border:0;padding:0;vertical-align:middle;}
    .org{font-size:9pt;letter-spacing:1.4pt;text-transform:uppercase;color:${secondary};font-weight:bold;}
    h1{font-size:21pt;margin:2pt 0 0;color:${primary};} .sub{font-size:10.5pt;color:#444;margin-top:2pt;}
    h2{font-size:12pt;color:${primary};border-bottom:1pt solid #d9d6cf;padding-bottom:3pt;margin:16pt 0 7pt;}
    h3{font-size:10pt;margin:10pt 0 4pt;color:#333;}
    table{border-collapse:collapse;width:100%;}
    table.tiles{border-collapse:separate;border-spacing:6pt 0;margin:0 -6pt;} .tile{border:.75pt solid #d9d6cf;border-radius:6pt;padding:7pt 9pt;vertical-align:top;width:25%;}
    .tl{font-size:8.5pt;color:${C.muted};text-transform:uppercase;letter-spacing:.5pt;} .tv{font-size:20pt;font-weight:bold;margin-top:2pt;font-variant-numeric:tabular-nums;} .tv.good{color:#006300;} .ts{font-size:8.5pt;color:${C.muted};margin-top:1pt;}
    .lgs{margin:6pt 0 2pt;font-size:9pt;} .lg{display:inline-block;margin-right:14pt;} .lg i{display:inline-block;width:9pt;height:9pt;border-radius:2pt;margin-right:3pt;vertical-align:-1pt;} .lg b{font-size:8pt;color:#555;}
    .chart text.ax{font-size:10px;fill:${C.muted};} .chart text.lbl{font-size:11px;font-weight:bold;fill:${C.ink};}
    table.t{font-size:8.6pt;} table.t th{text-align:left;font-weight:bold;color:#444;border-bottom:1pt solid #bdbbb5;padding:3pt 4pt;background:#f4f3f0;} table.t td{border-bottom:.5pt solid #e4e2dd;padding:2.5pt 4pt;vertical-align:middle;}
    table.t tr.done td{background:#f1f8f1;} .r{text-align:right;font-variant-numeric:tabular-nums;} .mono{font-family:Consolas,monospace;font-size:8pt;} .muted{color:${C.muted};}
    td.bar{width:110pt;} .pb{height:7pt;background:${C.track};border-radius:4pt;overflow:hidden;} .pb span{display:block;height:100%;background:${C.blue};border-radius:4pt;}
    thead{display:table-header-group;} tr{page-break-inside:avoid;break-inside:avoid;}
    .note{font-size:9pt;color:#444;background:#f7f6f3;border-left:3pt solid ${primary};padding:6pt 9pt;margin:8pt 0;}
    .pg{page-break-before:always;break-before:page;}
    .sig{width:100%;margin-top:26pt;} .sig td{border:0;width:50%;padding-right:18pt;height:60pt;vertical-align:bottom;} .sigline{border-top:.75pt solid #333;padding-top:3pt;font-size:9pt;}
    .fine{font-size:8pt;color:${C.muted};margin-top:12pt;}`;
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(cpa.name || "")}</title><style>${css}</style></head><body>
  ${word ? "" : `<div class="bar-top"><button onclick="window.print()">Print / Save as PDF</button><span>A4 portrait · choose “Save as PDF” as the printer · turn off the browser's own headers and footers</span></div>`}
  <div class="${word ? "Section1" : "wrap"}">
  <div class="hdr"><table><tr>${cpa.logoDataUrl ? `<td style="width:64pt;"><img src="${cpa.logoDataUrl}" alt="" height="50" style="height:50px;"></td>` : ""}<td>
    <div class="org">${esc(cpa.name || "")}${cpa.reg ? " · Registration no. " + esc(cpa.reg) : ""}</div>
    <h1>${esc(title)}</h1>
    <div class="sub">Progress in verifying the Master Beneficiary Register — as at ${esc(longDate(s.asAt))} · reporting period ${esc(longDate(s.from))} to ${esc(longDate(s.asAt))}</div></td>
    <td style="text-align:right;width:150pt;font-size:9pt;color:#333;">${o.docNo ? `Report no.<br><b>${esc(o.docNo)}</b>` : ""}${cpa.region ? `<br>${esc(cpa.region)}` : ""}</td></tr></table></div>

  <h2>Dashboard</h2>
  <table class="tiles"><tr>
    ${tile("Verified", fmtPct(s.verified, s.active), `${s.verified.toLocaleString("en-ZA")} of ${s.active.toLocaleString("en-ZA")} active members`, "good")}
    ${tile("Still to verify", left.toLocaleString("en-ZA"), `${s.pending.toLocaleString("en-ZA")} pending · ${s.disputed} disputed / rejected`)}
    ${tile("Verified in the period", s.inPeriod.length.toLocaleString("en-ZA"), `${s.last7} in the last 7 days`)}
    ${tile("Households fully verified", `${s.hh.full} of ${s.hh.total}`, `${s.hh.some} in progress · ${s.hh.none} not started`)}
  </tr></table>
  <h3>Verification status of active members</h3>
  ${statusBarSvg(s)}
  <div class="lgs">${legend}</div>
  <div class="note">${pace ? `At the recent pace of about <b>${pace}</b> verification${pace === 1 ? "" : "s"} a week, the remaining <b>${left.toLocaleString("en-ZA")}</b> active members would take roughly <b>${eta} week${eta === 1 ? "" : "s"}</b>.` : `Verification has not yet built a weekly pace to project from.`}
    The register also holds ${s.deceased} deceased and ${s.removed} removed or transferred member${s.removed === 1 ? "" : "s"}, who are not counted above.</div>

  <h3>Progress over time — total verified, week by week</h3>
  ${progressLineSvg(s.weeks)}
  ${s.undated ? `<p class="fine">${s.undated} member${s.undated === 1 ? " was" : "s were"} verified before verification dates were recorded and ${s.undated === 1 ? "is" : "are"} counted from the first week.</p>` : ""}
  <h3>New verifications per week</h3>
  ${weeklyBarsSvg(s.weeks)}

  <h3>Progress by generation</h3>
  <table class="t"><thead><tr><th>Generation</th><th class="r">Active members</th><th class="r">Verified</th><th>Progress</th><th class="r">%</th></tr></thead><tbody>${genRows}</tbody></table>

  <h2 class="pg">Progress by household</h2>
  <p class="muted" style="font-size:9pt;margin:0 0 6pt;">${s.hh.full} fully verified · ${s.hh.some} in progress · ${s.hh.none} not started. Shaded rows are fully verified.</p>
  <table class="t"><thead><tr><th class="r">No.</th><th>Household</th><th>ODI</th><th class="r">Members</th><th class="r">Verified</th><th class="r">Pending</th><th class="r">Disputed</th><th>Progress</th><th class="r">%</th><th>Status</th></tr></thead><tbody>${hhRows}</tbody></table>

  <h2>Data quality — what is holding verification back</h2>
  <table class="t"><thead><tr><th>Active members with…</th><th class="r">Members</th><th class="r">Share</th></tr></thead><tbody>${qRows}</tbody></table>

  <h2>Verified in the reporting period (${s.inPeriod.length})</h2>
  ${s.inPeriod.length ? `<table class="t"><thead><tr><th class="r">No.</th><th>Member no.</th><th>Name</th><th>Household</th><th>Family position</th><th>Verified on</th></tr></thead><tbody>${recent}</tbody></table>` : `<p class="muted">Nobody was verified between ${esc(longDate(s.from))} and ${esc(longDate(s.asAt))}.</p>`}

  ${o.outstanding ? `<h2 class="pg">Still to verify (${s.outstanding.length})</h2>
  <table class="t"><thead><tr><th class="r">No.</th><th>Member no.</th><th>Name</th><th>Household</th><th>Family position</th><th>Verification</th></tr></thead><tbody>${outRows}</tbody></table>` : ""}

  <h2${o.outstanding ? "" : ' class="pg"'}>Sign-off</h2>
  <p>This report was prepared from ${esc(cpa.name || "the association")}'s Master Beneficiary Register as at ${esc(longDate(s.asAt))}. Percentages are of active members; a household counts as fully verified when every active member in it is verified.</p>
  <table class="sig"><tr><td><div class="sigline"><b>Prepared by</b><br>Name and date</div></td><td><div class="sigline"><b>Chairperson</b><br>${esc((o.signers || {}).chair || "")}<br>Date</div></td></tr>
    <tr><td><div class="sigline"><b>Verification committee / Secretary</b><br>${esc((o.signers || {}).secretary || "")}<br>Date</div></td><td></td></tr></table>
  <p class="fine">${o.docNo ? `Report no. ${esc(o.docNo)} · ` : ""}generated ${esc(new Date().toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" }))} from CPA360™ records. ID numbers are not shown in this report.</p>
  </div></body></html>`;
}

/** Spreadsheet: progress per household (+ a totals row), the figures most often re-used in other documents. */
export function verificationCsv(s) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const head = ["No.", "Household", "ODI", "Active members", "Verified", "Pending", "Disputed / rejected", "Deceased", "% verified", "Status"];
  const rows = s.byHousehold.map((h, i) => [i + 1, h.ref || "(not linked)", h.odi, h.members, h.verified, h.pending, h.disputed, h.deceased, pct(h.verified, h.members), h.state]);
  rows.push(["", "TOTAL", "", s.active, s.verified, s.pending, s.disputed, s.deceased, pct(s.verified, s.active), `as at ${s.asAt}`]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(",")).join("\r\n");
}
