/* CPA360 — customisable dashboard.
   The Executive Dashboard is a 12-column grid of widgets. Each person can:
     · hide / show widgets      · reorder them (drag the handle, or the ▲ ▼ buttons — works on touch too)
     · resize them (⅓ · ½ · ⅔ · full width, where a widget allows it)
   The arrangement is saved per person and per CPA (so it follows them across devices) and cached on the device so the
   dashboard never flashes the default order. An admin can also "Save as CPA default" — what everyone without their own
   arrangement sees. "Reset" returns a person to the CPA default, or to the built-in layout.
   Pure helpers (resolveLayout / serialize / moveVisible) are unit-tested; initDashLayout wires the DOM. */

export const SIZES = [[4, "Small (⅓)"], [6, "Half"], [8, "Wide (⅔)"], [12, "Full width"]];
const ALL = [4, 6, 8, 12];
/** The built-in layout. New widgets start hidden ("Add widgets") so nobody's dashboard changes until they choose. */
export const WIDGETS = [
  { id: "next", label: "What must happen next", span: 12, spans: [12] },
  { id: "score", label: "Institutional score & journey", span: 12, spans: [12] },
  { id: "priority", label: "Priority actions", span: 12, spans: [8, 12] },
  { id: "domains", label: "Performance by domain", span: 6, spans: ALL },
  { id: "attention", label: "What needs attention", span: 6, spans: ALL },
  { id: "deadlines", label: "Upcoming deadlines", span: 6, spans: ALL },
  { id: "finance", label: "Financial alerts", span: 6, spans: ALL },
  { id: "projects", label: "Project status", span: 6, spans: ALL },
  { id: "docs", label: "Recent documents", span: 6, spans: ALL },
  { id: "bene", label: "Beneficiary snapshot", span: 6, spans: ALL, hiddenByDefault: true },
  { id: "birthdays", label: "Birthdays this week", span: 6, spans: ALL, hiddenByDefault: true },
  { id: "quick", label: "Quick links", span: 6, spans: ALL, hiddenByDefault: true },
];

/** saved layout (or null) → { order:[id], hidden:[id], span:{id:n} } — unknown widgets dropped, new ones appended, bad sizes reset. */
export function resolveLayout(saved, defs = WIDGETS) {
  const known = new Map(defs.map((d) => [d.id, d]));
  const s = saved && typeof saved === "object" ? saved : {};
  const savedOrder = Array.isArray(s.order) ? s.order.filter((id) => known.has(id)) : [];
  const order = [...new Set(savedOrder)];
  defs.forEach((d) => { if (!order.includes(d.id)) order.push(d.id); });
  const hidden = new Set((Array.isArray(s.hidden) ? s.hidden : []).filter((id) => known.has(id)));
  defs.forEach((d) => { if (d.hiddenByDefault && !savedOrder.includes(d.id)) hidden.add(d.id); });   // a widget this layout has never seen
  const span = {};
  defs.forEach((d) => { const v = s.span && +s.span[d.id]; span[d.id] = v && d.spans.includes(v) ? v : d.span; });
  return { order, hidden: [...hidden], span };
}
export const serialize = (st) => ({ v: 1, order: [...st.order], hidden: [...st.hidden], span: { ...st.span } });
export const sameLayout = (a, b) => JSON.stringify(serialize(a)) === JSON.stringify(serialize(b));

/** Move a widget one place up/down among the VISIBLE widgets (hidden ones keep their slots). */
export function moveVisible(order, hidden, id, delta) {
  const vis = order.filter((x) => !hidden.includes(x)), i = vis.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= vis.length) return order;
  const out = [...order], a = out.indexOf(id), b = out.indexOf(vis[j]);
  out[a] = vis[j]; out[b] = id;
  return out;
}

