/* ============================================================================
 * CPA360 Back Office — data layer.
 *
 * Live mode talks to the same Supabase project as the platform: bo_* tables
 * (RLS: back-office staff only) plus read-only bo_platform_* functions that
 * report on the CPA orgs. Demo mode (?demo in the URL) keeps everything in
 * memory, seeded from backoffice-demo.js, so the screens can be tried before
 * the migration is applied. Nothing in demo mode is saved.
 * ==========================================================================*/
import { supabase } from "./supabase.js";
import { demoSeed } from "./backoffice-demo.js";

export const DEMO = new URLSearchParams(location.search).has("demo");

const ORDER = {
  bo_team: ["sort", true], bo_clients: ["created_at", false], bo_milestones: ["sort", true],
  bo_tasks: ["sort", true], bo_task_comments: ["created_at", true], bo_visits: ["planned_date", false],
  bo_tickets: ["opened_at", false], bo_risks: ["sort", true], bo_decisions: ["sort", true],
  bo_kpis: ["sort", true], bo_kpi_readings: ["period", false], bo_settings: ["key", true],
};

/* ---------- live adapter ---------- */
const live = {
  async me() {
    const { data, error } = await supabase.rpc("bo_me");
    if (error) throw error;
    return data;
  },
  async list(table) {
    const [col, asc] = ORDER[table] || ["created_at", false];
    const { data, error } = await supabase.from(table).select("*").order(col, { ascending: asc }).limit(5000);
    if (error) throw error;
    return data;
  },
  async activity(limit = 80) {
    const { data, error } = await supabase.from("bo_activity").select("*").order("at", { ascending: false }).limit(limit);
    if (error) throw error;
    return data;
  },
  async insert(table, row) {
    const { data, error } = await supabase.from(table).insert(row).select().single();
    if (error) throw error;
    return data;
  },
  async update(table, id, patch, key = "id") {
    const { data, error } = await supabase.from(table).update(patch).eq(key, id).select().single();
    if (error) throw error;
    return data;
  },
  async upsert(table, row, onConflict) {
    const { data, error } = await supabase.from(table).upsert(row, { onConflict }).select().single();
    if (error) throw error;
    return data;
  },
  async remove(table, id) {
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) throw error;
  },
  async rpc(fn) {
    const { data, error } = await supabase.rpc(fn);
    if (error) throw error;
    return data;
  },
};

/* ---------- demo adapter ---------- */
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
let MEM = null;
let SEQ = 100;
const mem = () => (MEM ||= demoSeed());
const now = () => new Date().toISOString();

const demo = {
  async me() {
    return { is_staff: true, is_manager: true, is_platform_admin: true, team: mem().bo_team.find((t) => t.email === "demo@cpa360.local") || null };
  },
  async list(table) { return structuredClone(mem()[table] || []); },
  async activity() { return structuredClone(mem().bo_activity); },
  async insert(table, row) {
    const r = { id: uid(), created_at: now(), updated_at: now(), ...row };
    if (table === "bo_tasks" || table === "bo_tickets") r.number = ++SEQ;
    if (table === "bo_tasks" && r.status === "done") r.done_at = now();
    (mem()[table] ||= []).push(r);
    log(table, r, "insert");
    return structuredClone(r);
  },
  async update(table, id, patch, key = "id") {
    const r = mem()[table].find((x) => x[key] === id);
    if (!r) throw new Error("Not found");
    const before = r.status;
    Object.assign(r, patch, { updated_at: now() });
    if (table === "bo_tasks" && patch.status) r.done_at = patch.status === "done" ? (before === "done" ? r.done_at : now()) : null;
    log(table, r, "update", before);
    return structuredClone(r);
  },
  async upsert(table, row, onConflict) {
    const keys = onConflict.split(",");
    const r = (mem()[table] ||= []).find((x) => keys.every((k) => x[k] === row[k]));
    if (r) { Object.assign(r, row); return structuredClone(r); }
    return demo.insert(table, row);
  },
  async remove(table, id) {
    const list = mem()[table];
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) { log(table, list[i], "delete"); list.splice(i, 1); }
  },
  async rpc(fn) { return structuredClone(mem()[fn]); },
};

function log(table, r, action, beforeStatus) {
  const summary = (r.title || r.name || r.risk || r.decision || r.full_name || r.role_title || r.body || r.purpose || "").slice(0, 160)
    + (action === "update" && beforeStatus !== undefined && beforeStatus !== r.status ? " → " + r.status : "");
  mem().bo_activity.unshift({ id: ++SEQ, table_name: table, row_id: r.id, action, summary, actor_email: "demo@cpa360.local", at: now() });
}

export const db = DEMO ? demo : live;
