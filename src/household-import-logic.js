/* CPA360 — household register import: pure logic (no DOM) so it can be unit-tested.
   · matchColumns   — suggests which column of an uploaded table (PDF / CSV / Excel) belongs to which
                      Households column, from the header wording and from what the cells look like
   · detectHeaderRow, splitNameId, splitList — tidy up messy cells
   · analyseHouseholds — flags households that already exist (or appear twice in the file)
   · mergeHousehold — fills blanks on an existing household from the import (never overwrites)
   Household row: [0 ref,1 family rep,2 ODI,3 ODI id,4 d1,5 d1 id,6 d2,7 d2 id,8 d3,9 d3 id,10 d4,11 d4 id,
                   12 status,13 resident, …, 24 d5,25 d5 id,26 d6,27 d6 id,28 d7,29 d7 id] */
import { nameSimilarity, last4, findRegisterMatch } from "./family-tree-logic.js";

export const DESC_IDX = [[4, 5], [6, 7], [8, 9], [10, 11], [24, 25], [26, 27], [28, 29]];
const ORD_WORDS = [[1, /(^|\b)(1st|first|1)(\b|$)/], [2, /(^|\b)(2nd|second|2)(\b|$)/], [3, /(^|\b)(3rd|third|3)(\b|$)/], [4, /(^|\b)(4th|fourth|4)(\b|$)/], [5, /(^|\b)(5th|fifth|5)(\b|$)/], [6, /(^|\b)(6th|sixth|6)(\b|$)/], [7, /(^|\b)(7th|seventh|7)(\b|$)/]];
const norm = (s) => String(s || "").toLowerCase().replace(/[_.()/#:-]+/g, " ").replace(/\s+/g, " ").trim();
const ordinalOf = (h) => { for (const [n, re] of ORD_WORDS) if (re.test(h)) return n; return 0; };
const isIdWord = (h) => /(^|\b)(id|i d|identity|idno|id no|id number|identity number)(\b|$)/.test(h);
const isDescWord = (h) => /descend|child|dependan|kid|\bson\b|daughter|family member|\bmember/.test(h);

/** One header → { key, strength } or null. strength 2 = explicit, 1 = plausible. */
export function classifyHeader(raw) {
  const h = norm(raw);
  if (!h) return null;
  const ord = ordinalOf(h), id = isIdWord(h), desc = isDescWord(h);
  if (ord && (desc || /^d\s?\d$/.test(h) || /^\d(st|nd|rd|th)\b/.test(h))) return { key: `d${ord}${id ? "id" : ""}`, strength: 2 };
  if (ord && id && !/odi|household|family rep/.test(h)) return { key: `d${ord}id`, strength: 1 };
  if (id && /odi|original|dweller/.test(h)) return { key: "odiId", strength: 2 };
  if (/house\w*\s*(no|id|ref|number|nr|#)|^hh\b|\bhh\s*(no|id|ref)|mcpa|^ref(erence)?( no)?$|file no|family no|erf no|^no$|^#$|^nr$/.test(h)) return { key: "ref", strength: 2 };
  if (id) return { key: "odiId", strength: 1 };
  if (/famil\w* rep|representative|house\w* head|head of house|^rep$|^head$|house\w* hd/.test(h)) return { key: "famrep", strength: 2 };
  if (/odi|original dwell|dweller|inhabitant|name of owner|^owner$|surname and name|name and surname|full name|^name$|beneficiary|head of family/.test(h)) return { key: "odi", strength: /odi|dweller|original/.test(h) ? 2 : 1 };
  if (/status/.test(h)) return { key: "status", strength: 2 };
  if (/resident|dwells|lives on|stays|on the (farm|land)|in the community/.test(h)) return { key: "resident", strength: 2 };
  if (/descend|children|dependan|kids|family members|members|offspring/.test(h)) return { key: "descList", strength: 1 };
  return null;
}

const idLike = (v) => /^[\d*\s]{6,}$/.test(String(v || "").trim());
function columnKind(rows, c) {
  const vals = rows.map((r) => String(r[c] || "").trim()).filter(Boolean);
  if (!vals.length) return "empty";
  const ids = vals.filter(idLike).length;
  if (ids / vals.length >= 0.6) return "id";
  if (vals.filter((v) => /^[A-Za-z]{2,}[-\s]?\d+$/.test(v) || /^\d{1,4}$/.test(v)).length / vals.length >= 0.7) return "ref";
  return "text";
}

/** headers + sample rows + the list of available target keys → { map: {key: col}, conf: {key: "high"|"check"} } */
export function matchColumns(headers, rows, targetKeys) {
  const map = {}, conf = {}, used = new Set();
  const want = new Set(targetKeys);
  const cls = headers.map((h) => classifyHeader(h));
  const take = (key, c, level) => { if (!want.has(key) || key in map || used.has(c)) return false; map[key] = c; conf[key] = level; used.add(c); return true; };
  // 1) explicit headers first, then plausible ones
  [2, 1].forEach((s) => cls.forEach((c, i) => { if (c && c.strength === s) take(c.key, i, s === 2 ? "high" : "check"); }));
  // 2) an ID column that follows a name column belongs to that name ("Name | ID | Name | ID …")
  headers.forEach((h, i) => {
    if (used.has(i) || !isIdWord(norm(h))) return;
    const left = Object.entries(map).find(([, c]) => c === i - 1);
    if (!left) return;
    const k = left[0] === "odi" ? "odiId" : /^d\d$/.test(left[0]) ? left[0] + "id" : "";
    if (k) take(k, i, "check");
  });
  // 3) cell contents: the first text column is the ODI when nothing else claimed it
  if (want.has("odi") && !("odi" in map)) {
    const c = headers.findIndex((h, i) => !used.has(i) && columnKind(rows, i) === "text");
    if (c >= 0) take("odi", c, "check");
  }
  if (want.has("odiId") && !("odiId" in map) && "odi" in map) {
    const c = map.odi + 1;
    if (c < headers.length && !used.has(c) && columnKind(rows, c) === "id") take("odiId", c, "check");
  }
  if (want.has("ref") && !("ref" in map)) {
    const c = headers.findIndex((h, i) => !used.has(i) && columnKind(rows, i) === "ref");
    if (c >= 0) take("ref", c, "check");
  }
  return { map, conf };
}

/** Which row holds the column titles? The first of the top 8 rows that names several known columns. */
export function detectHeaderRow(rows) {
  let best = 0, bestN = -1;
  rows.slice(0, 8).forEach((r, i) => {
    const n = r.filter((c) => classifyHeader(c)).length;
    if (n > bestN) { bestN = n; best = i; }
  });
  return bestN >= 2 ? best : 0;
}

/** "Nomsa Khumalo 6003041082087" → { name, id } (the number moves to the ID field) */
export function splitNameId(cell) {
  const s = String(cell || "").trim();
  const m = /(?:^|[\s,(-])((?:\d[\s-]?){13})(?=$|[\s,)-])/.exec(s);
  if (!m) return { name: s, id: "" };
  const id = m[1].replace(/\D/g, "");
  return { name: s.replace(m[1], "").replace(/[\s,()-]+$/, "").replace(/^[\s,()-]+/, "").replace(/\s{2,}/g, " "), id };
}
/** A cell listing several people: "1. Sipho\n2. Lindiwe" / "Sipho, Lindiwe; Zodwa" → names */
export function splitList(cell) {
  return String(cell || "").split(/\r?\n|;|\s\/\s|,(?=\s*[A-Z])|\s+\d{1,2}[.)]\s+/).map((x) => x.replace(/^\s*\d{1,2}[.)]\s*/, "").trim()).filter(Boolean);
}

/** Build the value object the Households importer expects from one table row. */
export function buildValues(row, map, listKey = "descList") {
  const get = (k) => (k in map && map[k] != null ? String(row[map[k]] || "").trim() : "");
  const v = {};
  ["ref", "famrep", "status", "resident"].forEach((k) => { v[k] = get(k); });
  let n = splitNameId(get("odi")); v.odi = n.name; v.odiId = get("odiId") || n.id;
  for (let i = 1; i <= 7; i++) { n = splitNameId(get("d" + i)); v["d" + i] = n.name; v["d" + i + "id"] = get("d" + i + "id") || n.id; }
  const list = splitList(get(listKey));
  list.forEach((entry) => {
    const p = splitNameId(entry);
    for (let i = 1; i <= 7; i++) if (!v["d" + i]) { v["d" + i] = p.name; v["d" + i + "id"] = v["d" + i + "id"] || p.id; return; }
  });
  return v;
}

const RANK = { none: 0, possible: 1, exact: 2 };
const names = (h) => DESC_IDX.map(([n]) => String(h[n] || "").trim()).filter(Boolean);

/** Compare one built household with another household row. → null | {level, reason} */
export function compareHouseholds(b, e) {
  const sim = nameSimilarity(b[2], e[2]);
  const idEq = !!(last4(b[3]) && last4(b[3]) === last4(e[3]));
  const refEq = !!(b[0] && e[0] && b[0] === e[0]);
  const noIdConflict = !last4(b[3]) || !last4(e[3]) || idEq;
  if (refEq && sim >= 0.8) return { level: "exact", reason: "Same household ID and ODI" };
  if (sim >= 0.97 && noIdConflict) return { level: "exact", reason: idEq ? `Same ODI and same ID ending ${last4(b[3])}` : "Same ODI name" };
  if (idEq && sim >= 0.8) return { level: "exact", reason: `Same ID ending ${last4(b[3])} and a matching ODI name` };
  if (sim >= 0.97) return { level: "possible", reason: `Same ODI name, but a different ID (ending ${last4(b[3])} vs ${last4(e[3])})` };
  if (refEq) return { level: "possible", reason: `Same household ID, but a different ODI (${e[2]})` };
  if (sim >= 0.86) return { level: "possible", reason: `Very similar ODI name (${Math.round(sim * 100)}%)` };
  if (idEq && sim >= 0.55) return { level: "possible", reason: `Same ODI ID ending ${last4(b[3])}, name differs` };
  if (b[2] && names(e).some((n) => nameSimilarity(b[2], n) >= 0.97)) return { level: "possible", reason: "This ODI is listed as a descendant in that household" };
  return null;
}

/** built: household rows made from the file. → review rows with flags and a default action. */
export function analyseHouseholds(built, { households, register }) {
  const rows = built.map((b, i) => ({ i, b, dup: null, fileDup: null, reg: null, flag: "", action: "add" }));
  rows.forEach((r) => {
    let best = null;
    households.forEach((e) => {
      const c = compareHouseholds(r.b, e);
      if (c && (!best || RANK[c.level] > RANK[best.level])) best = { ...c, household: e };
    });
    r.dup = best;
  });
  for (let a = 0; a < rows.length; a++) for (let c = a + 1; c < rows.length; c++) {
    if (rows[c].fileDup) continue;
    const k = compareHouseholds(rows[c].b, rows[a].b);
    if (k) rows[c].fileDup = { ...k, with: a, reason: `Also in this file (row ${a + 1}): ${k.reason.toLowerCase()}` };
  }
  rows.forEach((r) => {
    if (!r.b[2]) return;
    const m = findRegisterMatch({ name: r.b[2], last4: last4(r.b[3]), dob: "" }, register, r.b[0]);
    if (m) r.reg = m;
    const lv = Math.max(RANK[r.dup ? r.dup.level : "none"], RANK[r.fileDup ? r.fileDup.level : "none"], r.reg && !r.dup ? 1 : 0);
    r.flag = lv === 2 ? "exact" : lv === 1 ? "possible" : "";
    r.action = !r.b[2] ? "skip" : lv === 2 ? "skip" : lv === 1 ? "review" : "add";
  });
  return rows;
}

/** Fill blanks on an existing household from an imported one. → list of what changed */
export function mergeHousehold(existing, built) {
  const ch = [];
  const set = (i, label) => { if (String(built[i] || "").trim() && !String(existing[i] || "").trim()) { existing[i] = built[i]; if (!ch.includes(label)) ch.push(label); } };
  set(1, "family representative"); set(3, "ODI ID");
  // descendants the household doesn't have yet go into its first free slots (names already there are left alone)
  DESC_IDX.forEach(([n, id]) => {
    const name = String(built[n] || "").trim();
    if (!name || names(existing).some((x) => nameSimilarity(x, name) >= 0.9)) return;
    const free = DESC_IDX.find(([en]) => !String(existing[en] || "").trim());
    if (!free) return;
    existing[free[0]] = name; if (built[id]) existing[free[1]] = built[id];
    if (!ch.includes("descendants")) ch.push("descendants");
  });
  return ch;
}

