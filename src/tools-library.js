/* ============================================================================
 * CPA360 Tools Library — downloadable working documents.
 *
 * Every template is generated in the browser (no files to host):
 *   .csv  registers / trackers / matrices — open in Excel; the column headings
 *         line up with the app's "Import CSV" buttons so a filled-in template
 *         can be loaded straight back into CPA360.
 *   .doc  forms / policies / agreements / toolkits — open in Word, formatted,
 *         with fill-in fields.  ("Toolkit" = several related templates in one
 *         document.)
 *
 * Curated by GAD. To add a template: add an entry to TOOLS with a build()
 * that returns the file's text.  Categories live in CATS.
 * ==========================================================================*/

const esc = (s) => (s == null ? "" : String(s)).replace(/[&<>"']/g, (m) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

/* ---------------------------------------------------------------- categories */
export const CATS = [
  { id: "assess", label: "Assessment & Planning", blurb: "Diagnose the institution and plan the work." },
  { id: "gov",    label: "Governance",            blurb: "Meetings, resolutions, committees, conduct." },
  { id: "benef",  label: "Beneficiaries",         blurb: "The membership register and member affairs." },
  { id: "admin",  label: "Administration",        blurb: "Delegations, policies, correspondence, records." },
  { id: "hr",     label: "Human Resources",       blurb: "Staff, positions, contracts, payroll." },
  { id: "fin",    label: "Finance",               blurb: "Budgeting, bookkeeping, controls, reporting." },
  { id: "proc",   label: "Procurement",           blurb: "Requisitions, quotations, orders, payments." },
  { id: "land",   label: "Land & Assets",         blurb: "Parcels, leases, allocations, asset care." },
  { id: "prod",   label: "Productivity",          blurb: "Enterprises, production, inputs, water." },
  { id: "proj",   label: "Projects & Commercialisation", blurb: "Business cases, delivery, markets, partners." },
  { id: "report", label: "Reporting & Compliance", blurb: "Board packs and statutory obligations." },
];

/* ------------------------------------------------------------- .doc builder */
/* A Word-compatible HTML document: Word opens it as a formatted, editable file. */
const DOC_CSS = `
  body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1f1f1f;line-height:1.45;margin:2.2cm 2cm;}
  .hdr{border-bottom:2.5pt solid #1c3a68;padding-bottom:6pt;margin-bottom:16pt;}
  .brand{font-size:8.5pt;letter-spacing:1.6pt;text-transform:uppercase;color:#2f7d4f;font-weight:bold;}
  h1{font-size:17pt;color:#132a4f;margin:3pt 0 2pt;}
  .sub{color:#555;font-size:10pt;margin:0;}
  h2{font-size:12pt;color:#1c3a68;border-bottom:.75pt solid #d8d8d8;padding-bottom:2pt;margin:15pt 0 6pt;}
  h3{font-size:10.5pt;color:#1c3a68;margin:10pt 0 3pt;}
  p{margin:4pt 0;}
  ul,ol{margin:4pt 0;padding-left:20pt;}
  li{margin:2.5pt 0;}
  table{border-collapse:collapse;width:100%;margin:6pt 0;font-size:10pt;}
  th,td{border:.75pt solid #b3b3b3;padding:5pt 7pt;text-align:left;vertical-align:top;}
  th{background:#eef2f7;color:#132a4f;}
  .fill{color:#8a8a8a;}
  .note{font-size:9.5pt;color:#666;font-style:italic;}
  .foot{margin-top:22pt;border-top:.75pt solid #d8d8d8;padding-top:6pt;font-size:8.5pt;color:#777;}
  .sig td{height:34pt;}
`;
function DOC(title, sub, body) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${esc(title)}</title>
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->
<style>${DOC_CSS}</style></head>
<body>
<div class="hdr">
  <div class="brand">CPA360&trade; &nbsp;&middot;&nbsp; A GAD Foundation Programme</div>
  <h1>${esc(title)}</h1>
  <p class="sub">${esc(sub || "")}</p>
</div>
<p><b>CPA name:</b> <span class="fill">________________________________</span>
&nbsp;&nbsp;<b>Registration no.:</b> <span class="fill">________________</span>
&nbsp;&nbsp;<b>Date:</b> <span class="fill">____________</span></p>
${body}
<div class="foot">CPA360&trade; working template &mdash; adapt to your CPA&rsquo;s registered constitution, rules and context before use.
CPA360 supports institutional management; it does not replace the CPA&rsquo;s lawful governance structures or decision-making.
&nbsp;&middot;&nbsp; Stronger CPAs. Brighter Futures.</div>
</body></html>`;
}
const H = (t) => `<h2>${esc(t)}</h2>`;
const H3 = (t) => `<h3>${esc(t)}</h3>`;
const P = (t) => `<p>${t}</p>`;
const NOTE = (t) => `<p class="note">${esc(t)}</p>`;
const UL = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
const OL = (items) => `<ol>${items.map((i) => `<li>${i}</li>`).join("")}</ol>`;
const CHECK = (items) => `<ul style="list-style:none;padding-left:0;">${items.map((i) => `<li>&#9744;&nbsp;&nbsp;${esc(i)}</li>`).join("")}</ul>`;
const FIELD = (label, hint) => `<p><b>${esc(label)}:</b> <span class="fill">${hint ? esc(hint) : "________________________________"}</span></p>`;
const LINES = (n) => `<p class="fill">${Array.from({ length: n || 3 }).map(() => "_______________________________________________________________").join("<br><br>")}</p>`;
const TABLE = (headers, rows) => `<table><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>${(rows || []).map((r) => `<tr>${r.map((c) => `<td>${c === "" ? "&nbsp;" : esc(c)}</td>`).join("")}</tr>`).join("")}</table>`;
const BLANK = (headers, n) => TABLE(headers, Array.from({ length: n || 6 }).map(() => headers.map(() => "")));
const SIGN = (roles) => {
  const r = (roles || ["Name", "Role / capacity", "Signature", "Date"]).filter(Boolean);
  return `<table class="sig"><tr>${r.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>` +
    Array.from({ length: 3 }).map(() => `<tr>${r.map(() => "<td>&nbsp;</td>").join("")}</tr>`).join("") + `</table>`;
};

/* ------------------------------------------------------------- .csv builder */
const csvCell = (v) => {
  v = v == null ? "" : String(v);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};
const CSV = (headers, rows) =>
  [headers, ...(rows || [])].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";

/* ==========================================================================
 *  TOOLS
 * ========================================================================*/
export const TOOLS = [

  /* ---------------------------------------------------------- assessment */
  {
    id: "self-assessment", cat: "assess", fmt: "doc",
    title: "Institutional Self-Assessment Workbook",
    desc: "Score the CPA against the nine CPA360 domains and the maturity journey. Use it to open an assessment or to re-check progress each quarter.",
    build: () => DOC("Institutional Self-Assessment Workbook",
      "Score each area 0 (not in place) to full weight (fully in place and working). Attach evidence references.",
      H("How to use this workbook") +
      OL([
        "Work through each domain with the Committee. Agree a score for every line.",
        "Record the evidence you relied on (minute, register, statement, file reference).",
        "Total each domain, then the nine domains, for a score out of 100.",
        "Use the lowest-scoring domains to build the Institutional Action Plan.",
      ]) +
      H("Domain scoring") +
      TABLE(["Domain", "Weight", "Score", "Evidence relied on", "Priority actions"], [
        ["Governance", "15", "", "", ""],
        ["Beneficiaries", "12", "", "", ""],
        ["Administration", "10", "", "", ""],
        ["Finance", "15", "", "", ""],
        ["Land & Assets", "12", "", "", ""],
        ["Productivity", "12", "", "", ""],
        ["Commercialisation", "8", "", "", ""],
        ["Compliance", "8", "", "", ""],
        ["Investment readiness", "8", "", "", ""],
        ["TOTAL", "100", "", "", ""],
      ]) +
      H("Maturity journey — where is the CPA now?") +
      TABLE(["Stage", "Description", "Reached? (Y/N)", "Notes"], [
        ["1 · Assess", "Baseline understood; records located", "", ""],
        ["2 · Recover", "Urgent compliance and disputes addressed", "", ""],
        ["3 · Stabilise", "Governance and finance functioning routinely", "", ""],
        ["4 · Professionalise", "Policies, delegations and staff in place", "", ""],
        ["5 · Productivise", "Land under active, recorded production", "", ""],
        ["6 · Commercialise", "Markets and revenue streams established", "", ""],
        ["7 · Scale", "Investment-ready; growing independently", "", ""],
      ]) +
      H("Assessment summary") +
      FIELD("Overall score") + FIELD("Maturity stage") +
      H3("Three things working well") + LINES(3) +
      H3("Three priorities for the next 90 days") + LINES(3) +
      H("Sign-off") + SIGN()),
  },
  {
    id: "action-plan", cat: "assess", fmt: "csv",
    title: "Institutional Action Plan",
    desc: "The master list of what must be done, by whom, by when. Headings match the Action Tracker — fill it in and use Import CSV on the Action Tracker screen.",
    build: () => CSV(
      ["Ref", "Category", "Action", "Owner", "Due date", "Status"],
      [
        ["ACT-001", "Governance", "Complete conflict-of-interest declarations for all Committee members", "Secretary", "2026-10-15", "Not Started"],
        ["ACT-002", "Finance", "Reconcile the bank account for the last three months", "Treasurer", "2026-10-31", "In Progress"],
      ]),
  },
  {
    id: "onboarding-toolkit", cat: "assess", fmt: "doc",
    title: "New CPA Onboarding Toolkit",
    desc: "Everything to start work with a CPA in one document: an introduction letter, an information-gathering form, a records checklist and a first-90-days outline.",
    build: () => DOC("New CPA Onboarding Toolkit",
      "Four templates for the first engagement with a Communal Property Association.",
      H("1 · Introduction letter to the Committee") +
      P("Date: <span class='fill'>____________</span>") +
      P("To the Executive Committee of <span class='fill'>________________________________ CPA</span>") +
      P("We have been asked to support your CPA to strengthen its institutional systems through the CPA360 programme. " +
        "This is a supportive process. It does not replace the Committee or the general meeting &mdash; the CPA remains in charge of every decision. " +
        "Our first step is to understand how the CPA works today and to locate its key records.") +
      P("We would be grateful if the Committee could nominate a contact person and help us gather the documents listed overleaf.") +
      SIGN(["Name", "Organisation", "Signature", "Date"]) +
      H("2 · CPA information form") +
      FIELD("Registered name") + FIELD("Registration number") + FIELD("Date established") +
      FIELD("District / province") + FIELD("Total land extent (ha)") + FIELD("Number of portions") +
      FIELD("Approximate membership") + FIELD("Number of households") +
      FIELD("Contact person") + FIELD("Position") + FIELD("Phone") + FIELD("Email") +
      H3("Committee as currently constituted") +
      BLANK(["Role", "Name", "Elected on", "Term ends"], 7) +
      H3("Biggest challenges, in the Committee's own words") + LINES(4) +
      H("3 · Records to locate") +
      CHECK([
        "Constitution and CPA registration certificate",
        "Surveyor-General diagram / title deed(s)",
        "Latest signed AGM and EXCO minutes",
        "Beneficiary / membership register",
        "Latest annual financial statements or audit",
        "Bank statements (last 12 months) and the banking mandate",
        "Lease and land-allocation agreements",
        "Asset register",
        "Statutory filings (CIPC annual return, SARS, DALRRD reports)",
        "Policies already adopted (finance, land allocation, others)",
        "Correspondence file with government and funders",
      ]) +
      H("4 · First 90 days — outline") +
      TABLE(["Weeks", "Focus", "Output"], [
        ["1–2", "Records located, information form completed", "Baseline file opened"],
        ["3–6", "Self-assessment workshop with the Committee", "Institutional score + priorities"],
        ["7–10", "Urgent compliance and disputes; quick wins", "Action Plan underway"],
        ["11–13", "Report back to the Committee / general meeting", "Endorsed improvement plan"],
      ])),
  },
  {
    id: "stabilisation-plan", cat: "assess", fmt: "doc",
    title: "90-Day Stabilisation Plan",
    desc: "A focused plan for a CPA in difficulty: the few things that must be fixed first to get governance and finance functioning.",
    build: () => DOC("90-Day Stabilisation Plan",
      "For a CPA at the Recover / Stabilise stage. Keep it short. Do these before anything else.",
      H("Priority 1 — Governance is functioning") +
      TABLE(["Task", "Owner", "By when", "Done"], [
        ["Confirm the Committee is properly elected and quorate", "", "", ""],
        ["Schedule the next three EXCO meetings; issue notices", "", "", ""],
        ["Bring the minute book up to date", "", "", ""],
        ["Set an AGM date and prepare the notice", "", "", ""],
      ]) +
      H("Priority 2 — Finances are under control") +
      TABLE(["Task", "Owner", "By when", "Done"], [
        ["Confirm bank signatories and the mandate", "", "", ""],
        ["Reconcile the bank account (last 3 months)", "", "", ""],
        ["List all income and commitments for the year", "", "", ""],
        ["Stop any unauthorised payments; agree a spending limit", "", "", ""],
      ]) +
      H("Priority 3 — Compliance and disputes") +
      TABLE(["Task", "Owner", "By when", "Done"], [
        ["File any overdue CIPC / SARS returns", "", "", ""],
        ["List open beneficiary disputes; set a resolution route", "", "", ""],
        ["Check that leases and permits are current", "", "", ""],
      ]) +
      H("Review") + FIELD("Progress review date") + P("Report progress to the Committee and, at the next opportunity, to the members.")),
  },
  {
    id: "records-checklist", cat: "assess", fmt: "doc",
    title: "CPA Records & Documents Checklist",
    desc: "A full checklist of the documents a well-run CPA should hold, grouped by the CPA360 Master File categories.",
    build: () => DOC("CPA Records & Documents Checklist",
      "Tick what the CPA holds. Note where each document is kept and who is responsible.",
      TABLE(["Master File category", "Key documents", "Held? (Y/N)", "Location / custodian"], [
        ["A · Governance", "Constitution, registration certificate, minute books, resolution register", "", ""],
        ["B · Beneficiaries", "Verified membership register, household records, verification files", "", ""],
        ["C · Land & tenure", "Title deed(s), SG diagrams, land-use map, allocation register", "", ""],
        ["D · Assets", "Asset register, infrastructure records, maintenance plan, insurance", "", ""],
        ["E · Finance", "Budgets, cashbooks, bank statements, AFS / audit, banking mandate", "", ""],
        ["F · HR", "Contracts, job descriptions, payroll records, leave register", "", ""],
        ["G · Projects", "Business cases, project plans, progress reports, funding agreements", "", ""],
        ["H · Productivity", "Enterprise plans, production and input records, water licences", "", ""],
        ["I · Commercial", "Lease agreements, offtake / market agreements, partnership MOUs", "", ""],
        ["J · Compliance", "CIPC returns, SARS filings, DALRRD reports, permits, policies", "", ""],
        ["K · Performance", "Assessment reports, action plans, M&E data, board packs", "", ""],
      ])),
  },

  /* ------------------------------------------------------------- governance */
  {
    id: "meeting-toolkit", cat: "gov", fmt: "doc",
    title: "Governance Meeting Toolkit",
    desc: "One document with a meeting notice, a standard agenda, a minutes template, an attendance register and a resolution form.",
    build: () => DOC("Governance Meeting Toolkit",
      "Templates for EXCO, Special General and Annual General Meetings.",
      H("1 · Notice of meeting") +
      P("Notice is hereby given of a <span class='fill'>_______________</span> meeting of <span class='fill'>________________________________ CPA</span>.") +
      FIELD("Date") + FIELD("Time") + FIELD("Venue") + FIELD("Quorum required (per the constitution)") +
      P("Agenda and supporting papers are attached. Members unable to attend should send apologies to the Secretary.") +
      FIELD("Issued by (Secretary)") + FIELD("Date issued") +
      H("2 · Standard agenda") +
      OL([
        "Opening and welcome",
        "Attendance and apologies; confirmation of quorum",
        "Approval of the agenda",
        "Declarations of conflict of interest",
        "Confirmation of the previous minutes",
        "Matters arising from the previous minutes",
        "Chairperson's report",
        "Treasurer's report (finances, budget vs actual, approvals sought)",
        "Portfolio / committee reports (land, beneficiaries, projects)",
        "Decisions required (list each item)",
        "General",
        "Date of the next meeting and closure",
      ]) +
      H("3 · Minutes") +
      FIELD("Meeting type") + FIELD("Date") + FIELD("Venue") + FIELD("Chairperson") +
      FIELD("Present (number)") + FIELD("Apologies") + FIELD("Quorum met? (Y/N)") +
      H3("Decisions and resolutions") +
      BLANK(["Item", "Discussion (summary)", "Decision / resolution", "Responsible", "Due date"], 6) +
      H3("Next meeting") + FIELD("Date") +
      P("Minutes prepared by: <span class='fill'>________________</span> &nbsp; Confirmed on: <span class='fill'>____________</span>") +
      SIGN(["Chairperson", "Signature", "Date", ""]) +
      H("4 · Attendance register") +
      BLANK(["#", "Full name", "Member / role", "Signature", "Contact"], 14) +
      H("5 · Resolution form") +
      FIELD("Resolution reference") + FIELD("Meeting and date") +
      H3("Resolved that:") + LINES(3) +
      FIELD("Proposed by") + FIELD("Seconded by") +
      FIELD("For / Against / Abstain") + FIELD("Responsible person") + FIELD("Due date") +
      SIGN(["Chairperson", "Secretary", "Date", ""])),
  },
  {
    id: "attendance-register", cat: "gov", fmt: "csv",
    title: "Meeting Attendance Register",
    desc: "A simple attendance and apologies sheet you can keep per meeting.",
    build: () => CSV(
      ["Meeting type", "Meeting date", "Full name", "Member / role", "Present / Apology", "Contact"],
      [["AGM", "2026-11-07", "Nomsa Khumalo", "Chairperson", "Present", "072 000 0000"]]),
  },
  {
    id: "resolution-register", cat: "gov", fmt: "csv",
    title: "Resolution Register",
    desc: "The running record of Committee and general-meeting decisions. Headings match the Governance › Resolutions import.",
    build: () => CSV(
      ["Ref", "Date", "Meeting", "Decision", "Responsible", "Due date", "Status"],
      [
        ["RES-2026-001", "2026-02-18", "EXCO Feb 2026", "Appoint the auditor for FY2025/26", "Treasurer", "2026-03-31", "Implemented"],
        ["RES-2026-002", "2026-02-18", "EXCO Feb 2026", "Adopt the delegation-of-authority matrix", "Secretary", "2026-04-30", "Open"],
      ]),
  },
  {
    id: "coi-declaration", cat: "gov", fmt: "doc",
    title: "Conflict of Interest Declaration Form",
    desc: "For each Committee member to complete annually and whenever a new interest arises.",
    build: () => DOC("Conflict of Interest Declaration",
      "Every Committee member completes this at least once a year and updates it when circumstances change.",
      FIELD("Full name") + FIELD("Position on the Committee") + FIELD("Date of declaration") +
      H("Declaration") +
      P("I declare the following interests that could, or could be seen to, influence my duties to the CPA " +
        "(business interests, employment, contracts with the CPA, family relationships with members / suppliers / lessees, land interests, or other):") +
      BLANK(["Interest", "Nature of the interest", "Related party", "How it will be managed"], 5) +
      P("<b>&#9744;</b> I have no interests to declare.") +
      H("Undertaking") +
      UL([
        "I will declare any new or changed interest as soon as it arises.",
        "I will recuse myself from any discussion or decision where I have a conflict.",
        "I understand that a false or withheld declaration is a breach of my duties.",
      ]) +
      SIGN(["Member signature", "Date", "Received by (Secretary)", "Date"])),
  },
  {
    id: "coi-register", cat: "gov", fmt: "csv",
    title: "Conflict of Interest Register",
    desc: "The consolidated register of declared interests. Headings match the Governance › Conflict of interest import.",
    build: () => CSV(
      ["Member", "Position", "Interest", "Nature", "Declared on", "Status"],
      [["S. Vilakazi", "Treasurer", "Vilakazi Bookkeeping cc", "Owns a bookkeeping practice in the district", "2026-02-18", "Recused"]]),
  },
  {
    id: "governance-calendar", cat: "gov", fmt: "csv",
    title: "Annual Governance Calendar",
    desc: "Every recurring statutory, reporting and internal obligation with its due date. Headings match the Governance › Calendar import.",
    build: () => CSV(
      ["Item", "Category", "Due date", "Recurrence", "Responsible", "Status"],
      [
        ["Annual General Meeting", "Meeting", "2026-11-07", "Annual", "Secretary", "Upcoming"],
        ["CIPC annual return", "Statutory", "2026-10-31", "Annual", "Secretary", "Upcoming"],
        ["Annual financial statements & audit", "Reporting", "2026-09-30", "Annual", "Treasurer", "In Progress"],
      ]),
  },
  {
    id: "committee-tor", cat: "gov", fmt: "doc",
    title: "Sub-Committee Terms of Reference",
    desc: "A template to establish a sub-committee (finance & audit, land allocation, social & ethics, projects) with a clear mandate.",
    build: () => DOC("Sub-Committee Terms of Reference",
      "Approved by the Executive Committee. Sub-committees advise and prepare work; they do not replace EXCO decisions.",
      FIELD("Sub-committee name") + FIELD("Established by resolution") + FIELD("Date") +
      H("Purpose") + LINES(2) +
      H("Responsibilities") + OL(["", "", "", ""].map(() => "<span class='fill'>________________________________________________</span>")) +
      H("Membership") +
      BLANK(["Name", "Role on the sub-committee", "EXCO member? (Y/N)"], 5) +
      FIELD("Chairperson of the sub-committee") +
      H("How it works") +
      TABLE(["Item", "Rule"], [
        ["Meeting frequency", ""],
        ["Quorum", ""],
        ["Reporting", "Minutes and recommendations to every EXCO meeting"],
        ["Decision authority", "Recommends to EXCO; may not commit CPA funds or sign agreements"],
        ["Review", "These terms are reviewed annually"],
      ]) +
      SIGN(["Chairperson (EXCO)", "Secretary", "Date", ""])),
  },
  {
    id: "code-of-conduct", cat: "gov", fmt: "doc",
    title: "Committee Member Code of Conduct",
    desc: "A short code for Committee members to sign on election, covering duties, confidentiality and conflicts.",
    build: () => DOC("Committee Member Code of Conduct",
      "Each Committee member signs this on election and at each AGM.",
      H("As a member of the Executive Committee I will:") +
      OL([
        "Act honestly and in the best interests of the CPA and all its members.",
        "Attend meetings, come prepared, and take part in decisions.",
        "Keep to the constitution, the rules, and lawful decisions of the general meeting.",
        "Declare conflicts of interest and step aside from those decisions.",
        "Keep confidential information confidential, including member personal data.",
        "Not use my position for personal gain or to favour family or associates.",
        "Account for any CPA money or property in my care.",
        "Treat members, staff and partners with respect.",
        "Support the decisions of the Committee once properly taken, or resign.",
      ]) +
      H("Breach") +
      P("A breach of this code may lead to removal from office in terms of the constitution.") +
      SIGN(["Member name", "Signature", "Date", ""])),
  },
  {
    id: "agm-checklist", cat: "gov", fmt: "doc",
    title: "AGM Preparation Checklist",
    desc: "A week-by-week checklist for preparing a compliant, well-run Annual General Meeting.",
    build: () => DOC("AGM Preparation Checklist",
      "Adjust the timing to the notice period in your constitution.",
      H("6–4 weeks before") +
      CHECK([
        "Confirm the date, venue and quorum requirement",
        "Draft the notice and agenda",
        "Prepare the annual financial statements / financial report",
        "Prepare the Chairperson's and portfolio reports",
        "Confirm which Committee positions are up for election",
      ]) +
      H("3–2 weeks before") +
      CHECK([
        "Issue the notice to all members (per the constitution's method and period)",
        "Publish or post the agenda and reports",
        "Arrange the venue, seating, registration table and attendance register",
        "Prepare ballot papers / election method",
      ]) +
      H("On the day") +
      CHECK([
        "Register attendance; confirm quorum before starting",
        "Record apologies and declarations of interest",
        "Take minutes; capture every resolution and the vote",
        "Conduct elections; record and announce results",
        "Confirm the date of the next meeting",
      ]) +
      H("After") +
      CHECK([
        "Finalise and circulate the minutes",
        "Update the resolution register and the Committee register",
        "File elected-Committee details for the CIPC annual return",
        "Lodge any required report with DALRRD",
      ])),
  },

  /* ---------------------------------------------------------- beneficiaries */
  {
    id: "beneficiary-register", cat: "benef", fmt: "csv",
    title: "Master Beneficiary Register",
    desc: "The core membership register. Headings match the Beneficiaries › Register import. Keep ID numbers masked in shared copies.",
    build: () => CSV(
      ["Register no.", "Full name", "Gender", "Date of birth", "ID (masked)", "Household ref", "Contact", "Joined on", "Status", "Verification"],
      [
        ["KV-0001", "Nomsa Khumalo", "Female", "1968-04-12", "****1082", "HH-014", "072 000 0001", "2005-06-01", "Active", "Verified"],
        ["KV-0002", "Petros Mahlangu", "Male", "1961-11-03", "****3345", "HH-027", "072 000 0002", "2005-06-01", "Active", "Verified"],
      ]),
  },
  {
    id: "household-register", cat: "benef", fmt: "csv",
    title: "Household Register",
    desc: "One row per beneficiary household. Headings match the Beneficiaries › Households import.",
    build: () => CSV(
      ["Household ref", "Head of household", "Members", "Village", "Portion", "Contact", "Status"],
      [["HH-014", "Nomsa Khumalo", "5", "Kwezi A", "Portion 1", "072 000 0001", "Active"]]),
  },
  {
    id: "verification-toolkit", cat: "benef", fmt: "doc",
    title: "Beneficiary Verification Toolkit",
    desc: "A verification checklist, a member interview form and a verification decision sheet — for a register verification round.",
    build: () => DOC("Beneficiary Verification Toolkit",
      "Use with the founding / verified 2005 list and the constitution's membership rules.",
      H("1 · Verification checklist (per person)") +
      FIELD("Register no.") + FIELD("Name as on the register") +
      CHECK([
        "Identity confirmed (ID document or affidavit sighted)",
        "Name matches the founding / verified list, or a valid succession is recorded",
        "Household link confirmed",
        "Contact details captured and current",
        "No duplicate record exists",
        "Any dispute or claim noted and referred",
      ]) +
      H("2 · Member interview form") +
      FIELD("Interview date") + FIELD("Interviewed by") +
      FIELD("Full name") + FIELD("Other names / known as") + FIELD("ID number") + FIELD("Date of birth") +
      FIELD("Year the household joined the CPA") + FIELD("Through whom (founding member / succession from)") +
      FIELD("Current village / residence") + FIELD("Household head") + FIELD("Number in household") +
      H3("Notes") + LINES(3) +
      H("3 · Verification decision") +
      TABLE(["Decision", "Tick", "Reason"], [
        ["Verified — confirmed member", "", ""],
        ["Pending — more information needed", "", ""],
        ["Referred to dispute resolution", "", ""],
        ["Not a member — removed from the register", "", ""],
      ]) +
      SIGN(["Verifying officer", "Social & Ethics Committee", "Date", ""])),
  },
  {
    id: "membership-form", cat: "benef", fmt: "doc",
    title: "Membership Application / Update Form",
    desc: "For a new membership claim or to update an existing member's details.",
    build: () => DOC("Membership Application / Update Form",
      "Submit to the Secretary. The Committee decides in terms of the constitution.",
      TABLE(["This is a", "Tick"], [["New membership claim", ""], ["Update to existing details", ""], ["Succession (member deceased)", ""]]) +
      H("Applicant") +
      FIELD("Full name") + FIELD("ID number") + FIELD("Date of birth") + FIELD("Gender") +
      FIELD("Phone") + FIELD("Postal / residential address") +
      H("Basis of the claim") +
      FIELD("Household reference (if known)") +
      FIELD("Founding member's name (if claiming by descent / succession)") +
      FIELD("Relationship to that member") +
      H3("Supporting documents attached") +
      CHECK(["Copy of ID", "Proof of residence", "Death certificate (succession)", "Nomination / family resolution (succession)", "Affidavit"]) +
      H("Office use") +
      FIELD("Date received") + FIELD("Register checked by") + FIELD("Referred to (Committee meeting)") +
      FIELD("Decision") + FIELD("Register no. issued") +
      SIGN(["Applicant", "Secretary", "Date", ""])),
  },
  {
    id: "succession-form", cat: "benef", fmt: "doc",
    title: "Succession & Nomination Form",
    desc: "Records the death of a member and the household's nomination of a successor, for the Committee to confirm.",
    build: () => DOC("Succession & Nomination Form",
      "Complete when a registered member has passed away. Attach the death certificate.",
      H("Deceased member") +
      FIELD("Register no.") + FIELD("Full name") + FIELD("ID number") + FIELD("Date of death") +
      FIELD("Household reference") +
      H("Nominated successor") +
      FIELD("Full name") + FIELD("ID number") + FIELD("Relationship to the deceased") +
      FIELD("Is the successor already a household member? (Y/N)") + FIELD("Contact") +
      H("Family confirmation") +
      P("We, the family / household of the deceased member, nominate the person named above to succeed to the membership.") +
      BLANK(["Name", "Relationship", "ID number", "Signature"], 4) +
      H("Committee decision") +
      FIELD("Meeting and date") + FIELD("Decision (approved / verifying / declined)") + FIELD("Register updated on") +
      SIGN(["Chairperson", "Secretary", "Date", ""])),
  },
  {
    id: "succession-register", cat: "benef", fmt: "csv",
    title: "Succession Case Register",
    desc: "Tracks each succession from lodgement to registration. Headings match the Beneficiaries › Succession import.",
    build: () => CSV(
      ["Deceased ref", "Deceased name", "Date of death", "Successor", "Relationship", "Lodged on", "Status"],
      [["KV-0008", "Jabu Ndlovu", "2024-11-02", "Nomsa Khumalo", "Sister", "2024-12-01", "Approved"]]),
  },
  {
    id: "dispute-form", cat: "benef", fmt: "doc",
    title: "Dispute Lodgement Form",
    desc: "For a member or claimant to lodge a membership, boundary, allocation or duplicate dispute.",
    build: () => DOC("Dispute Lodgement Form",
      "Submit to the Secretary. The Social & Ethics Committee manages disputes; unresolved matters may go to mediation.",
      FIELD("Case reference (office use)") + FIELD("Date lodged") +
      H("Person lodging the dispute") +
      FIELD("Full name") + FIELD("Register no. (if a member)") + FIELD("Contact") +
      H("Nature of the dispute") +
      TABLE(["Type", "Tick"], [["Membership", ""], ["Boundary", ""], ["Land allocation", ""], ["Duplicate record", ""], ["Identity", ""], ["Other", ""]]) +
      H("What is the dispute about?") + LINES(4) +
      H("Who else is involved?") + LINES(2) +
      H("What outcome is sought?") + LINES(2) +
      H("Office use") +
      FIELD("Referred to") + FIELD("Target resolution date") +
      SIGN(["Person lodging", "Received by", "Date", ""])),
  },
  {
    id: "dispute-log", cat: "benef", fmt: "csv",
    title: "Dispute & Duplicate Resolution Log",
    desc: "The register of open and resolved cases. Headings match the Beneficiaries › Disputes import.",
    build: () => CSV(
      ["Case ref", "Type", "Parties", "Description", "Raised on", "Status"],
      [["DSP-001", "Membership", "P. Nkuna vs CPA", "Claims membership by descent; not on the 2005 verified list", "2025-03-11", "Mediation"]]),
  },

  /* -------------------------------------------------------- administration */
  {
    id: "doa-matrix", cat: "admin", fmt: "csv",
    title: "Delegation of Authority Matrix",
    desc: "Who may approve what, and up to what value. Headings match the Administration › Delegation of authority import.",
    build: () => CSV(
      ["Function", "Category", "Threshold", "Approver", "Secondary approver", "Reference"],
      [
        ["Operational expenditure", "Finance", "up to R25 000", "Treasurer", "Chairperson", "Finance policy"],
        ["Operational expenditure", "Finance", "R25 001 – R150 000", "EXCO", "—", "Finance policy"],
        ["Capital / project expenditure", "Finance", "any amount", "General meeting", "—", "Constitution"],
        ["Bank payments (release)", "Finance", "any amount", "Two of: Chair, Treasurer, Secretary", "—", "Banking mandate"],
        ["Lease agreements (sign)", "Land", "any", "Chairperson", "Secretary", "EXCO resolution"],
      ]),
  },
  {
    id: "correspondence-register", cat: "admin", fmt: "csv",
    title: "Correspondence Register",
    desc: "Incoming and outgoing letters and emails, with response deadlines. Headings match the Administration › Correspondence import.",
    build: () => CSV(
      ["Ref", "Direction", "Date", "Party", "Subject", "Channel", "Response due", "Owner", "Status"],
      [["IN-2026-041", "Incoming", "2026-08-14", "DALRRD Provincial Office", "Request for updated beneficiary list & AFS", "Email", "2026-09-30", "Secretary", "Open"]]),
  },
  {
    id: "policy-register", cat: "admin", fmt: "csv",
    title: "Policy & SOP Register",
    desc: "Every policy and standard operating procedure, its version and review date. Headings match the Administration › Policies import.",
    build: () => CSV(
      ["Title", "Category", "Version", "Adopted on", "Review due", "Owner", "Status"],
      [
        ["Financial Management & Procurement Policy", "Finance", "v1.2", "2024-03-18", "2027-03-18", "Treasurer", "Adopted"],
        ["Land Allocation Policy", "Land", "v1.0", "2022-11-08", "2027-11-08", "Land Allocation Committee", "Adopted"],
      ]),
  },
  {
    id: "records-index", cat: "admin", fmt: "csv",
    title: "Institutional Records Index",
    desc: "The file plan: what record series exist, where they are kept and for how long. Headings match the Administration › Records import.",
    build: () => CSV(
      ["Record series", "Contents", "Medium", "Location", "Custodian", "Retention", "Status"],
      [["Financial records", "Cashbooks, bank statements, AFS, audit files", "Both", "CPA office + bookkeeper", "Treasurer", "7 years", "Current"]]),
  },
  {
    id: "retention-schedule", cat: "admin", fmt: "doc",
    title: "Document Retention Schedule",
    desc: "How long the CPA keeps each type of record before archiving or disposal.",
    build: () => DOC("Document Retention Schedule",
      "A guide. Check current law and any funder requirements; when in doubt, keep the record.",
      TABLE(["Record type", "Retain for", "Then"], [
        ["Constitution, registration, title deeds, SG diagrams", "Permanent", "Keep"],
        ["Minutes, resolutions, attendance registers", "Permanent", "Keep / archive"],
        ["Beneficiary register and verification files", "Permanent", "Keep / archive"],
        ["Annual financial statements and audit files", "Permanent", "Keep / archive"],
        ["Cashbooks, invoices, bank statements, vouchers", "7 years", "Dispose securely"],
        ["Tax records (SARS)", "5 years from filing", "Dispose securely"],
        ["Lease and allocation agreements", "Life of the agreement + 5 years", "Dispose securely"],
        ["Contracts of employment and payroll", "5 years after the employee leaves", "Dispose securely"],
        ["Correspondence (general)", "5 years", "Dispose"],
        ["Project files and funding agreements", "Life of the project + 5 years", "Archive"],
      ]) +
      NOTE("Disposal of any record must be approved by the Committee and recorded in the records index.")),
  },
  {
    id: "policy-template", cat: "admin", fmt: "doc",
    title: "Policy / SOP Template",
    desc: "A standard structure for any CPA policy or standard operating procedure.",
    build: () => DOC("Policy / Standard Operating Procedure",
      "Use this structure for every policy. Keep it short and practical.",
      FIELD("Policy title") + FIELD("Version") + FIELD("Adopted by resolution") + FIELD("Date adopted") + FIELD("Review due") + FIELD("Owner") +
      H("1 · Purpose") + LINES(2) +
      H("2 · Scope — who and what this applies to") + LINES(2) +
      H("3 · Principles") + OL(["", ""].map(() => "<span class='fill'>________________________________________________</span>")) +
      H("4 · Procedure — step by step") + OL(["", "", "", ""].map(() => "<span class='fill'>________________________________________________</span>")) +
      H("5 · Roles and responsibilities") + BLANK(["Role", "Responsibility"], 4) +
      H("6 · Records to keep") + LINES(2) +
      H("7 · Review") + P("This policy is reviewed on the date above, or sooner if circumstances change.") +
      SIGN(["Chairperson", "Secretary", "Date", ""])),
  },

  /* ------------------------------------------------------------------- HR */
  {
    id: "staff-register", cat: "hr", fmt: "csv",
    title: "Staff Register",
    desc: "Everyone the CPA employs or contracts. Headings match the HR › Staff import.",
    build: () => CSV(
      ["Ref", "Full name", "Position", "Employment type", "Start date", "Reports to", "Salary band", "Status"],
      [["EMP-001", "Lindiwe Sibiya", "CPA Administrator", "Permanent", "2023-02-01", "Secretary", "Band C", "Active"]]),
  },
  {
    id: "positions-register", cat: "hr", fmt: "csv",
    title: "Positions & Organogram Register",
    desc: "The establishment: every post, whether filled or vacant. Headings match the HR › Positions import.",
    build: () => CSV(
      ["Position", "Department", "Reports to", "Incumbent", "Heads", "Status"],
      [
        ["CPA Administrator", "Administration", "Secretary", "Lindiwe Sibiya", "1", "Filled"],
        ["Enterprise / Projects Officer", "Projects", "Projects Portfolio", "", "1", "Vacant"],
      ]),
  },
  {
    id: "payroll-summary", cat: "hr", fmt: "csv",
    title: "Payroll Summary",
    desc: "Monthly payroll totals for the finance record and SARS. Headings match the HR › Payroll import.",
    build: () => CSV(
      ["Period", "Headcount", "Gross", "Deductions", "Net", "PAYE ref", "UIF ref", "Status"],
      [["2026-03", "5", "42800", "6200", "36600", "SARS-0326", "UIF-0326", "Paid"]]),
  },
  {
    id: "leave-register", cat: "hr", fmt: "csv",
    title: "Leave Register",
    desc: "Annual, sick and family-responsibility leave taken by each employee.",
    build: () => CSV(
      ["Employee", "Leave type", "From", "To", "Days", "Balance after", "Approved by"],
      [["Lindiwe Sibiya", "Annual", "2026-07-01", "2026-07-05", "5", "10", "Secretary"]]),
  },
  {
    id: "employment-contract", cat: "hr", fmt: "doc",
    title: "Employment Contract Template",
    desc: "A basic written particulars of employment for a CPA employee. Have it checked against current labour law before use.",
    build: () => DOC("Contract of Employment",
      "Basic conditions of employment. Both parties keep a signed copy.",
      P("Entered into between <b>the CPA</b> (the employer) and:") +
      FIELD("Employee full name") + FIELD("ID number") + FIELD("Address") +
      H("1 · Position") + FIELD("Job title") + FIELD("Reports to") + FIELD("Place of work") +
      H("2 · Type and duration") +
      FIELD("Permanent / Fixed-term / Seasonal") + FIELD("Start date") + FIELD("End date (if fixed-term)") + FIELD("Probation period") +
      H("3 · Hours of work") + FIELD("Ordinary hours per week") + FIELD("Working days / times") +
      H("4 · Remuneration") +
      FIELD("Gross monthly / weekly wage") + FIELD("Payment date") + FIELD("Payment method") +
      P("Statutory deductions (PAYE, UIF) apply. Overtime, where worked and authorised, is paid per the Basic Conditions of Employment Act.") +
      H("5 · Leave") +
      UL(["Annual leave: 21 consecutive days per year (or as accrued)", "Sick leave: as per the BCEA cycle", "Family responsibility leave: 3 days per year (if qualifying)"]) +
      H("6 · Duties") + LINES(2) +
      H("7 · Termination") +
      P("Either party may terminate on notice: one week in the first 6 months, two weeks up to one year, four weeks thereafter &mdash; or as required by law. " +
        "The CPA's disciplinary and grievance procedures apply.") +
      H("8 · Confidentiality") +
      P("The employee will keep CPA information, including member personal data, confidential during and after employment.") +
      H("9 · General") + P("This document is the whole agreement. Changes must be in writing and signed by both parties.") +
      SIGN(["Employee", "For the CPA (name & role)", "Signature", "Date"])),
  },
  {
    id: "job-description", cat: "hr", fmt: "doc",
    title: "Job Description Template",
    desc: "A one-page job description for any CPA post.",
    build: () => DOC("Job Description",
      "Attach to the contract and use for recruitment and performance reviews.",
      FIELD("Job title") + FIELD("Department") + FIELD("Reports to") + FIELD("Supervises") + FIELD("Grade / band") +
      H("Purpose of the job") + LINES(2) +
      H("Key responsibilities") + OL(["", "", "", "", ""].map(() => "<span class='fill'>________________________________________________</span>")) +
      H("Decision-making and authority") + LINES(2) +
      H("Requirements") +
      TABLE(["", "Essential", "Desirable"], [
        ["Qualifications", "", ""],
        ["Experience", "", ""],
        ["Skills", "", ""],
      ]) +
      H("Performance indicators") + LINES(3) +
      SIGN(["Employee", "Supervisor", "Date", ""])),
  },

  /* --------------------------------------------------------------- finance */
  {
    id: "annual-budget", cat: "fin", fmt: "csv",
    title: "Annual Budget Template",
    desc: "Budget by category for the year. Headings match the Finance › Budget categories import (fill Annual budget; leave YTD actual at 0).",
    build: () => CSV(
      ["Category", "Annual budget", "YTD actual"],
      [
        ["Governance & admin", "260000", "0"],
        ["Finance & compliance", "180000", "0"],
        ["HR / Salaries", "620000", "0"],
        ["Land & asset maintenance", "340000", "0"],
        ["Project implementation", "480000", "0"],
        ["Productivity / production costs", "410000", "0"],
        ["Training & capacity building", "120000", "0"],
        ["Other expenditure", "60000", "0"],
      ]),
  },
  {
    id: "cashbook", cat: "fin", fmt: "csv",
    title: "Cash Book / Transaction Ledger",
    desc: "Every receipt and payment. Headings match the Finance › Transactions import — load it to update the ledger and budget-vs-actual.",
    build: () => CSV(
      ["Date", "Description", "Category", "Type (Income/Expense)", "Amount", "Method", "Reference"],
      [
        ["2026-03-31", "Payroll — bookkeeper & admin (March)", "HR / Salaries", "Expense", "28500", "EFT", "PAY-0326"],
        ["2026-03-15", "Cropland lease — Mkhize Farming", "Land & asset maintenance", "Income", "64000", "EFT", "LSE-0003"],
      ]),
  },
  {
    id: "budget-vs-actual", cat: "fin", fmt: "csv",
    title: "Budget vs Actual Worksheet",
    desc: "Compare planned and actual figures per category, month by month, for the finance report.",
    build: () => CSV(
      ["Category", "Annual budget", "Budget to date", "Actual to date", "Variance", "Comment"],
      [["HR / Salaries", "620000", "360000", "352000", "8000", "On track"]]),
  },
  {
    id: "petty-cash-log", cat: "fin", fmt: "csv",
    title: "Petty Cash Log",
    desc: "Small cash payments with running balance and receipt numbers.",
    build: () => CSV(
      ["Date", "Description", "Voucher no.", "Paid to", "Amount out", "Amount in (float)", "Balance"],
      [["2026-06-03", "Airtime for the office phone", "PC-0042", "MTN", "100", "0", "640"]]),
  },
  {
    id: "bank-recon", cat: "fin", fmt: "doc",
    title: "Bank Reconciliation Template",
    desc: "Reconcile the cash book to the bank statement each month.",
    build: () => DOC("Bank Reconciliation",
      "Complete monthly. Attach the bank statement and the cash-book print-out.",
      FIELD("Bank account") + FIELD("Month reconciled") + FIELD("Prepared by") + FIELD("Reviewed by") +
      H("Reconciliation") +
      TABLE(["", "Amount (R)"], [
        ["Balance per bank statement (closing)", ""],
        ["Add: deposits not yet reflected", ""],
        ["Less: payments / cheques not yet reflected", ""],
        ["= Adjusted bank balance", ""],
        ["Balance per cash book", ""],
        ["Difference (should be zero)", ""],
      ]) +
      H("Outstanding items") +
      BLANK(["Date", "Description", "Reference", "Amount (R)", "Type (deposit / payment)"], 6) +
      H("Notes / unresolved differences") + LINES(2) +
      SIGN(["Prepared by", "Reviewed by (Treasurer)", "Date", ""])),
  },
  {
    id: "financial-controls-toolkit", cat: "fin", fmt: "doc",
    title: "Financial Controls Toolkit",
    desc: "A short finance policy, a monthly finance checklist and a monthly finance report template — the core of sound money management.",
    build: () => DOC("Financial Controls Toolkit",
      "Adopt the policy by resolution; run the checklist every month; take the report to every EXCO meeting.",
      H("1 · Finance policy (short form)") +
      OL([
        "All CPA money is banked in the CPA's account. No CPA money is kept in personal accounts.",
        "Every payment needs an approved requisition and a supporting invoice or voucher.",
        "Payments are released by two authorised signatories.",
        "Approval limits follow the delegation-of-authority matrix.",
        "The bank account is reconciled monthly.",
        "The Treasurer reports budget vs actual to every EXCO meeting.",
        "Annual financial statements are prepared and independently reviewed or audited.",
        "Assets over R2 000 are recorded in the asset register.",
      ]) +
      H("2 · Monthly finance checklist") +
      CHECK([
        "All income received is recorded and banked",
        "All payments have an approved requisition and a voucher",
        "Bank reconciliation completed and reviewed",
        "Cash book updated; petty cash counted and agreed",
        "Budget vs actual updated",
        "Outstanding debtors and creditors listed",
        "Statutory payments (PAYE, UIF) made and referenced",
        "Finance report prepared for EXCO",
      ]) +
      H("3 · Monthly finance report") +
      FIELD("Month") + FIELD("Prepared by") +
      TABLE(["", "This month (R)", "Year to date (R)", "Annual budget (R)"], [
        ["Income", "", "", ""],
        ["Expenditure", "", "", ""],
        ["Surplus / (deficit)", "", "", ""],
        ["Bank balance (closing)", "", "", ""],
        ["Months of operating cover", "", "", ""],
      ]) +
      H3("Matters for the Committee's attention") + LINES(3) +
      H3("Approvals sought this month") + BLANK(["Item", "Amount (R)", "Requisition ref"], 3)),
  },

  /* ----------------------------------------------------------- procurement */
  {
    id: "supplier-database", cat: "proc", fmt: "csv",
    title: "Supplier Database",
    desc: "Approved suppliers with compliance status. Headings match the Procurement › Suppliers import.",
    build: () => CSV(
      ["Supplier", "Category", "Contact", "Reg. no.", "Tax clearance", "B-BBEE level", "Status"],
      [["Ehlanzeni Hardware & Fencing", "Materials", "sales@ehardware.co.za", "2004/009871/23", "Valid", "Level 2", "Active"]]),
  },
  {
    id: "requisition-register", cat: "proc", fmt: "csv",
    title: "Requisition Register",
    desc: "All purchase requisitions and their approval status. Headings match the Procurement › Requisitions import.",
    build: () => CSV(
      ["Ref", "Date", "Description", "Category", "Amount", "Requested by", "Approved by", "Status"],
      [["REQ-2026-011", "2026-03-02", "Fencing materials — Portion 4 grazing camp", "Land & asset maintenance", "48500", "Land Portfolio", "Treasurer", "Approved"]]),
  },
  {
    id: "requisition-form", cat: "proc", fmt: "doc",
    title: "Purchase Requisition Form",
    desc: "Raised before any purchase; approved per the delegation-of-authority matrix.",
    build: () => DOC("Purchase Requisition",
      "No purchase without an approved requisition.",
      FIELD("Requisition no.") + FIELD("Date") + FIELD("Requested by") + FIELD("Budget category") +
      H("What is needed and why") +
      BLANK(["Item / service", "Quantity", "Estimated unit price (R)", "Estimated total (R)"], 4) +
      FIELD("Total estimated value (R)") +
      H("Justification") + LINES(2) +
      H("Quotations") + P("Attach the required number of quotations (see the finance policy). List them on the Quotation Comparison Sheet.") +
      H("Approval") +
      TABLE(["Role", "Name", "Signature", "Date", "Approved / Declined"], [
        ["Requested by", "", "", "", ""],
        ["Checked — budget available (Treasurer / Bookkeeper)", "", "", "", ""],
        ["Approved (per delegation matrix)", "", "", "", ""],
      ])),
  },
  {
    id: "quote-comparison", cat: "proc", fmt: "doc",
    title: "Quotation Comparison Sheet",
    desc: "Compare at least three quotations on price and other factors, with a recommendation.",
    build: () => DOC("Quotation Comparison Sheet",
      "Attach to the requisition. Explain any choice that is not the lowest price.",
      FIELD("Requisition no.") + FIELD("Item / service") + FIELD("Prepared by") + FIELD("Date") +
      TABLE(["", "Quotation A", "Quotation B", "Quotation C"], [
        ["Supplier", "", "", ""],
        ["Price (incl. VAT)", "", "", ""],
        ["Delivery time", "", "", ""],
        ["Tax clearance valid?", "", "", ""],
        ["B-BBEE level", "", "", ""],
        ["Local supplier?", "", "", ""],
        ["Notes", "", "", ""],
      ]) +
      H("Recommendation") + FIELD("Recommended supplier") + H3("Reason") + LINES(2) +
      SIGN(["Recommended by", "Approved by", "Date", ""])),
  },
  {
    id: "purchase-order", cat: "proc", fmt: "doc",
    title: "Purchase Order Template",
    desc: "The official order sent to a supplier once a requisition is approved.",
    build: () => DOC("Purchase Order",
      "Issued by the CPA to the supplier. Quote this number on the invoice and delivery note.",
      FIELD("PO number") + FIELD("Date") + FIELD("Linked requisition no.") +
      H("Supplier") + FIELD("Name") + FIELD("Contact") + FIELD("Address") +
      H("Deliver to") + FIELD("Location") + FIELD("Required by date") +
      H("Order") +
      BLANK(["Item / description", "Quantity", "Unit price (R)", "Total (R)"], 5) +
      FIELD("Subtotal (R)") + FIELD("VAT (R)") + FIELD("Total (R)") +
      H("Terms") + P("Payment within 30 days of a correct invoice and satisfactory delivery. Goods remain returnable if not as ordered.") +
      SIGN(["Authorised for the CPA (name & role)", "Signature", "Date", ""])),
  },
  {
    id: "payment-voucher", cat: "proc", fmt: "doc",
    title: "Payment Voucher",
    desc: "Authorises a specific payment and links it to its supporting documents.",
    build: () => DOC("Payment Voucher",
      "One voucher per payment. Attach the invoice, PO and delivery note / proof.",
      FIELD("Voucher no.") + FIELD("Date") + FIELD("Pay to") + FIELD("Amount (R)") + FIELD("In words") +
      FIELD("Being payment for") + FIELD("Budget category") + FIELD("PO / requisition ref") + FIELD("Invoice no.") +
      FIELD("Payment method") + FIELD("Bank reference") +
      H("Supporting documents attached") +
      CHECK(["Approved requisition", "Purchase order", "Original invoice", "Delivery note / proof of receipt", "Quotation comparison"]) +
      H("Authorisation") +
      TABLE(["Role", "Name", "Signature", "Date"], [
        ["Prepared by", "", "", ""],
        ["Checked (Bookkeeper / Treasurer)", "", "", ""],
        ["Approved (per delegation matrix)", "", "", ""],
        ["Released — signatory 1", "", "", ""],
        ["Released — signatory 2", "", "", ""],
      ])),
  },

  /* -------------------------------------------------------- land & assets */
  {
    id: "land-register", cat: "land", fmt: "csv",
    title: "Land Parcel Register",
    desc: "Every portion, its use and tenure. Headings match the Land & Assets › Parcels import.",
    build: () => CSV(
      ["Portion", "Primary use", "Extent (ha)", "Lease / tenure", "Status"],
      [
        ["Portion 1", "Residential", "210", "Occupied", "Active"],
        ["Portion 2", "Grazing", "1850", "Community Livestock Assoc. — to 2027-06-30", "Active"],
      ]),
  },
  {
    id: "lease-register", cat: "land", fmt: "csv",
    title: "Lease Register",
    desc: "All land leases with parties, terms and rentals. Headings match the Land & Assets › Leases import.",
    build: () => CSV(
      ["Lessee / party", "Land / portion", "Land use", "Area (ha)", "Start date", "End date", "Annual rental", "Status"],
      [["Community Livestock Association", "Portion 2", "Grazing", "1850", "2022-07-01", "2027-06-30", "96000", "Active"]]),
  },
  {
    id: "allocation-register", cat: "land", fmt: "csv",
    title: "Land Allocation Register",
    desc: "Land allocated to beneficiaries and households. Headings match the Land & Assets › Allocations import.",
    build: () => CSV(
      ["Beneficiary / household", "Land / portion", "Purpose", "Area (ha)", "Allocated on", "Agreement ref.", "Status"],
      [["Women's Garden Collective", "Portion 3", "Communal vegetable garden", "4", "2024-09-15", "ALLOC-2024-009", "Active"]]),
  },
  {
    id: "asset-register", cat: "land", fmt: "csv",
    title: "Infrastructure & Asset Register",
    desc: "Fixed assets and infrastructure with value and condition. Headings match the Land & Assets › Register import.",
    build: () => CSV(
      ["Asset", "Type", "Location", "Year installed", "Value", "Condition", "Status"],
      [["Main borehole & pump house", "Water", "Portion 3", "2018", "480000", "Fair", "In use"]]),
  },
  {
    id: "maintenance-log", cat: "land", fmt: "csv",
    title: "Asset Maintenance Plan & Log",
    desc: "Planned and completed maintenance with cost. Headings match the Land & Assets › Maintenance import.",
    build: () => CSV(
      ["Asset", "Kind", "Task", "Scheduled date", "Completed date", "Cost", "Responsible", "Status"],
      [["Internal access road", "Infrastructure", "Regravel and shape washaway sections", "2026-09-30", "", "85000", "Land Portfolio", "Scheduled"]]),
  },
  {
    id: "lease-agreement", cat: "land", fmt: "doc",
    title: "Land Lease Agreement Template",
    desc: "A plain-language lease of CPA land to a lessee. Have it checked by a lawyer and approved by resolution before signing.",
    build: () => DOC("Lease Agreement",
      "Between the CPA (lessor) and the lessee named below. Approved by EXCO resolution / general meeting.",
      H("Parties") +
      FIELD("Lessor: the CPA, registration no.") +
      FIELD("Lessee full name / entity") + FIELD("Lessee registration / ID no.") + FIELD("Lessee address") +
      H("The land") +
      FIELD("Portion / description") + FIELD("Extent (ha)") + FIELD("Permitted land use") +
      H("Term") + FIELD("Start date") + FIELD("End date") + FIELD("Renewal terms") +
      H("Rental") +
      FIELD("Annual rental (R)") + FIELD("Payment dates") + FIELD("Escalation (% per year)") + FIELD("Paid into (CPA bank account)") +
      H("Lessee's obligations") +
      OL([
        "Use the land only for the permitted use.",
        "Farm / operate sustainably and not degrade the land.",
        "Keep to all laws, permits and water-use licences.",
        "Maintain fences, structures and access as agreed.",
        "Not sublet or cede without the CPA's written consent.",
        "Allow the CPA reasonable access to inspect.",
        "Carry appropriate insurance.",
      ]) +
      H("CPA's obligations") + OL(["Give the lessee undisturbed use of the land for the term.", "Deal promptly with boundary or access issues within its control."]) +
      H("Ending the lease") +
      P("Either party may end this lease on written notice for a material breach not fixed within 30 days. On expiry or termination the lessee vacates and hands back the land in good order.") +
      H("Disputes") + P("The parties will first attempt to resolve any dispute by discussion, then mediation, before any other step.") +
      SIGN(["For the CPA (name & role)", "Lessee", "Witness", "Date"])),
  },
  {
    id: "allocation-application", cat: "land", fmt: "doc",
    title: "Land Allocation Application Form",
    desc: "For a beneficiary or household to apply for a residential, cropping or grazing allocation.",
    build: () => DOC("Land Allocation Application",
      "Submit to the Secretary. The Land Allocation Committee recommends; EXCO / the general meeting decides.",
      H("Applicant") +
      FIELD("Full name") + FIELD("Register no.") + FIELD("Household ref") + FIELD("Contact") +
      H("Allocation requested") +
      TABLE(["Purpose", "Tick"], [["Residential site", ""], ["Subsistence cropping", ""], ["Grazing allotment", ""], ["Enterprise / other", ""]]) +
      FIELD("Preferred portion / area") + FIELD("Approximate size needed") +
      H("Motivation") + LINES(3) +
      H("Declaration") +
      P("I confirm I am a registered member / household of the CPA, the information above is true, and I will use the land only for the approved purpose and keep to the CPA's land rules.") +
      SIGN(["Applicant", "Witness", "Date", ""]) +
      H("Office use") +
      FIELD("Date received") + FIELD("Land Allocation Committee recommendation") + FIELD("EXCO / general meeting decision") + FIELD("Agreement reference issued")),
  },

  /* ------------------------------------------------------------ productivity */
  {
    id: "production-record", cat: "prod", fmt: "csv",
    title: "Production Record Sheet",
    desc: "Inputs, labour, harvest and sales per enterprise and period. Headings match the Productivity › Records import.",
    build: () => CSV(
      ["Type (Labour/Inputs/Harvest/Sales)", "Enterprise", "Period", "Description", "Quantity", "Unit", "Amount"],
      [
        ["Inputs", "Communal vegetable garden", "2026 Q1", "Seed, seedlings & compost", "0", "", "27500"],
        ["Harvest", "Communal vegetable garden", "2026 Q1", "Mixed vegetables", "3200", "kg", "0"],
        ["Sales", "Communal vegetable garden", "2026 Q1", "Sales to local spaza & school", "0", "", "31500"],
      ]),
  },
  {
    id: "water-use-log", cat: "prod", fmt: "csv",
    title: "Water Source & Use Log",
    desc: "Each water source, its licensed allocation and actual use. Headings match the Productivity › Water import.",
    build: () => CSV(
      ["Source", "Type", "Allocation (m³/yr)", "Used (m³)", "Licence ref", "Status"],
      [["Portion 3 borehole", "Borehole", "60000", "41200", "WUL-2028-0455", "Active"]]),
  },
  {
    id: "harvest-sales-log", cat: "prod", fmt: "csv",
    title: "Harvest & Sales Log",
    desc: "A simple field log of what was harvested and sold, by date.",
    build: () => CSV(
      ["Date", "Enterprise", "Product", "Quantity", "Unit", "Sold to", "Price per unit", "Total received"],
      [["2026-05-10", "Communal vegetable garden", "Spinach", "120", "bunches", "Kwezi Spaza", "8", "960"]]),
  },
  {
    id: "enterprise-plan", cat: "prod", fmt: "doc",
    title: "Enterprise Plan Template",
    desc: "A one-page plan for a farming or land-based enterprise: what, where, who, costs and expected returns.",
    build: () => DOC("Enterprise Plan",
      "One plan per enterprise. Update it each season.",
      FIELD("Enterprise name") + FIELD("Type (crop / orchard / timber / livestock / other)") +
      FIELD("Portion / location") + FIELD("Area (ha) or scale") + FIELD("Manager / operator") + FIELD("Season / period") +
      H("Description and objective") + LINES(2) +
      H("Inputs and costs") +
      BLANK(["Input", "Quantity", "Estimated cost (R)", "Source of funds"], 5) +
      FIELD("Total estimated cost (R)") +
      H("Expected output and income") +
      BLANK(["Output", "Expected quantity", "Price / unit (R)", "Expected income (R)"], 4) +
      FIELD("Expected gross margin (income – cost) (R)") +
      H("Risks and how they will be managed") + BLANK(["Risk", "Mitigation"], 3) +
      H("Water, permits and agreements needed") + LINES(2) +
      SIGN(["Prepared by", "Approved (Projects Committee)", "Date", ""])),
  },

  /* --------------------------------------------------- projects & commercial */
  {
    id: "business-case", cat: "proj", fmt: "doc",
    title: "Project Business Case Template",
    desc: "The case for a project: the problem, the options, the recommended option, cost, funding and expected benefit.",
    build: () => DOC("Project Business Case",
      "Take this to EXCO / the general meeting before committing funds or applying for funding.",
      FIELD("Project name") + FIELD("Prepared by") + FIELD("Date") + FIELD("Sponsor (portfolio)") +
      H("1 · The problem or opportunity") + LINES(3) +
      H("2 · Options considered") +
      TABLE(["Option", "Description", "Indicative cost (R)", "Pros / cons"], [["Do nothing", "", "", ""], ["Option A", "", "", ""], ["Option B", "", "", ""]]) +
      H("3 · Recommended option") + LINES(2) +
      H("4 · Cost and funding") +
      TABLE(["Item", "Amount (R)", "Source (CPA / grant / co-funder)"], [["Capital", "", ""], ["Operating (year 1)", "", ""], ["Total", "", ""]]) +
      FIELD("Funding still to be secured (R)") +
      H("5 · Benefits") +
      UL(["Jobs: <span class='fill'>______</span>", "Households benefiting: <span class='fill'>______</span>", "Hectares brought into use: <span class='fill'>______</span>", "Revenue to the CPA (per year): R<span class='fill'>______</span>"]) +
      H("6 · Key risks") + BLANK(["Risk", "Likelihood", "Mitigation"], 3) +
      H("7 · Readiness") +
      CHECK(["Land and tenure confirmed", "Water / permits available or applied for", "Beneficiaries identified and consulted", "Business case approved by resolution", "Implementation capacity in place"]) +
      SIGN(["Prepared by", "Endorsed (Chairperson)", "Date", ""])),
  },
  {
    id: "project-plan", cat: "proj", fmt: "doc",
    title: "Project Plan & Logframe",
    desc: "Objectives, activities, milestones, budget and a simple results framework for delivery.",
    build: () => DOC("Project Plan & Logframe",
      "Use once a project is approved. Review monthly against the progress report.",
      FIELD("Project name") + FIELD("Project manager") + FIELD("Start date") + FIELD("End date") + FIELD("Total budget (R)") +
      H("Goal and objectives") + LINES(2) +
      H("Results framework") +
      TABLE(["Level", "Statement", "Indicator", "Target", "Means of verification"], [
        ["Goal", "", "", "", ""],
        ["Outcome", "", "", "", ""],
        ["Output 1", "", "", "", ""],
        ["Output 2", "", "", "", ""],
      ]) +
      H("Work plan") +
      BLANK(["Activity", "Responsible", "Start", "Finish", "Budget (R)"], 8) +
      H("Milestones") + BLANK(["Milestone", "Due date"], 4) +
      H("Assumptions and risks") + BLANK(["Assumption / risk", "Response"], 3) +
      SIGN(["Project manager", "Sponsor", "Date", ""])),
  },
  {
    id: "progress-report", cat: "proj", fmt: "doc",
    title: "Project Progress Report",
    desc: "A monthly or quarterly report on delivery, spend and issues, for the Committee and funders.",
    build: () => DOC("Project Progress Report",
      "One report per reporting period. Attach photos and the updated work plan.",
      FIELD("Project name") + FIELD("Reporting period") + FIELD("Report date") + FIELD("Prepared by") +
      H("Overall status") + TABLE(["Status", "Tick", "Comment"], [["On track", "", ""], ["Minor issues", "", ""], ["At risk", "", ""]]) +
      H("Progress against the plan") +
      BLANK(["Planned activity / milestone", "Status", "Comment"], 6) +
      H("Budget") +
      TABLE(["", "This period (R)", "To date (R)", "Total budget (R)"], [["Spent", "", "", ""], ["Committed", "", "", ""], ["Remaining", "", "", ""]]) +
      H("Issues and decisions needed") + LINES(3) +
      H("Plan for the next period") + LINES(3) +
      SIGN(["Project manager", "Sponsor", "Date", ""])),
  },
  {
    id: "market-assessment", cat: "proj", fmt: "doc",
    title: "Market Assessment Template",
    desc: "A structured look at the market for a commodity before committing to production or a contract.",
    build: () => DOC("Market Assessment",
      "One per commodity or enterprise.",
      FIELD("Commodity / product") + FIELD("Assessed by") + FIELD("Date") +
      H("Demand") + LINES(2) +
      H("Potential buyers") +
      BLANK(["Buyer", "Channel (contract / auction / local)", "Volume they take", "Price basis", "Requirements (quality, grading, certification)"], 4) +
      H("Price") + FIELD("Current price range") + FIELD("Seasonality") + FIELD("Price trend") +
      H("What the CPA can realistically supply") + FIELD("Volume per season") + FIELD("Quality / grade achievable") +
      H("Gaps to close") + LINES(2) +
      H("Recommendation") + TABLE(["", "Tick"], [["Proceed — pursue a contract / MOU", ""], ["Proceed with conditions", ""], ["Do not proceed now", ""]]) +
      SIGN(["Assessed by", "Reviewed (Commercialisation)", "Date", ""])),
  },
  {
    id: "mou-template", cat: "proj", fmt: "doc",
    title: "Partnership / MOU Template",
    desc: "A memorandum of understanding with a funder, technical partner, buyer or government body.",
    build: () => DOC("Memorandum of Understanding",
      "An MOU records intent and roles. It is not a binding contract unless it says so. Have any binding agreement checked by a lawyer.",
      H("Parties") + FIELD("Party 1: the CPA") + FIELD("Party 2 (name & type)") + FIELD("Party 2 contact") +
      H("Purpose of this MOU") + LINES(2) +
      H("What each party will do") +
      TABLE(["Party", "Contribution / responsibility"], [["The CPA", ""], ["The partner", ""]]) +
      H("Duration") + FIELD("Start date") + FIELD("End / review date") +
      H("Money") + P("State whether any funds change hands and on what terms, or write \"No funds are transferred under this MOU\".") + LINES(2) +
      H("Governance") + P("Each party keeps its own decision-making. Nothing here commits the CPA against its constitution or the general meeting.") +
      H("Confidentiality and data") + P("Member personal information shared under this MOU is used only for the stated purpose and kept secure.") +
      H("Ending the MOU") + P("Either party may end this MOU on 30 days' written notice.") +
      SIGN(["For the CPA (name & role)", "For the partner (name & role)", "Date", ""])),
  },
  {
    id: "revenue-tracker", cat: "proj", fmt: "csv",
    title: "Revenue Stream Tracker",
    desc: "Every source of income to the CPA and whether it recurs. Headings match the Commercialisation › Revenue import.",
    build: () => CSV(
      ["Stream", "Source", "Annual amount", "Recurring (Yes/No)", "Status"],
      [
        ["Grazing lease — Portion 2", "Lease", "96000", "Yes", "Active"],
        ["Vegetable sales", "Enterprise sales", "45000", "Yes", "Active"],
      ]),
  },

  /* ------------------------------------------------------ reporting & compliance */
  {
    id: "board-pack-checklist", cat: "report", fmt: "doc",
    title: "Board Pack Checklist",
    desc: "What to include in the pack for an EXCO or general meeting so decisions are well informed.",
    build: () => DOC("Board Pack Checklist",
      "The Secretary compiles the pack and circulates it with the notice.",
      CHECK([
        "Agenda",
        "Minutes of the previous meeting and the action / resolution tracker",
        "Chairperson's report",
        "Treasurer's report: budget vs actual, bank balance, approvals sought",
        "Portfolio reports (land, beneficiaries, projects, productivity)",
        "Institutional score and journey update (from CPA360)",
        "Items requiring a decision, each with a short recommendation",
        "Correspondence of note",
        "Governance calendar — what is due before the next meeting",
        "Risk / attention list",
      ]) +
      NOTE("Tip: the CPA360 \"Generate board pack\" button assembles most of this from the live data.")),
  },
  {
    id: "compliance-checklist", cat: "report", fmt: "doc",
    title: "Statutory Compliance Checklist",
    desc: "The CPA's recurring obligations to CIPC, SARS, DALRRD and other bodies, with due dates and status.",
    build: () => DOC("Statutory Compliance Checklist",
      "Review at least quarterly. Keep proof of every filing in the compliance file.",
      H("Companies and Intellectual Property Commission (CIPC)") +
      TABLE(["Obligation", "Frequency", "Due", "Last done", "Status"], [
        ["Annual return", "Annual", "", "", ""],
        ["Update Committee / office-bearer details after elections", "On change", "", "", ""],
        ["Maintain the registered address", "Ongoing", "", "", ""],
      ]) +
      H("South African Revenue Service (SARS)") +
      TABLE(["Obligation", "Frequency", "Due", "Last done", "Status"], [
        ["Income tax return", "Annual", "", "", ""],
        ["PAYE / UIF (if employing staff)", "Monthly", "", "", ""],
        ["VAT (if registered)", "Bi-monthly", "", "", ""],
        ["Keep tax-exempt / PBO status current (if applicable)", "Ongoing", "", "", ""],
      ]) +
      H("Department of Agriculture, Land Reform & Rural Development (DALRRD)") +
      TABLE(["Obligation", "Frequency", "Due", "Last done", "Status"], [
        ["Annual compliance / progress report", "Annual", "", "", ""],
        ["Report material governance changes", "On change", "", "", ""],
        ["Grant / RECAP reporting (if funded)", "Per agreement", "", "", ""],
      ]) +
      H("Other") +
      TABLE(["Obligation", "Frequency", "Due", "Last done", "Status"], [
        ["Water use licence conditions", "Per licence", "", "", ""],
        ["Environmental / land-use permits", "Per permit", "", "", ""],
        ["Annual General Meeting", "Annual", "", "", ""],
        ["Annual financial statements / audit", "Annual", "", "", ""],
        ["Asset and liability insurance renewal", "Annual", "", "", ""],
      ]) +
      SIGN(["Compiled by", "Reviewed (Secretary)", "Date", ""])),
  },
  {
    id: "annual-return-checklist", cat: "report", fmt: "doc",
    title: "CIPC Annual Return Preparation Checklist",
    desc: "What to gather and confirm before filing the CPA's annual return.",
    build: () => DOC("Annual Return Preparation Checklist",
      "Work through this before logging in to file. Keep the filing confirmation in the compliance file.",
      CHECK([
        "Confirm the CPA's registration number and registered address",
        "Confirm the current Committee / office bearers (names, ID numbers, capacities) from the latest AGM minutes",
        "Update any changes on the CIPC record first",
        "Confirm the financial year-end",
        "Have the latest annual financial statements or financial report ready",
        "Calculate the annual turnover figure required for the fee",
        "Confirm the filing fee and payment method",
        "File within the window (month of registration anniversary)",
        "Download and file the confirmation of filing",
        "Update the governance calendar with next year's due date",
      ])),
  },
  {
    id: "dalrrd-report", cat: "report", fmt: "doc",
    title: "DALRRD Annual Progress Report Template",
    desc: "A structured annual report to the Department on governance, land use, beneficiaries and finances.",
    build: () => DOC("Annual Progress Report to DALRRD",
      "Adjust to any format the Department provides. Attach the AGM minutes and financial statements.",
      FIELD("CPA name") + FIELD("Registration no.") + FIELD("Reporting year") + FIELD("Compiled by") +
      H("1 · Governance") +
      FIELD("AGM held? Date") + FIELD("Committee properly constituted? (Y/N)") + FIELD("Number of EXCO meetings held") +
      H3("Key governance changes / issues") + LINES(2) +
      H("2 · Beneficiaries") +
      FIELD("Registered members") + FIELD("Verified") + FIELD("Households") + FIELD("Open disputes") +
      H("3 · Land use") +
      BLANK(["Portion", "Use", "Active / idle", "Leased to / managed by"], 5) +
      H("4 · Production and enterprises") + LINES(2) +
      H("5 · Finances") +
      FIELD("Total income for the year (R)") + FIELD("Total expenditure (R)") + FIELD("Closing bank balance (R)") + FIELD("Audited / reviewed? (Y/N)") +
      H("6 · Projects and funding") + BLANK(["Project", "Status", "Funder", "Value (R)"], 4) +
      H("7 · Challenges and support requested") + LINES(3) +
      SIGN(["Chairperson", "Secretary", "Date", ""])),
  },
];

/* ==========================================================================
 *  build + download
 * ========================================================================*/
export function buildTool(id) {
  const t = TOOLS.find((x) => x.id === id);
  if (!t) return null;
  const safe = t.title.replace(/[^\w -]+/g, "").trim();
  if (t.fmt === "csv") {
    return { filename: `CPA360 - ${safe}.csv`, mime: "text/csv", content: t.build() };
  }
  return { filename: `CPA360 - ${safe}.doc`, mime: "application/msword", content: t.build() };
}

export function downloadTool(id) {
  const f = buildTool(id);
  if (!f) return false;
  try {
    const blob = new Blob([f.content], { type: f.mime + ";charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = f.filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch (e) {
    console.error("download failed", e);
    return false;
  }
}

/* ==========================================================================
 *  view
 * ========================================================================*/
const FMT_LABEL = { csv: "CSV · Excel", doc: "DOC · Word" };

export function renderToolsLibrary(view) {
  const counts = CATS.map((c) => TOOLS.filter((t) => t.cat === c.id).length);
  const total = TOOLS.length;

  view.innerHTML = `
    <div class="tl">
      <p class="note tl-intro">
        Working documents for every part of running a CPA — ${total} templates and toolkits.
        <b>CSV</b> files open in Excel and their columns line up with the “Import CSV” buttons in each section, so a
        completed template loads straight back into CPA360. <b>DOC</b> files open in Word, ready to fill in.
        These are starting points — adapt each one to your CPA’s constitution and context.
      </p>

      <div class="tl-toolbar">
        <label class="tl-search">
          ${searchIcon()}
          <input type="search" id="tl-q" placeholder="Search templates…" autocomplete="off" aria-label="Search templates">
        </label>
      </div>

      <nav class="tl-cats" aria-label="Categories">
        ${CATS.map((c, i) => `<button type="button" class="tl-chip" data-jump="tl-cat-${c.id}">${esc(c.label)} <span>${counts[i]}</span></button>`).join("")}
      </nav>

      <div id="tl-body">
        ${CATS.map((c) => sectionHtml(c)).join("")}
      </div>
      <p class="tl-empty" id="tl-empty" hidden>No templates match “<span></span>”.</p>
    </div>`;

  const q = view.querySelector("#tl-q");
  const emptyEl = view.querySelector("#tl-empty");

  view.querySelectorAll("[data-jump]").forEach((b) => (b.onclick = () => {
    const el = view.querySelector("#" + b.dataset.jump);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }));

  view.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => {
    const ok = downloadTool(b.dataset.tool);
    if (ok) {
      const prev = b.textContent;
      b.textContent = "Downloaded ✓";
      b.disabled = true;
      setTimeout(() => { b.textContent = prev; b.disabled = false; }, 1800);
    } else {
      b.textContent = "Try again";
    }
  }));

  q.addEventListener("input", () => {
    const term = q.value.trim().toLowerCase();
    let shown = 0;
    view.querySelectorAll(".tl-card").forEach((card) => {
      const hit = !term || card.dataset.search.includes(term);
      card.hidden = !hit;
      if (hit) shown++;
    });
    view.querySelectorAll(".tl-cat").forEach((sec) => {
      const any = [...sec.querySelectorAll(".tl-card")].some((c) => !c.hidden);
      sec.hidden = !any;
    });
    emptyEl.hidden = shown > 0;
    if (!emptyEl.hidden) emptyEl.querySelector("span").textContent = q.value.trim();
  });
}

function sectionHtml(c) {
  const items = TOOLS.filter((t) => t.cat === c.id);
  return `
    <section class="tl-cat" id="tl-cat-${c.id}">
      <div class="tl-cat-head">
        <h2>${esc(c.label)}</h2>
        <p>${esc(c.blurb)}</p>
      </div>
      <div class="tl-grid">
        ${items.map(cardHtml).join("")}
      </div>
    </section>`;
}

function cardHtml(t) {
  const search = `${t.title} ${t.desc} ${t.cat} ${t.fmt}`.toLowerCase();
  return `
    <article class="tl-card" data-search="${esc(search)}">
      <div class="tl-card-top">
        <span class="tl-fmt tl-fmt-${t.fmt}">${FMT_LABEL[t.fmt]}</span>
      </div>
      <h3>${esc(t.title)}</h3>
      <p>${esc(t.desc)}</p>
      <button class="btn" type="button" data-tool="${esc(t.id)}">${downloadIcon()} Download</button>
    </article>`;
}

function searchIcon() {
  return `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>`;
}
function downloadIcon() {
  return `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;margin-right:5px"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"/></svg>`;
}
