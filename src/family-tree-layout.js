/* CPA360 — family tree engine (pure: no DOM, no network, unit-tested).
   householdPeople(household, register) → everyone in a household, from BOTH the register (members whose
        household_ref matches) and the household record's own slots (ODI, family rep, 1st–7th descendant), merged,
        so the tree builds itself from what's already captured — people only named on the household record show
        up too, drawn dashed ("not yet on the register").
   layoutFamily(people) → positioned nodes + connectors for a top-down tree:
        ODI (+ spouse) at the top, each person's children centred beneath them, lineage from the member's
        `parent_ref` (register column 15) and — where no parent is recorded — the ODI.
        Other family members with no known place go in an "extended family" band below the tree. */
import { nameSimilarity } from "./family-tree-logic.js";
import { householdSlots } from "./family-tree-logic.js";

export const NODE_W = 176, NODE_H = 82, HGAP = 26, VGAP = 76, SPOUSE_GAP = 30;

export const ordinalOf = (role) => { const m = /^(\d)(st|nd|rd|th) Descendant$/.exec(String(role || "")); return m ? +m[1] : 0; };
const rank = (p) => (p.role === "ODI" ? 0 : ordinalOf(p.role) || (p.role === "Spouse" ? 60 : p.role === "Family Representative" ? 70 : 80));

/** Register row → person. Row: [0 ref,1 name,2 gender,3 dob,4 id_masked,5 household,6 contact,7 joined,8 status,9 verification,10 notes,11 role,12 verified_on,13 optout,14 parent_ref] */
export function personFromRow(r) {
  return { key: r._id || `r:${r[0]}:${r[1]}`, ref: String(r[0] || ""), name: String(r[1] || "").trim(), gender: r[2] || "", dob: r[3] || "", idm: r[4] || "", status: r[8] || "Active", verification: r[9] || "Pending",
    role: r[11] || "", parentRef: String(r[14] || "").trim(), virtual: false, famRep: false, row: r };
}

export function householdPeople(h, register) {
  const ref = h[0];
  const people = register.filter((r) => r[5] === ref && r[8] !== "Removed" && String(r[1] || "").trim()).map(personFromRow);
  const used = new Set();
  householdSlots(h).forEach((s) => {
    if (!s.name) return;
    const byRef = people.find((p) => p.ref === `${ref}-${s.suffix}`);
    const byName = people.find((p) => !used.has(p) && nameSimilarity(p.name, s.name) >= 0.9);
    const m = byRef || byName;
    if (m) {
      used.add(m);
      if (s.suffix === "REP") m.famRep = true;
      if (!m.role && s.suffix !== "REP") m.role = s.role;
      return;
    }
    people.push({ key: `v:${ref}:${s.suffix}`, ref: `${ref}-${s.suffix}`, name: s.name, gender: "", dob: "", idm: "", status: "Active", verification: "Pending", role: s.role, parentRef: "", virtual: true, famRep: s.suffix === "REP", row: null });
  });
  return people;
}

