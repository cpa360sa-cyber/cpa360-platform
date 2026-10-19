/* CPA360 — Import new family trees / household registers (Beneficiaries → Households → "Import family trees").
   Upload a PDF (typed or scanned), spreadsheet (.xlsx / .csv) or a photo of a printed register. The table in it is
   read, lined up with the Households columns automatically, and shown for you to adjust ("match accordingly"):
   every Households column has a drop-down listing the columns found in the file, with sample values beside it.
   Then each household is checked against the ones already on the platform before anything is added.

   · Digital PDFs are read in the browser (pdf-table.js) — no upload, no AI, no cost.
   · Scanned PDFs / photos need the AI reader (the scan-family-tree function in "table" mode).
   · Nothing is saved until the final "Import" — duplicates default to Skip, uncertain ones block the button
     until someone decides, and only the last 4 digits of any ID are kept (the platform's masking rule). */
import * as repo from "./repo.js";
import { readPdf, itemsToTable } from "./pdf-table.js";
import { matchColumns, detectHeaderRow, buildValues, analyseHouseholds, mergeHousehold } from "./household-import-logic.js";
import { householdSlots, findRegisterMatch, last4 } from "./family-tree-logic.js";

const LETTERS = (i) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const GROUPS = [
  ["Household", ["ref", "status", "resident"]],
  ["ODI & family representative", ["odi", "odiId", "famrep"]],
  ["Descendants", ["d1", "d1id", "d2", "d2id", "d3", "d3id", "d4", "d4id", "d5", "d5id", "d6", "d6id", "d7", "d7id"]],
];

