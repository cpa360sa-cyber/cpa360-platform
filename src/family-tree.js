/* CPA360 — Household family trees (Beneficiaries → Households → "Family tree").
   Upload a photo / scan / PDF of a family tree (typed OR handwritten), have it read, review it as a
   tree, and add the people to the Master Beneficiary Register in one go — with duplicates flagged.

   How it stays safe:
   · Reading is done by the scan-family-tree Edge Function (AI vision). Nothing it returns is trusted:
     every person lands on a REVIEW screen first; low-confidence readings are highlighted; the
     CPA corrects names, positions and decisions before anything is saved.
   · Duplicates (same person already on the register, in another household, already extracted from
     the household record, or drawn twice on the tree) are flagged; "possible" ones can't be added
     until someone decides, exact ones are skipped by default.
   · Only the last 4 digits of any ID are ever kept (the platform's masking rule) — full numbers read
     from the page exist only in the browser during review.
   · Works without the AI too: the originals are still kept with the household and people can be typed
     or pasted into the same review screen. */
import * as repo from "./repo.js";
import { analyse, layoutTree, mergeFill, nameSimilarity } from "./family-tree-logic.js";

const SECTION = "household-tree";
const ROLES = ["ODI", "Family Representative", "1st Descendant", "2nd Descendant", "3rd Descendant", "4th Descendant", "5th Descendant", "6th Descendant", "7th Descendant", "Spouse", "Other family member"];
const SLOT_IDX = { ODI: [2, 3], REP: [1, null], D1: [4, 5], D2: [6, 7], D3: [8, 9], D4: [10, 11], D5: [24, 25], D6: [26, 27], D7: [28, 29] };

const suffixOf = (role, usedFree) => role === "ODI" ? "ODI" : role === "Family Representative" ? "REP" : /^(\d)(st|nd|rd|th) Descendant$/.exec(role) ? "D" + /^(\d)/.exec(role)[1] : role === "Spouse" ? "SP" : "F" + usedFree;
const b64 = (buf) => { let s = ""; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000)); return btoa(s); };

/* Photos are shrunk to ≤2000 px (still plenty for handwriting) and re-encoded as JPEG; PDFs go as they are. */
async function prepFile(file) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    if (file.size > 5 * 1048576) throw new Error(`“${file.name}” is over 5 MB — use a smaller PDF, or photograph the pages instead.`);
    return { name: file.name, original: file, media_type: "application/pdf", data: b64(await file.arrayBuffer()), thumb: "" };
  }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { throw new Error(`“${file.name}” couldn't be opened as a picture (iPhone HEIC photos need to be shared as JPG, or take the photo again).`); }
  const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.88));
  if (!blob) throw new Error(`“${file.name}” couldn't be prepared.`);
  if (blob.size > 5 * 1048576) throw new Error(`“${file.name}” is still too large after shrinking.`);
  return { name: file.name, original: file, media_type: "image/jpeg", data: b64(await blob.arrayBuffer()), thumb: URL.createObjectURL(blob) };
}

