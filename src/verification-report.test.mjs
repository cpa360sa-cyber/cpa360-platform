// node web/src/verification-report.test.mjs
import { verificationStats, verificationReportHtml, verificationCsv, generationOf, statusBarSvg, progressLineSvg } from "./verification-report.js";
let fail = 0;
const t = (n, ok, x = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  " + x)); };
const R = (ref, name, hh, role, o = {}) => [ref, name, o.g || "", o.dob || "", o.id || "", hh, o.contact || "", "", o.status || "Active", o.verif || "Pending", o.notes || "", role, o.vOn || "", false, ""];
const reg = [
  R("MCPA-001-ODI", "Anna Maseko", "MCPA-001", "ODI", { verif: "Verified", vOn: "2026-10-14", id: "*********1085", dob: "1930-01-01" }),
  R("MCPA-001-D1-1", "Lydia Maseko", "MCPA-001", "1st Descendant", { verif: "Verified", vOn: "2026-11-19" }),
  R("MCPA-001-D2-1", "Dennis Dube", "MCPA-001", "2nd Descendant", { verif: "Verified" }),                         // verified before dates were kept
  R("MCPA-002-ODI", "Mariah Maibi", "MCPA-002", "ODI", { verif: "Verified", vOn: "2026-11-23" }),
  R("MCPA-002-D1-1", "John Gwebu", "MCPA-002", "1st Descendant"),
  R("MCPA-002-D1-2", "Kate Gwebu", "MCPA-002", "1st Descendant", { verif: "Disputed" }),
  R("MCPA-002-D2-1", "Late Gwebu", "MCPA-002", "2nd Descendant", { status: "Deceased", verif: "Verified", vOn: "2026-11-20" }),
  R("MCPA-002-REP", "Sabelo <b>Nkosi</b>", "MCPA-002", "Family Representative", { notes: "FLAG: check" }),
  R("TBC-1", "Unlinked Person", "", ""),
  R("MCPA-003-D1-1", "Future Verified", "MCPA-003", "1st Descendant", { verif: "Verified", vOn: "2026-12-30" }),  // dated after the report date
];
const s = verificationStats(reg, { asAt: "2026-11-23", from: "2026-11-01", households: [["MCPA-003", "", "Third ODI"]] });

t("active members exclude the deceased", s.active === 9 && s.deceased === 1, s.active);
t("verified counts active only, and not verifications dated after the report date", s.verified === 4, s.verified);
t("disputed and pending add up", s.disputed === 1 && s.pending === 4 && s.verified + s.pending + s.disputed === s.active, JSON.stringify([s.verified, s.pending, s.disputed]));
t("verified in the period (from 1 Nov)", s.inPeriod.length === 2 && s.inPeriod[0][0] === "MCPA-002-ODI", s.inPeriod.map((r) => r[0]).join());
t("last 7 days (17–23 Nov)", s.last7 === 2, s.last7);
t("weekly progress is cumulative and ends at the verified total", s.weeks.length > 2 && s.weeks[s.weeks.length - 1].cumulative === s.verified && s.weeks.every((w, i) => !i || w.cumulative >= s.weeks[i - 1].cumulative), JSON.stringify(s.weeks.slice(-2)));
t("undated verifications counted from the start", s.undated === 1 && s.weeks[0].cumulative >= 1);
t("weeks start on a Monday", s.weeks.every((w) => new Date(w.week + "T00:00:00Z").getUTCDay() === 1));
t("generation from ref or role", generationOf(reg[0]) === 0 && generationOf(reg[2]) === 2 && generationOf(reg[7]) === null && generationOf(["X", "", "", "", "", "", "", "", "", "", "", "3rd Descendant"]) === 3);
const g = Object.fromEntries(s.byGeneration.map((x) => [x.label, x]));
t("by generation", g["ODI"].total === 2 && g["ODI"].verified === 2 && g["1st descendants"].total === 4 && g["Position not recorded"].total === 2, JSON.stringify(s.byGeneration));
const h = Object.fromEntries(s.byHousehold.map((x) => [x.ref, x]));
t("household MCPA-001 fully verified", h["MCPA-001"].state === "Fully verified" && h["MCPA-001"].members === 3);
t("household MCPA-002 in progress, deceased counted apart", h["MCPA-002"].state === "In progress" && h["MCPA-002"].members === 4 && h["MCPA-002"].deceased === 1 && h["MCPA-002"].disputed === 1);
t("household ODI name falls back to the household record", h["MCPA-003"].odi === "Third ODI" && h["MCPA-003"].state === "Not started");
t("unlinked members grouped last", s.byHousehold[s.byHousehold.length - 1].ref === "");
t("household summary", s.hh.total === 3 && s.hh.full === 1 && s.hh.some === 1 && s.hh.none === 1, JSON.stringify(s.hh));
const q = Object.fromEntries(s.quality.map((x) => [x.label, x.n]));
t("data quality counts", q["No ID number on file"] === 8 && q["Not linked to an ODI household"] === 1 && q["Flagged for follow-up in the notes"] === 1, JSON.stringify(q));
t("outstanding = active and not verified", s.outstanding.length === 5);

const html = verificationReportHtml(s, { cpa: { name: "Mashobotho CPA", reg: "CPA/01" }, mode: "print", docNo: "VER-1", outstanding: true });
t("report has the dashboard, charts and every section", ["Dashboard", "Progress over time", "New verifications per week", "Progress by generation", "Progress by household", "Data quality", "Verified in the reporting period", "Still to verify", "Sign-off"].every((x) => html.includes(x)));
t("headline percentage printed", html.includes("44.4%"), (html.match(/\d+(\.\d)?%/) || [])[0]);
t("names are escaped", !html.includes("<b>Nkosi</b>") && html.includes("&lt;b&gt;Nkosi"));
t("no ID numbers in the report", !html.includes("1085"));
t("outstanding list can be left out", !verificationReportHtml(s, { mode: "print" }).includes("Still to verify ("));
t("Word view has no print bar", !verificationReportHtml(s, { mode: "word" }).includes("Print / Save as PDF"));
t("status bar has one segment per status present", (statusBarSvg(s).match(/<rect/g) || []).length === 3);
t("progress line has a marker per week", (progressLineSvg(s.weeks).match(/<circle/g) || []).length === s.weeks.length);
t("empty register → a friendly message, not a broken chart", progressLineSvg([]).includes("No verifications"));
const csv = verificationCsv(s).split("\r\n");
t("CSV: BOM, header, one row per household and a total", csv[0].startsWith("﻿") && csv.length === s.byHousehold.length + 2 && /TOTAL/.test(csv[csv.length - 1]));
const empty = verificationStats([], { asAt: "2026-11-23" });
t("empty register doesn't crash", empty.active === 0 && verificationReportHtml(empty, {}).includes("Dashboard"));

console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