export function openHouseholdImport(ctx) {
  const { h: u } = ctx, { esc } = u;
  const targets = [...ctx.targets, { k: "descList", label: "All descendants in ONE column (split automatically)" }];
  const T = Object.fromEntries(targets.map((t) => [t.k, t]));
  const keys = targets.map((t) => t.k);
  const S = { table: [], name: "", headerRow: 0, map: {}, conf: {}, rows: [], logConflicts: true, extract: true, busy: false, quality: 1, pdfData: null };
  const { scrim, close } = u.govModal("Import family trees / household register", `<div id="hi-body"></div>`,
    `<span id="hi-foot" class="hint" style="margin-right:auto;"></span><button class="btn" data-act="close" type="button">Cancel</button><button class="btn" id="hi-back" type="button" hidden>&lsaquo; Back</button><button class="btn primary" id="hi-next" type="button" disabled>Continue</button>`, 1080);
  const $s = (q) => scrim.querySelector(q);
  const body = () => $s("#hi-body");
  let stage = "pick";

  /* ------------------------------------------------------------------ stage 1: pick a file --- */
  function paintPick(msg) {
    stage = "pick";
    $s("#hi-back").hidden = true; $s("#hi-next").hidden = true; $s("#hi-foot").textContent = "";
    body().innerHTML = `
      <p class="hint" style="margin:0 0 10px;">Upload a <b>PDF</b> (a household register or family-tree list), an <b>Excel / CSV</b> sheet, or a <b>photo</b> of a printed register. Its columns are lined up with the Households columns for you, and you can change any match before importing.</p>
      <label class="hi-drop" id="hi-drop"><b>Choose a file</b> or drop it here<br><span class="hint">PDF · .xlsx · .csv · JPG/PNG</span>
        <input type="file" id="hi-file" accept=".pdf,application/pdf,.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,image/*" hidden></label>
      <div id="hi-msg" class="hint" role="status" style="margin-top:10px;">${msg || ""}</div>
      <details style="margin-top:12px;"><summary style="cursor:pointer;font-size:12.5px;">What does a good file look like?</summary>
        <p class="hint">One row per household, with columns such as <i>Household No · ODI Name · ODI ID · Family Representative · 1st Descendant · ID · 2nd Descendant · …</i> (up to 7 descendants). The wording doesn't have to match — the next step lets you point each column at the right place. A cell like “Nomsa Khumalo 6003041082087” is split into name and ID automatically, and a single “Children” column listing several names is split too.</p></details>`;
    const fi = $s("#hi-file"), drop = $s("#hi-drop");
    fi.onchange = (e) => { if (e.target.files[0]) readFile(e.target.files[0]); };
    ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
    drop.addEventListener("drop", (e) => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
  }
  const say = (t, err) => { const m = $s("#hi-msg"); if (m) { m.textContent = t; m.style.color = err ? "var(--status-critical)" : ""; } };

  async function readFile(f) {
    S.name = f.name; S.pdfData = null;
    try {
      let rows;
      if (/\.xlsx$/i.test(f.name)) { say("Reading the spreadsheet…"); rows = await ctx.parseXLSX(await f.arrayBuffer()); }
      else if (/\.csv$/i.test(f.name) || f.type === "text/csv") { say("Reading the file…"); rows = ctx.parseCSV(await f.text()); }
      else if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        const buf = await f.arrayBuffer();
        S.pdfData = { media_type: "application/pdf", buf, name: f.name };
        say("Opening the PDF…");
        const { pages, numPages } = await readPdf(buf, (p, n) => say(`Reading page ${p} of ${n}…`));
        const t = itemsToTable(pages);
        S.quality = t.quality;
        if (!pages.some((p) => p.length)) { return needAi(`This PDF is a scan or photo — it has no text to read directly (${numPages} page${numPages === 1 ? "" : "s"}).`); }
        if (t.rows.length < 2 || t.columns < 2) { return needAi("The text in this PDF isn't laid out as a table I can follow."); }
        rows = t.rows;
      } else if (/^image\//.test(f.type)) {
        const buf = await f.arrayBuffer();
        S.pdfData = { media_type: f.type === "image/jpg" ? "image/jpeg" : f.type, buf, name: f.name };
        return needAi("A photo needs the AI reader to turn it into a table.");
      } else return say("Please choose a PDF, .xlsx, .csv or a picture.", true);
      useTable(rows);
    } catch (e) { say("Couldn't read that file — " + ((e && e.message) || e), true); }
  }
  function needAi(why) {
    const m = $s("#hi-msg");
    m.innerHTML = `${esc(why)} <button type="button" class="btn small primary" id="hi-ai">Read it with AI</button><div class="hint" style="margin-top:6px;">The pages are sent securely to an AI reading service, then you review everything before it is imported.</div>`;
    m.style.color = "";
    $s("#hi-ai").onclick = async () => {
      const b = $s("#hi-ai"); b.disabled = true; say("Reading the register… handwriting and long tables can take a minute.");
      try {
        const bytes = new Uint8Array(S.pdfData.buf); let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        if (bytes.length > 5 * 1048576) throw new Error("That file is over 5 MB — split it into smaller parts.");
        const out = await repo.scanFamilyTree({ org_id: ctx.orgId, mode: "table", files: [{ media_type: S.pdfData.media_type, data: btoa(s) }] });
        if (!out.rows || out.rows.length < 1) throw new Error("No table was found in that document.");
        S.quality = 0.6;
        useTable([out.columns, ...out.rows]);
      } catch (e) {
        b.disabled = false;
        say(e && e.code === "not_configured" ? e.message : "The AI reader couldn't finish: " + ((e && e.message) || e), true);
      }
    };
  }
  function useTable(rows) {
    rows = rows.map((r) => r.map((c) => String(c == null ? "" : c).trim())).filter((r) => r.some(Boolean));
    if (rows.length < 2) return say("That file has no data rows.", true);
    const width = Math.max(...rows.map((r) => r.length));
    S.table = rows.map((r) => [...r, ...new Array(width - r.length).fill("")]);
    S.headerRow = detectHeaderRow(S.table);
    automap();
    paintMatch();
  }
  const dataRows = () => (S.headerRow >= 0 ? S.table.slice(S.headerRow + 1) : S.table);
  const headers = () => (S.headerRow >= 0 ? S.table[S.headerRow] : S.table[0].map((_, i) => `Column ${LETTERS(i)}`));
  function automap() { const m = matchColumns(headers(), dataRows(), keys); S.map = m.map; S.conf = m.conf; }

  /* ------------------------------------------------------------------ stage 2: match columns --- */
  function paintMatch() {
    stage = "match";
    $s("#hi-back").hidden = false; $s("#hi-next").hidden = false; $s("#hi-next").textContent = "Review households →";
    const hd = headers(), rows = dataRows();
    const sample = (c) => { const v = rows.map((r) => r[c]).filter(Boolean).slice(0, 3); return v.length ? v.map(esc).join(" · ") : '<span class="hint">empty</span>'; };
    const colOpts = (sel) => `<option value="">— not in my file —</option>` + hd.map((x, i) => `<option value="${i}"${sel === i ? " selected" : ""}>${LETTERS(i)} — ${esc(String(x).slice(0, 38) || "(no title)")}</option>`).join("");
    const unmapped = hd.map((x, i) => i).filter((i) => !Object.values(S.map).includes(i) && rows.some((r) => r[i]));
    const row = (k) => {
      const t = T[k], c = S.map[k];
      return `<div class="hi-row"><div class="hi-lab">${esc(t.label.replace(/ \(auto-masked.*\)$/, ""))}${t.required ? ' <b style="color:var(--status-critical)">*</b>' : ""}</div>
        <select data-k="${k}">${colOpts(c)}</select>
        <div class="hi-sample">${c != null ? sample(c) : ""}${c != null && S.conf[k] === "check" ? ' <span class="ft-chip low">check</span>' : c != null ? ' <span class="ft-chip ok">matched</span>' : ""}</div></div>`;
    };
    body().innerHTML = `
      <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px;">
        <div class="field" style="margin:0;min-width:260px;flex:1;"><label for="hi-hdr">Which row has the column titles?</label>
          <select id="hi-hdr">${S.table.slice(0, 8).map((r, i) => `<option value="${i}"${i === S.headerRow ? " selected" : ""}>Row ${i + 1}: ${esc(r.filter(Boolean).slice(0, 4).join(" | ").slice(0, 60))}</option>`).join("")}<option value="-1"${S.headerRow < 0 ? " selected" : ""}>There are no titles — the first row is data</option></select></div>
        <button type="button" class="btn small" id="hi-auto">Match automatically again</button></div>
      <p class="hint" style="margin:0 0 6px;"><b>${esc(S.name)}</b> — ${rows.length} row${rows.length === 1 ? "" : "s"}, ${hd.length} columns found.${S.quality < 0.5 ? ` <span style="color:var(--status-warning);">The layout looked irregular — check the matches below carefully.</span>` : ""} Point each Households column at the matching column of your file; leave it blank if your file doesn't have it.</p>
      ${GROUPS.map(([g, ks]) => `<div class="hi-group">${esc(g)}</div>${ks.filter((k) => T[k]).map(row).join("")}`).join("")}
      <div class="hi-group">If your file lists the descendants together</div>${row("descList")}
      ${unmapped.length ? `<p class="hint" style="margin-top:8px;">Not used: ${unmapped.map((i) => `${LETTERS(i)} (${esc(String(hd[i]).slice(0, 24) || "no title")})`).join(", ")}</p>` : ""}
      <div id="hi-msg" class="hint" style="margin-top:6px;"></div>`;
    $s("#hi-foot").textContent = S.map.odi == null ? "Match the ODI column to continue." : `${rows.length} households ready to check.`;
    $s("#hi-next").disabled = S.map.odi == null;
    $s("#hi-hdr").onchange = (e) => { S.headerRow = +e.target.value; automap(); paintMatch(); };
    $s("#hi-auto").onclick = () => { automap(); paintMatch(); };
    body().querySelectorAll("select[data-k]").forEach((s) => (s.onchange = () => { const k = s.dataset.k; if (s.value === "") delete S.map[k]; else { S.map[k] = +s.value; S.conf[k] = "high"; } paintMatch(); }));
    $s("#hi-back").onclick = () => paintPick();
    $s("#hi-next").onclick = () => buildReview();
  }

  /* ------------------------------------------------------------------ stage 3: review & import --- */
  function buildReview() {
    const built = [];
    dataRows().forEach((r) => {
      const v = buildValues(r, S.map);
      if (!v.odi && !v.ref) return;
      const b = ctx.make(v, built.length);
      if (b) { b.__hadRef = !!v.ref; built.push(b); }
    });
    if (!built.length) return say("No households were found with those matches — check the ODI column.", true);
    S.rows = analyseHouseholds(built, { households: ctx.households(), register: ctx.register() });
    paintReview();
  }
  const counts = () => { const c = { n: S.rows.length, add: 0, merge: 0, skip: 0, review: 0, flagged: 0 }; S.rows.forEach((r) => { c[r.action]++; if (r.flag) c.flagged++; }); return c; };
  function paintReview() {
    stage = "review";
    $s("#hi-back").hidden = false; $s("#hi-next").hidden = false;
    const c = counts();
    const info = (r) => {
      const bits = [];
      if (r.dup) bits.push(`<div class="ft-dup ${r.dup.level}"><b>${r.dup.level === "exact" ? "Already on the platform" : "Possible duplicate"}</b> — ${esc(r.dup.reason)}<br><span class="hint">${esc(r.dup.household[0])} · ${esc(r.dup.household[2])}${r.dup.household[3] ? " · ID " + esc(r.dup.household[3]) : ""}</span></div>`);
      if (r.fileDup) bits.push(`<div class="ft-dup ${r.fileDup.level}"><b>Repeated in the file</b> — ${esc(r.fileDup.reason)}</div>`);
      if (r.reg && !r.dup) bits.push(`<div class="ft-dup possible"><b>ODI already a member</b> — ${esc(r.reg.reason)}<br><span class="hint">${esc(r.reg.row[1])} · ${esc(r.reg.row[0] || "no ref")} · ${esc(r.reg.row[5] || "no household")}</span></div>`);
      return bits.join("") || '<span class="hint">No duplicates found</span>';
    };
    const opts = (r) => [r.action === "review" ? ["review", "— decide —"] : null, ["add", "Add as new household"], ["skip", "Skip"], r.dup ? ["merge", "Update existing household"] : null].filter(Boolean)
      .map(([v, l]) => `<option value="${v}"${v === r.action ? " selected" : ""}>${esc(l)}</option>`).join("");
    const descs = (b) => [4, 6, 8, 10, 24, 26, 28].map((i) => b[i]).filter(Boolean);
    body().innerHTML = `
      <div class="grid grid-4" style="gap:8px;margin-bottom:10px;">
        ${u.statTile("Households in file", c.n, S.name, "")}
        ${u.statTile("To add", c.add + c.merge, `${c.add} new · ${c.merge} updated`, "good")}
        ${u.statTile("Duplicates flagged", c.flagged, c.flagged ? "Check the highlighted rows" : "None", c.flagged ? "warning" : "good")}
        ${u.statTile("Need a decision", c.review, c.review ? "Choose Add, Skip or Update" : "All decided", c.review ? "critical" : "good")}</div>
      <div class="table-wrap scroll" style="max-height:380px;"><table><thead><tr><th>#</th><th>Household</th><th>ODI</th><th>Family rep.</th><th>Descendants</th><th>Checks</th><th>Decision</th></tr></thead><tbody>
      ${S.rows.map((r, i) => `<tr class="${r.flag === "exact" ? "hi-dupe" : ""}"><td class="hint">${i + 1}</td>
        <td class="mono">${esc(r.b[0])}</td>
        <td><b>${esc(r.b[2] || "(no ODI)")}</b><div class="hint">${r.b[3] ? "ID " + esc(r.b[3]) : "no ID"}</div></td>
        <td>${esc(r.b[1])}</td>
        <td class="hint" style="max-width:200px;">${descs(r.b).length ? `${descs(r.b).length}: ` + descs(r.b).map(esc).join(", ") : "—"}</td>
        <td style="min-width:230px;">${info(r)}</td>
        <td><select data-i="${i}">${opts(r)}</select></td></tr>`).join("")}</tbody></table></div>
      <label class="cm-check" style="margin-top:10px;"><input type="checkbox" id="hi-ext"${S.extract ? " checked" : ""}> Also add each ODI, family representative and descendant to the Master Register (people already on the register are skipped)</label>
      <label class="cm-check" style="margin-top:6px;"><input type="checkbox" id="hi-log"${S.logConflicts ? " checked" : ""}> Record possible duplicates that I add anyway in Duplicate / Conflict Cases</label>`;
    $s("#hi-foot").textContent = c.review ? `${c.review} row${c.review === 1 ? "" : "s"} still need a decision.` : `${c.add} to add · ${c.merge} to update · ${c.skip} skipped`;
    $s("#hi-next").textContent = c.add + c.merge ? `Import ${c.add}${c.merge ? ` & update ${c.merge}` : ""}` : "Nothing to import";
    $s("#hi-next").disabled = S.busy || c.review > 0 || c.add + c.merge === 0;
    body().querySelectorAll("select[data-i]").forEach((s) => (s.onchange = () => { S.rows[+s.dataset.i].action = s.value; paintReview(); }));
    $s("#hi-ext").onchange = (e) => { S.extract = e.target.checked; };
    $s("#hi-log").onchange = (e) => { S.logConflicts = e.target.checked; };
    $s("#hi-back").onclick = () => paintMatch();
    $s("#hi-next").onclick = () => doImport();
  }

  async function doImport() {
    if (S.busy) return; S.busy = true; $s("#hi-next").disabled = true; $s("#hi-foot").textContent = "Importing…";
    const H = ctx.households(), R = ctx.register(), D = ctx.disputes(), today = new Date().toISOString().slice(0, 10);
    let added = 0, merged = 0, people = 0, skippedPeople = 0, logged = 0, k = 0;
    const touched = [], loggedHh = new Set();
    for (const r of S.rows) {
      if (r.action === "add") {
        if (!r.b.__hadRef) r.b[0] = ctx.nextRef(k++);
        delete r.b.__hadRef; H.push(r.b); added++; touched.push(r.b);
        if (r.flag === "possible" && S.logConflicts && (r.dup || r.reg)) {
          const m = r.dup ? `${r.dup.household[2]} (${r.dup.household[0]})` : `${r.reg.row[1]} (${r.reg.row[0] || "member"})`;
          const n = D.reduce((x, d) => Math.max(x, +(/(\d+)$/.exec(d[0] || "") || [0, 0])[1]), 0) + 1 + logged;
          D.push([`DUP-${String(n).padStart(3, "0")}`, "Duplicate", `${r.b[2]} (${r.b[0]}) / ${m}`, `Possible duplicate household found while importing ${S.name}: ${(r.dup || r.reg).reason}. Added as a new household — confirm or merge.`, today, "Open", ""]);
          logged++; loggedHh.add(r.b[0]);
        }
      } else if (r.action === "merge" && r.dup) { if (mergeHousehold(r.dup.household, r.b).length) { merged++; touched.push(r.dup.household); } }
    }
    if (S.extract) {
      touched.forEach((hh) => {
        const hhRef = hh[0];
        householdSlots(hh).forEach((s) => {
          if (!s.name) return;
          const ref = `${hhRef}-${s.suffix}`;
          if (R.some((x) => x[0] === ref)) { skippedPeople++; return; }
          const idMasked = [3, null, 5, 7, 9, 11, 25, 27, 29][s.idx] != null ? hh[[3, null, 5, 7, 9, 11, 25, 27, 29][s.idx]] : "";   // slot → its ID column
          const m = findRegisterMatch({ name: s.name, last4: last4(idMasked), dob: "" }, R, hhRef);
          if (m && m.level === "exact") { skippedPeople++; return; }
          R.push([ref, s.name, "Unspecified", "", idMasked || "", hhRef, "", "", "Active", "Pending", `Added from ${S.name} on ${today}. Verify against the original.`, s.role, "", false]);
          people++;
          if (m && S.logConflicts && !(s.suffix === "ODI" && loggedHh.has(hhRef))) {   // the household-level entry already covers its ODI
            const n = D.reduce((x, d) => Math.max(x, +(/(\d+)$/.exec(d[0] || "") || [0, 0])[1]), 0) + 1 + logged;
            D.push([`DUP-${String(n).padStart(3, "0")}`, "Duplicate", `${s.name} (${ref}) / ${m.row[1]} (${m.row[0] || "member"})`, `Possible duplicate member while importing ${S.name}: ${m.reason}.`, today, "Open", ""]); logged++;
          }
        });
      });
    }
    try {
      await ctx.commit("households");
      if (people) await ctx.commit("beneficiaries");
      if (logged) await ctx.commit("beneficiary_disputes");
      close();
      u.toast(`Imported ${added} household${added === 1 ? "" : "s"}${merged ? `, updated ${merged}` : ""}${people ? `, added ${people} member${people === 1 ? "" : "s"} to the register` : ""}${logged ? `, logged ${logged} possible duplicate${logged === 1 ? "" : "s"}` : ""}.${skippedPeople ? ` ${skippedPeople} already on the register.` : ""}`);
    } catch (e) { S.busy = false; u.toast("Couldn't save: " + ((e && e.message) || e), true); paintReview(); }
  }

  paintPick();
}
