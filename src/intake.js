/* CPA360 — Beneficiaries → Intake.
   People send photos of their ID copy or family tree through ONE private link per CPA (usually pasted into a WhatsApp
   chat — "please send it here"); the files land here for review. Nothing touches the register until a person acts:
     · ID copy      → "Add as a new member" (opens the ID reader with the pictures already loaded) or
                      "Attach to an existing member" (files it as that member's ID document)
     · Family tree  → "File under a household & scan" (files it with the household, then opens the family-tree reader)
     · Other        → attach to a member, file under a household, or mark done
   Every item ends as Processed (with a note of what was done) or Rejected, and the files can then be deleted
   (good POPIA practice — an ID copy only needs to live in one place). The public side is submit.html /
   the intake-submit Edge Function. */
import * as repo from "./repo.js";
import { KIND_LABEL, newSlug, linkUrl, waNumber, waMessage, suggestHousehold } from "./intake-logic.js";

const UI = { filter: "new", hh: "" };
const isImg = (d) => /^image\//.test(d.mime || "");
const when = (iso) => { const d = new Date(iso), s = Math.round((Date.now() - d) / 60000); return s < 1 ? "just now" : s < 60 ? `${s} min ago` : s < 1440 ? `${Math.round(s / 60)} h ago` : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }); };

