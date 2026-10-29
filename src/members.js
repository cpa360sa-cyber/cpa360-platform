import { supabase, FUNCTIONS_URL } from "./supabase.js";

/* Access levels — one place for the wording used everywhere (invite form, team list, welcome screen). */
export const ROLE_INFO = {
  viewer: { label: "Viewer", short: "Can look, can't change", detail: "Sees everything in the CPA but cannot change anything. Good for auditors, funders, observers." },
  member: { label: "Member", short: "Day-to-day records", detail: "Adds and edits the day-to-day records — beneficiaries, governance, administration, land, projects, communication. Cannot change Finance & Procurement, HR, Integrations or the team." },
  admin:  { label: "Admin",  short: "Runs the CPA", detail: "Everything a Member can do, plus Finance & Procurement, HR, Integrations and the Brand Box, and can invite or remove Viewers and Members." },
  owner:  { label: "Owner",  short: "Full control", detail: "Everything an Admin can do, and the only one who can make or remove Admins and Owners." },
};

/** Which roles the signed-in person may hand out. Admins: Viewer/Member. Owner: also Admin. */
export const assignableRoles = (myRole) => (myRole === "owner" ? ["viewer", "member", "admin"] : ["viewer", "member"]);

/** Can `myRole` change / remove someone whose current role is `theirRole`? (mirrors the database rules) */
export const canManage = (myRole, theirRole, isMe) =>
  myRole === "owner" || (myRole === "admin" && !isMe && (theirRole === "viewer" || theirRole === "member"));

/** Members of an org: email, role, name, cell (admins only) and whether they've finished joining. */
export async function listMembers(orgId) {
  const { data, error } = await supabase.rpc("org_members", { p_org: orgId });
  if (error) throw error;
  return data || [];
}

async function callInvite(payload) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("your session expired — sign in again");
  const res = await fetch(`${FUNCTIONS_URL}/invite-member`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, redirect_to: location.origin + location.pathname }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `invite failed (${res.status})`);
  return out;
}

/**
 * Invite someone to a CPA. mode "email" sends the invitation email; mode "link" returns a personal
 * link to send on WhatsApp instead (and can be used to "resend"). Returns
 * { emailed, existing, link } — existing=true means they already had an account and were just added.
 */
export const addMember = (orgId, email, role, mode = "email") =>
  callInvite({ org_id: orgId, email, role, mode });

export async function setMemberRole(orgId, userId, role) {
  const { error } = await supabase.rpc("set_member_role", { p_org: orgId, p_user: userId, p_role: role });
  if (error) throw error;
}

export async function removeMember(orgId, userId) {
  const { error } = await supabase.rpc("remove_member", { p_org: orgId, p_user: userId });
  if (error) throw error;
}

/** WhatsApp "click to chat" link with the invite text ready — opens WhatsApp with the message waiting. */
export function whatsappInviteUrl({ cell, cpaName, link, inviterName }) {
  const text = `Hi! ${inviterName ? inviterName + " has invited you" : "You have been invited"} to join ${cpaName} on CPA360.\n\n` +
    `Tap this link, press "Accept invitation", then add your name, cell number and a password:\n${link}\n\n(The link is personal to you — please don't share it.)`;
  const digits = String(cell || "").replace(/\D/g, "").replace(/^0/, "27");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
