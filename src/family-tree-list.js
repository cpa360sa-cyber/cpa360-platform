/* CPA360 — Family Trees → "Export as a list".
   The same list the Beneficiary Master Register exports, but arranged by household: every household's name
   is printed on its own banner AND repeated on every row (so a sorted or filtered spreadsheet never loses it), and
   inside each household people follow the family tree — ODI and spouse first, then each person's children beneath them.
   Pure functions (no DOM, no network) so they can be unit-tested; family-trees.js does the dialog and the download.
   Columns = every column of the Master Register export (No., Member no., Full name, Gender, ID masked, Date of birth,
   Household, ODI, Family position, Contact, Date joined, Status, Verification, Date verified) plus the tree's own
   Household name, Generation, Child of and "On the register". ID numbers stay masked (last 4 digits), as on the register. */

const natCmp = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });

/** Everyone in a household in family-tree reading order: ODI, spouse(s), then each person followed by their own descendants,
 *  then the "extended family" band. Every person appears exactly once (cycles and strangers fall back to the end). */
export function listOrder(L) {
  const nodes = L.nodes.filter((n) => !n.p.placeholder);
  const root = L.nodes.find((n) => n.p.key === L.rootKey);
  const byRef = new Map(L.nodes.filter((n) => n.p.ref).map((n) => [n.p.ref, n]));
  const kids = new Map();
  L.nodes.forEach((n) => {
    if (n === root || n.spouse || n.ext) return;
    let par = n.p.parentRef ? byRef.get(n.p.parentRef) : null;
    if (!par || par === n) par = root;
    if (!kids.has(par)) kids.set(par, []);
    kids.get(par).push(n);
  });
  kids.forEach((arr) => arr.sort((a, b) => a.x - b.x));
  const out = [], seen = new Set();
  const add = (n) => { if (!n || seen.has(n)) return false; seen.add(n); if (!n.p.placeholder) out.push(n); return true; };
  const walk = (n) => (kids.get(n) || []).forEach((c) => { if (add(c)) walk(c); });
  if (root) { add(root); L.nodes.filter((n) => n.spouse).sort((a, b) => a.x - b.x).forEach(add); walk(root); }
  L.nodes.filter((n) => n.ext).sort((a, b) => a.y - b.y || a.x - b.x).forEach(add);
  nodes.forEach(add);                                              // anything a cycle left behind
  return out;
}

/** builds: [{hh, people, L, odi, title}] (see family-trees.js build()).
 *  o: { fmtDay?, order: "name"|"ref", members: "all"|"active"|"verified", virtual: bool }
 *  → groups: [{ ref, name, odi, rows:[record], stats }] — records are flat, ready for any output format. */
export function listGroups(builds, o = {}) {
  const fmt = o.fmtDay || ((s) => (s ? String(s).slice(0, 10) : ""));
  const keep = (n) => {
    const p = n.p;
    if (p.virtual && o.virtual === false) return false;
    if (o.members === "active") return p.status === "Active";
    if (o.members === "verified") return p.verification === "Verified";
    return true;
  };
  const groups = builds.map((b) => {
    const nameOf = new Map(b.L.nodes.filter((n) => n.p.ref).map((n) => [n.p.ref, n.p.name]));
    const hhRef = String(b.hh[0] || ""), odi = b.odi || "";
    const rows = listOrder(b.L).filter(keep).map((n) => {
      const p = n.p, r = p.row || [];
      return {
        hhRef, hhName: b.title, odi,
        ref: p.virtual ? "" : p.ref, name: p.name, gender: p.gender || "", idm: p.idm || "", dob: fmt(p.dob),
        role: p.role || (p.famRep ? "Family Representative" : ""), generation: n.ext ? "" : String(n.gen + 1),
        parentName: p.parentRef ? nameOf.get(p.parentRef) || "" : "", contact: r[6] || "", joined: fmt(r[7]),
        status: p.status || "", verification: p.virtual ? "" : p.verification || "", verifiedOn: fmt(r[12]),
        onRegister: p.virtual ? "No — named on the household record only" : "Yes",
      };
    });
    const c = (f) => rows.filter(f).length;
    return {
      ref: hhRef, name: b.title, odi, rows,
      stats: { members: rows.length, verified: c((x) => x.verification === "Verified"), pending: c((x) => x.verification !== "Verified" && x.status !== "Deceased" && x.onRegister === "Yes"),
        deceased: c((x) => x.status === "Deceased"), notOnRegister: c((x) => x.onRegister !== "Yes"), female: c((x) => /^f/i.test(x.gender)), male: c((x) => /^m/i.test(x.gender)) },
    };
  }).filter((g) => g.rows.length);
  groups.sort((a, b) => (o.order === "ref" ? natCmp(a.ref, b.ref) : natCmp(a.name, b.name) || natCmp(a.odi, b.odi)) || natCmp(a.ref, b.ref));
  return groups;
}

