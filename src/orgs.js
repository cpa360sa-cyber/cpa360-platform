import { supabase } from "./supabase.js";

const ACTIVE_KEY = "cpa360.activeOrg";

/** The CPAs the signed-in user belongs to, with their role in each. */
export async function myOrgs() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("role, created_at, org:orgs(id, name, region, registration, current_gate)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || [])
    .filter((r) => r.org)
    .map((r) => ({ ...r.org, role: r.role }));
}

export function getActiveOrgId() {
  try { return localStorage.getItem(ACTIVE_KEY); } catch { return null; }
}
export function setActiveOrgId(id) {
  try { localStorage.setItem(ACTIVE_KEY, id); } catch {}
}

/** Pick a valid active org: the stored one if the user still belongs to it,
    otherwise the first, otherwise null. */
export function resolveActiveOrg(orgs) {
  const stored = getActiveOrgId();
  const hit = orgs.find((o) => o.id === stored);
  const chosen = hit || orgs[0] || null;
  if (chosen) setActiveOrgId(chosen.id);
  return chosen;
}

export async function createOrg({ name, registration, region, established }) {
  const { data, error } = await supabase.rpc("create_org", {
    p_name: name,
    p_registration: registration || null,
    p_region: region || null,
    p_established: established ? Number(established) : null,
  });
  if (error) throw error;
  return data; // org uuid
}

export async function seedSandbox() {
  const { data, error } = await supabase.rpc("seed_sandbox_cpa");
  if (error) throw error;
  return data;
}

const ORDER = { viewer: 0, member: 1, admin: 2, owner: 3 };
export const atLeast = (role, min) => (ORDER[role] ?? -1) >= (ORDER[min] ?? 99);