/** → { nodes:[{p,x,y,w,h,gen,ext}], edges:[{x1,y1,x2,y2,gen}], marriages:[{x1,x2,y}], width, height, gens, stats, rootKey } */
export function layoutFamily(peopleIn) {
  let people = [...peopleIn];
  let root = people.find((p) => p.role === "ODI");
  if (!root) { root = { key: "root:placeholder", ref: "", name: "ODI not recorded", role: "ODI", status: "Active", verification: "Pending", virtual: true, placeholder: true, famRep: false, parentRef: "" }; people = [root, ...people]; }
  const byRef = new Map(people.filter((p) => p.ref).map((p) => [p.ref, p]));
  const spouses = people.filter((p) => p !== root && p.role === "Spouse" && !p.parentRef);
  const fixed = new Set([root, ...spouses]);
  // where does each person hang? (recorded parent, else the ODI) — cycles and strangers fall back to the ODI
  const parentOf = new Map();
  people.forEach((p) => {
    if (fixed.has(p)) return;
    const pr = p.parentRef && byRef.get(p.parentRef);
    parentOf.set(p, pr && pr !== p ? pr : root);
  });
  parentOf.forEach((par, p) => {                                  // break cycles
    const seen = new Set([p]); let cur = par;
    while (cur && cur !== root) { if (seen.has(cur)) { parentOf.set(p, root); break; } seen.add(cur); cur = parentOf.get(cur) || root; }
  });
  const kids = new Map(), extended = [];
  people.forEach((p) => {
    if (fixed.has(p)) return;
    const loose = !p.parentRef && (p.role === "Other family member" || p.role === "Family Representative");
    if (loose) { extended.push(p); return; }
    const par = parentOf.get(p);
    if (!kids.has(par)) kids.set(par, []);
    kids.get(par).push(p);
  });
  const sorter = (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name);
  kids.forEach((arr) => arr.sort(sorter));
  extended.sort(sorter);

  const selfW = (n) => (n === root ? (1 + spouses.length) * NODE_W + spouses.length * SPOUSE_GAP : NODE_W);
  const sub = new Map();
  const width = (n) => {
    const ch = kids.get(n) || [];
    const w = Math.max(selfW(n), ch.length ? ch.reduce((s, c) => s + width(c), 0) + HGAP * (ch.length - 1) : 0);
    sub.set(n, w); return w;
  };
  width(root);

  const nodes = [], edges = [], marriages = [];
  let maxGen = 0;
  const place = (n, left, gen) => {
    maxGen = Math.max(maxGen, gen);
    const cx = left + sub.get(n) / 2, y = gen * (NODE_H + VGAP);
    let anchorX = cx;
    if (n === root) {
      const x0 = cx - selfW(n) / 2;
      nodes.push({ p: n, x: x0, y, w: NODE_W, h: NODE_H, gen });
      spouses.forEach((s, i) => {
        const sx = x0 + (i + 1) * (NODE_W + SPOUSE_GAP);
        nodes.push({ p: s, x: sx, y, w: NODE_W, h: NODE_H, gen, spouse: true });
        marriages.push({ x1: sx - SPOUSE_GAP, x2: sx, y: y + NODE_H / 2 });
      });
      anchorX = spouses.length ? x0 + NODE_W + SPOUSE_GAP / 2 : x0 + NODE_W / 2;
    } else { nodes.push({ p: n, x: cx - NODE_W / 2, y, w: NODE_W, h: NODE_H, gen }); }
    const ch = kids.get(n) || [];
    const total = ch.reduce((s, c) => s + sub.get(c), 0) + HGAP * Math.max(0, ch.length - 1);
    let x = left + (sub.get(n) - total) / 2;
    ch.forEach((c) => {
      const ccx = x + sub.get(c) / 2;
      edges.push({ x1: anchorX, y1: n === root && spouses.length ? y + NODE_H / 2 : y + NODE_H, x2: ccx, y2: (gen + 1) * (NODE_H + VGAP), gen: gen + 1 });
      place(c, x, gen + 1); x += sub.get(c) + HGAP;
    });
  };
  place(root, 0, 0);

  let treeW = sub.get(root), treeH = (maxGen + 1) * NODE_H + maxGen * VGAP;
  if (extended.length) {
    const perRow = Math.max(3, Math.floor((Math.max(treeW, NODE_W * 3) + HGAP) / (NODE_W + HGAP)));
    const rowW = Math.min(extended.length, perRow) * (NODE_W + HGAP) - HGAP;
    const left = Math.max(0, (treeW - rowW) / 2), y0 = treeH + VGAP * 1.15;
    extended.forEach((p, i) => nodes.push({ p, x: left + (i % perRow) * (NODE_W + HGAP), y: y0 + Math.floor(i / perRow) * (NODE_H + HGAP), w: NODE_W, h: NODE_H, gen: maxGen + 1, ext: true }));
    treeH = y0 + Math.ceil(extended.length / perRow) * (NODE_H + HGAP) - HGAP;
    treeW = Math.max(treeW, rowW);
  }
  const real = nodes.filter((n) => !n.p.placeholder);
  return {
    nodes, edges, marriages, width: treeW, height: treeH, gens: maxGen + 1, rootKey: root.key, hasExtended: extended.length > 0,
    stats: {
      members: real.length, onRegister: real.filter((n) => !n.p.virtual).length, notYet: real.filter((n) => n.p.virtual).length,
      deceased: real.filter((n) => n.p.status === "Deceased").length, verified: real.filter((n) => n.p.verification === "Verified").length,
      pending: real.filter((n) => n.p.verification !== "Verified" && n.p.status !== "Deceased").length,
      female: real.filter((n) => /^f/i.test(n.p.gender)).length, male: real.filter((n) => /^m/i.test(n.p.gender)).length,
      byGen: Array.from({ length: maxGen + 1 }, (_, g) => real.filter((n) => !n.ext && n.gen === g).length),
    },
  };
}
