/* ============================================================================
 * CPA360 Stage Reviews — for platform admins (GAD Foundation staff) only.
 *
 * A CPA's own dashboard (dashboard.js) evaluates its live score/domain data
 * against the readiness rule for its next CPA360 Journey stage and, when met,
 * calls flag_stage_review() — the CPA can never advance itself. This screen
 * is where a GAD Foundation reviewer sees every flagged CPA and approves or
 * holds the transition. Only approval moves gates/orgs.current_gate — see
 * migration 0037_stage_gating.sql for the full model.
 *
 * list_stage_reviews() / decide_stage_review() are both SECURITY DEFINER RPCs
 * that re-check is_platform_admin() server-side — the nav item being hidden
 * for everyone else is a UX nicety, not the guard.
 * ==========================================================================*/
import * as repo from "./repo.js";

const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const STAGE_NAMES = { 1: "Assess", 2: "Recover", 3: "Stabilise", 4: "Professionalise", 5: "Productivise", 6: "Commercialise", 7: "Scale" };
const FILTERS = ["pending", "approved", "held", "all"];

let VIEW = null;
let ROWS = [];
let FILTER = "pending";
let ERROR = "";
const BUSY = new Set();
const NOTES = {};

export async function renderStageReviews(view) {
  VIEW = view;
  view.innerHTML = `<div class="booting" style="min-height:160px">Loading stage reviews…</div>`;
  await load();
}

async function load() {
  try {
    ROWS = await repo.listStageReviews(FILTER === "all" ? null : FILTER);
    ERROR = "";
  } catch (e) {
    VIEW.innerHTML = `<div class="msg err">Couldn't load stage reviews — ${esc(e.message)}</div>`;
    return;
  }
  paint();
}

function paint() {
  if (!VIEW) return;
  const counts = { pending: 0, approved: 0, held: 0 };
  ROWS.forEach((r) => { if (counts[r.status] != null) counts[r.status]++; });

  VIEW.innerHTML = `
    <p class="note">Every CPA whose live score data has crossed the readiness bar for its next CPA360 Journey stage lands
      here automatically. Nothing unlocks for that CPA until you approve it — holding just records why, and the CPA can be
      re-flagged later once it's genuinely ready.</p>
    ${ERROR ? `<div class="msg err">${esc(ERROR)}</div>` : ""}
    <div class="la-filters" role="tablist" aria-label="Filter by status">
      ${FILTERS.map((s) => `<button type="button" class="${s === FILTER ? "active" : ""}" data-filter="${esc(s)}"
        role="tab" aria-selected="${s === FILTER}">${s === "all" ? "All" : cap(s)}${s !== "all" ? ` <span class="n">${counts[s] || 0}</span>` : ""}</button>`).join("")}
    </div>
    ${ROWS.length ? `<div class="table-wrap"><table>
        <thead><tr>
          <th scope="col">Flagged</th><th scope="col">CPA</th><th scope="col">Transition</th>
          <th scope="col">Why it was flagged</th><th scope="col">Status</th><th scope="col">Decision</th>
        </tr></thead>
        <tbody>${ROWS.map(rowHtml).join("")}</tbody>
      </table></div>`
      : `<p class="note">No${FILTER === "all" ? "" : ` ${FILTER}`} stage reviews right now.</p>`}
  `;
  wire();
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function rowHtml(r) {
  const date = new Date(r.flagged_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  const disabled = BUSY.has(r.id) ? "disabled" : "";
  const detail = (r.flagged_detail && r.flagged_detail.detail) || "";
  return `<tr data-id="${esc(r.id)}">
    <td class="mono">${date}</td>
    <td><b>${esc(r.org_name)}</b><div style="font-size:12px;color:var(--ink-2)">Currently Stage ${r.current_gate}</div></td>
    <td>Stage ${r.from_stage} → <b>Stage ${r.to_stage} — ${esc(STAGE_NAMES[r.to_stage] || "")}</b></td>
    <td style="max-width:320px;font-size:12.5px;color:var(--ink-2)">${esc(detail)}</td>
    <td><span class="pill ${r.status === "approved" ? "good" : r.status === "held" ? "" : "brand"}">${cap(r.status)}</span></td>
    <td>${r.status === "pending" ? `
        <textarea data-note-for="${esc(r.id)}" rows="1" placeholder="Optional note…" ${disabled}>${esc(NOTES[r.id] || "")}</textarea>
        <div style="display:flex;gap:6px;margin-top:6px;">
          <button class="btn primary" type="button" data-approve="${esc(r.id)}" ${disabled}>Approve</button>
          <button class="btn" type="button" data-hold="${esc(r.id)}" ${disabled}>Hold</button>
        </div>`
      : `<div style="font-size:12px;color:var(--ink-2)">
          ${r.decided_at ? new Date(r.decided_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" }) : ""}
          ${r.decision_note ? `<br>${esc(r.decision_note)}` : ""}
        </div>`}
    </td>
  </tr>`;
}

function wire() {
  VIEW.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { FILTER = b.dataset.filter; load(); }));
  VIEW.querySelectorAll("[data-note-for]").forEach((ta) => (ta.oninput = () => { NOTES[ta.dataset.noteFor] = ta.value; }));
  VIEW.querySelectorAll("[data-approve]").forEach((b) => (b.onclick = () => decide(b.dataset.approve, "approved")));
  VIEW.querySelectorAll("[data-hold]").forEach((b) => (b.onclick = () => decide(b.dataset.hold, "held")));
}

async function decide(id, decision) {
  if (BUSY.has(id)) return;
  BUSY.add(id);
  paint();
  try {
    await repo.decideStageReview(id, decision, NOTES[id] || null);
    delete NOTES[id];
    ERROR = "";
    await load();
  } catch (e) {
    ERROR = `Couldn't record that decision — ${e.message}`;
    BUSY.delete(id);
    paint();
    return;
  }
  BUSY.delete(id);
}
