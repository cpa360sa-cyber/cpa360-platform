// node web/src/family-tree-logic.test.mjs
import { nameSimilarity, normTokens, analyse, layoutTree, mergeFill, last4 } from "./family-tree-logic.js";
let fail = 0;
const t = (name, ok, extra = "") => { if (!ok) fail++; console.log((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  " + extra)); };
const sim = (a, b) => +nameSimilarity(a, b).toFixed(2);

t("identical", sim("Nomsa Khumalo", "Nomsa Khumalo") === 1);
t("word order / comma", sim("Khumalo, Nomsa", "Nomsa Khumalo") === 1, sim("Khumalo, Nomsa", "Nomsa Khumalo"));
t("case + accents", sim("NOMSA KHUMALO", "Nomsá khumalo") === 1);
t("honorific ignored", sim("Mama Nomsa Khumalo", "Nomsa Khumalo") === 1);
t("typo", sim("Nomsa Khumalo", "Nomza Khumalo") >= 0.86, sim("Nomsa Khumalo", "Nomza Khumalo"));
t("handwriting confusion Dlamini/Dlamlni", sim("Thandi Dlamini", "Thandi Dlamlni") >= 0.86, sim("Thandi Dlamini", "Thandi Dlamlni"));
t("initial", sim("N. Khumalo", "Nomsa Khumalo") >= 0.86, sim("N. Khumalo", "Nomsa Khumalo"));
t("extra middle name", sim("Nomsa Grace Khumalo", "Nomsa Khumalo") >= 0.86, sim("Nomsa Grace Khumalo", "Nomsa Khumalo"));
t("same first name only is NOT a match", sim("Thandi Dlamini", "Thandi Khumalo") < 0.86, sim("Thandi Dlamini", "Thandi Khumalo"));
t("same surname only is NOT a match", sim("Sipho Khumalo", "Nomsa Khumalo") < 0.86, sim("Sipho Khumalo", "Nomsa Khumalo"));
t("different people", sim("Petros Mahlangu", "Robert Mokoena") < 0.5);
t("single token vs full is not a match", sim("Nomsa", "Nomsa Khumalo") < 0.86, sim("Nomsa", "Nomsa Khumalo"));
t("last4", last4("****1082") === "1082" && last4("8001015009087") === "9087" && last4("") === "");

const reg = [
  ["MCPA-001-ODI", "Nomsa Khumalo", "Female", "1960-03-04", "****1082", "MCPA-001", "", "", "Active", "Verified", "", "ODI", "", false],
  ["MCPA-001-D1", "Sipho Khumalo", "Male", "1985-01-01", "****5555", "MCPA-001", "", "", "Active", "Pending", "", "1st Descendant", "", false],
  ["MCPA-002-ODI", "Thandi Dlamini", "Female", "", "****9999", "MCPA-002", "", "", "Active", "Pending", "", "ODI", "", false],
];
const hh = ["MCPA-001", "", "Nomsa Khumalo", "****1082", "Sipho Khumalo", "****5555", "", "", "", "", "", "", "Active", true, "", "", "", "Pending", "", "", "", "", false, "", "", "", "", "", "", ""];
const P = (o) => ({ full_name: "", relationship: "child", generation: 1, parent_name: "", gender: "unknown", id_number: "", date_of_birth: "", deceased: false, contact: "", notes: "", confidence: "high", ...o });
const people = [
  P({ full_name: "Nomsa Khumalo", relationship: "self_head", generation: 0 }),            // head, already in the register
  P({ full_name: "Sipho Khumalo", id_number: "8501015555087" }),                            // already extracted (D1)
  P({ full_name: "Lindiwe Khumalo", gender: "female", generation: 1 }),                    // brand new → 2nd descendant
  P({ full_name: "Nomza Khumalo", generation: 1, parent_name: "Nomsa" }),                  // fuzzy vs head? (Nomza ~ Nomsa, same surname)
  P({ full_name: "Thandi Dlamini", generation: 1 }),                                        // same name, other household
  P({ full_name: "Lindiwe Khumalo", generation: 1 }),                                       // drawn twice
  P({ full_name: "Baba Themba Khumalo", relationship: "spouse", generation: 0 }),           // spouse (new)
  P({ full_name: "Late Gogo Zodwa Khumalo", relationship: "parent", generation: -1, deceased: true }),
];
const rows = analyse(people, { register: reg, household: hh, hhRef: "MCPA-001" });
const by = (n, k = 0) => rows.filter((r) => r.name === n)[k];
t("head matches household ODI slot", by("Nomsa Khumalo").role === "ODI" && by("Nomsa Khumalo").ref === "MCPA-001-ODI");
t("head flagged exact duplicate, default skip", by("Nomsa Khumalo").flag === "exact" && by("Nomsa Khumalo").action === "skip");
t("Sipho = D1 slot, exact dup (already extracted)", by("Sipho Khumalo").role === "1st Descendant" && by("Sipho Khumalo").flag === "exact", JSON.stringify([by("Sipho Khumalo").role, by("Sipho Khumalo").flag]));
t("Lindiwe new → next free slot (2nd), add", by("Lindiwe Khumalo").role === "2nd Descendant" && by("Lindiwe Khumalo").action === "add", JSON.stringify([by("Lindiwe Khumalo").role, by("Lindiwe Khumalo").action]));
t("second Lindiwe flagged as drawn twice", by("Lindiwe Khumalo", 1).scanDup && by("Lindiwe Khumalo", 1).flag === "exact" && by("Lindiwe Khumalo", 1).action === "skip");
t("Thandi Dlamini: same name in OTHER household → possible, needs review", by("Thandi Dlamini").flag === "possible" && by("Thandi Dlamini").action === "review" && /MCPA-002/.test(by("Thandi Dlamini").dup.reason), JSON.stringify(by("Thandi Dlamini").dup));
t("Nomza ≈ Nomsa Khumalo flagged possible", by("Nomza Khumalo").flag === "possible", JSON.stringify([by("Nomza Khumalo").flag, by("Nomza Khumalo").dup]));
t("spouse gets Spouse role", by("Baba Themba Khumalo").role === "Spouse" && by("Baba Themba Khumalo").action === "add");
t("late parent → Other family member, deceased kept", by("Late Gogo Zodwa Khumalo").role === "Other family member" && by("Late Gogo Zodwa Khumalo").deceased === true);
t("refs are unique", new Set(rows.filter((r) => r.action !== "skip").map((r) => r.ref)).size === rows.filter((r) => r.action !== "skip").length);

const rows2 = analyse([P({ full_name: "Zanele Mokoena", id_number: "9001011082087", date_of_birth: "1990-01-01" })], { register: reg, household: hh, hhRef: "MCPA-009" });
t("ID last-4 equal but name unrelated → no flag", rows2[0].flag === "" && rows2[0].action === "add", JSON.stringify(rows2[0].dup));
const rows3 = analyse([P({ full_name: "N Khumalo", id_number: "6003041082087", date_of_birth: "1960-03-04", relationship: "self_head", generation: 0 })], { register: reg, household: null, hhRef: "MCPA-010" });
t("initial + same ID last 4 + DOB → exact", rows3[0].flag === "exact", JSON.stringify(rows3[0].dup));

const rowsZ = analyse([...people, P({ full_name: "Zodwa Khumalo", gender: "female" })], { register: reg, household: hh, hhRef: "MCPA-001" });
t("a repeated person does not use up a descendant slot", (() => { const ords = rowsZ.filter((r) => !r.scanDup && /Descendant/.test(r.role)).map((r) => parseInt(r.role)).sort((a, b) => a - b); return ords.every((o, i) => o === i + 1) && rowsZ[5].ref === rowsZ[2].ref; })(), JSON.stringify(rowsZ.map((r) => [r.name, r.role, !!r.scanDup])));
const layout = layoutTree(rows);
t("layout orders generations", layout.map((g) => g.gen).join() === "-1,0,1", layout.map((g) => g.gen).join());
const row = ["X-1", "Test", "Unspecified", "", "", "", "", "", "Active", "Pending", "", "", "", false];
const ch = mergeFill(row, { role: "3rd Descendant", dob: "1990-05-05", contact: "0821234567", gender: "female" }, "MCPA-001");
t("mergeFill fills only blanks", row[5] === "MCPA-001" && row[11] === "3rd Descendant" && row[3] === "1990-05-05" && row[2] === "Female" && ch.length === 5, JSON.stringify([row, ch]));
const keep = ["X-2", "Keep", "Male", "1970-01-01", "", "MCPA-777", "0711111111", "", "Active", "Pending", "", "ODI", "", false];
mergeFill(keep, { role: "Spouse", dob: "1999-09-09", contact: "0000", gender: "female" }, "MCPA-001");
t("mergeFill never overwrites", keep[5] === "MCPA-777" && keep[11] === "ODI" && keep[3] === "1970-01-01" && keep[2] === "Male");
console.log(fail ? `\n${fail} FAILED` : "\nALL PASSED");
process.exit(fail ? 1 : 0);