export function listTotals(groups) {
  const t = { households: groups.length, members: 0, verified: 0, pending: 0, deceased: 0, notOnRegister: 0, female: 0, male: 0 };
  groups.forEach((g) => Object.keys(g.stats).forEach((k) => { t[k] += g.stats[k]; }));
  return t;
}

/** The columns, in order. `get(rec, n)` — n is the running number across the whole list. */
export function listColumns(o = {}) {
  const cols = [
    ["No.", (r, n) => String(n)], ["Household no.", (r) => r.hhRef], ["Household name", (r) => r.hhName], ["ODI", (r) => r.odi],
    ["Member no.", (r) => r.ref], ["Full name", (r) => r.name], ["Family position", (r) => r.role], ["Generation", (r) => r.generation], ["Child of", (r) => r.parentName],
    ["Gender", (r) => r.gender],
  ];
  if (o.ids !== false) cols.push(["ID number (masked)", (r) => r.idm]);
  cols.push(["Date of birth", (r) => r.dob], ["Contact", (r) => r.contact], ["Date joined", (r) => r.joined], ["Status", (r) => r.status],
    ["Verification", (r) => r.verification], ["Date verified", (r) => r.verifiedOn], ["On the register", (r) => r.onRegister]);
  return cols;
}

export function listCsv(groups, o = {}) {
  const cols = listColumns(o), q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.map((c) => q(c[0])).join(",")];
  let n = 0;
  groups.forEach((g) => g.rows.forEach((r) => { n++; lines.push(cols.map((c) => q(c[1](r, n))).join(",")); }));
  return "﻿" + lines.join("\r\n");
}

function fnv1a(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h >>> 0; }
export function listDocNo(groups, asAt, reg) {
  const sig = groups.map((g) => g.ref + ":" + g.rows.map((r) => [r.ref, r.name, r.idm, r.status, r.verification].join("~")).join("|")).join("\n") + "|" + (reg || "") + "|" + asAt;
  return `FTL-${asAt.replace(/-/g, "")}-${fnv1a(sig).toString(36).toUpperCase().padStart(7, "0").slice(0, 7)}`;
}

/** A printable document (PDF via the browser's print dialog) or a Word file.
 *  o: { cpa:{name,reg,region,logoDataUrl,brandPrimary,brandSecondary}, mode:"print"|"word", asAt:"YYYY-MM-DD", ids, scopeNote, esc } */
