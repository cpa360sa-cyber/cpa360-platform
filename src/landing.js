/* CPA360 landing page — interactions + lead capture. Plain script, no imports. */
(function () {
  "use strict";
  var env = window.__CPA360_ENV || {};
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (m) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m];
    });
  };

  var y = $("#lp-year"); if (y) y.textContent = new Date().getFullYear();

  /* ---- sticky header ---- */
  var header = $("#lp-header");
  var onScroll = function () { header.classList.toggle("scrolled", window.scrollY > 8); };
  onScroll(); window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- mobile nav ---- */
  var burger = $("#lp-burger"), mnav = $("#lp-mobile-nav");
  burger.addEventListener("click", function () {
    var open = mnav.hidden;
    mnav.hidden = !open;
    burger.setAttribute("aria-expanded", String(open));
  });
  $$("#lp-mobile-nav a").forEach(function (a) {
    a.addEventListener("click", function () { mnav.hidden = true; burger.setAttribute("aria-expanded", "false"); });
  });

  /* ---- "Sign in" → "Go to your workspace" if a session exists ---- */
  try {
    var ref = (env.SUPABASE_URL || "").replace(/^https:\/\//, "").split(".")[0];
    var raw = ref && localStorage.getItem("sb-" + ref + "-auth-token");
    if (raw && JSON.parse(raw).access_token) {
      var si = $("#lp-signin");
      if (si) si.textContent = "Go to your workspace";
    }
  } catch (e) {}

  /* ---- modules ---- */
  var IC = {
    gov: '<path d="M4 21h16M6 21V9m4 12V9m4 12V9m4 12V9M3 9l9-6 9 6"/>',
    ben: '<circle cx="9" cy="8" r="3"/><path d="M15 11a3 3 0 1 0 0-6M4 20c0-2.8 2.2-5 5-5s5 2.2 5 5M15 15c2.5 0 5 1.6 5 5"/>',
    adm: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    fin: '<path d="M3 12h18M6 8l-3 4 3 4M18 8l3 4-3 4"/><circle cx="12" cy="12" r="3"/>',
    pro: '<path d="M6 3h9l5 5v13H6z"/><path d="M14 3v6h6M9 14l2 2 4-4"/>',
    hr: '<circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
    land: '<path d="M3 20l6-14 5 8 3-5 4 11z"/><path d="M3 20h18"/>',
    prod: '<path d="M12 22V9M12 9C9 9 7 6 7 3c3 0 5 3 5 6zM12 9c3 0 5-3 5-6-3 0-5 3-5 6z"/><path d="M5 22h14"/>',
    proj: '<path d="M4 6h16M4 12h16M4 18h10"/><circle cx="19" cy="18" r="2"/>',
    comm: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
    fund: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5a2.5 2 0 0 1 5 0c0 1.5-1.5 2-2.5 2.5S9.5 15 9.5 16.5a2.5 2 0 0 0 5 0"/>',
    perf: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 12l6-4"/><circle cx="12" cy="12" r="1.6"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M13 3v6h6"/>',
  };
  var MODULES = [
    ["gov", "Governance", "EXCO, committees, resolutions, meetings, AGM/SGM, conflict of interest.", "A functioning, minuted Committee."],
    ["ben", "Beneficiaries", "The Master Beneficiary Register — verification, households, succession, disputes.", "A register you can defend."],
    ["adm", "Administration", "Records management, correspondence and the delegation-of-authority matrix.", "Nothing lost, everything found."],
    ["fin", "Finance", "Budget, transactions, bank reconciliation and annual financial statements.", "Books that reconcile."],
    ["pro", "Procurement", "Requisitions, purchase orders, suppliers, payments and procurement compliance.", "Every rand authorised and traced."],
    ["hr", "HR", "Staff records, payroll references, policies and the organogram.", "A properly staffed office."],
    ["land", "Land & Assets", "Parcels, allocations, leases, permits, infrastructure and maintenance.", "Every hectare accounted for."],
    ["prod", "Productivity", "Crops, orchards, timber, livestock, water, inputs, harvest and cost of production.", "Land that is actually working."],
    ["proj", "Projects", "Pipeline, scorecards, business cases and delivery tracking.", "Projects that get delivered."],
    ["comm", "Commercialisation", "Markets, partnerships, revenue streams and investment readiness.", "Diversified, own-source income."],
    ["fund", "Funding Readiness", "The institutional evidence a funder or bank asks for, assembled in one place.", "Proposals that don't stall."],
    ["perf", "Performance", "The CPA360 Institutional Score and monitoring & evaluation.", "One honest view of where you stand."],
    ["doc", "Documents", "The CPA Master File — eleven categories forming the institution's official memory.", "A complete institutional record."],
  ];
  var mg = $("#lp-modules-grid");
  if (mg) {
    mg.innerHTML = MODULES.map(function (m) {
      return '<article class="lp-mod"><div class="lp-mod-ic">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
        IC[m[0]] + "</svg></div><h3>" + esc(m[1]) + "</h3><p>" + esc(m[2]) + "</p><b>" + esc(m[3]) + "</b></article>";
    }).join("");
  }

  /* ---- FAQ ---- */
  var FAQ = [
    ["What is CPA360?", "CPA360 is an integrated institutional management platform for Communal Property Associations. It brings governance, beneficiaries, administration, finance, land, productivity, projects and commercialisation into one operating environment, and measures institutional health on a standardised 100-point score."],
    ["Who is CPA360 for?", "CPA Executive Committees, CPA administration offices, and the professionals, government departments, funders and NGOs that work with CPAs."],
    ["What does CPA360 assess?", "Nine institutional domains: governance, beneficiary integrity, administration, financial controls, land & assets, productivity, commercialisation, compliance and investment readiness."],
    ["Does CPA360 manage my CPA?", "No. CPA360 supports institutional management and gives the Committee and administration office one shared, structured view. The CPA continues to govern itself through its lawful structures."],
    ["Can CPA360 help with beneficiary verification?", "Yes. CPA360 maintains the Master Beneficiary Register with verification status, household records, succession cases, deceased members, duplicate/conflict cases and verification evidence."],
    ["Can CPA360 help with governance?", "Yes. It maintains EXCO and office-bearer records, sub-committees, a resolutions register, meeting and AGM/SGM records, conflict-of-interest declarations and a governance calendar of statutory deadlines."],
    ["Can CPA360 help with funding readiness?", "Yes. CPA360 assembles the institutional evidence — governance, verified beneficiaries, finances, land records, business cases — that funders and banks ask for, and flags what is still missing."],
    ["Does CPA360 provide funding?", "No. CPA360 does not provide funding and does not provide government funding. It strengthens institutional readiness so a CPA is better positioned when it approaches funders."],
    ["How does the CPA360 score work?", "Each of the nine domains is scored against weighted criteria and rolled up to a single figure out of 100, mapped to a maturity band. As tracked actions are completed and evidence is uploaded, the score moves."],
    ["Can CPA360 be used by an existing CPA administration office?", "Yes. CPA360 is designed to be run by the CPA's own administrators and committee members, with role-based access. It works alongside an existing office rather than replacing it."],
    ["Is CPA360 a replacement for the CPA Executive Committee?", "No. CPA360 does not replace the CPA's lawful governance structures or decision-making authority. It is a tool the Committee uses to see and manage the institution."],
  ];
  var fl = $("#lp-faq-list");
  if (fl) {
    fl.innerHTML = FAQ.map(function (q) {
      return "<details><summary>" + esc(q[0]) + "</summary><p>" + esc(q[1]) + "</p></details>";
    }).join("");
  }

  /* ---- consultation ---- */
  var CONSULT = (env.CONSULTATION_URL || "").trim();
  var consultSlot = $("#lp-consult-slot");
  if (CONSULT && consultSlot) {
    consultSlot.innerHTML = '<iframe src="' + esc(CONSULT) + '" title="Book a CPA360 consultation" loading="lazy"></iframe>';
  }
  $$("[data-consult]").forEach(function (b) {
    b.addEventListener("click", function () {
      if (CONSULT) { window.open(CONSULT, "_blank", "noopener"); return; }
      openForm("consultation");
    });
  });

  /* ============ lead form ============ */
  var PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];
  var LAND = ["Under 100 ha", "100 – 500 ha", "500 – 2,000 ha", "2,000 – 10,000 ha", "Over 10,000 ha", "Not sure"];
  var HH = ["Under 50", "50 – 200", "200 – 1,000", "1,000 – 5,000", "Over 5,000", "Not sure"];
  var ROLES = ["EXCO Member", "CPA Administrator", "Chairperson", "Secretary", "Treasurer", "Beneficiary", "Professional Advisor", "Government", "Other"];
  var CHALLENGES = ["Governance", "Beneficiary Records", "Finance", "Administration", "Land Management", "Agriculture / Productivity", "Projects", "Funding", "Commercialisation", "Other"];

  var INTENTS = {
    assessment: { eyebrow: "CPA360 Assessment enquiry", title: "Find out where your CPA stands.", submit: "Request CPA360 Assessment" },
    consultation: { eyebrow: "CPA360 Consultation request", title: "Book a CPA360 Consultation.", submit: "Request Consultation" },
    proposal: { eyebrow: "CPA360 Proposal request", title: "Request a CPA360 Proposal.", submit: "Request Proposal" },
  };

  var modal = $("#lp-form-modal"), formEl = $("#lp-form"), bodyEl = $("#lp-form-body"),
    progEl = $("#lp-form-progress"), msgEl = $("#lp-form-msg"), doneEl = $("#lp-form-done"),
    backBtn = $("#lp-form-back"), nextBtn = $("#lp-form-next");
  var state = { intent: "assessment", step: 0, data: {} };
  var selField = function (name, label, opts, ph) {
    return '<label class="lp-step"><h4>' + esc(label) + "</h4>" +
      '<select name="' + name + '"><option value="">' + esc(ph || "Select…") + "</option>" +
      opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + "</option>"; }).join("") +
      "</select></label>";
  };
  var STEPS = [
    { key: "cpa_name", req: true, html: '<div class="lp-step"><h4>What is your CPA called?</h4><p class="hint">The registered or commonly used name.</p><input type="text" name="cpa_name" autocomplete="organization" placeholder="e.g. Kwezi Valley Communal Property Association" /></div>' },
    { key: "province", html: selField("province", "Which province is the CPA in?", PROVINCES) },
    { key: "land_size", html: selField("land_size", "Approximate land size", LAND) },
    { key: "households", html: selField("households", "Approximate number of beneficiary households", HH) },
    { key: "challenges", multi: true, html: '<div class="lp-step"><h4>Current institutional challenges</h4><p class="hint">Select all that apply.</p><div class="lp-choices">' + CHALLENGES.map(function (c) { return '<label><input type="checkbox" name="challenges" value="' + esc(c) + '"> ' + esc(c) + "</label>"; }).join("") + "</div></div>" },
    { key: "contact_name", req: true, html: '<div class="lp-step"><h4>Your name</h4><input type="text" name="contact_name" autocomplete="name" placeholder="Full name" /></div>' },
    { key: "email", req: true, html: '<div class="lp-step"><h4>Your email</h4><input type="email" name="email" autocomplete="email" placeholder="you@example.org" /></div>' },
    { key: "phone", html: '<div class="lp-step"><h4>Your phone number</h4><p class="hint">Optional, but it helps us reach you.</p><input type="tel" name="phone" autocomplete="tel" placeholder="+27 …" /></div>' },
    { key: "role", html: selField("role", "Your role", ROLES) },
    { key: "review", html: '<div class="lp-step"><h4>Review &amp; send</h4><p class="hint">Check the details, then send your enquiry.</p><div class="lp-review"><dl id="lp-review-dl"></dl></div></div>' },
  ];

  function renderStep() {
    var s = STEPS[state.step];
    bodyEl.innerHTML = s.html;
    if (s.key === "review") {
      var d = state.data, rows = [
        ["CPA", d.cpa_name], ["Province", d.province], ["Land size", d.land_size],
        ["Households", d.households], ["Challenges", (d.challenges || []).join(", ")],
        ["Name", d.contact_name], ["Email", d.email], ["Phone", d.phone], ["Role", d.role],
      ].filter(function (r) { return r[1]; });
      $("#lp-review-dl").innerHTML = rows.map(function (r) {
        return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>";
      }).join("");
    } else {
      var inp = bodyEl.querySelector("input,select");
      if (inp && !s.multi) {
        var v = state.data[s.key];
        if (v != null) inp.value = v;
        inp.focus();
      }
      if (s.multi) {
        (state.data[s.key] || []).forEach(function (val) {
          var c = bodyEl.querySelector('input[value="' + CSS.escape(val) + '"]');
          if (c) c.checked = true;
        });
      }
    }
    progEl.innerHTML = STEPS.map(function (_, i) {
      return '<span class="' + (i <= state.step ? "on" : "") + '"></span>';
    }).join("");
    backBtn.hidden = state.step === 0;
    nextBtn.textContent = state.step === STEPS.length - 1 ? INTENTS[state.intent].submit : "Next";
    msgEl.textContent = "";
  }

  function collect() {
    var s = STEPS[state.step];
    if (s.key === "review") return true;
    if (s.multi) {
      state.data[s.key] = $$('input[name="' + s.key + '"]:checked', bodyEl).map(function (c) { return c.value; });
      return true;
    }
    var inp = bodyEl.querySelector("input,select");
    var val = inp ? inp.value.trim() : "";
    if (s.req && !val) { msgEl.textContent = "This field is required."; inp.focus(); return false; }
    if (s.key === "email" && val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) {
      msgEl.textContent = "Enter a valid email address."; inp.focus(); return false;
    }
    state.data[s.key] = val;
    return true;
  }

  function openForm(intent) {
    state.intent = INTENTS[intent] ? intent : "assessment";
    state.step = 0; state.data = {};
    $("#lp-form-eyebrow").textContent = INTENTS[state.intent].eyebrow;
    $("#lp-form-title").textContent = INTENTS[state.intent].title;
    formEl.hidden = false; doneEl.hidden = true;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    renderStep();
  }
  function closeForm() {
    modal.hidden = true;
    document.body.style.overflow = "";
  }

  $$("[data-open-form]").forEach(function (b) {
    b.addEventListener("click", function () { openForm(b.getAttribute("data-open-form")); });
  });
  $$("[data-close-form]").forEach(function (b) { b.addEventListener("click", closeForm); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !modal.hidden) closeForm(); });

  backBtn.addEventListener("click", function () {
    if (state.step > 0) { state.step--; renderStep(); }
  });
  nextBtn.addEventListener("click", function () {
    if (!collect()) return;
    if (state.step < STEPS.length - 1) { state.step++; renderStep(); return; }
    submitLead();
  });

  async function submitLead() {
    nextBtn.disabled = true; nextBtn.textContent = "Sending…"; msgEl.textContent = "";
    var d = state.data;
    var payload = {
      cpa_name: d.cpa_name, province: d.province || null, land_size: d.land_size || null,
      households: d.households || null, challenges: d.challenges || [],
      contact_name: d.contact_name, email: d.email, phone: d.phone || null, role: d.role || null,
      intent: state.intent, source: "landing", hp: ($("#lp-hp") || {}).value || "",
    };
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 15000);
    try {
      if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error("config");
      var res = await fetch(env.SUPABASE_URL + "/rest/v1/leads", {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          apikey: env.SUPABASE_ANON_KEY,
          Authorization: "Bearer " + env.SUPABASE_ANON_KEY,
          Prefer: "return=minimal",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      formEl.hidden = true; doneEl.hidden = false;
    } catch (err) {
      msgEl.textContent = "Sorry — we couldn't send that just now. Please check your connection and try again.";
      nextBtn.disabled = false; nextBtn.textContent = INTENTS[state.intent].submit;
    } finally {
      clearTimeout(timer);
    }
  }
})();
