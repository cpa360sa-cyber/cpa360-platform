/* CPA360 — South African ID: facts hidden in the number, and a parser for text read off an ID copy.
   Pure functions (no DOM / network) so they can be unit-tested.
   A 13-digit SA ID number is  YYMMDD SSSS C A Z :
     YYMMDD = date of birth · SSSS = 0000-4999 female / 5000-9999 male · C = 0 citizen / 1 permanent resident
     A = (old) race digit · Z = Luhn check digit. */

export function luhnOk(digits) {
  const s = String(digits || "");
  if (!/^\d+$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < s.length; i++) { let d = +s[s.length - 1 - i]; if (i % 2) { d *= 2; if (d > 9) d -= 9; } sum += d; }
  return sum % 10 === 0;
}

/** → { digits, valid, dob, gender, citizen } — `valid` = 13 digits, a real date and the check digit adds up. */
export function saIdInfo(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  const out = { digits, valid: false, dob: "", gender: "", citizen: "" };
  if (digits.length !== 13) return out;
  const yy = +digits.slice(0, 2), mm = +digits.slice(2, 4), dd = +digits.slice(4, 6);
  const y = yy <= new Date().getFullYear() % 100 ? 2000 + yy : 1900 + yy;
  const dt = new Date(y, mm - 1, dd);
  const dateOk = dt.getFullYear() === y && dt.getMonth() === mm - 1 && dt.getDate() === dd;
  if (dateOk) out.dob = `${y}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  out.gender = +digits.slice(6, 10) >= 5000 ? "Male" : "Female";
  out.citizen = digits[10] === "0" ? "SA citizen" : digits[10] === "1" ? "Permanent resident" : "";
  out.valid = dateOk && luhnOk(digits);
  return out;
}

const CONFUSE = { O: "0", o: "0", Q: "0", D: "0", I: "1", l: "1", "|": "1", i: "1", S: "5", s: "5", B: "8", Z: "2", z: "2", G: "6" };
/** Every plausible 13-digit ID number in a block of OCR text, best (check-digit valid) first. */
export function findIdNumbers(text) {
  const found = [];
  const seen = new Set();
  String(text || "").split(/\r?\n/).forEach((line) => {
    // runs made of digits, spaces/dashes and the letters OCR confuses with digits
    (line.match(/[0-9OoQDIil|SsBZzG][0-9OoQDIil|SsBZzG\s-]{11,}[0-9OoQDIil|SsBZzG]/g) || []).forEach((run) => {
      const dg = run.replace(/[\s-]/g, "").replace(/[OoQDIil|SsBZzG]/g, (c) => CONFUSE[c] || c);
      if (!/^\d+$/.test(dg)) return;
      for (let i = 0; i + 13 <= dg.length; i++) {
        const cand = dg.slice(i, i + 13);
        if (seen.has(cand)) continue;
        seen.add(cand);
        const info = saIdInfo(cand);
        found.push({ digits: cand, valid: info.valid, dateOk: !!info.dob });
      }
    });
  });
  return found.sort((a, b) => (b.valid - a.valid) || (b.dateOk - a.dateOk));
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const title = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const cleanName = (s) => String(s || "").replace(/[^\p{L}\s'-]/gu, " ").replace(/\s+/g, " ").trim();
const labelAt = (lines, re) => {
  for (let i = 0; i < lines.length; i++) {
    const m = re.exec(lines[i]);
    if (!m) continue;
    const rest = cleanName(lines[i].slice(m[0].length));
    if (rest.length >= 2) return rest;
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {         // value is usually on the next line
      const v = cleanName(lines[j]);
      if (v.length >= 2 && !/^(surname|van|names?|voorna|sex|geslag|nationality|nasionaliteit|identity|country|status|date)/i.test(v)) return v;
    }
  }
  return "";
};

/** OCR text of an ID book page / smart ID card → whatever could be read. Nothing is invented. */
export function parseIdText(text) {
  const lines = String(text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const ids = findIdNumbers(text);
  const best = ids[0] || null;
  const info = best ? saIdInfo(best.digits) : null;
  const surname = labelAt(lines, /^(surname\s*[\/|]?\s*(van)?|van)\b[:\s\/|-]*/i);
  const names = labelAt(lines, /^(forenames?|given\s+names?|names?\s*[\/|]?\s*(voorna(am|me|me[ns]))?|voorna(am|me|me[ns]))\b[:\s\/|-]*/i);
  const out = { idNumber: best ? best.digits : "", idValid: !!(best && best.valid), surname: surname ? title(surname) : "", names: names ? title(names) : "", sex: "", dob: info && info.dob ? info.dob : "", gender: info ? info.gender : "", citizen: info ? info.citizen : "", alternatives: ids.slice(1, 4).map((x) => x.digits) };
  const sx = /\b(?:sex|gender|geslag)\b[^A-Za-z]{0,6}([MF])\b/i.exec(text || "");
  if (sx) out.sex = sx[1].toUpperCase() === "M" ? "Male" : "Female";
  // printed date of birth ("04 MAR 1960") — used only when there is no usable ID number
  if (!out.dob) {
    const d = /(\d{1,2})\s*([A-Za-z]{3})[a-z]*\s*(\d{4})/.exec((lines.find((l) => /birth|gebo/i.test(l)) || "") + " " + (text || ""));
    if (d && MONTHS[d[2].toUpperCase()]) out.dob = `${d[3]}-${String(MONTHS[d[2].toUpperCase()]).padStart(2, "0")}-${String(+d[1]).padStart(2, "0")}`;
  }
  if (!out.gender && out.sex) out.gender = out.sex;
  out.fullName = [out.names, out.surname].filter(Boolean).join(" ");
  return out;
}
