/* CPA360 — family-tree scan: pure logic (no DOM, no network) so it can be unit-tested.
   · name similarity that copes with spelling variants, word order, initials and honorifics
   · duplicate detection against the Master Register, the household's own slots and the scan itself
   · mapping scanned relationships onto the platform's family positions (ODI / Family Rep / 1st…7th Descendant)
   · generation layout for the review tree
   Register row shape: [0 ref,1 name,2 gender,3 dob,4 id_masked,5 household_ref,6 contact,7 joined,
                        8 status,9 verification,10 notes,11 household_role,12 verified_on,13 wish_optout] */

const STOP = new Set(["mr", "mrs", "ms", "miss", "dr", "rev", "late", "the", "mama", "baba", "ntate", "mme", "oom", "tannie", "nkosikazi", "inkosikazi", "umnumzana", "mnr", "mev", "of", "and", "van", "der", "de"]);

export function normTokens(name) {
  return String(name || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z\s'-]/g, " ").replace(/['’-]/g, "").split(/\s+/).filter((t) => t && !STOP.has(t));
}

function jaro(a, b) {
  if (a === b) return 1;
  const la = a.length, lb = b.length;
  if (!la || !lb) return 0;
  const win = Math.max(0, Math.floor(Math.max(la, lb) / 2) - 1);
  const ma = new Array(la).fill(false), mb = new Array(lb).fill(false);
  let m = 0;
  for (let i = 0; i < la; i++) {
    for (let j = Math.max(0, i - win); j < Math.min(lb, i + win + 1); j++) {
      if (!mb[j] && a[i] === b[j]) { ma[i] = mb[j] = true; m++; break; }
    }
  }
  if (!m) return 0;
  let t = 0, k = 0;
  for (let i = 0; i < la; i++) if (ma[i]) { while (!mb[k]) k++; if (a[i] !== b[k]) t++; k++; }
  return (m / la + m / lb + (m - t / 2) / m) / 3;
}
export function jaroWinkler(a, b) {
  const j = jaro(a, b);
  let p = 0;
  while (p < 4 && p < a.length && p < b.length && a[p] === b[p]) p++;
  return j + p * 0.1 * (1 - j);
}
function tokenSim(x, y) {
  if (x === y) return 1;
  if ((x.length === 1 && y.startsWith(x)) || (y.length === 1 && x.startsWith(y))) return 0.9;   // initial
  const s = jaroWinkler(x, y);
  return s >= 0.86 ? s : 0;
}
/** 0..1 — 1 means the same name (any word order); handles initials, extra middle names, typos. */
export function nameSimilarity(a, b) {
  const ta = normTokens(a), tb = normTokens(b);
  if (!ta.length || !tb.length) return 0;
  if ([...ta].sort().join(" ") === [...tb].sort().join(" ")) return 1;
  const [small, big] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const used = new Set();
  let sum = 0;
  for (const t of small) {
    let best = 0, bi = -1;
    big.forEach((u, i) => { if (used.has(i)) return; const s = tokenSim(t, u); if (s > best) { best = s; bi = i; } });
    if (bi >= 0) { used.add(bi); sum += best; }
  }
  // a shared surname alone must not make two people "the same": every word is matched on its own
  return Math.min(1, sum / (small.length + 0.25 * (big.length - small.length)));
}

export const last4 = (s) => { const m = /(\d{4})\s*$/.exec(String(s || "").replace(/\s/g, "")); return m ? m[1] : ""; };
const RANK = { none: 0, possible: 1, exact: 2 };

/** How does scanned person `p` relate to existing register row `r`? → null or {level, score, reason, why[]} */
export function compareToRow(p, r, hhRef) {
  const score = nameSimilarity(p.name, r[1]);
  const idMatch = !!(p.last4 && last4(r[4]) && p.last4 === last4(r[4]));
  const dobMatch = !!(p.dob && r[3] && String(r[3]).slice(0, 10) === p.dob);
  const sameHh = !!(hhRef && r[5] === hhRef);
  let level = "none", reason = "";
  if (score >= 0.97 && (sameHh || idMatch || dobMatch)) { level = "exact"; reason = idMatch ? `Same name and same ID ending ${p.last4}` : dobMatch ? "Same name and same birth date" : "Same name in this household"; }
  else if (idMatch && score >= 0.8) { level = "exact"; reason = `Same ID ending ${p.last4} and a matching name`; }
  else if (dobMatch && score >= 0.92) { level = "exact"; reason = "Same birth date and a matching name"; }
  else if (score >= 0.97) { level = "possible"; reason = `Same name, in ${r[5] ? "household " + r[5] : "no household"}`; }
  else if (idMatch && score >= 0.55) { level = "possible"; reason = `Same ID ending ${p.last4}, name differs`; }
  else if (dobMatch && score >= 0.75) { level = "possible"; reason = "Same birth date, similar name"; }
  else if (score >= 0.86) { level = "possible"; reason = `Very similar name (${Math.round(score * 100)}%)`; }
  if (level === "none") return null;
  return { level, score, reason, sameHh };
}

