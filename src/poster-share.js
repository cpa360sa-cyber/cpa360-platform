/* CPA360 — the phone page behind the "Publish via WhatsApp" QR code (poster.html#c=<short code>). Plain script, no login.
   The birthday shoutout poster was made on the computer; this page shows it on the phone and hands it to WhatsApp's
   share sheet with ONE tap — then it's "My status" → Send. The short code travels in the URL fragment (never sent as part of
   the page request) and works for 12 hours; the pictures come through signed links that expire on their own. */
(function () {
  "use strict";
  var env = window.__CPA360_ENV || {};
  var FN = (env.FUNCTIONS_URL || (env.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1") + "/poster-share";
  var root = document.getElementById("root");
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var code = (/[#&]c=([a-z0-9]+)/.exec(location.hash) || [])[1] || "";

  function note(title, text) { root.innerHTML = "<h1>" + esc(title) + '</h1><p class="muted">' + esc(text) + "</p>"; }
  if (!code) { note("This link isn't complete", "Please scan the code on the computer again."); return; }
  if (!env.SUPABASE_URL && !env.FUNCTIONS_URL) { note("Not available", "This page isn't set up correctly."); return; }

  fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get", code: code }) })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (res) {
      if (!res.ok) { note("This link can't be used", (res.j && res.j.error) || "Please make the poster again on the computer."); return; }
      start(res.j);
    }).catch(function () { note("No connection", "Please check your internet connection and scan the code again."); });

  function start(d) {
    var n = d.urls.length, files = null;
    root.innerHTML =
      "<h1>Your birthday poster is ready</h1>" +
      '<p class="muted">' + esc(d.cpa_name || "") + "</p>" +
      '<div class="posters" id="ps">' + d.urls.map(function (u, i) { return '<img src="' + esc(u) + '" alt="Birthday poster ' + (i + 1) + '">'; }).join("") + "</div>" +
      '<button type="button" class="primary" id="share">Share to WhatsApp Status</button>' +
      '<div class="steps" id="steps"><b>Then:</b> tap <b>WhatsApp</b> → choose <b>My status</b> → press <b>Send</b>.</div>' +
      '<button type="button" id="cap">Copy the caption</button>' +
      '<a class="btn" id="save" href="' + esc(d.urls[0]) + '" download="Birthday-poster.png" hidden>Save the picture</a>' +
      '<div class="msg" id="msg" role="status"></div>';
    var $ = function (id) { return document.getElementById(id); }, say = function (t, err) { $("msg").className = "msg" + (err ? " err" : ""); $("msg").textContent = t || ""; };
    var canShare = !!(navigator.canShare && navigator.share);

    // get the pictures ready as files so the share sheet opens instantly when the button is pressed
    Promise.all(d.urls.map(function (u, i) {
      return fetch(u).then(function (r) { return r.blob(); }).then(function (b) { return new File([b], "Birthday-poster" + (n > 1 ? "-" + (i + 1) : "") + ".png", { type: "image/png" }); });
    })).then(function (f) { files = f; if (canShare && !navigator.canShare({ files: f })) canShare = false; })
      .catch(function () { files = null; });

    $("share").onclick = function () {
      if (!canShare || !files) { $("save").hidden = false; say(files ? "This phone can't open the share sheet from here — save the picture, then in WhatsApp open Status and add it." : "The picture is still loading — try again in a moment.", !!files); return; }
      navigator.share({ files: files, text: d.caption || "" }).then(function () { say("Done — check that it shows in your Status."); })
        .catch(function (e) { if (e && e.name === "AbortError") return; $("save").hidden = false; say("Couldn't open WhatsApp from here — save the picture and add it in WhatsApp → Status.", true); });
    };
    $("cap").onclick = function () {
      (navigator.clipboard ? navigator.clipboard.writeText(d.caption || "") : Promise.reject()).then(function () { say("Caption copied — paste it under your Status."); }).catch(function () { window.prompt("Copy this caption:", d.caption || ""); });
    };
    if (!d.caption) $("cap").hidden = true;
    if (!canShare) { $("save").hidden = false; $("steps").innerHTML = "<b>To post:</b> save the picture, then open <b>WhatsApp → Status → +</b> and choose it."; }
  }
})();
