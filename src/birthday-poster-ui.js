/* CPA360 — Birthdays → "Birthday shoutout": the dialog around birthday-poster.js.
   Who is on the poster comes from the Birthdays rules (active adults who haven't opted out; under-18s are never listed).
   The person posting sees a live preview, can untick or correct a name, switch ages / languages / colours, then:
     · Share to WhatsApp Status — on a phone this opens WhatsApp's share sheet (choose "My status")
     · Download — the PNG(s), for posting from a computer through WhatsApp Web, or from a phone's gallery
     · Copy caption — wording to paste under the Status
   WhatsApp gives software no way to publish a Status itself, so nothing is ever posted without a person doing it. */
import { splitPosters, posterSvg, posterPng, captionText, GREETINGS, WISH } from "./birthday-poster.js";
import { THEMES, themeFor } from "./family-tree-svg.js";

const dayName = (d) => d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
const longDate = (d) => d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const safe = (s) => String(s || "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").slice(0, 50) || "CPA";

export function openBirthdayPoster(ctx) {
  const { h: u } = ctx, { esc } = u, store = (k, v) => { try { v === undefined ? null : localStorage.setItem("cpa360.bposter." + k + "." + ctx.orgId, JSON.stringify(v)); } catch (e) { /* private mode */ } };
  const load = (k, d) => { try { const v = localStorage.getItem("cpa360.bposter." + k + "." + ctx.orgId); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const S = { day: 0, rows: [], info: null, theme: load("theme", "brand"), ages: load("ages", true), langs: load("langs", ["en", "zu", "ss"]), text: { ...Object.fromEntries(Object.entries(GREETINGS).map(([k, v]) => [k, v.text])), ...load("text", {}) }, page: 0, busy: false };
  const canShare = (() => { try { return typeof navigator !== "undefined" && !!navigator.canShare && navigator.canShare({ files: [new File([new Blob(["x"])], "x.png", { type: "image/png" })] }); } catch (e) { return false; } })();
  const cache = new Map();                                    // poster index → { key, blob }

  const pick = (d) => { S.info = ctx.people(d); S.rows = S.info.people.map((p) => ({ ...p, on: true })); S.page = 0; cache.clear(); };
  pick(0);
  const choices = () => Array.from({ length: 8 }, (_, d) => { const i = ctx.people(d); return { d, n: i.people.length, date: i.date }; });

  const { scrim, close } = u.govModal("Birthday shoutout — a poster for WhatsApp Status", `
    <div style="display:grid;grid-template-columns:minmax(300px,380px) 1fr;gap:18px;" class="bp-grid">
      <div id="bp-ctl"></div>
      <div style="text-align:center;"><div id="bp-prev" style="display:inline-block;border:1px solid var(--border);border-radius:12px;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,.18);line-height:0;background:#eee;"></div>
        <div id="bp-pager" style="margin-top:8px;"></div></div></div>`,
    `<span id="bp-foot" class="hint" style="margin-right:auto;"></span><button class="btn" data-act="close" type="button">Close</button>
     <button class="btn" id="bp-cap" type="button">Copy caption</button><button class="btn" id="bp-dl" type="button">Download</button>
     ${canShare ? `<button class="btn primary" id="bp-share" type="button">Share to WhatsApp Status</button>` : ""}`, 1020);
  const $s = (q) => scrim.querySelector(q);
  const cpa = () => ctx.cpa();
  const included = () => S.rows.filter((r) => r.on && String(r.name).trim());
  const greetings = () => ["en", "zu", "ss"].filter((k) => S.langs.includes(k)).map((k) => (S.text[k] || "").trim()).filter(Boolean);
  const posters = () => {
    const pages = splitPosters(included().map((r) => ({ name: String(r.name).trim(), age: r.age })));
    const th = themeFor(S.theme, cpa()), date = longDate(S.info.date);
    return pages.map((people, i) => ({ people, svg: posterSvg({ people, theme: th, cpaName: cpa().name || "", logo: cpa().logoDataUrl || "", dateLabel: date, greetings: greetings(), showAges: S.ages, page: i + 1, pages: pages.length, seed: 11 + i * 7 }), key: JSON.stringify([people, S.theme, S.ages, greetings(), i, pages.length]) }));
  };
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;     // the local day, not UTC
  const fileName = (i, n) => `Birthday-Shoutout-${safe(cpa().name)}-${ymd(S.info.date)}${n > 1 ? "-" + (i + 1) : ""}.png`;
  async function pngFor(i, ps) {
    const c = cache.get(i);
    if (c && c.key === ps[i].key) return c.blob;
    const blob = await posterPng(ps[i].svg); cache.set(i, { key: ps[i].key, blob }); return blob;
  }

  function paintCtl() {
    const ch = choices(), langs = S.langs;
    $s("#bp-ctl").innerHTML = `
      <div class="field"><label for="bp-day">Whose birthdays?</label><select id="bp-day">${ch.map((c) => `<option value="${c.d}"${c.d === S.day ? " selected" : ""}>${c.d === 0 ? "Today" : c.d === 1 ? "Tomorrow" : ""}${c.d < 2 ? " · " : ""}${esc(dayName(c.date))} — ${c.n} birthday${c.n === 1 ? "" : "s"}</option>`).join("")}</select></div>
      <div class="field"><label>People on the poster</label>
        ${S.rows.length ? `<div style="max-height:210px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:4px 8px;">${S.rows.map((r, i) => `<div style="display:flex;gap:8px;align-items:center;padding:3px 0;"><input type="checkbox" data-on="${i}"${r.on ? " checked" : ""} aria-label="Include ${esc(r.name)}" style="width:18px;height:18px;flex:none;margin:0;"><input type="text" data-nm="${i}" value="${esc(r.name)}" aria-label="Name" style="flex:1 1 auto;width:auto;min-width:0;"><b class="mono" style="flex:none;min-width:2ch;text-align:right;">${esc(r.age)}</b></div>`).join("")}</div>`
          : `<div class="hint">Nobody on this day has a birth date on the register — pick another day.</div>`}
        <div class="hint" style="margin-top:4px;">${S.info.minors ? `${S.info.minors} member${S.info.minors === 1 ? "" : "s"} under 18 left off. ` : ""}${S.info.optedOut ? `${S.info.optedOut} opted out of wishes — left off. ` : ""}Untick someone, or correct a spelling, and the poster updates.</div></div>
      <label class="cm-check"><input type="checkbox" id="bp-ages"${S.ages ? " checked" : ""}> Show their ages</label>
      <div class="field" style="margin-top:8px;"><label for="bp-theme">Colours</label><select id="bp-theme">${Object.entries(THEMES).map(([k, f]) => `<option value="${k}"${k === S.theme ? " selected" : ""}>${esc(f("#1c3a68", "#2f7d4f").name)}</option>`).join("")}</select></div>
      <div class="field"><label>Greeting</label>${Object.entries(GREETINGS).map(([k, g]) => `<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;"><input type="checkbox" data-lg="${k}"${langs.includes(k) ? " checked" : ""} aria-label="${esc(g.label)}" style="width:18px;height:18px;flex:none;margin:0;"><span class="hint" style="flex:none;width:56px;">${esc(g.label)}</span><input type="text" data-gt="${k}" value="${esc(S.text[k])}" aria-label="${esc(g.label)} greeting" style="flex:1 1 auto;width:auto;min-width:0;"></div>`).join("")}
        <div class="hint">Please have a first-language speaker check the isiZulu and siSwati wording once — you can correct it here and it's remembered on this computer.</div></div>`;
    $s("#bp-day").onchange = (e) => { S.day = +e.target.value; pick(S.day); paintCtl(); paint(); };
    $s("#bp-ages").onchange = (e) => { S.ages = e.target.checked; store("ages", S.ages); paint(); };
    $s("#bp-theme").onchange = (e) => { S.theme = e.target.value; store("theme", S.theme); paint(); };
    $s("#bp-ctl").querySelectorAll("[data-on]").forEach((b) => (b.onchange = () => { S.rows[+b.dataset.on].on = b.checked; S.page = 0; paint(); }));
    $s("#bp-ctl").querySelectorAll("[data-nm]").forEach((b) => (b.oninput = () => { S.rows[+b.dataset.nm].name = b.value; paint(); }));
    $s("#bp-ctl").querySelectorAll("[data-lg]").forEach((b) => (b.onchange = () => { S.langs = Object.keys(GREETINGS).filter((k) => ($s(`[data-lg="${k}"]`) || {}).checked); store("langs", S.langs); paint(); }));
    $s("#bp-ctl").querySelectorAll("[data-gt]").forEach((b) => (b.oninput = () => { S.text[b.dataset.gt] = b.value; store("text", S.text); paint(); }));
  }

  let timer = null;
  function paint() {
    const ps = posters();
    if (S.page >= ps.length) S.page = Math.max(0, ps.length - 1);
    const prev = $s("#bp-prev");
    if (!ps.length) { prev.innerHTML = `<div style="width:300px;height:400px;display:grid;place-items:center;padding:20px;line-height:1.4;" class="hint">Nobody to show — tick at least one person.</div>`; }
    else { prev.innerHTML = ps[S.page].svg.svg; const svg = prev.querySelector("svg"); svg.style.width = "min(300px, 36vw)"; svg.style.height = "auto"; svg.style.display = "block"; }
    $s("#bp-pager").innerHTML = ps.length > 1 ? `<button class="btn small" id="bp-prevp" type="button"${S.page ? "" : " disabled"}>&lsaquo;</button> <span class="hint">Poster ${S.page + 1} of ${ps.length} — ${ps[S.page].people.length} people</span> <button class="btn small" id="bp-nextp" type="button"${S.page < ps.length - 1 ? "" : " disabled"}>&rsaquo;</button>` : ps.length ? `<span class="hint">${ps[0].people.length} on this poster</span>` : "";
    const pp = $s("#bp-prevp"); if (pp) pp.onclick = () => { S.page--; paint(); };
    const np = $s("#bp-nextp"); if (np) np.onclick = () => { S.page++; paint(); };
    ["#bp-cap", "#bp-dl", "#bp-share"].forEach((q) => { const b = $s(q); if (b) b.disabled = !ps.length; });
    $s("#bp-foot").textContent = ps.length ? (canShare ? "" : "On a computer: download, then in WhatsApp Web open Status and add the picture.") : "";
    clearTimeout(timer); timer = setTimeout(() => ps.forEach((_, i) => pngFor(i, ps).catch(() => {})), 400);     // pre-render so Share is instant
  }
  const run = (id, fn) => { const b = $s(id); if (!b) return; b.onclick = async () => { if (S.busy) return; S.busy = true; const old = b.textContent; b.disabled = true; b.textContent = "…"; try { await fn(); } catch (e) { if (!(e && e.name === "AbortError")) u.toast("Couldn't do that: " + ((e && e.message) || e), true); } S.busy = false; b.disabled = false; b.textContent = old; }; };
  const caption = () => captionText(included().map((r) => ({ name: String(r.name).trim(), age: r.age })), cpa().name, "", S.ages);

  run("#bp-cap", async () => { try { await navigator.clipboard.writeText(caption()); u.toast("Caption copied — paste it under your Status."); } catch (e) { window.prompt("Copy this caption:", caption()); } });
  run("#bp-dl", async () => {
    const ps = posters();
    for (let i = 0; i < ps.length; i++) {
      const blob = await pngFor(i, ps), url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = fileName(i, ps.length); a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
      await new Promise((r) => setTimeout(r, 350));
    }
    u.toast(ps.length > 1 ? `${ps.length} posters downloaded.` : "Poster downloaded.");
    if (S.day === 0 && ctx.markDone) ctx.markDone();               // today's shoutout is made — quieten the reminder
  });
  run("#bp-share", async () => {
    const ps = posters(), files = [];
    for (let i = 0; i < ps.length; i++) files.push(new File([await pngFor(i, ps)], fileName(i, ps.length), { type: "image/png" }));
    if (!navigator.canShare({ files })) { u.toast("This phone can't share these pictures directly — use Download instead.", true); return; }
    await navigator.share({ files, text: caption(), title: "Birthday shoutout" });
    if (S.day === 0 && ctx.markDone) ctx.markDone();
  });

  paintCtl(); paint();
}