/** Best existing-register match for a scanned person (statuses Removed are still compared). */
export function findRegisterMatch(p, register, hhRef) {
  let best = null;
  for (const r of register) {
    const c = compareToRow(p, r, hhRef);
    if (!c) continue;
    if (!best || RANK[c.level] > RANK[best.level] || (RANK[c.level] === RANK[best.level] && c.score > best.score)) best = { ...c, row: r };
  }
  return best;
}

/** Household "slots": the ODI, the Family Representative and descendants 1–7 already named on the household record. */
export function householdSlots(h) {
  h = h || [];
  const s = [
    { role: "ODI", suffix: "ODI", name: h[2] }, { role: "Family Representative", suffix: "REP", name: h[1] },
    { role: "1st Descendant", suffix: "D1", name: h[4] }, { role: "2nd Descendant", suffix: "D2", name: h[6] },
    { role: "3rd Descendant", suffix: "D3", name: h[8] }, { role: "4th Descendant", suffix: "D4", name: h[10] },
    { role: "5th Descendant", suffix: "D5", name: h[24] }, { role: "6th Descendant", suffix: "D6", name: h[26] }, { role: "7th Descendant", suffix: "D7", name: h[28] },
  ];
  return s.map((x, i) => ({ ...x, idx: i, name: String(x.name || "").trim() }));
}
const ORD = ["", "1st", "2nd", "3rd", "4th", "5th", "6th", "7th"];