export function listHtml(groups, o) {
  const esc = o.esc || ((s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
  const cpa = o.cpa || {}, word = o.mode === "word", cols = listColumns(o), t = listTotals(groups);
  const primary = cpa.brandPrimary || "#1c3a68", secondary = cpa.brandSecondary || "#2f7d4f";
  const no = listDocNo(groups, o.asAt, cpa.reg);
  const title = "Family Tree List — by Household";
  const asAtLong = new Date(o.asAt + "T00:00:00").toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" });
  const cssStr = (s) => String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const logo = cpa.logoDataUrl ? `<img src="${esc(cpa.logoDataUrl)}" alt="" height="54" style="height:54px;">` : "";
  const css = `
    ${word ? "@page Section1{size:841.9pt 595.3pt;mso-page-orientation:landscape;margin:36pt 30pt 36pt 30pt;} div.Section1{page:Section1;}"
      : `@page{size:A4 landscape;margin:15mm 10mm 17mm;
          @top-left{content:"${cssStr(title)}";font:8pt Calibri,Arial,sans-serif;color:#666;}
          @top-right{content:"${cssStr(cpa.name || "")}${cpa.reg ? " · " + cssStr(cpa.reg) : ""}";font:8pt Calibri,Arial,sans-serif;color:#666;}
          @bottom-left{content:"Document no. ${cssStr(no)}";font:8pt Calibri,Arial,sans-serif;color:#666;}
          @bottom-right{content:"Page " counter(page) " of " counter(pages);font:8pt Calibri,Arial,sans-serif;color:#666;}}`}
    body{font-family:Calibri,'Segoe UI',Arial,sans-serif;color:#1a1a1a;font-size:10pt;margin:0;}
    .bar{position:sticky;top:0;background:#14203a;color:#fff;padding:9px 14px;font-size:12px;display:flex;gap:12px;align-items:center;z-index:9;}
    .bar button{background:#b98a2e;color:#fff;border:0;border-radius:7px;padding:7px 14px;font-weight:700;cursor:pointer;}
    @media print{.bar{display:none}}
    .hdr{border-bottom:3pt solid ${primary};padding-bottom:8pt;margin-bottom:10pt;} .hdr table{border:0;width:100%;} .hdr td{border:0;padding:0;vertical-align:middle;}
    .org{font-size:9pt;letter-spacing:1.4pt;text-transform:uppercase;color:${secondary};font-weight:bold;}
    h1{font-size:22pt;margin:2pt 0 0;color:${primary};font-weight:bold;} .sub{font-size:10.5pt;color:#444;margin:2pt 0 0;} .meta{font-size:9pt;color:#333;}
    h2{font-size:11pt;color:#fff;background:${primary};padding:3pt 8pt;margin:12pt 0 5pt;}
    table{border-collapse:collapse;width:100%;}
    .sum td{border:.5pt solid #b5b5b5;padding:3pt 7pt;font-size:9.5pt;} .sum .k{width:22%;background:#eef2f7;font-weight:bold;color:${primary};} .sum .v{width:11%;text-align:right;}
    table.reg{font-size:7.4pt;margin-top:4pt;}
    table.reg th{background:${primary};color:#fff;padding:3pt 4pt;text-align:left;border:.5pt solid ${primary};}
    table.reg td{border:.5pt solid #bdbdbd;padding:2pt 4pt;vertical-align:top;}
    table.reg td.hhb{background:${secondary};color:#fff;font-size:9pt;font-weight:bold;padding:4pt 6pt;border-color:${secondary};}
    table.reg td.hhb span{font-weight:normal;font-size:8pt;opacity:.92;margin-left:8pt;}
    table.reg tr.p:nth-child(even) td{background:#f6f8fb;} table.reg tr.nr td{font-style:italic;color:#555;}
    thead{display:table-header-group;} tr{page-break-inside:avoid;break-inside:avoid;} tr.hh{page-break-after:avoid;break-after:avoid;}
    .fine{font-size:8pt;color:#666;margin-top:10pt;}
    .cert{page-break-before:always;break-before:page;} .cert p{font-size:10.5pt;line-height:1.5;margin:6pt 0;}
    .sig{width:100%;margin-top:18pt;} .sig td{border:0;width:50%;padding:0 18pt 0 0;vertical-align:bottom;height:64pt;}
    .sigline{border-top:.75pt solid #333;padding-top:3pt;font-size:9pt;} .sigline b{font-size:9.5pt;}
    .stamp{border:1pt dashed #888;width:120pt;height:90pt;text-align:center;color:#999;font-size:8.5pt;padding-top:36pt;}
    .box td{border:.5pt solid #999;padding:6pt 8pt;font-size:9.5pt;height:24pt;}`;
  const head = cols.map((c) => `<th>${esc(c[0])}</th>`).join("");
  let n = 0;
  const body = groups.map((g) => {
    const s = g.stats;
    const banner = `<tr class="hh"><td class="hhb" colspan="${cols.length}">Household ${esc(g.ref)} — ${esc(g.name)}<span>ODI: ${esc(g.odi || "not recorded")} · ${s.members} member${s.members === 1 ? "" : "s"} · ${s.verified} verified${s.deceased ? ` · ${s.deceased} deceased` : ""}${s.notOnRegister ? ` · ${s.notOnRegister} not yet on the register` : ""}</span></td></tr>`;
    return banner + g.rows.map((r) => { n++; return `<tr class="p${r.onRegister === "Yes" ? "" : " nr"}">${cols.map((c) => `<td>${esc(c[1](r, n))}</td>`).join("")}</tr>`; }).join("");
  }).join("");
  const stat = (k, v) => `<td class="k">${esc(k)}</td><td class="v">${esc(v)}</td>`;
  /* certification page — same wording and layout as the Beneficiary Master Register's; o.cert = { chairName, secName, chairSig, secSig, apply, date } or falsy for none */
  const c = o.cert;
  const sigCell = (label, nm, img) => `<td>${c && c.apply && img ? `<img src="${esc(img)}" height="46" alt="" style="height:46px;">` : '<div style="height:46px"></div>'}<div class="sigline"><b>${esc(label)}</b><br>${esc(nm || "")}<br>Date: ${c && c.apply && img ? esc(c.date || "") : "________________"}</div></td>`;
  const certHtml = !c ? "" : `<div class="cert">
    <div class="hdr"><div class="org">${esc(cpa.name || "")}${cpa.reg ? " · " + esc(cpa.reg) : ""}</div><h1 style="font-size:17pt;">Certification of the ${esc(title)}</h1></div>
    <p>We, the undersigned office bearers of <b>${esc(cpa.name || "the association")}</b>${cpa.reg ? ` (registration no. ${esc(cpa.reg)})` : ""}, certify that this ${esc(title)} (document no. <b>${esc(no)}</b>) has been extracted from the association's household and membership records, lists <b>${t.members}</b> ${t.members === 1 ? "person" : "people"} in <b>${t.households}</b> household${t.households === 1 ? "" : "s"} as at <b>${esc(asAtLong)}</b> — of whom <b>${t.verified}</b> ${t.verified === 1 ? "has" : "have"} been verified by the association${t.notOnRegister ? `, and <b>${t.notOnRegister}</b> ${t.notOnRegister === 1 ? "is" : "are"} named on a household record but not yet entered in the Master Register` : ""} — and is a true and accurate record to the best of our knowledge.</p>
    <p>Identity numbers are shown masked (last four digits), as held on the association's register. The full register, with supporting identity documents, is available from the association's records on request.</p>
    <table class="sig"><tr>${sigCell("Chairperson", c.chairName, c.chairSig)}${sigCell("Secretary", c.secName, c.secSig)}</tr></table>
    <table style="width:100%;margin-top:14pt;"><tr><td style="border:0;vertical-align:top;"><div class="stamp">Official stamp<br>of the Association</div></td>
      <td style="border:0;vertical-align:top;padding-left:20pt;"><table class="box"><tr><td style="width:40%;"><b>Date of the AGM at which the list was presented</b></td><td>&nbsp;</td></tr>
        <tr><td><b>For official use — reference no.</b></td><td>&nbsp;</td></tr><tr><td><b>Date received / received by</b></td><td>&nbsp;</td></tr></table></td></tr></table>
    <p class="fine">Document no. ${esc(no)} · ${t.members} record${t.members === 1 ? "" : "s"} · generated ${esc(new Date().toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" }))} from ${esc(cpa.name || "the CPA")}'s CPA360™ records. The document number changes if any member's name, ID, household, status or verification in this list changes, so a printed copy can be compared with the live records.</p>
  </div>`;
  return `<!DOCTYPE html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)} — ${esc(cpa.name || "")}</title>
  <style>${css}</style></head><body>
  ${word ? "" : `<div class="bar"><button onclick="window.print()">Print / Save as PDF</button><span>${t.members} people in ${t.households} household${t.households === 1 ? "" : "s"} · A4 landscape · choose “Save as PDF” as the printer · header and footer are built in — turn off the browser's own Headers and footers</span></div>`}
  <div class="${word ? "Section1" : ""}">
  <div class="hdr"><table><tr><td style="width:70pt;">${logo}</td><td>
    <div class="org">${esc(cpa.name || "")}${cpa.reg ? " · Registration no. " + esc(cpa.reg) : ""}</div>
    <h1>${esc(title)}</h1>
    <div class="sub">Every household with its family — as at ${esc(asAtLong)}${o.scopeNote ? " · " + esc(o.scopeNote) : ""}</div></td>
    <td style="text-align:right;width:190pt;" class="meta">Document no.<br><b>${esc(no)}</b>${cpa.region ? `<br>${esc(cpa.region)}` : ""}</td></tr></table></div>
  <h2>Summary</h2>
  <table class="sum"><tr>${stat("Households", t.households)}${stat("Verified", t.verified)}${stat("Female", t.female)}</tr><tr>${stat("People listed", t.members)}${stat("Awaiting verification", t.pending)}${stat("Male", t.male)}</tr><tr>${stat("Deceased", t.deceased)}${stat("Not yet on the register", t.notOnRegister)}<td class="k"></td><td class="v"></td></tr></table>
  <h2>Households and their families</h2>
  <table class="reg"><thead><tr>${head}</tr></thead><tbody>${body || `<tr><td colspan="${cols.length}">No households match the chosen scope.</td></tr>`}</tbody></table>
  <p class="fine">Document no. ${esc(no)} · ${t.members} record${t.members === 1 ? "" : "s"} in ${t.households} household${t.households === 1 ? "" : "s"} · generated ${esc(new Date().toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "short" }))} from ${esc(cpa.name || "the CPA")}'s CPA360™ records. Identity numbers are shown masked (last four digits), as held on the register. People marked “No” under “On the register” are named on the household record but are not yet in the Master Register.</p>
  ${certHtml}</div></body></html>`;
}
