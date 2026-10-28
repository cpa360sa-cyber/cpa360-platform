/* CPA360 — Birthdays → "Daily reminder": pure helpers (no DOM, no network) so they can be unit-tested.
   · reminderIcs()       a calendar file (.ics) for a repeating daily reminder with a link into the platform — works in the
                         phone's own calendar app, so it needs no email key or WhatsApp setup
   · validEmail / validCell / hourLabel / describeStatus   small helpers for the settings dialog
   · doneKey / posterDoneToday   "I've already posted today's shoutout" bookkeeping that quietens the banner and alert */

const pad = (n) => String(n).padStart(2, "0");

/** RFC 5545 text escaping + line folding at 75 octets (continuation lines start with a space), CRLF line ends. */
export const icsEscape = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
export function icsFold(line) {
  const enc = new TextEncoder(), out = [];
  let cur = "", bytes = 0, limit = 75;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > limit) { out.push(cur); cur = " "; bytes = 1; limit = 75; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join("\r\n");
}

/** o: { cpaName, hour (0–23, South African time), url, uid, startDate?:"YYYY-MM-DD" (first day; default tomorrow), now?: Date }
 *  → the .ics text. The event repeats every day at `hour`:00 for 15 minutes with an alert at the start. */
export function reminderIcs(o) {
  const now = o.now || new Date(), h = Math.min(23, Math.max(0, +o.hour || 0));
  const first = o.startDate || (() => { const t = new Date(now.getTime() + 86400000); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; })();
  const d = first.replace(/-/g, ""), dtstart = `${d}T${pad(h)}0000`, dtend = `${d}T${pad(h)}1500`;
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
  const title = "Post today's birthday shoutout" + (o.cpaName ? " — " + o.cpaName : "");
  const desc = `Open the platform to see whose birthday it is today and make the birthday shoutout poster for WhatsApp Status:\n${o.url}\n(If nobody has a birthday today, you can ignore this reminder.)`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//CPA360//Birthday shoutout reminder//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE", "TZID:Africa/Johannesburg", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0200", "TZNAME:SAST", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:${o.uid || "birthday-shoutout"}@cpa360`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Africa/Johannesburg:${dtstart}`, `DTEND;TZID=Africa/Johannesburg:${dtend}`, "RRULE:FREQ=DAILY",
    `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(desc)}`, `URL:${o.url}`, "TRANSP:TRANSPARENT",
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(title)}`, "TRIGGER:PT0M", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.map(icsFold).join("\r\n") + "\r\n";
}

export const validEmail = (s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(s || "").trim());
/** A cell number WhatsApp can reach: SA mobile (06/07/08…) in any layout, or full international "+…". */
export function validCell(input) {
  for (const part of String(input || "").split(/[\/,;]/)) {
    let s = part.replace(/[^\d+]/g, "");
    if (s.startsWith("+")) s = s.slice(1);
    if (s.startsWith("0027")) s = s.slice(2);
    if (/^0[678]\d{8}$/.test(s) || /^27[678]\d{8}$/.test(s)) return true;
    if (/^(?!27)[1-9]\d{8,14}$/.test(s) && part.trim().startsWith("+")) return true;
  }
  return false;
}
export const hourLabel = (h) => `${pad(h)}:00`;
export const HOURS = [5, 6, 7, 8, 9, 10, 12, 15, 18];

/** What the settings dialog should say about a channel, given what's saved and what the system has. */
export function describeStatus(row, waConnected) {
  const r = row || {};
  return {
    email: r.email_on ? (validEmail(r.email) ? "On — a morning email to " + r.email : "On, but the address isn't valid") : "Off",
    whatsapp: r.whatsapp_on ? (!validCell(r.whatsapp_number) ? "On, but the number isn't valid" : waConnected ? "On — a morning WhatsApp to " + r.whatsapp_number : "On, but WhatsApp Business isn't connected yet — nothing can be sent until it is") : "Off",
  };
}

/* "I've posted today's shoutout" — a per-CPA, per-day flag kept on this computer so the banner stops nagging once it's done */
export const doneKey = (orgId) => "cpa360.bposter.done." + orgId;
export function posterDoneToday(orgId, today, storage) {
  try { return (storage || localStorage).getItem(doneKey(orgId)) === today; } catch (e) { return false; }
}
export function markPosterDone(orgId, today, storage) {
  try { (storage || localStorage).setItem(doneKey(orgId), today); } catch (e) { /* private mode: the banner simply stays */ }
}
