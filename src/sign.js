/* CPA360 — remote card signing page (sign.html#t=<token>). Plain script, no login, no libraries.
   The link's token travels in the URL fragment, so it is never sent to a server as part of the
   page request or leaked in a Referer header; it is only posted to the sign-request function. */
(function () {
  "use strict";
  var env = window.__CPA360_ENV || {};
  var FN = (env.FUNCTIONS_URL || (env.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1") + "/sign-request";
  var root = document.getElementById("root");
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var token = (/[#&]t=([A-Za-z0-9_-]+)/.exec(location.hash) || [])[1] || "";

  function call(body) {
    return fetch(FN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }
  function note(title, text) { root.innerHTML = '<h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p>'; }
  function done(cpa) {
    root.innerHTML = '<div class="done"><div class="tick" aria-hidden="true">&#10003;</div><h1>Thank you — signed</h1>' +
      '<p class="muted">Your signature has been sent to ' + esc(cpa || "your CPA") + ' and will appear on your membership card. You can close this page.</p></div>';
  }

  if (!token) { note("This link isn't complete", "Please open the full link you were sent, or ask your CPA for a new one."); return; }
  if (!env.SUPABASE_URL && !env.FUNCTIONS_URL) { note("Not available", "This page isn't set up correctly. Please contact your CPA."); return; }

  call({ action: "get", token: token }).then(function (res) {
    if (!res.ok) { note("This link isn't valid", (res.j && res.j.error) || "Please ask your CPA for a new link."); return; }
    var d = res.j;
    if (d.status === "signed") { note("Already signed", "This card has already been signed. Nothing more to do."); return; }
    if (d.status !== "pending") { note(d.status === "expired" ? "This link has expired" : "This link is no longer active", "Please ask " + (d.cpa_name || "your CPA") + " to send you a new one."); return; }
    start(d);
  }).catch(function () { note("No connection", "Please check your internet connection and open the link again."); });

  function start(d) {
    var exp = new Date(d.expires_at);
    root.innerHTML =
      '<h1>Sign your membership card</h1>' +
      '<p class="muted">' + esc(d.cpa_name) + ' asks you to add your signature to your membership card.</p>' +
      '<div class="who"><span class="muted">Card holder</span><b>' + esc(d.member_name) + '</b></div>' +
      (d.needs_id ? '<label for="id4">For your safety, type the last 4 digits of your ID number</label><input id="id4" type="tel" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••">' : '') +
      '<label>Sign inside the box with your finger</label>' +
      '<div class="pad" id="pad"><canvas id="cv" aria-label="Signature pad"></canvas><div class="line"></div><span class="x" aria-hidden="true">&times;</span><div class="hint" id="hint">Sign here</div></div>' +
      '<div class="row"><button type="button" id="undo" disabled>Undo</button><button type="button" id="clear" disabled>Clear</button></div>' +
      '<label class="consent"><input type="checkbox" id="ok"><span>I confirm this is my own signature and I allow ' + esc(d.cpa_name) + ' to print it on my membership card.</span></label>' +
      '<div class="row"><button type="button" class="primary" id="send" disabled>Send my signature</button></div>' +
      '<div class="msg" id="msg" role="status"></div>' +
      '<p class="muted" style="font-size:12.5px;">This link works once and expires ' + esc(exp.toLocaleDateString("en-ZA", { day: "numeric", month: "long" })) + '.</p>';

    var cv = document.getElementById("cv"), ctx = cv.getContext("2d"), INK = "#14203a", W = 2.8;
    var strokes = [], cur = null, dpr = 1;
    var $ = function (id) { return document.getElementById(id); };
    function line(c, pts, k, ox, oy) {
      c.beginPath(); c.lineWidth = W * k; c.strokeStyle = INK; c.fillStyle = INK; c.lineCap = "round"; c.lineJoin = "round";
      var P = pts.map(function (p) { return [(p.x - ox) * k, (p.y - oy) * k]; });
      if (P.length === 1) { c.arc(P[0][0], P[0][1], W * k / 2, 0, Math.PI * 2); c.fill(); return; }
      c.moveTo(P[0][0], P[0][1]);
      for (var i = 1; i < P.length - 1; i++) c.quadraticCurveTo(P[i][0], P[i][1], (P[i][0] + P[i + 1][0]) / 2, (P[i][1] + P[i + 1][1]) / 2);
      c.lineTo(P[P.length - 1][0], P[P.length - 1][1]); c.stroke();
    }
    function redraw() { ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); strokes.forEach(function (s) { line(ctx, s, 1, 0, 0); }); }
    function fit() { var b = cv.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; cv.width = Math.round(b.width * dpr); cv.height = Math.round(b.height * dpr); redraw(); }
    fit(); window.addEventListener("resize", fit);
    function sync() {
      var has = strokes.length > 0;
      $("undo").disabled = !has; $("clear").disabled = !has; $("hint").hidden = has;
      $("send").disabled = !(has && $("ok").checked);
    }
    function pt(e) { var b = cv.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; }
    cv.addEventListener("pointerdown", function (e) { e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (x) {} cur = [pt(e)]; strokes.push(cur); redraw(); sync(); });
    cv.addEventListener("pointermove", function (e) {
      if (!cur) return; e.preventDefault();
      var evs = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
      (evs.length ? evs : [e]).forEach(function (ev) { cur.push(pt(ev)); }); redraw();
    });
    var end = function () { cur = null; };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
    $("undo").onclick = function () { strokes.pop(); redraw(); sync(); };
    $("clear").onclick = function () { strokes = []; redraw(); sync(); };
    $("ok").onchange = sync;

    $("send").onclick = function () {
      var msg = $("msg"); msg.className = "msg"; msg.textContent = "";
      var all = [].concat.apply([], strokes), x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      all.forEach(function (p) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); });
      if (all.length < 6 || x1 - x0 < 24) { msg.className = "msg err"; msg.textContent = "That looks too small — please sign a little larger."; return; }
      var id4 = d.needs_id ? ($("id4").value || "").replace(/\D/g, "") : "";
      if (d.needs_id && id4.length !== 4) { msg.className = "msg err"; msg.textContent = "Please type the last 4 digits of your ID number."; return; }
      var pad = 4, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2, k = Math.min(3, 800 / bw);
      var out = document.createElement("canvas"); out.width = Math.max(1, Math.round(bw * k)); out.height = Math.max(1, Math.round(bh * k));
      var oc = out.getContext("2d");
      strokes.forEach(function (s) { line(oc, s, k, x0 - pad, y0 - pad); });
      var png = out.toDataURL("image/png");
      var btn = $("send"); btn.disabled = true; msg.textContent = "Sending…";
      call({ action: "submit", token: token, id_last4: id4, png_base64: png }).then(function (res) {
        if (res.ok) { done(res.j.cpa_name || d.cpa_name); return; }
        msg.className = "msg err"; msg.textContent = (res.j && res.j.error) || "Couldn't send — please try again.";
        if (res.status === 410) { setTimeout(function () { note("Link no longer active", (res.j && res.j.error) || ""); }, 1500); return; }
        btn.disabled = false;
      }).catch(function () { msg.className = "msg err"; msg.textContent = "No connection — please try again."; btn.disabled = false; });
    };
  }
})();