/** Turns raw scan output into review rows: role, register ref, duplicate flags and a default action. */
export function analyse(people, { register, household, hhRef }) {
  const slots = householdSlots(household);
  const takenRefs = new Set(register.map((r) => String(r[0] || "")));
  const usedSuffix = new Set();
  const rows = people.map((p, i) => ({
    i, p, name: String(p.full_name || "").trim(), gender: p.gender, last4: last4(p.id_number), fullId: String(p.id_number || ""), dob: p.date_of_birth || "",
    role: "", suffix: "", ref: "", dup: null, scanDup: null, action: "add", confidence: p.confidence, deceased: !!p.deceased, generation: p.generation, relationship: p.relationship,
    notes: p.notes || "", contact: p.contact || "", parent: p.parent_name || "", slotName: "",
  }));
  rows.forEach((r) => { r.p2 = { name: r.name, last4: r.last4, dob: r.dob }; });

  // duplicates inside the scan itself (the same person drawn twice)
  for (let a = 0; a < rows.length; a++) {
    for (let b = a + 1; b < rows.length; b++) {
      if (rows[b].scanDup) continue;
      const sc = nameSimilarity(rows[a].name, rows[b].name);
      const idEq = rows[a].last4 && rows[a].last4 === rows[b].last4;
      const dobConflict = rows[a].dob && rows[b].dob && rows[a].dob !== rows[b].dob;
      if ((sc >= 0.97 && !dobConflict) || (idEq && sc >= 0.7) || (sc >= 0.9 && !dobConflict && !(rows[a].last4 && rows[b].last4 && rows[a].last4 !== rows[b].last4))) {
        rows[b].scanDup = { with: a, level: sc >= 0.97 || idEq ? "exact" : "possible", reason: `Appears twice on this tree (also “${rows[a].name}”)` };
      }
    }
  }

  // 1) people who match a name already on the household record take that slot's position
  rows.forEach((r) => {
    if (r.scanDup) return;
    let best = null;
    slots.forEach((s) => { if (!s.name) return; const sc = nameSimilarity(r.name, s.name); if (sc >= 0.9 && (!best || sc > best.sc)) best = { s, sc }; });
    if (best) { r.role = best.s.role; r.suffix = best.s.suffix; r.slotName = best.s.name; usedSuffix.add(best.s.suffix); }
  });
  // 2) the head
  rows.forEach((r) => { if (!r.scanDup && !r.role && r.relationship === "self_head") { const s = slots[0]; if (!usedSuffix.has("ODI") && (!s.name || nameSimilarity(r.name, s.name) >= 0.9)) { r.role = "ODI"; r.suffix = "ODI"; usedSuffix.add("ODI"); } } });
  // 3) descendants, in generation order then as listed, take the next free 1st…7th slot
  const desc = rows.filter((r) => !r.scanDup && !r.role && ["child", "grandchild", "great_grandchild"].includes(r.relationship)).sort((a, b) => a.generation - b.generation || a.i - b.i);
  let k = 1;
  desc.forEach((r) => {
    while (k <= 7 && usedSuffix.has("D" + k)) k++;
    if (k <= 7) { r.role = `${ORD[k]} Descendant`; r.suffix = "D" + k; usedSuffix.add("D" + k); k++; }
  });
  // 4) everyone else
  let f = 1;
  rows.forEach((r) => {
    if (r.role || r.scanDup) return;
    if (r.relationship === "spouse" && !usedSuffix.has("SP")) { r.role = "Spouse"; r.suffix = "SP"; usedSuffix.add("SP"); return; }
    r.role = r.relationship === "spouse" ? "Spouse" : "Other family member";
    r.suffix = r.relationship === "spouse" ? "SP" + (++f) : "F" + (f++);
  });
  // register refs, unique
  rows.forEach((r) => {
    if (r.scanDup) return;
    let ref = `${hhRef}-${r.suffix}`, n = 2;
    r.refTaken = takenRefs.has(ref);
    while (takenRefs.has(ref) && !r.slotName) ref = `${hhRef}-${r.suffix}-${n++}`;
    r.ref = r.slotName ? `${hhRef}-${r.suffix}` : ref;
    if (!r.slotName) takenRefs.add(ref);
  });
  // a repeated person shows the same position/ref as the first time they appear
  rows.forEach((r) => { if (r.scanDup) { const o = rows[r.scanDup.with]; r.role = o.role; r.suffix = o.suffix; r.ref = o.ref; } });
  // duplicates against the register
  rows.forEach((r) => {
    const sameRef = register.find((x) => x[0] === r.ref && r.slotName);
    let m = findRegisterMatch(r.p2, register, hhRef);
    if (sameRef && (!m || m.row !== sameRef)) {
      const c = compareToRow(r.p2, sameRef, hhRef);
      m = { level: "exact", score: c ? c.score : 1, reason: "Already extracted from this household record", sameHh: true, row: sameRef };
    }
    if (m) r.dup = m;
  });
  // default actions: never silently add something that may already exist
  rows.forEach((r) => {
    const lv = Math.max(RANK[r.dup ? r.dup.level : "none"], RANK[r.scanDup ? r.scanDup.level : "none"]);
    r.flag = lv === 2 ? "exact" : lv === 1 ? "possible" : "";
    r.action = lv === 2 ? "skip" : lv === 1 ? "review" : "add";
    if (!r.name) { r.action = "skip"; }
  });
  return rows;
}

/** Generation rows for the review tree (parents above, the head's generation, then descendants). */
export function layoutTree(rows) {
  const by = new Map();
  rows.forEach((r) => { const g = Number.isFinite(r.generation) ? r.generation : 0; if (!by.has(g)) by.set(g, []); by.get(g).push(r); });
  const label = (g) => g < -1 ? "Grandparents & earlier" : g === -1 ? "Parents' generation" : g === 0 ? "Head's generation" : g === 1 ? "Children" : g === 2 ? "Grandchildren" : g === 3 ? "Great-grandchildren" : `Generation +${g}`;
  return [...by.keys()].sort((a, b) => a - b).map((g) => ({ gen: g, label: label(g), rows: by.get(g) }));
}

/** Fields an existing record is missing and the scan can fill (never overwrites). */
export function mergeFill(row, r, hhRef) {
  const changes = [];
  const set = (idx, val, label) => { if (val && !String(row[idx] || "").trim()) { row[idx] = val; changes.push(label); } };
  if (!String(row[5] || "").trim() && hhRef) { row[5] = hhRef; changes.push("household"); }
  set(11, r.role, "family position");
  set(3, r.dob, "birth date");
  set(6, r.contact, "contact");
  if (!String(row[2] || "").trim() || row[2] === "Unspecified") { if (r.gender === "female" || r.gender === "male") { row[2] = r.gender === "female" ? "Female" : "Male"; changes.push("gender"); } }
  return changes;
}

