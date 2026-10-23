/* CPA360 — public "send your documents" page (submit.html#c=<link code>[&h=<household>]). Plain script, no login, no libraries.
   Members choose photos / PDFs of their ID copy or family tree, say who they are, and send them to the CPA's
   Beneficiaries → Intake inbox through the intake-submit function. Big photos are shrunk on the phone first
   (saves data, and 10 MB per file is the limit). The link code travels in the URL fragment so it is never sent to
   a server as part of the page request or leaked in a Referer header. */
(function () {
  "use strict";
  var env = window.__CPA360_ENV || {};
  var FN = (env.FUNCTIONS_URL || (env.SUPABASE_URL || "").replace(/\/+$/, "") + "/functions/v1") + "/intake-submit";
  var root = document.getElementById("root");
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]; }); };
  var hash = location.hash || "";
  var slug = (/[#&]c=([a-z0-9]+)/.exec(hash) || [])[1] || "";
  var linkHh = decodeURIComponent((/[#&]h=([^&]+)/.exec(hash) || [])[1] || "").slice(0, 60);
  var MAX_FILES = 6, MAX_BYTES = 10 * 1024 * 1024;

  function note(title, text) { root.innerHTML = "<h1>" + esc(title) + '</h1><p class="muted">' + esc(text) + "</p>"; }
  function post(body) {
    return fetch(FN, { method: "POST", body: body, headers: typeof body === "string" ? { "Content-Type": "application/json" } : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, status: r.status, j: j }; }); });
  }

  if (!slug) { note("This link isn't complete", "Please open the full link you were sent, or ask your CPA for a new one."); return; }
  if (!env.SUPABASE_URL && !env.FUNCTIONS_URL) { note("Not available", "This page isn't set up correctly. Please contact your CPA."); return; }

  post(JSON.stringify({ action: "info", slug: slug, h: linkHh })).then(function (res) {
    if (!res.ok) { note(res.status === 410 ? "This link has been switched off" : "This link isn't valid", (res.j && res.j.error) || "Please ask your CPA for a new link."); return; }
    start(res.j);
  }).catch(function () { note("No connection", "Please check your internet connection and open the link again."); });

  /* a photo → a smaller JPEG (max 2400 px); anything else, or anything that fails, goes as it is */
  function shrink(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1500000 || !window.createImageBitmap) return Promise.resolve(file);
    return createImageBitmap(file).then(function (bmp) {
      var k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
      var x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.drawImage(bmp, 0, 0, c.width, c.height);
      return new Promise(function (res) { c.toBlob(function (b) { res(b && b.size < file.size ? new File([b], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file); }, "image/jpeg", 0.86); });
    }).catch(function () { return file; });
  }

  function start(d) {
    var cpa = d.cpa_name || "your CPA", files = [], busy = false;
    root.innerHTML =
      "<h1>Send your documents to " + esc(cpa) + "</h1>" +
      '<p class="muted">Choose what you are sending, add the photos, tell us who you are, and press Send. The office will check them — nothing is added until a person has looked at it.</p>' +
      (d.household_ref ? '<p><span class="tag">Household ' + esc(d.household_ref) + "</span></p>" : "") +
      '<label class="l">What are you sending?</label><div class="kinds">' +
      '<label class="kind"><input type="radio" name="kind" value="id" checked><div><b>My ID copy</b><span>ID book page or smart ID card (front and back)</span></div></label>' +
      '<label class="kind"><input type="radio" name="kind" value="family_tree"><div><b>A family tree</b><span>Typed or handwritten — every page</span></div></label>' +
      '<label class="kind"><input type="radio" name="kind" value="other"><div><b>Something else</b><span>Any other document the CPA asked for</span></div></label></div>' +
      '<label class="l">Photos or PDF <span class="opt">(up to ' + MAX_FILES + ")</span></label>" +
      '<div class="pick"><label class="btn" style="cursor:pointer;">Choose photos / PDF<input id="f1" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden></label>' +
      '<label class="btn" style="cursor:pointer;">Take a photo<input id="f2" type="file" accept="image/jpeg" capture="environment" hidden></label></div>' +
      '<p class="muted" style="font-size:12.5px;">Lay the document flat in good light so all the writing is clear.</p><div class="thumbs" id="th"></div>' +
      '<label class="l" for="nm">Your full name</label><input id="nm" type="text" autocomplete="name" maxlength="80">' +
      '<label class="l" for="ph">Your cell number <span class="opt">(so the office can reach you)</span></label><input id="ph" type="tel" inputmode="tel" autocomplete="tel" maxlength="20">' +
      (d.household_ref ? "" : '<label class="l" for="hh">Your household or ODI name <span class="opt">(if you know it)</span></label><input id="hh" type="text" maxlength="100">') +
      '<label class="l" for="nt">Anything the office should know <span class="opt">(optional)</span></label><textarea id="nt" maxlength="500"></textarea>' +
      '<div class="hp" aria-hidden="true"><label>Website <input id="web" type="text" tabindex="-1" autocomplete="off"></label></div>' +
      '<label class="consent"><input type="checkbox" id="ok"><span>I agree that ' + esc(cpa) + " may keep these documents and use them only to confirm my membership and keep the community's family records, as set out in its privacy notice.</span></label>" +
      '<button type="button" class="primary" id="send" disabled>Send</button><div class="msg" id="msg" role="status"></div>';

    var $ = function (id) { return document.getElementById(id); };
    function say(t, err) { var m = $("msg"); m.className = "msg" + (err ? " err" : ""); m.textContent = t || ""; }
    function sync() { $("send").disabled = busy || !files.length || !$("ok").checked || ($("nm").value || "").trim().length < 2; }
    function paint() {
      $("th").innerHTML = "";
      files.forEach(function (f, i) {
        var d1 = document.createElement("div"); d1.className = "th";
        if (/^image\//.test(f.type)) { var im = document.createElement("img"); im.alt = "Photo " + (i + 1); im.src = URL.createObjectURL(f); d1.appendChild(im); } else { d1.textContent = "PDF"; }
        var x = document.createElement("button"); x.type = "button"; x.setAttribute("aria-label", "Remove"); x.textContent = "×";
        x.onclick = function () { files.splice(i, 1); paint(); say(""); }; d1.appendChild(x); $("th").appendChild(d1);
      });
      sync();
    }
    function add(list) {
      var chain = Promise.resolve();
      [].slice.call(list).forEach(function (f) {
        chain = chain.then(function () {
          if (files.length >= MAX_FILES) { say("You can send up to " + MAX_FILES + " files at a time.", true); return; }
          if (!/^(image\/(jpeg|png|webp)|application\/pdf)$/.test(f.type)) { say("“" + f.name + "” isn't a JPG, PNG or PDF — please choose a photo of the document.", true); return; }
          return shrink(f).then(function (g) {
            if (g.size > MAX_BYTES) { say("“" + f.name + "” is too big (10 MB is the limit). Please choose a smaller photo.", true); return; }
            files.push(g); say("");
          });
        });
      });
      return chain.then(paint);
    }
    $("f1").onchange = function (e) { add(e.target.files); e.target.value = ""; };
    $("f2").onchange = function (e) { add(e.target.files); e.target.value = ""; };
    $("ok").onchange = sync; $("nm").oninput = sync;

    $("send").onclick = function () {
      var fd = new FormData();
      fd.append("slug", slug); fd.append("kind", (document.querySelector("input[name=kind]:checked") || {}).value || "other");
      fd.append("name", $("nm").value.trim()); fd.append("phone", $("ph").value.trim()); fd.append("note", $("nt").value.trim());
      fd.append("household", $("hh") ? $("hh").value.trim() : ""); fd.append("h", d.household_ref || "");
      fd.append("consent", "1"); fd.append("website", $("web").value);
      files.forEach(function (f) { fd.append("files", f, f.name); });
      busy = true; sync(); say("Sending… please keep this page open.");
      post(fd).then(function (res) {
        if (res.ok) { done(res.j.reference, res.j.cpa_name || cpa); return; }
        busy = false; sync(); say((res.j && res.j.error) || "Couldn't send — please try again.", true);
      }).catch(function () { busy = false; sync(); say("No connection — please check your data and press Send again.", true); });
    };
    paint();
  }

  function done(ref, cpa) {
    root.innerHTML = '<div class="done"><div class="tick" aria-hidden="true">&#10003;</div><h1>Thank you — sent</h1>' +
      '<p class="muted">' + esc(cpa) + " has received your documents and will check them. They will contact you if anything else is needed. You can close this page.</p>" +
      (ref ? '<p class="muted">Reference: <b>' + esc(ref) + "</b></p>" : "") + "</div>";
  }
})();
