import { supabase } from "./supabase.js";

const ACTIVE_KEY = "cpa360.activeOrg";
const BRAND_BUCKET = "cpa-docs";

/** The CPAs the signed-in user belongs to, with their role in each. */
export async function myOrgs() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("role, created_at, org:orgs(id, name, region, registration, current_gate, logo_path, brand_primary, brand_secondary, brand_footer)")
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

/* ============================== Brand Box ============================== */
/* A CPA's own logo + colors, applied to every generated document (Tools
   Library downloads, the printed board pack). Logo bytes live in the
   existing private 'cpa-docs' bucket; orgs.logo_path just records the key. */

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error || new Error("Couldn't read file."));
    fr.readAsDataURL(blob);
  });
}

export async function updateOrgBrand(orgId, { primary, secondary, footer }) {
  const { error } = await supabase.from("orgs").update({
    brand_primary: primary || null, brand_secondary: secondary || null, brand_footer: footer || null,
  }).eq("id", orgId);
  if (error) throw error;
}

export async function uploadOrgLogo(orgId, file) {
  if (!/^image\//.test(file.type)) throw new Error("Please choose an image file (PNG, JPG or SVG).");
  if (file.size > 4 * 1048576) throw new Error("Max 4 MB.");
  const path = `${orgId}/branding/logo`;
  const up = await supabase.storage.from(BRAND_BUCKET).upload(path, file, { upsert: true, contentType: file.type });
  if (up.error) throw up.error;
  const { error } = await supabase.from("orgs").update({ logo_path: path }).eq("id", orgId);
  if (error) throw error;
  return path;
}

export async function removeOrgLogo(orgId, path) {
  if (path) await supabase.storage.from(BRAND_BUCKET).remove([path]).catch(() => {});
  const { error } = await supabase.from("orgs").update({ logo_path: null }).eq("id", orgId);
  if (error) throw error;
}

/** Fetches the org's logo and returns it as a data: URL — inlined into
    generated documents so they render without depending on a signed URL
    (which expires) or network access once downloaded. */
export async function orgLogoDataUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(BRAND_BUCKET).download(path);
  if (error) throw error;
  return blobToDataUrl(data);
}

/** Resolves an org into the flat brand object generated documents expect,
    caching the (async) logo data URL on the org object so repeat navigation
    doesn't re-download it. */
export async function resolveBrand(org) {
  if (!org) return null;
  if (org.logo_path && org._logoDataUrl === undefined) {
    try { org._logoDataUrl = await orgLogoDataUrl(org.logo_path); }
    catch { org._logoDataUrl = null; }
  }
  if (!org.logo_path) org._logoDataUrl = null;
  return {
    name: org.name || "", reg: org.registration || "",
    primary: org.brand_primary || "", secondary: org.brand_secondary || "",
    footer: org.brand_footer || "", logoDataUrl: org._logoDataUrl || null,
  };
}
