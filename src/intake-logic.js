/* CPA360 — Intake inbox: pure helpers (no DOM, no network) so they can be unit-tested.
   · newSlug()          an unguessable link code (14 characters, a–z 0–9)
   · linkUrl()          the member-facing link: <site>/submit.html#c=<code>[&h=<household>]  (code in the fragment)
   · waNumber()         a South African cell number typed any which way → the digits wa.me wants ("0821234567" → "27821234567")
   · waMessage()        the reply staff paste into WhatsApp
   · suggestHousehold() which household a sender probably means, from what they typed (ref, or the ODI's / family name) */
import { nameSimilarity } from "./family-tree-logic.js";

export const KIND_LABEL = { id: "ID copy", family_tree: "Family tree", other: "Other document" };

export function newSlug(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  const ABC = "abcdefghijklmnopqrstuvwxyz0123456789", bytes = random(14);
  let s = "";
  for (let i = 0; i < 14; i++) s += ABC[bytes[i] % ABC.length];
  return s;
}

export function linkUrl(base, slug, hhRef) {
  return `${String(base).replace(/#.*$/, "")}#c=${slug}${hhRef ? "&h=" + encodeURIComponent(hhRef) : ""}`;
}

export function waNumber(input) {
  let s = String(input || "").replace(/[^\d+]/g, "");
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("00")) s = s.slice(2);
  else if (/^0\d{9}$/.test(s)) s = "27" + s.slice(1);
  return /^\d{9,15}$/.test(s) && !/^0/.test(s) ? s : "";
}

export function waMessage(kind, cpaName, url, name) {
  const what = kind === "id" ? "a clear photo of your ID (front and back)" : kind === "family_tree" ? "a photo of your family tree (every page)" : "your documents";
  const hi = String(name || "").trim() ? `Hi ${String(name).trim().split(/\s+/)[0]},` : "Hi,";
  return `${hi} thank you for contacting ${cpaName || "the CPA"}. Please send ${what} through this private link — choose the photos, type your name and press Send:\n${url}\nIt only takes a minute, and only the CPA's office can see what you send.`;
}

/** households: [{ ref, odi, label }] → the best guess for what the sender typed, or null. */
export function suggestHousehold(text, households) {
  const t = String(text || "").trim();
  if (t.length < 2) return null;
  const low = t.toLowerCase();
  const byRef = households.find((h) => String(h.ref).toLowerCase() === low);
  if (byRef) return { ref: byRef.ref, how: "household number" };
  // names need at least a first name AND a surname — several families share a surname, so a surname alone never picks a household
  if (t.split(/\s+/).filter((w) => w.length > 1).length < 2) return null;
  const scored = households.map((h) => ({ ref: h.ref, how: "name", score: nameSimilarity(t, h.odi || "") })).filter((x) => x.score >= 0.85).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1].score >= scored[0].score - 0.02) return null;          // two equally good guesses = no guess
  return scored[0];
}
