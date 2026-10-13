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

/* ---- Chairperson / Secretary signatures ----
   Stored per-org as small transparent PNG data: URLs (orgs.chair_signature / secretary_signature,
   migration 0040) and read only by that org's members. */
export async function getOrgSignatures(orgId) {
  const { data, error } = await supabase.from("orgs").select("chair_signature, secretary_signature").eq("id", orgId).single();
  if (error) throw error;
  return { chair: data.chair_signature || "", secretary: data.secretary_signature || "" };
}
export async function setOrgSignature(orgId, which, dataUrl) {
  const col = which === "chair" ? "chair_signature" : "secretary_signature";
  const { error } = await supabase.from("orgs").update({ [col]: dataUrl || null }).eq("id", orgId);
  if (error) throw error;
}
/** Turns a photo/scan of a signature into a clean transparent PNG data URL: the paper
    colour becomes see-through (so it sits on a signature line), the ink keeps one solid
    colour, and the picture is cropped to the ink and capped at 800px wide. */
export async function processSignatureImage(file) {
  if (!/^image\//.test(file.type)) throw new Error("Please choose an image (PNG or JPG).");
  if (file.size > 6 * 1048576) throw new Error("Max 6 MB.");
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 800 / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h), d = img.data;
  // paper brightness = the 85th-percentile pixel (the page itself, not the ink), so grey or
  // off-white scans become fully see-through instead of leaving a tinted box
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) hist[Math.min(d[i], d[i + 1], d[i + 2])]++;
  let acc = 0, paper = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= w * h * 0.85) { paper = Math.max(v, 140); break; } }
  let minX = w, minY = h, maxX = -1, maxY = -1, inkR = 0, inkG = 0, inkB = 0, inkN = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a0 = d[i + 3], m = Math.min(d[i], d[i + 1], d[i + 2]);
    const t = paper - m;
    const a = Math.min(a0, t < 22 ? 0 : Math.min(255, (t - 22) * 2.6));
    if (a > 200) { inkR += d[i]; inkG += d[i + 1]; inkB += d[i + 2]; inkN++; }
    d[i + 3] = a;
    if (a > 24) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  }
  if (maxX < 0) throw new Error("No signature found in that picture — use dark ink on a light background.");
  const r = inkN ? Math.round(inkR / inkN) : 20, g = inkN ? Math.round(inkG / inkN) : 20, b = inkN ? Math.round(inkB / inkN) : 60;
  for (let i = 0; i < d.length; i += 4) { d[i] = r; d[i + 1] = g; d[i + 2] = b; }
  ctx.putImageData(img, 0, 0);
  const pad = 3;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad); maxX = Math.min(w - 1, maxX + pad); maxY = Math.min(h - 1, maxY + pad);
  const out = document.createElement("canvas");
  out.width = maxX - minX + 1; out.height = maxY - minY + 1;
  out.getContext("2d").drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
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