/* ---------------------------------------------------------------------------------------------- DOM --- */
/** o: { grid, bar, isAdmin, load(), save(layout), saveDefault(layout), clearOwn(), clearDefault(), toast(msg,err), cacheKey, defs? } */
export function initDashLayout(o) {
  const defs = o.defs || WIDGETS, grid = o.grid, bar = o.bar;
  const el = (id) => grid.querySelector(`.dw[data-w="${id}"]`);
  let layouts = { own: null, def: null }, st = resolveLayout(null, defs), editing = false, timer = null, dragging = null;
  const readCache = () => { try { return JSON.parse(localStorage.getItem(o.cacheKey) || "null"); } catch (e) { return null; } };
  const writeCache = (v) => { try { v ? localStorage.setItem(o.cacheKey, JSON.stringify(v)) : localStorage.removeItem(o.cacheKey); } catch (e) { /* private mode */ } };
  const base = () => resolveLayout(layouts.own || layouts.def, defs);

  /* per-widget edit tools, added once */
  defs.forEach((d) => {
    const dw = el(d.id); if (!dw || dw.querySelector(":scope > .dw-tools")) return;
    const t = document.createElement("div"); t.className = "dw-tools"; t.setAttribute("role", "toolbar"); t.setAttribute("aria-label", d.label + " — layout");
    t.innerHTML = `<span class="dw-h" title="Drag to move" aria-hidden="true">⠿</span><b class="dw-t">${d.label}</b>
      <button type="button" data-a="up" title="Move up" aria-label="Move ${d.label} up">▲</button><button type="button" data-a="down" title="Move down" aria-label="Move ${d.label} down">▼</button>
      ${d.spans.length > 1 ? `<select data-a="size" aria-label="Width of ${d.label}">${SIZES.filter(([n]) => d.spans.includes(n)).map(([n, l]) => `<option value="${n}">${l}</option>`).join("")}</select>` : ""}
      <button type="button" data-a="hide" title="Hide this widget" aria-label="Hide ${d.label}">✕</button>`;
    dw.prepend(t);
    t.querySelector(".dw-h").addEventListener("mousedown", () => { dw.draggable = true; });
    t.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-a]"); if (!b) return;
      if (b.dataset.a === "hide") { if (!st.hidden.includes(d.id)) st.hidden.push(d.id); }
      else st.order = moveVisible(st.order, st.hidden, d.id, b.dataset.a === "up" ? -1 : 1);
      changed();
    });
    const sz = t.querySelector("select"); if (sz) sz.addEventListener("change", () => { st.span[d.id] = +sz.value; changed(); });
    dw.addEventListener("dragstart", (e) => { if (!dw.draggable) return; dragging = dw; dw.classList.add("dragging"); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", d.id); } catch (x) { /* */ } });
    dw.addEventListener("dragend", () => { dw.draggable = false; dw.classList.remove("dragging"); dragging = null; st.order = [...grid.querySelectorAll(":scope > .dw")].map((x) => x.dataset.w).filter((id) => defs.some((q) => q.id === id)); changed(true); });
  });
  grid.addEventListener("mouseup", () => { if (!dragging) defs.forEach((d) => { const dw = el(d.id); if (dw) dw.draggable = false; }); });
  grid.addEventListener("dragover", (e) => {
    if (!dragging) return; e.preventDefault();
    const t = e.target.closest(".dw"); if (!t || t === dragging || t.hidden) return;
    const r = t.getBoundingClientRect(), before = e.clientY < r.top + r.height / 2;
    t.parentNode.insertBefore(dragging, before ? t : t.nextSibling);
  });

  function paint() {
    st.order.forEach((id) => { const dw = el(id); if (dw) grid.appendChild(dw); });              // physical order = reading/tab order
    defs.forEach((d) => {
      const dw = el(d.id); if (!dw) return;
      dw.hidden = st.hidden.includes(d.id);
      dw.style.setProperty("--span", st.span[d.id]);
      const sz = dw.querySelector(".dw-tools select"); if (sz) sz.value = String(st.span[d.id]);
      const up = dw.querySelector('[data-a="up"]'), dn = dw.querySelector('[data-a="down"]'), vis = st.order.filter((x) => !st.hidden.includes(x)), i = vis.indexOf(d.id);
      if (up) up.disabled = i <= 0; if (dn) dn.disabled = i < 0 || i >= vis.length - 1;
    });
    grid.classList.toggle("dash-editing", editing);
    paintBar();
  }
  function paintBar() {
    if (!bar) return;
    const hiddenDefs = defs.filter((d) => st.hidden.includes(d.id));
    if (!editing) { bar.innerHTML = `<button type="button" class="btn small" id="dl-edit" title="Choose which widgets you see, and where">⚙ Customize dashboard</button>`; bar.querySelector("#dl-edit").onclick = () => { editing = true; paint(); }; return; }
    bar.innerHTML = `<div class="dl-edit">
      <div class="dl-row"><b>Customizing your dashboard</b><span class="hint">Drag ⠿ or use ▲ ▼ to move · pick a width · ✕ to hide. It saves as you go.</span>
        <span style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap;">
          ${layouts.own || layouts.def ? `<button type="button" class="btn small" id="dl-reset" title="${layouts.def && !layouts.own ? "Back to the built-in layout" : layouts.def ? "Back to the CPA's default layout" : "Back to the built-in layout"}">Reset</button>` : ""}
          ${o.isAdmin ? `<button type="button" class="btn small" id="dl-def" title="Everyone without their own arrangement will see this one">Save as CPA default</button>${layouts.def ? `<button type="button" class="btn small" id="dl-undef">Clear CPA default</button>` : ""}` : ""}
          <button type="button" class="btn small primary" id="dl-done">Done</button></span></div>
      <div class="dl-row"><span class="hint">${hiddenDefs.length ? "Add widgets:" : "All widgets are showing."}</span>${hiddenDefs.map((d) => `<button type="button" class="btn small" data-add="${d.id}">＋ ${d.label}</button>`).join("")}</div></div>`;
    bar.querySelector("#dl-done").onclick = async () => { await flush(); editing = false; paint(); };
    const rs = bar.querySelector("#dl-reset"); if (rs) rs.onclick = async () => { layouts.own = null; writeCache(null); st = base(); paint(); try { await o.clearOwn(); o.toast("Back to " + (layouts.def ? "the CPA's default layout." : "the built-in layout.")); } catch (e) { o.toast("Reset on this device — couldn't sync: " + ((e && e.message) || e), true); } };
    const df = bar.querySelector("#dl-def"); if (df) df.onclick = async () => { try { await o.saveDefault(serialize(st)); layouts.def = serialize(st); o.toast("Saved as the CPA's default layout."); paint(); } catch (e) { o.toast("Couldn't save the default: " + ((e && e.message) || e), true); } };
    const ud = bar.querySelector("#dl-undef"); if (ud) ud.onclick = async () => { try { await o.clearDefault(); layouts.def = null; o.toast("CPA default cleared."); paint(); } catch (e) { o.toast("Couldn't clear it: " + ((e && e.message) || e), true); } };
    bar.querySelectorAll("[data-add]").forEach((b) => (b.onclick = () => { st.hidden = st.hidden.filter((x) => x !== b.dataset.add); changed(); }));
  }
  function changed(skipPaint) { if (!skipPaint) paint(); else paintBar(); clearTimeout(timer); timer = setTimeout(flush, 500); }
  async function flush() {
    clearTimeout(timer); timer = null;
    const lay = serialize(st); layouts.own = lay; writeCache(lay);
    try { await o.save(lay); } catch (e) { o.toast("Saved on this device — couldn't sync to your account: " + ((e && e.message) || e), true); }
  }

  /* start from the device cache (instant), then reconcile with the account */
  const cached = readCache();
  if (cached) { layouts.own = cached; st = base(); }
  paint();
  (async () => {
    try {
      const got = await o.load();
      layouts.def = got.def;
      if (got.own) { layouts.own = got.own; writeCache(got.own); } else { layouts.own = null; writeCache(null); }   // the account is the source of truth
      if (!editing) { st = base(); paint(); }
    } catch (e) { /* offline / preview — the cached or built-in layout stays */ }
  })();
  return { refresh: paint, isEditing: () => editing, state: () => st };
}
