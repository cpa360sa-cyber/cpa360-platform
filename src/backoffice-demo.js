/* ============================================================================
 * CPA360 Back Office — demo data (?demo). Plan structure mirrors the seed in
 * supabase/migrations/0055_backoffice_seed.sql (CPA360-OPS-01 v0.2); the
 * clients, visits and tickets are fictional samples so every screen has data.
 * ==========================================================================*/
const day = (offset) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
const ts = (offset, h = 9) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(h, 0, 0, 0); return d.toISOString(); };
let n = 0;
const id = (p) => `${p}-${++n}`;

export function demoSeed() {
  n = 0;
  const team = [
    ["JV Operations Lead", "back_office", "JV", 1, "active", "Operations Lead (demo)", "demo@cpa360.local", "admin"],
    ["Designated Bookkeeper", "back_office", "JV", 0.5, "active", "Bookkeeper (demo)", "books@cpa360.local", "member"],
    ["Committee Secretary & Records Officer", "back_office", "JV", 1, "vacant"],
    ["Technical Lead", "platform", "Afribot", 1, "active", "Technical Lead (demo)", "tech@cpa360.local", "member"],
    ["Platform Developer", "platform", "Afribot", 1, "active", "Developer (demo)", "dev@cpa360.local", "member"],
    ["Programme Lead", "programme", "GAD", 0.5, "active", "Programme Lead (demo)", "programme@cpa360.local", "member"],
    ["BD & Partnerships Lead", "bd", "GAD", 1, "active", "BD Lead (demo)", "bd@cpa360.local", "member"],
    ["Toolkit & Framework Content Lead", "programme", "GAD", 1, "vacant"],
    ["Intake & Triage Coordinator", "delivery", "GAD", 0.5, "active", "Intake (demo)", "intake@cpa360.local", "member"],
    ["CPA Implementation Facilitator", "delivery", "GAD", 1, "active", "Facilitator A (demo)", "fac.a@cpa360.local", "member"],
    ["CPA Implementation Facilitator", "delivery", "GAD", 1, "vacant"],
    ["Regional Delivery Lead", "delivery", "GAD", 1, "vacant"],
  ].map(([role_title, department, party, fte, status, full_name, email, access], i) => ({
    id: id("tm"), role_title, department, party, fte, status, full_name: full_name || null, email: email || null,
    access: access || "member", sort: i + 1, starts_on: day(20 + i * 3), user_id: null,
  }));
  const T = (role) => team.find((t) => t.role_title === role && t.status === "active")?.id || null;

  const ms = [
    ["S1", "Close the draft's five decision points", "pre_signature", "committee", "Both Parties + attorneys", 19, "in_progress"],
    ["S2", "Decide whether governance-recovery facilitation is JV Business", "pre_signature", "committee", "Both Parties", 19, "at_risk"],
    ["S3", "Complete Schedule 1 (Toolkit Library, prototype, Program Profile, Journey Map)", "pre_signature", "committee", "Both Parties", 19, "in_progress"],
    ["S5", "Authorising resolutions; Committee members and bank signatories named", "pre_signature", "committee", "Each Party", 19, "done"],
    ["S7", "Sign the Agreement", "pre_signature", "committee", "Authorised signatories", 19, "not_started"],
    ["M1.1", "First Management Committee meeting", "month_1", "committee", "Committee chair", 26, "not_started"],
    ["M1.2", "Appoint JV Operations Lead; delegation resolution with Rand limits", "month_1", "committee", "Committee", 26, "not_started"],
    ["M1.4", "Open JV Account with dual authority", "month_1", "back_office", "Bookkeeper", 50, "not_started"],
    ["M1.6", "Accounting system with cost centres A and B and CPA codes", "month_1", "back_office", "Bookkeeper", 50, "not_started"],
    ["M2.1", "Move repository, hosting, database and domain to JV accounts", "months_2_3", "platform", "Technical Lead", 81, "in_progress"],
    ["M2.5", "Monitoring, daily backups, MFA, audit logging; first restore test", "months_2_3", "platform", "Technical Lead", 81, "in_progress"],
    ["M2.6", "Release 1 to pilot standard (R1-01 to R1-10)", "months_2_3", "platform", "Platform team", 109, "in_progress"],
    ["M2.12", "Agree pilot CPAs with referral partners", "months_2_3", "bd", "BD Lead", 81, "in_progress"],
    ["M2.13", "Triage pilot CPAs; sign engagement letters; onboard", "months_2_3", "delivery", "Client Delivery", 109, "not_started"],
    ["R8", "Release 1 passes pilot acceptance test; restore tested", "ready", "platform", "Operations Lead", 109, "not_started"],
    ["Y1.2", "First CPA onboarded on the platform", "year_1", "delivery", "Client Delivery", 109, "not_started"],
    ["Y1.6", "First Gate 1 signed off", "year_1", "programme", "Gate Reviewer", 231, "not_started"],
    ["Y1.9", "About 8 CPAs active", "year_1", "delivery", "Operations Lead", 384, "not_started"],
    ["Y2.1", "Release 2 live", "year_2", "platform", "Technical Lead", 475, "not_started"],
    ["Y3.4", "First graduations; 25–35 CPAs active", "year_3", "delivery", "Operations Lead", 1115, "not_started"],
  ].map(([code, title, phase, department, owner_role, due, status], i) => ({
    id: id("ms"), code, title, phase, department, owner_role, due_date: day(due), status, sort: i + 1, owner_id: null,
  }));
  const M = (code) => ms.find((m) => m.code === code)?.id ?? null;

  const clients = [
    { name: "Sample CPA North", province: "Limpopo", pipeline_stage: "won", lifecycle: "onboarding", segment: "A", stream: "AB", payer: "Funder (sample)", value_zar: 180000, referral_date: day(-60), triage_date: day(-38), signed_date: day(-14), onboarded_date: null, source: "Department referral", satisfaction: 4.5 },
    { name: "Sample CPA River", province: "Limpopo", pipeline_stage: "negotiation", lifecycle: "proposal", segment: "A", stream: "A", payer: "CPA", value_zar: 95000, referral_date: day(-41), triage_date: day(-20), source: "Partner referral" },
    { name: "Sample CPA Ridge", province: "Eastern Cape", pipeline_stage: "qualified", lifecycle: "triage", segment: "B", referral_date: day(-26), source: "Municipality" },
    { name: "Sample CPA Valley", province: "KwaZulu-Natal", pipeline_stage: "lead", lifecycle: "first_contact", referral_date: day(-4), source: "Website" },
    { name: "Sample CPA Plains", province: "Free State", pipeline_stage: "lost", lifecycle: "declined", segment: "C", referral_date: day(-90), triage_date: day(-64), lost_reason: "Structurally non-viable; referred to the Department", source: "Department referral" },
    { name: "Sample Development Fund", kind: "funder", pipeline_stage: "proposal", lifecycle: "proposal", value_zar: 1200000, payer: "Funder", referral_date: day(-30), source: "BD outreach" },
  ].map((c) => ({ id: id("cl"), kind: "cpa", owner_id: T("BD & Partnerships Lead"), facilitator_id: c.lifecycle === "onboarding" ? T("CPA Implementation Facilitator") : null, org_id: null, lead_id: null, created_at: ts(-10), ...c }));
  const C = (name) => clients.find((c) => c.name === name).id;

  const tasks = [
    ["Circulate the Operations Plan to both Parties", "done", "P2", "committee", null, -6, "S1"],
    ["Joint working session on D1–D4; brief attorneys", "in_progress", "P1", "committee", "JV Operations Lead", 5, "S1"],
    ["Draft side letter on facilitation status (JV vs GAD programme)", "blocked", "P1", "committee", "JV Operations Lead", 3, "S2"],
    ["List Schedule 1 Part C open-source components", "review", "P2", "platform", "Technical Lead", 7, "S3"],
    ["Shortlist office options (Polokwane)", "todo", "P3", "back_office", "JV Operations Lead", 16, null],
    ["Draft Year 1 budget and delegation resolution", "todo", "P1", "back_office", "Designated Bookkeeper", 16, "M1.2"],
    ["Set up uptime monitor and alerting", "in_progress", "P2", "platform", "Platform Developer", 12, "M2.5"],
    ["Restore test from daily backup", "todo", "P2", "platform", "Technical Lead", 30, "M2.5"],
    ["R1-07 offline capture for attendance registers", "in_progress", "P2", "platform", "Platform Developer", 40, "M2.6"],
    ["Pilot acceptance test script", "backlog", "P3", "platform", "Technical Lead", 70, "R8"],
    ["Engagement letter and onboarding pack for Sample CPA North", "todo", "P1", "delivery", "CPA Implementation Facilitator", 1, "M2.13"],
    ["Triage file: Sample CPA Ridge", "in_progress", "P2", "delivery", "Intake & Triage Coordinator", -2, "M2.13"],
    ["Pilot proposal to Sample Development Fund", "review", "P2", "bd", "BD & Partnerships Lead", 4, "M2.12"],
    ["Courtesy visit to traditional authority before field work", "backlog", "P3", "delivery", null, 35, null],
    ["Consent forms in English, Sepedi and isiZulu", "backlog", "P3", "programme", "Programme Lead", 45, "R9"],
  ].map(([title, status, priority, department, role, due, ms], i) => ({
    id: id("tk"), number: i + 1, title, status, priority, department, assignee_id: role ? T(role) : null,
    milestone_id: ms ? M(ms) : null, client_id: /North/.test(title) ? C("Sample CPA North") : /Ridge/.test(title) ? C("Sample CPA Ridge") : /Fund/.test(title) ? C("Sample Development Fund") : null,
    due_date: day(due), sort: i + 1, labels: [], created_at: ts(-20 + i), done_at: status === "done" ? ts(-6) : null, description: "",
  }));

  const visits = [
    { client_id: C("Sample CPA North"), planned_date: day(-12), held_date: day(-12), report_date: day(-11), purpose: "Kick-off with the executive" },
    { client_id: C("Sample CPA North"), planned_date: day(-5), held_date: day(-5), report_date: day(-1), purpose: "Onboarding checklist and consent forms" },
    { client_id: C("Sample CPA North"), planned_date: day(-3), held_date: null, report_date: null, purpose: "Platform accounts and CPA profile" },
    { client_id: C("Sample CPA Ridge"), planned_date: day(-8), held_date: day(-8), report_date: day(-7), purpose: "Triage site visit" },
    { client_id: C("Sample CPA North"), planned_date: day(2), purpose: "Baseline Institutional Score" },
  ].map((v) => ({ id: id("vs"), facilitator_id: T("CPA Implementation Facilitator"), outcome: "", ...v }));

  const tickets = [
    { title: "Secretary cannot reset password", tier: 1, severity: "P3", status: "resolved", opened_at: ts(-9, 9), acknowledged_at: ts(-9, 11), resolved_at: ts(-9, 15), client_id: C("Sample CPA North") },
    { title: "Attendance register upload times out on 3G", tier: 2, severity: "P2", status: "in_progress", opened_at: ts(-3, 10), acknowledged_at: ts(-3, 12), assignee_id: T("Platform Developer") },
    { title: "Login page down (sample P1)", tier: 3, severity: "P1", status: "closed", opened_at: ts(-15, 8), acknowledged_at: ts(-15, 9), resolved_at: ts(-15, 13), assignee_id: T("Technical Lead") },
    { title: "How do I record an SGM?", tier: 1, severity: "P4", status: "open", opened_at: ts(-1, 14) },
  ].map((t, i) => ({ id: id("tc"), number: i + 1, reporter: "CPA secretary (sample)", ...t }));

  const decisions = [
    ["D1", "The draft's five open points", "Before signature", 19, "open"], ["D2", "Whether facilitation is JV Business", "Before signature", 19, "open"],
    ["D3", "Toolkit Library and prototype: Background or Foreground IP", "Before signature", 19, "open"], ["D4", "POPIA responsible party per processing category", "Before signature", 19, "decided"],
    ["D5", "Appoint JV Operations Lead and delegation limits", "Month 1", 50, "open"], ["D6", "Designated bookkeeper; name on the JV Account", "Month 1", 50, "open"],
    ["D7", "Year 1 budget, service-fee rates and loss funding", "Month 1", 50, "open"], ["D8", "VAT registration", "Month 1", 50, "open"],
    ["D9", "Pilot pricing and standard client terms", "Month 2", 81, "open"], ["D10", "Office location", "Month 2", 81, "open"], ["D11", "Pilot CPAs and referral partners", "Month 2", 81, "open"],
  ].map(([code, decision, needed_by, due, status], i) => ({ id: id("dc"), code, decision, needed_by, due_date: day(due), status, sort: i + 1, outcome: status === "decided" ? "GAD Foundation responsible party for programme data; Afribot operator (sample)" : null }));

  const risks = [
    ["R01", "Year 1 losses larger than expected", "Committee", 3, 4], ["R02", "Pilot CPAs do not engage", "Operations Lead", 3, 5],
    ["R03", "Elite capture of a CPA's platform accounts", "Programme Lead", 3, 4], ["R05", "Platform outage during a CPA meeting", "Technical Lead", 2, 4],
    ["R06", "POPIA breach", "Information Officer", 2, 5], ["R07", "Key-person dependence", "Committee", 4, 4],
    ["R11", "Funder dependence", "BD Lead", 4, 4], ["R13", "Load-shedding, poor roads and signal", "Operations Lead", 4, 3],
  ].map(([code, risk, owner_role, likelihood, impact], i) => ({ id: id("rk"), code, risk, owner_role, likelihood, impact, status: "open", sort: i + 1, mitigation: "See CPA360-OPS-01 section 21", effect: "" }));

  const kpis = [
    ["K01", "Active Client CPAs", "count", "gte", 8, 20, 30, "JV Operations Lead", true], ["K02", "Cost cover", "pct", "gte", 25, 60, 100, "JV Operations Lead", false],
    ["K03", "Operating reserve", "months", "gte", 0, 1, 3, "Bookkeeper", false], ["K04", "Client satisfaction", "score", "gte", 4, 4.2, 4.3, "Programme Lead", true],
    ["K10", "Referral to triage decision", "days", "lte", 20, 15, 15, "Intake & Triage Coordinator", true], ["K11", "Visits held vs planned", "pct", "gte", 85, 90, 90, "Regional Delivery Leads", true],
    ["K12", "Visit reports on time", "pct", "gte", 90, 95, 95, "Facilitators", true], ["K14", "Onboarding on time", "pct", "gte", 80, 90, 95, "Facilitators", true],
    ["K15", "Platform in use at CPAs", "pct", "gte", 70, 80, 90, "Facilitators + Platform Trainer", true], ["K16", "Caseload per facilitator", "count", "lte", 4, 4, 4, "Delivery Manager", true],
    ["K20", "Platform uptime", "pct", "gte", 99, 99, 99.5, "Technical Lead", false], ["K21", "P1 response", "pct", "gte", 100, 100, 100, "Technical Lead", true],
    ["K22", "P1 fix or workaround", "pct", "gte", 100, 100, 100, "Technical Lead", true], ["K23", "Backups succeeded", "pct", "gte", 100, 100, 100, "Technical Lead", false],
    ["K24", "Tier 1 answered in 4 hours", "pct", "gte", 90, 95, 95, "Support Desk", true], ["K40", "Qualified pipeline", "count", "gte", 10, 20, 30, "BD & Partnerships Lead", true],
    ["K41", "Proposal win rate", "pct", "gte", 40, 45, 50, "BD & Partnerships Lead", true], ["K42", "New CPAs contracted (year to date)", "count", "gte", 8, 12, 15, "BD & Partnerships Lead", true],
    ["K50", "Management accounts by the 15th", "yesno", "gte", 1, 1, 1, "Bookkeeper", false], ["K51", "Minutes within 5 Business Days", "pct", "gte", 100, 100, 100, "Committee Secretary", false],
    ["K52", "Debtors over 60 days", "pct", "lte", 15, 10, 10, "Contracts & Billing Officer", false], ["K60", "POPIA incidents reported in 24 hours", "pct", "gte", 100, 100, 100, "Information Officer", false],
    ["K61", "Access review done", "yesno", "gte", 1, 1, 1, "Technical Lead", false],
  ].map(([kid, name, unit, direction, target_y1, target_y2, target_y3, owner_role, auto], i) => ({ id: kid, name, unit, direction, target_y1, target_y2, target_y3, owner_role, auto, sort: i + 1, frequency: "Monthly", definition: "", source: "" }));

  const month = (o) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + o); return d.toISOString().slice(0, 10); };
  const readings = [
    ["K20", -2, 99.6], ["K20", -1, 98.4], ["K23", -1, 100], ["K02", -1, 0], ["K50", -1, 1], ["K61", -1, 0], ["K61", -2, 0],
  ].map(([kpi_id, o, value]) => ({ id: id("kr"), kpi_id, period: month(o), value, note: "" }));

  const orgs = [
    { id: "org-1", name: "Sample CPA North", region: "Limpopo", current_gate: 1, members_count: 412, users: 4, beneficiaries: 398, documents: 37, meetings: 3, open_actions: 9, events_30d: 214, last_activity: ts(-1), pending_reviews: 0, created_at: ts(-40) },
    { id: "org-2", name: "Training sandbox", region: "Gauteng", current_gate: 2, members_count: 120, users: 2, beneficiaries: 118, documents: 5, meetings: 1, open_actions: 2, events_30d: 0, last_activity: ts(-45), pending_reviews: 1, created_at: ts(-70) },
  ];
  clients[0].org_id = "org-1";

  return {
    bo_team: team, bo_milestones: ms, bo_clients: clients, bo_tasks: tasks, bo_visits: visits, bo_tickets: tickets,
    bo_decisions: decisions, bo_risks: risks, bo_kpis: kpis, bo_kpi_readings: readings,
    bo_task_comments: [{ id: id("cm"), task_id: tasks[2].id, author_name: "Operations Lead (demo)", body: "Waiting for attorneys' view on clause 7.6 before we can draft.", created_at: ts(-1) }],
    bo_settings: [{ key: "plan", value: { name: "CPA360 Operations Plan 2026–2029", code: "CPA360-OPS-01", version: "0.2", month1: "2026-12-01", signature_target: "2026-11-30" } }],
    bo_activity: [{ id: 1, table_name: "bo_tasks", action: "update", summary: "Circulate the Operations Plan to both Parties → done", actor_email: "demo@cpa360.local", at: ts(-6) }],
    bo_platform_orgs: orgs,
    bo_platform_leads: [
      { id: "lead-1", created_at: ts(-2), cpa_name: "Sample CPA Hillside", province: "Mpumalanga", contact_name: "Secretary (sample)", email: "hillside@example.org", phone: "", intent: "demo", source: "landing", status: "new", message: "We need help with our AGM and member register.", imported: false },
      { id: "lead-2", created_at: ts(-6), cpa_name: "Sample CPA Valley", province: "KwaZulu-Natal", contact_name: "Chair (sample)", email: "valley@example.org", intent: "consult", source: "landing", status: "contacted", imported: true },
    ],
    bo_platform_summary: { orgs: 2, users: 8, beneficiaries: 516, documents: 42, pending_reviews: 1, new_leads: 1, events_7d: 61,
      daily_30d: Array.from({ length: 30 }, (_, i) => ({ d: day(i - 29), n: Math.max(0, Math.round(6 + 5 * Math.sin(i / 2.5) + (i % 7 === 0 ? -6 : 0))) })) },
  };
}
