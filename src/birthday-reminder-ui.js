/* CPA360 — Birthdays → "Daily reminder": the settings dialog.
   Four ways to be reminded each morning that someone has a birthday (and that the shoutout poster can be made):
     1. In the platform   always on — a banner and a dashboard alert until the poster has been shared
     2. Phone calendar    a repeating calendar entry (.ics) with a link back here — works today, no setup
     3. Email             a morning email listing today's birthdays (needs the platform's email key)
     4. WhatsApp          a morning WhatsApp to the CPA's own number (needs WhatsApp Business connected + an approved template)
   Email and WhatsApp are sent by the birthday-reminder Edge Function (hourly schedule); this dialog saves the settings,
   shows what happened last time, and can send a test straight away. */
import * as repo from "./repo.js";
import { reminderIcs, validEmail, validCell, hourLabel, HOURS, describeStatus } from "./birthday-reminder.js";

export async function openReminderDialog(ctx) {
  const { h: u } = ctx, { esc } = u;
  let D = { row: null, waConnected: false };
  const { scrim, close } = u.govModal("Daily birthday reminder", `<div id="rm-body"><p class="hint">Loading…</p></div>`,
    `<span id="rm-foot" class="hint" style="margin-right:auto;"></span><button class="btn" data-act="close" type="button">Close</button>${ctx.canEdit ? `<button class="btn" id="rm-test" type="button">Save &amp; send a test</button><button class="btn primary" id="rm-save" type="button">Save</button>` : ""}`, 640);
  const $s = (q) => scrim.querySelector(q);
  try { D = await repo.loadReminder(ctx.orgId); } catch (e) { $s("#rm-body").innerHTML = `<p class="hint">Couldn't load the reminder settings: ${esc((e && e.message) || e)}</p>`; return; }
  const r = D.row || { send_hour: 7, email_on: false, email: "", whatsapp_on: false, whatsapp_number: "" };
  const appLink = () => new URL("app.html", location.href).href + "#/v/beneficiary/birthdays";
  const dis = ctx.canEdit ? "" : " disabled";
  const st = describeStatus({ ...r }, D.waConnected);

  $s("#rm-body").innerHTML = `
    <p class="hint" style="margin:0 0 10px;">A reminder when someone has a birthday, so the shoutout poster doesn't get forgotten. Nothing is ever sent to members — these go to you.</p>
    <div class="field"><label for="rm-hour">Remind me at (South African time)</label><select id="rm-hour"${dis}>${HOURS.map((h) => `<option value="${h}"${h === r.send_hour ? " selected" : ""}>${hourLabel(h)}</option>`).join("")}</select></div>

    <div class="card" style="margin:10px 0;padding:12px;"><b>1 · In the platform</b> <span class="pill good">Always on</span>
      <div class="hint">A banner (and an alert on the dashboard) appears on any day someone has a birthday, and goes away once you've shared or downloaded the poster.</div></div>

    <div class="card" style="margin:10px 0;padding:12px;"><b>2 · Phone calendar</b> <span class="pill good">Works now</span>
      <div class="hint" style="margin:4px 0 8px;">Adds a repeating daily reminder — "Post today's birthday shoutout" — with a link back here. Open the file on your phone and choose <b>Add to calendar</b>.</div>
      <button type="button" class="btn small" id="rm-ics">Download the calendar reminder</button></div>

    <div class="card" style="margin:10px 0;padding:12px;"><b>3 · Email</b>
      <label class="cm-check" style="margin-top:6px;"><input type="checkbox" id="rm-eon"${r.email_on ? " checked" : ""}${dis}> Email me every morning there are birthdays</label>
      <div class="field"><label for="rm-email">Email address</label><input id="rm-email" type="text" inputmode="email" autocomplete="email" value="${esc(r.email || "")}"${dis}></div>
      <div class="hint" id="rm-est">${esc(st.email)} — sending also needs the platform's email key to be set up.</div></div>

    <div class="card" style="margin:10px 0;padding:12px;"><b>4 · WhatsApp</b>
      <label class="cm-check" style="margin-top:6px;"><input type="checkbox" id="rm-won"${r.whatsapp_on ? " checked" : ""}${dis}> WhatsApp me every morning there are birthdays</label>
      <div class="field"><label for="rm-wa">Your cell number</label><input id="rm-wa" type="tel" inputmode="tel" autocomplete="tel" value="${esc(r.whatsapp_number || "")}"${dis}></div>
      <div class="hint" id="rm-wst">${esc(st.whatsapp)}${D.waConnected ? "" : " (Communication → Channels)."}</div></div>

    <div class="hint" id="rm-last">${r.last_result ? `Last run${r.last_sent_on ? " (" + esc(u.fmtDay ? u.fmtDay(String(r.last_sent_on).slice(0, 10)) : r.last_sent_on) + ")" : ""}: ${esc(r.last_result)}` : "Email / WhatsApp haven't run yet."}</div>`;

  const $i = (id) => $s("#" + id), say = (t, err) => { const f = $s("#rm-foot"); f.textContent = t || ""; f.style.color = err ? "var(--status-critical)" : ""; };
  const hourNow = () => +$i("rm-hour").value;
  $i("rm-ics").onclick = () => {
    const blob = new Blob([reminderIcs({ cpaName: ctx.cpa().name || "", hour: hourNow(), url: appLink(), uid: "birthday-shoutout-" + ctx.orgId })], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = "Birthday-shoutout-reminder.ics"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000);
    u.toast("Calendar reminder downloaded — open it on your phone and choose Add to calendar.");
  };
  if (!ctx.canEdit) return;

  const read = () => ({ send_hour: hourNow(), email_on: $i("rm-eon").checked, email: $i("rm-email").value.trim(), whatsapp_on: $i("rm-won").checked, whatsapp_number: $i("rm-wa").value.trim() });
  const check = (v) => (v.email_on && !validEmail(v.email) ? "Type a valid email address, or untick the email box." : v.whatsapp_on && !validCell(v.whatsapp_number) ? "Type a valid cell number (e.g. 082 123 4567), or untick the WhatsApp box." : "");
  async function save() {
    const v = read(), bad = check(v);
    if (bad) { say(bad, true); return false; }
    say("Saving…");
    try { D.row = await repo.saveReminder(ctx.orgId, v); say("Saved."); return true; } catch (e) { say("Couldn't save: " + ((e && e.message) || e), true); return false; }
  }
  $i("rm-save").onclick = async () => { const b = $i("rm-save"); b.disabled = true; const ok = await save(); b.disabled = false; if (ok) { u.toast("Reminder settings saved."); close(); } };
  $i("rm-test").onclick = async () => {
    const b = $i("rm-test"); b.disabled = true;
    try {
      if (!(await save())) return;
      say("Sending a test…");
      const out = await repo.testReminder(ctx.orgId);
      $i("rm-last").textContent = "Test: " + out.result; say("");
      u.toast("Test finished — see the result in the dialog.");
    } catch (e) { say((e && e.message) || String(e), true); }
    finally { b.disabled = false; }
  };
}
