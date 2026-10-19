/* CPA360 — Add a member from an ID copy (Beneficiaries → Master Register → "Add from ID copy").
   1. Upload a photo / scan / PDF of the ID (green ID book or smart ID card; front, optionally back).
   2. It reads what it can — on this computer (free, private) or with AI (better on poor photos) — and
      fills the form. The 13-digit ID number is validated (check digit) and gives the date of birth,
      gender and citizenship by itself.
   3. Everything it read is only a suggestion: those fields are highlighted, the ID copy is shown beside the
      form, and the person adding the member completes and corrects the rest by hand.
   4. The register is checked for the same person before saving (same ID ending, same name, same birth date).
   5. The ID copy is filed with the member's documents (ID document). Only the last 4 digits of the ID number
      are kept on the register — the platform's masking rule. */
import * as repo from "./repo.js";
import { saIdInfo, parseIdText } from "./id-parse.js";
import { toPicture, ocrText } from "./id-ocr.js";
import { findRegisterMatch, last4 } from "./family-tree-logic.js";

const todayIso = () => new Date().toISOString().slice(0, 10);
const blobB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = rej; fr.readAsDataURL(blob); });

/** Next register no. in the style already used ("KV-0007" → "KV-0008"); "" when there's no clear pattern. */
export function suggestRef(register) {
  const groups = new Map();
  register.forEach((r) => {
    const m = /^([A-Za-z]+)([-\s]?)(\d{1,6})$/.exec(String(r[0] || "").trim());
    if (!m) return;
    const key = m[1] + "|" + m[2], g = groups.get(key) || { n: 0, max: 0, w: m[3].length };
    g.n++; g.max = Math.max(g.max, +m[3]); g.w = Math.max(g.w, m[3].length); groups.set(key, g);
  });
  const best = [...groups.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  if (!best) return "";
  const [pre, sep] = best[0].split("|");
  return `${pre}${sep}${String(best[1].max + 1).padStart(best[1].w, "0")}`;
}

export function openIdIntake(ctx) {
  const { h: u } = ctx, { esc } = u;
  const S = { files: [], pics: [], read: {}, aiUsed: false, scanNote: "", touched: {} };
  const { scrim, close } = u.govModal("Add a member from an ID copy", `<div id="ii-body"></div>`,
    `<span id="ii-foot" class="hint" style="margin-right:auto;"></span><button class="btn" data-act="close" type="button">Cancel</button><button class="btn" id="ii-back" type="button" hidden>&lsaquo; Back</button><button class="btn primary" id="ii-next" type="button" hidden>Add member</button>`, 980);
  const $s = (q) => scrim.querySelector(q), body = () => $s("#ii-body");
  const say = (t, err) => { const m = $s("#ii-msg"); if (m) { m.textContent = t; m.style.color = err ? "var(--status-critical)" : ""; } };

  /* ---------------------------------------------------------------- stage 1: the ID copy --- */
  function paintPick() {
    $s("#ii-back").hidden = true; $s("#ii-next").hidden = true; $s("#ii-foot").textContent = "";
    body().innerHTML = `
      <p class="hint" style="margin:0 0 10px;">Upload a photo or scan of the member's <b>ID book page</b> or <b>smart ID card</b> (front, and the back if you have it). It reads what it can and fills in the form — you check it and complete whatever is missing.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <label class="btn primary" style="cursor:pointer;">Choose photo / PDF<input id="ii-file" type="file" accept="image/*,application/pdf" multiple hidden></label>
        <label class="btn" style="cursor:pointer;">Take a photo<input id="ii-cam" type="file" accept="image/*" capture="environment" hidden></label>
        <button class="btn" id="ii-manual" type="button">No ID copy — type it in</button></div>
      <div id="ii-picked" style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;"></div>
      <div id="ii-actions" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;" hidden>
        <button class="btn primary" id="ii-ocr" type="button">Read it on this computer</button>
        <button class="btn" id="ii-ai" type="button">Read it with AI</button></div>
      <p class="hint" id="ii-privacy" style="margin-top:8px;" hidden><b>On this computer:</b> free and private — the picture isn't sent anywhere. <b>With AI:</b> better on blurry or tilted photos; the picture is sent securely to an AI reading service (make sure that fits your CPA's privacy notice).</p>
      <div id="ii-msg" class="hint" role="status" style="margin-top:8px;"></div>`;
    paintPicked();
    $s("#ii-file").onchange = (e) => { add(e.target.files); e.target.value = ""; };
    $s("#ii-cam").onchange = (e) => { add(e.target.files); e.target.value = ""; };
    $s("#ii-manual").onclick = () => paintForm();
    $s("#ii-ocr").onclick = runOcr;
    $s("#ii-ai").onclick = runAi;
  }
  function paintPicked() {
    const box = $s("#ii-picked"); if (!box) return;
    box.innerHTML = S.pics.map((p, i) => `<div style="position:relative;"><img src="${esc(p.url)}" alt="ID copy ${i + 1}" style="height:120px;border-radius:8px;border:1px solid var(--border);">
      <button type="button" class="btn small" data-x="${i}" style="position:absolute;top:2px;right:2px;padding:0 6px;">&times;</button></div>`).join("");
    box.querySelectorAll("[data-x]").forEach((b) => (b.onclick = () => { S.pics.splice(+b.dataset.x, 1); S.files.splice(+b.dataset.x, 1); paintPicked(); }));
    $s("#ii-actions").hidden = !S.pics.length; $s("#ii-privacy").hidden = !S.pics.length;
  }
  async function add(list) {
    for (const f of [...list]) {
      if (S.pics.length >= 2) { say("Front and back only — remove one first.", true); break; }
      try { const blob = await toPicture(f); S.pics.push({ blob, url: URL.createObjectURL(blob), name: f.name }); S.files.push(f); }
      catch (e) { say((e && e.message) || String(e), true); }
    }
    paintPicked();
  }
  async function runOcr() {
    $s("#ii-ocr").disabled = $s("#ii-ai").disabled = true;
    try {
      const text = await ocrText(S.pics.map((p) => p.blob), (t) => say(t));
      const r = parseIdText(text);
      const got = !!(r.idNumber || r.fullName || r.dob);
      S.read = fromParse(r); S.scanNote = got ? "Read on this computer — please check every highlighted field against the ID." : "";
      if (!got) { say("Couldn't read anything reliable from that picture. Try a clearer, straight-on photo — or type the details in.", true); $s("#ii-ocr").disabled = $s("#ii-ai").disabled = false; $s("#ii-manual").textContent = "Type it in with the picture beside it"; return; }
      paintForm();
    } catch (e) { say((e && e.message) || String(e), true); $s("#ii-ocr").disabled = $s("#ii-ai").disabled = false; }
  }
  async function runAi() {
    $s("#ii-ocr").disabled = $s("#ii-ai").disabled = true; say("Reading the ID with AI…");
    try {
      const files = [];
      for (const p of S.pics) files.push({ media_type: "image/jpeg", data: await blobB64(p.blob) });
      const out = await repo.scanFamilyTree({ org_id: ctx.orgId, mode: "id", files });
      const r = out.id || {};
      const info = saIdInfo(r.id_number);
      S.read = { name: [r.names, r.surname].filter(Boolean).join(" "), id: info.digits, dob: r.date_of_birth || info.dob || "", gender: r.gender === "female" ? "Female" : r.gender === "male" ? "Male" : info.gender || "" };
      S.aiUsed = true; S.scanNote = `Read with AI${r.confidence === "low" ? " (hard to read)" : ""} — please check every highlighted field against the ID.${r.notes ? " " + r.notes : ""}`;
      paintForm();
    } catch (e) {
      say(e && e.code === "not_configured" ? e.message : "The AI reader couldn't finish: " + ((e && e.message) || e), true);
      $s("#ii-ocr").disabled = $s("#ii-ai").disabled = false;
    }
  }
  const fromParse = (r) => ({ name: r.fullName, id: r.idNumber, dob: r.dob, gender: r.gender });

  /* ---------------------------------------------------------------- stage 2: the form --- */
  function paintForm() {
    const R = ctx.register(), hhc = ctx.hhChoices(""), rd = S.read || {};
    const fld = (id, label, inner, readKey) => `<div class="field ${readKey && rd[readKey] ? "id-read" : ""}"><label for="${id}">${label}${readKey && rd[readKey] ? ' <span class="ft-chip low">from the ID — check</span>' : ""}</label>${inner}</div>`;
    const sel = (id, opts, val) => `<select id="${id}">${opts.map((o) => `<option${o === val ? " selected" : ""}>${esc(o)}</option>`).join("")}</select>`;
    $s("#ii-back").hidden = false; $s("#ii-next").hidden = false;
    body().innerHTML = `
      ${S.scanNote ? `<div class="illus-banner" role="note" style="margin-bottom:10px;">${esc(S.scanNote)}</div>` : `<p class="hint" style="margin:0 0 8px;">Fill in the member's details${S.pics.length ? " — the ID copy is shown beside the form" : ""}. Only the last 4 digits of the ID number are kept on the register.</p>`}
      <div class="ii-grid">
        <div>
          ${fld("ii-name", "Full name *", `<input id="ii-name" type="text" value="${esc(rd.name || "")}" autocomplete="off">`, "name")}
          ${fld("ii-id", "ID number", `<input id="ii-id" type="text" inputmode="numeric" value="${esc(rd.id || "")}" maxlength="20" autocomplete="off"><div id="ii-idinfo" class="hint"></div>`, "id")}
          <div class="cm-filters">
            ${fld("ii-dob", "Date of birth", `<input id="ii-dob" type="date" value="${esc(rd.dob || "")}">`, "dob")}
            ${fld("ii-gender", "Gender", sel("ii-gender", ["Female", "Male", "Other", "Unspecified"], rd.gender || "Unspecified"), "gender")}
            ${fld("ii-hh", "ODI / household", `<select id="ii-hh">${hhc.options.map((o) => `<option value="${esc(o)}">${esc(o || "— not linked —")}</option>`).join("")}</select>`)}
            ${fld("ii-role", "Family position", `<select id="ii-role">${ctx.roles.map((o) => `<option value="${esc(o)}">${esc(o || "— none —")}</option>`).join("")}</select>`)}
            ${fld("ii-contact", "Contact (cell number)", `<input id="ii-contact" type="text" autocomplete="off">`)}
            ${fld("ii-joined", "Joined on", `<input id="ii-joined" type="date" value="${todayIso()}">`)}
            ${fld("ii-ref", "Register / member no.", `<input id="ii-ref" type="text" value="${esc(suggestRef(R))}" autocomplete="off">`)}
            ${fld("ii-status", "Status", sel("ii-status", ctx.statuses, "Active"))}
          </div>
          ${fld("ii-verif", "Verification", sel("ii-verif", ctx.verifs, "Pending"))}
          ${fld("ii-notes", "Notes", `<textarea id="ii-notes" rows="2">${esc(S.pics.length ? `Added from an ID copy on ${todayIso()}.` : "")}</textarea>`)}
          <label class="cm-check"><input type="checkbox" id="ii-save"${S.pics.length ? " checked" : " disabled"}> File the ID copy with this member's documents (ID document)</label>
        </div>
        <div>
          ${S.pics.length ? `<div class="hint" style="margin-bottom:4px;">ID copy — click to enlarge</div>${S.pics.map((p) => `<a href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="ID copy" style="width:100%;border-radius:10px;border:1px solid var(--border);margin-bottom:8px;"></a>`).join("")}` : ""}
          <div id="ii-dup"></div>
        </div>
      </div>`;
    const $i = (id) => $s("#" + id);
    // date of birth / gender come from a valid ID number unless the user has typed their own
    const sync = () => {
      const info = saIdInfo($i("ii-id").value), box = $i("ii-idinfo"), raw = $i("ii-id").value.replace(/\D/g, "");
      if (!raw) box.innerHTML = "";
      else if (info.digits.length !== 13) box.innerHTML = `<span style="color:var(--status-warning);">${raw.length} digits — an SA ID has 13</span>`;
      else if (info.valid) box.innerHTML = `<span style="color:var(--status-good);">&#10003; Valid SA ID number · ${esc(info.citizen)}</span>`;
      else box.innerHTML = `<span style="color:var(--status-critical);">&#10007; The check digit doesn't match — re-check the number against the ID</span>`;
      if (info.valid) {
        if (!S.touched.dob && info.dob) $i("ii-dob").value = info.dob;
        if (!S.touched.gender) $i("ii-gender").value = info.gender;
      }
      dup();
    };
    const dup = () => {
      const name = $i("ii-name").value.trim(), id = $i("ii-id").value.replace(/\D/g, "");
      const hhRef = ctx.refFromHhLabel($i("ii-hh").value);
      const m = name || id ? findRegisterMatch({ name, last4: last4(id), dob: $i("ii-dob").value }, R, hhRef) : null;
      S.dup = m; const box = $i("ii-dup");
      if (!name && !id) { box.innerHTML = ""; }
      else if (!m) box.innerHTML = `<div class="ft-dup ok"><b>No duplicates found</b> on the register.</div>`;
      else box.innerHTML = `<div class="ft-dup ${m.level}"><b>${m.level === "exact" ? "Already on the register?" : "Possible duplicate"}</b> — ${esc(m.reason)}<br><span class="hint">${esc(m.row[1])} · ${esc(m.row[0] || "no ref")} · ${esc(m.row[5] || "no household")} · ${esc(m.row[8] || "")}${m.row[4] ? " · ID " + esc(m.row[4]) : ""}</span>
        ${m.level === "exact" ? `<label class="cm-check" style="margin-top:6px;"><input type="checkbox" id="ii-anyway"> This is a different person — add anyway</label>` : ""}</div>`;
      const any = $i("ii-anyway"); if (any) any.onchange = gate;
      gate();
    };
    const gate = () => {
      const blocked = !$i("ii-name").value.trim() || (S.dup && S.dup.level === "exact" && !($i("ii-anyway") && $i("ii-anyway").checked));
      $s("#ii-next").disabled = !!blocked;
      $s("#ii-foot").textContent = !$i("ii-name").value.trim() ? "Enter the member's full name." : blocked ? "This looks like someone already on the register." : "";
    };
    $i("ii-id").oninput = sync; $i("ii-name").oninput = dup; $i("ii-hh").onchange = dup; $i("ii-dob").onchange = () => { S.touched.dob = true; dup(); };
    $i("ii-gender").onchange = () => { S.touched.gender = true; };
    sync();
    $s("#ii-back").onclick = () => paintPick();
    $s("#ii-next").onclick = save;
  }

  async function save() {
    const $i = (id) => $s("#" + id);
    const name = $i("ii-name").value.trim(), rawId = $i("ii-id").value.replace(/\D/g, ""), info = saIdInfo(rawId);
    $s("#ii-next").disabled = true; $s("#ii-foot").textContent = "Saving…";
    const hhRef = ctx.refFromHhLabel($i("ii-hh").value);
    const notes = [$i("ii-notes").value.trim(), rawId && info.digits.length === 13 && !info.valid ? "ID number's check digit did not match — verify against the original." : ""].filter(Boolean).join(" ");
    const row = [$i("ii-ref").value.trim(), name, $i("ii-gender").value, $i("ii-dob").value || info.dob || "", ctx.maskId(rawId), hhRef, $i("ii-contact").value.trim(), $i("ii-joined").value, $i("ii-status").value, $i("ii-verif").value, notes,
      $i("ii-role").value || ctx.inferRole(hhRef, name), "", false];
    ctx.register().push(row);
    const keep = $i("ii-save").checked && S.files.length;
    try {
      await ctx.commit("beneficiaries");
      if (!row._id) { $s("#ii-next").disabled = false; $s("#ii-foot").textContent = ""; ctx.h.toast("The member couldn't be saved — please try again.", true); return; }
      if (keep) {
        for (const f of S.files) { try { await repo.uploadDoc(ctx.orgId, "member-id", row._id, f); ctx.h.bumpDocCount("member-id", row._id, 1); } catch (e) { ctx.h.toast("Member added, but the ID copy couldn't be filed: " + ((e && e.message) || e), true); } }
        ctx.rerender();
      }
      close();
      ctx.h.toast(`${name} added to the register${keep ? " with the ID copy filed" : ""}.`);
      if (ctx.after) ctx.after(row);
    } catch (e) { $s("#ii-next").disabled = false; ctx.h.toast("Couldn't save: " + ((e && e.message) || e), true); }
  }

  paintPick();
}