/* ------------------------------------------------------------ step 1: the household's trees --- */
export function openFamilyTree(ctx) {
  const { h: u } = ctx, { esc } = u, hh = ctx.household, hhRef = hh[0], odi = String(hh[2] || hh[1] || "").trim();
  const { scrim, close } = u.govModal(`Family tree — ${hhRef}${odi ? " · " + odi : ""}`, `
    <p class="hint" style="margin:0 0 8px;">Upload a photo, scan or PDF of this household's family tree — typed or <b>handwritten</b>. It is read for you, shown as a tree, and checked against the register for duplicates <b>before</b> anyone is added.</p>
    <div class="field"><label>Trees on file</label><div id="ft-docs" class="hint">Loading…</div></div>
    ${ctx.canEdit ? `
    <div class="field"><label>Add a family tree</label>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <label class="btn" style="cursor:pointer;">Choose photos / PDF<input id="ft-file" type="file" accept="image/*,application/pdf" multiple hidden></label>
        <label class="btn" style="cursor:pointer;">Take a photo<input id="ft-cam" type="file" accept="image/*" capture="environment" hidden></label>
      </div><div id="ft-picked" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;"></div></div>
    <label class="cm-check"><input type="checkbox" id="ft-keep" checked> Keep the original with this household as evidence</label>
    <label class="cm-check" style="margin-top:6px;"><input type="checkbox" id="ft-ok"> I'm allowed to scan this family's records. The pages are sent securely to an AI reading service to be read; the CPA reviews everything before it is saved.</label>
    <div id="ft-msg" class="hint" role="status" style="margin-top:8px;"></div>` : `<p class="hint">You have view-only access.</p>`}`,
    `<button class="btn" data-act="close" type="button">Close</button>
     ${ctx.canEdit ? `<button class="btn" id="ft-manual" type="button">Enter the family by hand</button><button class="btn" id="ft-save" type="button" disabled>Just save the file</button><button class="btn primary" id="ft-scan" type="button" disabled>Scan &amp; review</button>` : ""}`, 640);
  const $s = (q) => scrim.querySelector(q);
  let picked = [], busy = false;

  async function listDocs() {
    const box = $s("#ft-docs");
    try {
      const docs = await repo.listDocs(ctx.orgId, SECTION, hh._id);
      box.innerHTML = docs.length ? docs.map((d) => `<div style="display:flex;gap:8px;align-items:center;padding:3px 0;border-top:1px solid var(--border);">
          <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(d.name)}</span><span>${esc(u.fmtDay(String(d.uploaded_at || "").slice(0, 10)))}</span>
          <button type="button" class="btn small" data-ft-view="${esc(d.id)}">View</button>
          ${ctx.canEdit ? `<button type="button" class="btn small" data-ft-rescan="${esc(d.id)}">Scan this</button><button type="button" class="btn small danger" data-ft-del="${esc(d.id)}">Delete</button>` : ""}</div>`).join("") : "None yet.";
      box.querySelectorAll("[data-ft-view]").forEach((b) => (b.onclick = async () => { const d = docs.find((x) => x.id === b.dataset.ftView); try { window.open(await repo.docPreviewUrl(d.path), "_blank", "noopener"); } catch (e) { u.toast("Couldn't open: " + ((e && e.message) || e), true); } }));
      box.querySelectorAll("[data-ft-del]").forEach((b) => (b.onclick = () => u.confirmModal("Delete this family-tree file? People already added from it stay on the register.", async () => {
        const d = docs.find((x) => x.id === b.dataset.ftDel);
        try { await repo.deleteDoc(d); u.bumpDocCount(SECTION, hh._id, -1); listDocs(); ctx.rerender(); } catch (e) { u.toast("Couldn't delete: " + ((e && e.message) || e), true); }
      })));
      box.querySelectorAll("[data-ft-rescan]").forEach((b) => (b.onclick = async () => {
        const d = docs.find((x) => x.id === b.dataset.ftRescan);
        if (!$s("#ft-ok").checked) { $s("#ft-msg").textContent = "Tick the permission box first."; return; }
        try {
          $s("#ft-msg").textContent = "Fetching the file…";
          const blob = await (await fetch(await repo.docPreviewUrl(d.path))).blob();
          const f = new File([blob], d.name, { type: d.mime || blob.type });
          picked = [await prepFile(f)]; picked[0].stored = true; await runScan();
        } catch (e) { $s("#ft-msg").textContent = (e && e.message) || String(e); }
      }));
    } catch (e) { box.textContent = "Couldn't load the list: " + ((e && e.message) || e); }
  }
  listDocs();

  function paintPicked() {
    $s("#ft-picked").innerHTML = picked.map((p, i) => `<div style="position:relative;width:92px;">
        ${p.thumb ? `<img src="${esc(p.thumb)}" alt="" style="width:92px;height:92px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">` : `<div style="width:92px;height:92px;border-radius:8px;border:1px solid var(--border);display:grid;place-items:center;font-weight:700;">PDF</div>`}
        <button type="button" class="btn small" data-ft-x="${i}" style="position:absolute;top:2px;right:2px;padding:0 6px;">&times;</button></div>`).join("");
    $s("#ft-picked").querySelectorAll("[data-ft-x]").forEach((b) => (b.onclick = () => { picked.splice(+b.dataset.ftX, 1); paintPicked(); }));
    sync();
  }
  function sync() {
    if (!ctx.canEdit) return;
    $s("#ft-scan").disabled = busy || !picked.length || !$s("#ft-ok").checked;
    $s("#ft-save").disabled = busy || !picked.length;
  }
  async function addFiles(list) {
    const msg = $s("#ft-msg"); msg.textContent = "";
    for (const f of [...list]) {
      if (picked.length >= 4) { msg.textContent = "Up to 4 pages at a time — scan a large tree in parts."; break; }
      try { picked.push(await prepFile(f)); } catch (e) { msg.textContent = (e && e.message) || String(e); }
    }
    paintPicked();
  }
  if (ctx.canEdit) {
    $s("#ft-file").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
    $s("#ft-cam").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
    $s("#ft-ok").onchange = sync;
    $s("#ft-manual").onclick = () => { close(); openReview(ctx, { people: [], notes: "", sources: [], manual: true }); };
    const keepFiles = async () => {
      if (!$s("#ft-keep").checked) return;
      for (const p of picked) {
        if (p.stored) continue;
        try { await repo.uploadDoc(ctx.orgId, SECTION, hh._id, p.original); u.bumpDocCount(SECTION, hh._id, 1); p.stored = true; }
        catch (e) { $s("#ft-msg").textContent = "Couldn't keep “" + p.name + "”: " + ((e && e.message) || e); }
      }
    };
    $s("#ft-save").onclick = async () => { busy = true; sync(); $s("#ft-msg").textContent = "Saving…"; await keepFiles(); busy = false; picked = []; paintPicked(); $s("#ft-msg").textContent = "Saved with the household."; listDocs(); ctx.rerender(); };
    var runScan = async function () {
      if (busy || !picked.length) return;
      busy = true; sync();
      const msg = $s("#ft-msg"); msg.textContent = "Reading the family tree… this can take up to a minute for handwriting.";
      try {
        await keepFiles();
        const out = await repo.scanFamilyTree({ org_id: ctx.orgId, household_ref: hhRef, odi_name: odi, files: picked.map((p) => ({ media_type: p.media_type, data: p.data })) });
        const sources = picked.map((p) => ({ name: p.name, thumb: p.thumb, pdf: p.media_type === "application/pdf" }));
        close();
        openReview(ctx, { people: out.people || [], notes: out.document_notes || "", sources, manual: false });
      } catch (e) {
        busy = false; sync();
        if (e && e.code === "not_configured") {
          msg.innerHTML = `${esc(e.message)} <button type="button" class="btn small" id="ft-go-manual">Enter the family by hand</button>`;
          const g = $s("#ft-go-manual"); if (g) g.onclick = () => { close(); openReview(ctx, { people: [], notes: "", sources: picked.map((p) => ({ name: p.name, thumb: p.thumb, pdf: p.media_type === "application/pdf" })), manual: true }); };
        } else msg.textContent = (e && e.message) || String(e);
        listDocs(); ctx.rerender();
      }
    };
    $s("#ft-scan").onclick = runScan;
  }
}

