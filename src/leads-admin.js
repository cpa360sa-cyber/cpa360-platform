/* ============================================================================
 * CPA360 Leads Inbox — for platform admins (GAD Foundation staff) only.
 *
 * public.leads is write-only via PostgREST (the landing-page form can insert,
 * nobody can select). This view reads/updates through the `leads-admin` Edge
 * Function, which re-checks the caller is a platform admin on every call —
 * the nav item being hidden for everyone else is a UX nicety, not the guard.
 * ==========================================================================*/
import { supabase } from "./supabase.js";

const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const STATUSES = ["new", "contacted", "qualified", "closed"];

let VIEW = null;
let ROWS = [];
let FILTER = "All";
let ERROR = "";
const BUSY = new Set();

async function call(body) {
  const { data, error } = await supabase.functions.invoke("leads-admin", { body });
  if (error) throw new Error(error.message || "Request failed");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function renderLeadsAdmin(view) {
  VIEW = view;
  view.innerHTML = `<div class="booting" style="min-height:160px">Loading leads…</div>`;
  try {
    const data = await call({ action: "list" });
    ROWS = data.leads || [];
    ERROR = "";
  } catch (e) {
    view.innerHTML = `<div class="msg err">Couldn't load leads — ${esc(e.message)}</div>`;
    return;
  }
  paint();
}

function paint() {
  if (!VIEW) return;
  const rows = FILTER === "All" ? ROWS : ROWS.filter((r) => r.status === FILTER);
  const counts = STATUSES.reduce((m, s) => ((m[s] = ROWS.filter((r) => r.status === s).length), m), {});

  VIEW.innerHTML = `
    <p class="note">Every enquiry from the public landing-page form lands here first. This list is visible only to
      platform admins — not to any CPA's members.</p>
    ${ERROR ? `<div class="msg err">${esc(ERROR)}</div>` : ""}
    <div class="la-filters" role="tablist" aria-label="Filter by status">
      ${["All", ...STATUSES].map((s) => `<button type="button" class="${s === FILTER ? "active" : ""}" data-filter="${esc(s)}"
        role="tab" aria-selected="${s === FILTER}">${esc(s === "All" ? "All" : cap(s))}${s !== "All" ? ` <span class="n">${counts[s] || 0}</span>` : ` <span class="n">${ROWS.length}</span>`}</button>`).join("")}
    </div>
    ${rows.length ? `<div class="table-wrap"><table>
        <thead><tr>
          <th scope="col">Submitted</th><th scope="col">CPA</th><th scope="col">Contact</th>
          <th scope="col">Intent</th><th scope="col">Status</th><th scope="col">Notes</th>
        </tr></thead>
        <tbody>${rows.map(rowHtml).join("")}</tbody>
      </table></div>`
      : `<p class="note">No leads${FILTER === "All" ? "" : ` with status "${esc(FILTER)}"`} yet.</p>`}
  `;
  wire();
}

function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }

function rowHtml(r) {
  const date = new Date(r.created_at).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
  const disabled = BUSY.has(r.id) ? "disabled" : "";
  return `<tr data-id="${esc(r.id)}">
    <td class="mono">${date}</td>
    <td><b>${esc(r.cpa_name)}</b>${r.province ? `<div style="font-size:12px;color:var(--ink-2)">${esc(r.province)}</div>` : ""}</td>
    <td>${esc(r.contact_name)}<div style="font-size:12px;color:var(--ink-2)">
      <a href="mailto:${esc(r.email)}">${esc(r.email)}</a>${r.phone ? " · " + esc(r.phone) : ""}</div></td>
    <td style="text-transform:capitalize">${esc(r.intent || "")}</td>
    <td><select class="role-pill" data-status-for="${esc(r.id)}" ${disabled}
        style="border:1px solid var(--border);background:var(--surface);color:var(--ink)">
        ${STATUSES.map((s) => `<option value="${s}"${s === r.status ? " selected" : ""}>${cap(s)}</option>`).join("")}
      </select></td>
    <td class="la-notes">
      <textarea data-notes-for="${esc(r.id)}" rows="1" placeholder="Add a note…" ${disabled}>${esc(r.notes || "")}</textarea>
      <button class="linkbtn" type="button" data-save-notes="${esc(r.id)}" ${disabled}>Save note</button>
    </td>
  </tr>`;
}

function wire() {
  VIEW.querySelectorAll("[data-filter]").forEach((b) => (b.onclick = () => { FILTER = b.dataset.filter; paint(); }));
  VIEW.querySelectorAll("[data-status-for]").forEach((sel) => (sel.onchange = () =>
    updateLead(sel.dataset.statusFor, { status: sel.value })));
  VIEW.querySelectorAll("[data-save-notes]").forEach((b) => (b.onclick = () => {
    const id = b.dataset.saveNotes;
    const ta = VIEW.querySelector(`[data-notes-for="${id}"]`);
    updateLead(id, { notes: ta.value });
  }));
}

async function updateLead(id, patch) {
  if (BUSY.has(id)) return;
  BUSY.add(id);
  paint();
  try {
    const data = await call({ action: "update", id, patch });
    const i = ROWS.findIndex((r) => r.id === id);
    if (i >= 0 && data.lead) ROWS[i] = data.lead;
    ERROR = "";
  } catch (e) {
    ERROR = `Couldn't save that change — ${e.message}`;
  } finally {
    BUSY.delete(id);
    paint();
  }
}
