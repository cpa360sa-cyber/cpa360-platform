import { supabase, FUNCTIONS_URL } from "./supabase.js";

/** Members of an org, with email + role (SECURITY DEFINER RPC). */
export async function listMembers(orgId) {
  const { data, error } = await supabase.rpc("org_members", { p_org: orgId });
  if (error) throw error;
  return data || [];
}

/**
 * Add someone to a CPA. Tries the "existing account" path first (a plain RPC);
 * if there's no account yet, falls through to the invite Edge Function.
 * Returns { invited: boolean }.
 */
export async function addMember(orgId, email, role) {
  const { error } = await supabase.rpc("add_member_by_email", {
    p_org: orgId,
    p_email: email,
    p_role: role,
  });
  if (!error) return { invited: false };
  if (!/no account found/i.test(error.message || "")) throw error;

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("your session expired — sign in again");

  const res = await fetch(`${FUNCTIONS_URL}/invite-member`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ org_id: orgId, email, role }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `invite failed (${res.status})`);
  return { invited: true };
}

export async function setMemberRole(orgId, userId, role) {
  const { error } = await supabase.rpc("set_member_role", {
    p_org: orgId,
    p_user: userId,
    p_role: role,
  });
  if (error) throw error;
}

export async function removeMember(orgId, userId) {
  const { error } = await supabase.rpc("remove_member", {
    p_org: orgId,
    p_user: userId,
  });
  if (error) throw error;
}