/* ------------------------------------------------------------ step 2: review & add --- */
const todayIso = () => new Date().toISOString().slice(0, 10);
const REL_WORDS = [[/grand\s*(son|daughter|child)|\bgrandkid/i, "grandchild", 2], [/\b(wife|husband|spouse|partner)\b/i, "spouse", 0], [/\b(son|daughter|child|kid)\b/i, "child", 1], [/\b(mother|father|mom|mum|dad|parent)\b/i, "parent", -1], [/\b(brother|sister|sibling)\b/i, "sibling", 0], [/\b(head|odi)\b/i, "self_head", 0]];

function openReview(ctx, scan) {
  const { h: u } = ctx, { esc } = u, hh = ctx.household, hhRef = hh[0];
  const reg = () => ctx.register();
  const base = (o) => ({ full_name: "", relationship: "child", generation: 1, parent_name: "", gender: "unknown", id_number: "", date_of_birth: "", deceased: false, contact: "", notes: "", confidence: "high", ...o });
  const state = { rows: [], logConflicts: true, busy: false };
  const rebuild = () => {
    const people = state.rows.map((r) => ({ ...r.p, full_name: r.name, id_number: r.fullId, date_of_birth: r.dob, deceased: r.deceased, gender: r.gender, contact: r.contact, notes: r.notes, confidence: r.confidence, relationship: r.relationship, generation: r.generation }));
    const fresh = analyse(people, { register: reg(), household: hh, hhRef });
    fresh.forEach((n, i) => {
      const o = state.rows[i]; if (!o) return;
      n.p = o.p; n.parent = o.parent;
      if (o.roleEdited) { n.role = o.role; n.suffix = o.suffix; n.ref = o.ref; n.roleEdited = true; }
      if (o.actionTouched) { n.action = o.action; n.actionTouched = true; }
    });
    state.rows = fresh;
  };
  state.rows = analyse((scan.people || []).map(base), { register: reg(), household: hh, hhRef });
  state.rows.forEach((r, i) => { r.p = (scan.people || [])[i] ? base(scan.people[i]) : base({}); });

  const { scrim, close } = u.govModal(`Review the family tree — ${hhRef}`, `<div id="fr-body"></div>`,
    `<span id="fr-foot" class="hint" style="margin-right:auto;"></span><button class="btn" data-act="close" type="button">Cancel</button><button class="btn primary" id="fr-add" type="button" disabled>Add to register</button>`, 1040);
  const $s = (q) => scrim.querySelector(q);

  const refUnique = (r) => {
    const taken = new Set(reg().map((x) => String(x[0] || "")));
    state.rows.forEach((x) => { if (x !== r && x.action !== "skip" && x.ref) taken.add(x.ref); });
    let ref = `${hhRef}-${r.suffix}`, n = 2;
    while (taken.has(ref)) ref = `${hhRef}-${r.suffix}-${n++}`;
    return ref;
  };
  const counts = () => {
    const c = { n: state.rows.length, add: 0, merge: 0, skip: 0, review: 0, exact: 0, possible: 0, low: 0 };
    state.rows.forEach((r) => { c[r.action] = (c[r.action] || 0) + 1; if (r.flag) c[r.flag]++; if (r.confidence === "low") c.low++; });
    return c;
  };
  const toneFor = (r) => r.action === "skip" ? "skip" : r.action === "review" ? "warn" : r.flag === "possible" ? "warn" : "new";
  const dupHtml = (r) => {
    const d = r.dup, s = r.scanDup, bits = [];
    if (d) bits.push(`<div class="ft-dup ${d.level}"><b>${d.level === "exact" ? "Already on the register" : "Possible duplicate"}</b> — ${esc(d.reason)}<br><span class="hint">${esc(d.row[1])} · ${esc(d.row[0] || "no ref")} · ${esc(d.row[5] || "no household")} · ${esc(d.row[8] || "")}${d.row[4] ? " · ID " + esc(d.row[4]) : ""}</span></div>`);
    if (s) bits.push(`<div class="ft-dup ${s.level}"><b>${s.level === "exact" ? "Listed twice" : "Possibly listed twice"}</b> — ${esc(s.reason)}</div>`);
    return bits.join("");
  };
  const actionOpts = (r) => {
    const o = [];
    if (r.action === "review") o.push(["review", "— decide —"]);
    o.push(["add", "Add as new member"], ["skip", "Skip"]);
    if (r.dup) o.push(["merge", "Update existing record"]);
    return o.map(([v, l]) => `<option value="${v}"${v === r.action ? " selected" : ""}>${esc(l)}</option>`).join("");
  };

  function paint() {
    const c = counts(), tree = layoutTree(state.rows);
    const card = (r) => `<div class="ft-card ${toneFor(r)}" title="${esc(r.notes || "")}">
        <b>${esc(r.name || "(no name)")}</b><div class="hint">${esc(r.role)}${r.deceased ? " · late" : ""}</div>
        ${r.parent ? `<div class="hint">child of ${esc(r.parent)}</div>` : ""}
        ${r.flag ? `<span class="ft-chip ${r.flag}">${r.flag === "exact" ? "duplicate" : "check"}</span>` : ""}${r.confidence === "low" ? `<span class="ft-chip low">hard to read</span>` : ""}</div>`;
    $s("#fr-body").innerHTML = `
      ${scan.manual ? `<p class="hint" style="margin:0 0 8px;">Type the people below, or paste a list (one person per line, e.g. “Lindiwe Khumalo - daughter”). They go through the same duplicate checks.</p>` : `<p class="hint" style="margin:0 0 8px;">Nothing has been added yet. Check each reading against the original, fix anything wrong, then decide the flagged rows.${scan.notes ? ` <i>Reader's note: ${esc(scan.notes)}</i>` : ""}</p>`}
      ${(scan.sources || []).length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;">${scan.sources.map((s) => s.thumb ? `<a href="${esc(s.thumb)}" target="_blank" rel="noopener"><img src="${esc(s.thumb)}" alt="${esc(s.name)}" title="Open ${esc(s.name)}" style="height:74px;border-radius:8px;border:1px solid var(--border);"></a>` : `<span class="pill neutral">${esc(s.name)}</span>`).join("")}</div>` : ""}
      <div class="grid grid-4" style="gap:8px;margin-bottom:10px;">
        ${u.statTile("People read", c.n, c.low ? `${c.low} hard to read` : "", c.low ? "warning" : "")}
        ${u.statTile("To add", c.add, "New members", "good")}
        ${u.statTile("Duplicates flagged", c.exact + c.possible, `${c.exact} certain · ${c.possible} to check`, c.exact + c.possible ? "warning" : "good")}
        ${u.statTile("Need a decision", c.review, c.review ? "Choose Add, Skip or Update" : "All decided", c.review ? "critical" : "good")}</div>
      ${state.rows.length ? `<div class="ft-tree">${tree.map((g) => `<div class="ft-gen"><div class="ft-genlabel">${esc(g.label)}</div><div class="ft-genrow">${g.rows.map(card).join("")}</div></div>`).join("")}</div>
        <div class="table-wrap scroll" style="margin-top:10px;max-height:340px;"><table><thead><tr><th>Name (as read)</th><th>Position</th><th>ID / born</th><th>Checks</th><th>Decision</th><th></th></tr></thead><tbody>
        ${state.rows.map((r, i) => `<tr class="ft-tr ${r.confidence === "low" ? "ft-low" : ""}">
          <td style="min-width:170px;"><input data-f="name" data-i="${i}" type="text" value="${esc(r.name)}" style="width:100%;">
            ${r.confidence !== "high" ? `<div class="hint" style="color:var(--status-warning);">${r.confidence === "low" ? "Hard to read — check carefully" : "Interpreted"}${r.notes ? " · " + esc(r.notes) : ""}</div>` : r.notes ? `<div class="hint">${esc(r.notes)}</div>` : ""}</td>
          <td><select data-f="role" data-i="${i}">${ROLES.map((x) => `<option${x === r.role ? " selected" : ""}>${esc(x)}</option>`).join("")}</select><div class="hint mono">${esc(r.ref)}</div></td>
          <td class="hint">${r.last4 ? "ID ****" + esc(r.last4) : "no ID"}<br>${esc(r.dob || "")}</td>
          <td style="min-width:200px;">${dupHtml(r) || `<span class="hint">No duplicates found</span>`}</td>
          <td><select data-f="action" data-i="${i}">${actionOpts(r)}</select></td>
          <td><button type="button" class="btn small" data-f="del" data-i="${i}" title="Remove this row">&times;</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="state"><p>No one yet — add a person below.</p></div>`}
      <div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap;margin-top:10px;">
        <button type="button" class="btn small" id="fr-addrow">+ Add a person</button>
        <details style="flex:1;min-width:260px;"><summary style="cursor:pointer;font-size:12.5px;">Paste a list of names</summary>
          <textarea id="fr-paste" rows="4" style="width:100%;margin-top:6px;" placeholder="Lindiwe Khumalo - daughter&#10;Themba Khumalo - husband"></textarea>
          <button type="button" class="btn small" id="fr-paste-go" style="margin-top:6px;">Add these</button></details></div>
      <label class="cm-check" style="margin-top:10px;"><input type="checkbox" id="fr-log"${state.logConflicts ? " checked" : ""}> Record "possible duplicates" that I add anyway in Duplicate / Conflict Cases so they can be looked at later</label>`;
    const foot = $s("#fr-foot"), addBtn = $s("#fr-add"), nAdd = c.add + c.merge;
    foot.textContent = c.review ? `${c.review} row${c.review === 1 ? "" : "s"} still need a decision.` : `${c.add} to add · ${c.merge} to update · ${c.skip} skipped`;
    addBtn.disabled = state.busy || c.review > 0 || nAdd === 0;
    addBtn.textContent = nAdd ? `Add ${c.add}${c.merge ? ` & update ${c.merge}` : ""}` : "Nothing to add";

    scrim.querySelectorAll("[data-f]").forEach((el) => {
      const i = +el.dataset.i, r = state.rows[i], f = el.dataset.f;
      if (f === "del") el.onclick = () => { state.rows.splice(i, 1); rebuild(); paint(); };
      else el.onchange = () => {
        if (f === "name") { r.name = el.value.trim(); rebuild(); paint(); }
        else if (f === "role") { r.role = el.value; r.roleEdited = true; r.suffix = suffixOf(el.value, state.rows.filter((x) => /^F\d/.test(x.suffix || "")).length + 1); r.ref = refUnique(r); paint(); }
        else if (f === "action") { r.action = el.value; r.actionTouched = true; paint(); }
      };
    });
    const blank = (o) => { const p = base(o || {}); return { p, name: p.full_name, fullId: "", dob: "", deceased: false, gender: "unknown", contact: "", notes: p.notes, confidence: "high", relationship: p.relationship, generation: p.generation, parent: "", role: "", suffix: "", ref: "", action: "skip" }; };
    $s("#fr-addrow").onclick = () => { state.rows.push(blank()); rebuild(); paint(); const ins = scrim.querySelectorAll('[data-f="name"]'); if (ins.length) ins[ins.length - 1].focus(); };
    $s("#fr-paste-go").onclick = () => {
      ($s("#fr-paste").value || "").split(/\n+/).map((l) => l.trim()).filter(Boolean).forEach((l) => {
        const m = /^(.+?)\s*[-–—,:(]\s*(.+?)\)?$/.exec(l);
        const name = (m ? m[1] : l).trim(), rel = m ? m[2] : "";
        const hit = REL_WORDS.find(([re]) => re.test(rel));
        state.rows.push(blank({ full_name: name, relationship: hit ? hit[1] : "child", generation: hit ? hit[2] : 1, notes: rel && !hit ? rel : "" }));
      });
      rebuild(); paint();
    };
    $s("#fr-log").onchange = (e) => { state.logConflicts = e.target.checked; };
  }
  rebuild(); paint();

  $s("#fr-add").onclick = async () => {
    if (state.busy) return; state.busy = true; $s("#fr-add").disabled = true; $s("#fr-foot").textContent = "Adding…";
    const R = reg(), today = todayIso(), disputes = ctx.disputes();
    let added = 0, merged = 0, slotsChanged = false, logged = 0;
    const note = `Added from a family-tree scan on ${today}${scan.manual ? " (typed in)" : ""}. Verify against the original.`;
    for (const r of state.rows) {
      if (r.action === "add" && r.name) {
        const ref = refUnique(r); r.ref = ref;
        const gender = r.gender === "female" ? "Female" : r.gender === "male" ? "Male" : "Unspecified";
        const dob = r.dob || u.dobFromSaId(r.fullId) || "";
        R.push([ref, r.name, gender, dob, u.maskId(r.fullId), hhRef, r.contact, "", r.deceased ? "Deceased" : "Active", "Pending",
          `${note}${r.confidence === "low" ? " Hard to read on the original." : ""}${r.notes ? " " + r.notes : ""}`, r.role, "", false]);
        added++;
        const sfx = /^(ODI|REP|D\d)$/.exec(r.suffix) ? r.suffix : "", idx = SLOT_IDX[sfx];
        if (idx && !String(hh[idx[0]] || "").trim()) { hh[idx[0]] = r.name; if (idx[1] != null) hh[idx[1]] = u.maskId(r.fullId); slotsChanged = true; }
        if (r.flag === "possible" && state.logConflicts && r.dup) {
          const n = disputes.reduce((m, d) => Math.max(m, +(/(\d+)$/.exec(d[0] || "") || [0, 0])[1]), 0) + 1 + logged;
          disputes.push([`DUP-${String(n).padStart(3, "0")}`, "Duplicate", `${r.name} (${ref}) / ${r.dup.row[1]} (${r.dup.row[0] || "no ref"})`,
            `Possible duplicate found while scanning the family tree of household ${hhRef}: ${r.dup.reason}. Added as a new member — confirm or merge.`, today, "Open", ""]);
          logged++;
        }
      } else if (r.action === "merge" && r.dup) {
        const ch = mergeFill(r.dup.row, r, hhRef);
        if (ch.length) merged++;
      }
    }
    // lineage: a person drawn under someone other than the ODI gets that person as their parent
    const addedPairs = state.rows.filter((r) => r.action === "add" && r.name).map((r) => ({ r, row: R.find((x) => x[0] === r.ref && x[1] === r.name) })).filter((x) => x.row);
    const household = R.filter((x) => x[5] === hhRef);
    addedPairs.forEach(({ r, row }) => {
      if (!r.parent || r.role === "ODI" || r.role === "Spouse") return;
      let best = null;
      household.forEach((c) => { if (c === row || c[11] === "ODI") return; const sc = nameSimilarity(r.parent, c[1]); if (sc >= 0.9 && (!best || sc > best.sc)) best = { c, sc }; });
      if (best && best.c[0]) row[14] = best.c[0];
    });
    try {
      await ctx.commit("beneficiaries");
      if (slotsChanged) await ctx.commit("households");
      if (logged) await ctx.commit("beneficiary_disputes");
      close();
      u.toast(`Added ${added} member${added === 1 ? "" : "s"}${merged ? `, updated ${merged}` : ""}${logged ? `, logged ${logged} possible duplicate${logged === 1 ? "" : "s"} for follow-up` : ""}. They start as Pending verification.`);
    } catch (e) { state.busy = false; u.toast("Couldn't save: " + ((e && e.message) || e), true); paint(); }
  };
}