export async function renderIntake(host, ctx) {
  const { h: u } = ctx, { esc } = u;
  host.innerHTML = `<div class="state"><p>Loading the intake inbox…</p></div>`;
  let D;
  try { D = await repo.loadIntake(ctx.orgId); }
  catch (e) { host.innerHTML = `<div class="state"><p>Couldn't load the intake inbox: ${esc((e && e.message) || e)}</p><p class="hint">If this is the first time, the database may not have the Intake tables yet.</p></div>`; return; }

  const hhList = () => ctx.households().map((h) => ({ ref: String(h[0] || ""), odi: String(h[2] || h[1] || ""), row: h })).filter((h) => h.ref);
  const cpaName = () => ctx.cpa().name || "the CPA";
  const base = () => new URL("submit.html", location.href).href;
  const count = (s) => D.subs.filter((x) => x.status === s).length;
  const reload = async () => { D = await repo.loadIntake(ctx.orgId); paint(); };
  const guard = (btn, fn) => async () => { const old = btn.textContent; btn.disabled = true; try { await fn(); } catch (e) { u.toast((e && e.message) || String(e), true); } if (btn.isConnected) { btn.disabled = false; btn.textContent = old; } };

  /* ------------------------------------------------------------------ the link card --- */
  function linkCard() {
    const L = D.link;
    if (!L) return `<div class="card"><div class="card-head"><div><h3>Get documents sent straight to the platform</h3>
      <span class="hint">Make one private link for ${esc(cpaName())}. When someone sends you a photo of their ID or family tree on WhatsApp, reply with the link instead — they choose the photos, type their name, and the files arrive here for you to review.</span></div></div>
      ${ctx.canEdit ? `<button type="button" class="btn primary" id="in-make">Create my submission link</button>` : `<p class="hint">Ask an editor to create the link.</p>`}</div>`;
    const url = linkUrl(base(), L.slug), hhs = hhList();
    return `<div class="card"><div class="card-head" style="gap:8px;"><div><h3>Your submission link ${L.enabled ? `<span class="pill good">ON</span>` : `<span class="pill critical">OFF</span>`}</h3>
        <span class="hint">Reply to anyone who sends you documents on WhatsApp with this link. They see only a simple upload form — never the register, or anyone else's files.</span></div></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px;"><input id="in-url" type="text" readonly value="${esc(url)}" style="flex:1;min-width:240px;" aria-label="Submission link">
        <button type="button" class="btn" id="in-copy">Copy link</button></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <label style="font-size:12px;">Message for <select id="in-kind"><option value="id">an ID copy</option><option value="family_tree">a family tree</option><option value="other">other documents</option></select></label>
        <button type="button" class="btn primary" id="in-wa" title="Opens WhatsApp with the message ready — choose who to send it to">Open WhatsApp with this message</button>
        <button type="button" class="btn" id="in-copymsg">Copy message</button></div>
      <details style="margin-top:10px;"><summary class="hint" style="cursor:pointer;">More: a link for one household · switch off · replace the link</summary>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px;">
          <select id="in-hh" aria-label="Household" style="max-width:320px;"><option value="">Link for a household…</option>${hhs.sort((a, b) => a.odi.localeCompare(b.odi)).map((h) => `<option value="${esc(h.ref)}">${esc(h.odi || "—")} · ${esc(h.ref)}</option>`).join("")}</select>
          <button type="button" class="btn small" id="in-hhcopy">Copy household link</button></div>
        <p class="hint" style="margin:6px 0;">A household link files what comes in under that household automatically — useful when you are helping one family.</p>
        ${ctx.canEdit ? `<div style="display:flex;gap:8px;flex-wrap:wrap;"><button type="button" class="btn small" id="in-toggle">${L.enabled ? "Switch the link OFF" : "Switch the link ON"}</button><button type="button" class="btn small danger" id="in-rotate">Replace the link (the old one stops working)</button></div>` : ""}</details></div>`;
  }

  /* ------------------------------------------------------------------ the list --- */
  function itemHtml(s, urls) {
    const docs = D.docs.get(s.id) || [], tone = s.status === "new" ? "warning" : s.status === "processed" ? "good" : "neutral";
    const wa = waNumber(s.submitter_phone), hhHint = s.link_household ? `household ${s.link_household} (link)` : s.claimed_household ? `says: “${s.claimed_household}”` : "";
    const open = s.status === "new" && ctx.canEdit;
    const act = !ctx.canEdit ? "" : s.status === "new"
      ? (s.kind === "id" ? `<button type="button" class="btn small primary" data-a="addmember" data-id="${esc(s.id)}">Add as a new member</button><button type="button" class="btn small" data-a="attach" data-id="${esc(s.id)}">Attach to an existing member</button>`
        : s.kind === "family_tree" ? `<button type="button" class="btn small primary" data-a="tree" data-id="${esc(s.id)}">File under a household &amp; scan</button>`
        : `<button type="button" class="btn small" data-a="attach" data-id="${esc(s.id)}">Attach to a member</button><button type="button" class="btn small" data-a="file" data-id="${esc(s.id)}">File under a household</button><button type="button" class="btn small" data-a="done" data-id="${esc(s.id)}">Mark as done</button>`)
        + `<button type="button" class="btn small danger" data-a="reject" data-id="${esc(s.id)}">Reject</button>`
      : `${docs.length ? `<button type="button" class="btn small danger" data-a="delfiles" data-id="${esc(s.id)}" title="Remove the pictures from the inbox (anything already filed with a member or household stays there)">Delete the files</button>` : ""}<button type="button" class="btn small" data-a="reopen" data-id="${esc(s.id)}">Move back to New</button>`;
    return `<div class="card" style="margin-top:10px;${open ? "border-left:4px solid var(--status-warning);" : ""}">
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:baseline;"><b style="font-size:15px;">${esc(s.submitter_name)}</b><span class="pill neutral">${esc(KIND_LABEL[s.kind] || s.kind)}</span><span class="pill ${tone}">${esc(s.status === "new" ? "New" : s.status === "processed" ? "Processed" : "Rejected")}</span>
        <span class="hint" style="margin-left:auto;" title="${esc(new Date(s.created_at).toLocaleString("en-ZA"))}">${esc(when(s.created_at))}</span></div>
      <div class="hint" style="margin:4px 0;">${s.submitter_phone ? `${esc(s.submitter_phone)}${wa ? ` · <a href="https://wa.me/${wa}" target="_blank" rel="noopener">reply on WhatsApp</a>` : ""}` : "no cell number given"}${hhHint ? ` · ${esc(hhHint)}` : ""} · ref ${esc(s.id.slice(0, 8).toUpperCase())}</div>
      ${s.note ? `<div style="margin:4px 0;">“${esc(s.note)}”</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">${docs.length ? docs.map((d) => { const url = urls.get(d.path); return url ? `<a href="${esc(url)}" target="_blank" rel="noopener" title="${esc(d.name)}" style="display:block;width:96px;height:96px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;text-align:center;font-size:12px;color:#555;">${isImg(d) ? `<img src="${esc(url)}" alt="${esc(d.name)}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">` : `<span style="display:block;padding-top:36px;">PDF<br>${esc(d.name).slice(0, 14)}</span>`}</a>` : `<span class="hint">${esc(d.name)}</span>`; }).join("") : `<span class="hint">${s.status === "new" ? "No files." : "Files deleted."}</span>`}</div>
      ${s.outcome ? `<div class="hint" style="margin-bottom:6px;"><b>${s.status === "rejected" ? "Rejected" : "Done"}:</b> ${esc(s.outcome)}${s.reviewed_at ? ` · ${esc(when(s.reviewed_at))}` : ""}</div>` : ""}
      <div style="display:flex;gap:8px;flex-wrap:wrap;">${act}</div></div>`;
  }

  async function paint() {
    const list = D.subs.filter((s) => UI.filter === "all" || s.status === UI.filter);
    const tab = (k, l, n) => `<button type="button" class="btn small${UI.filter === k ? " primary" : ""}" data-f="${k}">${l}${n != null ? ` (${n})` : ""}</button>`;
    host.innerHTML = `${linkCard()}
      <div class="card" style="margin-top:14px;"><div class="card-head" style="gap:8px;"><div><h3>Received</h3><span class="hint">Open a picture to see it full size. Nothing is added to the register until you act on it.</span></div>
        <button type="button" class="btn small" id="in-refresh">Refresh</button></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">${tab("new", "New", count("new"))}${tab("processed", "Processed", count("processed"))}${tab("rejected", "Rejected", count("rejected"))}${tab("all", "All", D.subs.length)}</div>
        <div id="in-list">${list.length ? '<div class="state"><p>Loading…</p></div>' : `<div class="state"><p>${UI.filter === "new" ? (D.subs.length ? "Nothing waiting — you're up to date. 🎉" : (D.link ? "Nothing has been sent yet. Reply to the next person who sends you a document on WhatsApp with the link above." : "Create your link above to start receiving documents.")) : "Nothing here."}</p></div>`}</div></div>`;
    wire();
    if (!list.length) return;
    let urls = new Map();
    try { urls = await repo.docPreviewUrls(list.flatMap((s) => (D.docs.get(s.id) || []).map((d) => d.path))); } catch (e) { /* thumbnails are a nicety */ }
    const box = host.querySelector("#in-list"); if (!box) return;
    box.innerHTML = list.map((s) => itemHtml(s, urls)).join("");
    box.querySelectorAll("[data-a]").forEach((b) => (b.onclick = guard(b, () => act(b.dataset.a, D.subs.find((x) => x.id === b.dataset.id)))));
  }

  function wire() {
    host.querySelectorAll("[data-f]").forEach((b) => (b.onclick = () => { UI.filter = b.dataset.f; paint(); }));
    const $ = (q) => host.querySelector(q), L = D.link;
    $("#in-refresh").onclick = guard($("#in-refresh"), reload);
    const mk = $("#in-make"); if (mk) mk.onclick = guard(mk, async () => { D.link = await repo.saveIntakeLink(ctx.orgId, { slug: newSlug(), enabled: true }); paint(); });
    if (!L) return;
    const url = linkUrl(base(), L.slug), msg = () => waMessage($("#in-kind").value, cpaName(), url);
    $("#in-copy").onclick = () => copy(url, "Link copied.");
    $("#in-copymsg").onclick = () => copy(msg(), "Message copied — paste it into WhatsApp.");
    $("#in-wa").onclick = () => window.open("https://wa.me/?text=" + encodeURIComponent(msg()), "_blank", "noopener");
    $("#in-hhcopy").onclick = () => { const r = $("#in-hh").value; if (!r) { u.toast("Choose a household first.", true); return; } copy(linkUrl(base(), L.slug, r), "Household link copied."); };
    const tg = $("#in-toggle"); if (tg) tg.onclick = guard(tg, async () => { D.link = await repo.saveIntakeLink(ctx.orgId, { enabled: !L.enabled }); u.toast(D.link.enabled ? "The link is ON." : "The link is OFF — people who open it will be told it was switched off."); paint(); });
    const ro = $("#in-rotate"); if (ro) ro.onclick = () => u.confirmModal("Replace the link? The old link stops working straight away — anyone you gave it to will need the new one.", async () => { try { D.link = await repo.saveIntakeLink(ctx.orgId, { slug: newSlug() }); u.toast("New link created."); paint(); } catch (e) { u.toast((e && e.message) || String(e), true); } });
  }
  async function copy(text, ok) { try { await navigator.clipboard.writeText(text); u.toast(ok); } catch (e) { window.prompt("Copy this:", text); } }

  /* ------------------------------------------------------------------ actions --- */
  const filesOf = async (s) => {
    const out = [];
    for (const d of D.docs.get(s.id) || []) { const blob = await (await fetch(await repo.docPreviewUrl(d.path))).blob(); out.push(new File([blob], d.name, { type: d.mime || blob.type })); }
    return out;
  };
  const finish = async (s, status, outcome, linked) => { await repo.reviewIntake(s.id, { status, outcome, linked_ref: linked || null }); await reload(); };
  const hhRefGuess = (s) => (s.link_household && hhList().some((h) => h.ref === s.link_household) ? s.link_household : (suggestHousehold(s.claimed_household, hhList()) || {}).ref || "");

  async function act(a, s) {
    if (!s) return;
    if (a === "addmember") {
      const files = await filesOf(s);
      ctx.openIdIntake({ preload: files.filter((f) => /^image\/|pdf$/.test(f.type)).slice(0, 2), defaultHh: hhRefGuess(s), defaultContact: s.submitter_phone || "",
        after: (row) => { finish(s, "processed", `Added ${row[1]}${row[0] ? " (" + row[0] + ")" : ""} to the register.`, row[0]).catch((e) => u.toast((e && e.message) || String(e), true)); } });
      if (files.length > 2) u.toast(`Only the first 2 pictures were loaded (front and back) — ${files.length - 2} more are still in the inbox.`);
    } else if (a === "attach") attachDialog(s);
    else if (a === "tree" || a === "file") fileDialog(s, a === "tree");
    else if (a === "done") noteDialog(s, "Mark as done", "What was done? (optional)", "processed");
    else if (a === "reject") rejectDialog(s);
    else if (a === "reopen") { await repo.reviewIntake(s.id, { status: "new", outcome: null, linked_ref: null }); await reload(); }
    else if (a === "delfiles") u.confirmModal("Delete these pictures from the inbox? Anything already filed with a member or household is kept there.", async () => {
      try { for (const d of D.docs.get(s.id) || []) await repo.deleteDoc(d); await repo.updateIntake(s.id, { file_count: 0 }); u.toast("Files deleted."); await reload(); } catch (e) { u.toast((e && e.message) || String(e), true); }
    });
  }

  function attachDialog(s) {
    const reg = ctx.register(), docs = D.docs.get(s.id) || [];
    const { scrim, close } = u.govModal("Attach to an existing member", `
      <p class="hint" style="margin:0 0 8px;">Files the ${docs.length} picture${docs.length === 1 ? "" : "s"} from <b>${esc(s.submitter_name)}</b> as the member's ID document. Search by name, member number or last 4 ID digits.</p>
      <input id="at-q" type="search" placeholder="Start typing a name…" value="${esc(s.submitter_name)}" style="width:100%;"><div id="at-res" style="margin-top:8px;max-height:320px;overflow:auto;"></div>`,
      `<button class="btn" data-act="close" type="button">Cancel</button>`, 560);
    const $s = (q) => scrim.querySelector(q);
    const find = () => {
      const q = $s("#at-q").value.trim().toLowerCase(); if (q.length < 2) { $s("#at-res").innerHTML = `<p class="hint">Type at least 2 letters.</p>`; return; }
      const hits = reg.filter((r) => r._id && r[8] !== "Removed" && [r[1], r[0], String(r[4] || "").slice(-4)].some((v) => String(v || "").toLowerCase().includes(q))).slice(0, 25);
      $s("#at-res").innerHTML = hits.length ? hits.map((r, i) => `<div style="display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid var(--border);"><span style="flex:1;min-width:0;"><b>${esc(r[1])}</b><div class="hint">${esc(r[0] || "no ref")} · ${esc(r[5] || "no household")} · ${esc(r[9] || "")}${r[4] ? " · ID " + esc(r[4]) : ""}</div></span><button type="button" class="btn small primary" data-pick="${esc(r._id)}">Attach here</button></div>`).join("") : `<p class="hint">No one found. Try a different spelling, or use “Add as a new member”.</p>`;
      $s("#at-res").querySelectorAll("[data-pick]").forEach((b) => (b.onclick = guard(b, async () => {
        const m = reg.find((r) => r._id === b.dataset.pick);
        await repo.moveDocs(docs, "member-id", m._id); u.bumpDocCount("member-id", m._id, docs.length);
        close(); u.toast(`Filed with ${m[1]}.`); await finish(s, "processed", `ID copy attached to ${m[1]}${m[0] ? " (" + m[0] + ")" : ""}.`, m[0]); ctx.rerender && ctx.rerender();
      })));
    };
    $s("#at-q").oninput = find; find();
  }

  function fileDialog(s, thenScan) {
    const docs = D.docs.get(s.id) || [], hhs = hhList().sort((a, b) => a.odi.localeCompare(b.odi)), guess = hhRefGuess(s);
    const { scrim, close } = u.govModal(thenScan ? "File under a household & scan" : "File under a household", `
      <p class="hint" style="margin:0 0 8px;">Files the ${docs.length} picture${docs.length === 1 ? "" : "s"} from <b>${esc(s.submitter_name)}</b> with the household${thenScan ? ", then opens the family-tree reader so you can scan it and add the people" : ""}.${s.claimed_household ? ` They wrote: <b>“${esc(s.claimed_household)}”</b>.` : ""}</p>
      <div class="field"><label for="fd-hh">Household</label><select id="fd-hh"><option value="">— choose —</option>${hhs.map((h) => `<option value="${esc(h.ref)}"${h.ref === guess ? " selected" : ""}>${esc(h.odi || "—")} · ${esc(h.ref)}</option>`).join("")}</select>${guess ? `<div class="hint">Suggested from what was sent — check it is right.</div>` : ""}</div>`,
      `<button class="btn" data-act="close" type="button">Cancel</button><button class="btn primary" id="fd-go" type="button">${thenScan ? "File &amp; open the scan" : "File it"}</button>`, 520);
    const $s = (q) => scrim.querySelector(q);
    $s("#fd-go").onclick = guard($s("#fd-go"), async () => {
      const ref = $s("#fd-hh").value, h = hhs.find((x) => x.ref === ref);
      if (!h) { u.toast("Choose a household first.", true); return; }
      if (!h.row._id) { u.toast("Save that household first (it has no record yet).", true); return; }
      await repo.moveDocs(docs, "household-tree", h.row._id); u.bumpDocCount("household-tree", h.row._id, docs.length);
      close(); await finish(s, "processed", `Filed under household ${h.ref}${h.odi ? " (" + h.odi + ")" : ""}${thenScan ? " and opened for scanning" : ""}.`, h.ref);
      if (thenScan) ctx.openFamilyTree(h.row); else u.toast("Filed.");
    });
  }

  function noteDialog(s, title, label, status) {
    const { scrim, close } = u.govModal(title, `<div class="field"><label for="nt-t">${esc(label)}</label><textarea id="nt-t" rows="3" maxlength="300"></textarea></div>`,
      `<button class="btn" data-act="close" type="button">Cancel</button><button class="btn primary" id="nt-go" type="button">Save</button>`, 480);
    scrim.querySelector("#nt-go").onclick = guard(scrim.querySelector("#nt-go"), async () => { const t = scrim.querySelector("#nt-t").value.trim(); close(); await finish(s, status, t || (status === "processed" ? "Marked as done." : "")); });
  }
  function rejectDialog(s) {
    const docs = D.docs.get(s.id) || [];
    const { scrim, close } = u.govModal("Reject this submission", `<p class="hint" style="margin:0 0 8px;">Use this for blurry, wrong or unwanted files. Nothing is added to the register.</p>
      <div class="field"><label for="rj-t">Reason (kept for your records)</label><input id="rj-t" type="text" maxlength="200" placeholder="e.g. photo too blurry — asked to resend"></div>
      ${docs.length ? `<label class="cm-check"><input type="checkbox" id="rj-del" checked> Also delete the ${docs.length} picture${docs.length === 1 ? "" : "s"} from the inbox</label>` : ""}`,
      `<button class="btn" data-act="close" type="button">Cancel</button><button class="btn danger" id="rj-go" type="button">Reject</button>`, 500);
    const $s = (q) => scrim.querySelector(q);
    $s("#rj-go").onclick = guard($s("#rj-go"), async () => {
      const why = $s("#rj-t").value.trim(), del = $s("#rj-del") && $s("#rj-del").checked; close();
      if (del) { for (const d of docs) await repo.deleteDoc(d); await repo.updateIntake(s.id, { file_count: 0 }); }
      await finish(s, "rejected", why || "Rejected.");
    });
  }

  paint();
}
