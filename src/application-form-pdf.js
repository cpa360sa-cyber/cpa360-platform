/* CPA360 — the fillable "Application for membership" form (New Applications tab), as a PDF.
   Written by hand like pdf-write.js: no library, only the standard Helvetica fonts (nothing embedded),
   and real PDF form fields — type-in boxes and tick-boxes — that work in Adobe Reader, Edge and Chrome,
   and still print cleanly for completing by hand. Field names follow the beneficiary_applications columns
   (family_name, applicant_name, claimed_odi…) so a completed form can be read back later.
   Pure (options in, Uint8Array out) so it is unit-tested. */

const PW = 595, PH = 842, M = 42;                // A4 portrait, margin
const NAVY = "0.122 0.227 0.373", GREY = "0.35 0.35 0.35", LINE = "0.62 0.62 0.62", SHADE = "0.94 0.95 0.97";

/* The supporting documents a family is asked for — same wording as the checklist in the app. */
export const FORM_EVIDENCE = [
  "Completed application form",
  "Police affidavit — sworn statement commissioned at SAPS",
  "Certified ID copy of the applicant",
  "Certified ID copies of the family members applying",
  "Family tree showing descent from the ODI",
  "Birth certificates linking each generation to the ODI",
  "Death certificate of the ODI",
  "Death certificates of deceased parents / grandparents",
  "Marriage certificate(s)",
  "Letter from the Traditional Council / Induna",
  "Confirmation letter from the ODI's family or household representative",
  "Proof of the family's historical link to the land (removal records, old permits, photos)",
  "Proof of current address",
];
export const MEMBER_ROWS = 14;

/* ---- Helvetica / Helvetica-Bold glyph widths (1/1000 em) for ASCII 32–126, from the standard AFMs ---- */
const HV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
// the few non-ASCII characters the form uses → WinAnsi code and width
const EXTRA = { "—": [0o227, 1000], "–": [0o226, 556], "’": [0o222, 222], "‘": [0o221, 222], "“": [0o223, 333], "”": [0o224, 333], "•": [0o225, 350] };

export function textWidth(s, size, bold) {
  const t = bold ? HB : HV;
  let w = 0;
  for (const ch of String(s)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? t[c - 32] : EXTRA[ch] ? EXTRA[ch][1] : 556; }
  return (w * size) / 1000;
}
/* a PDF literal string: brackets and backslashes escaped, the WinAnsi extras as octal, anything else → "?" */
export function pdfStr(s) {
  let o = "";
  for (const ch of String(s)) {
    const c = ch.charCodeAt(0);
    if (ch === "\\" || ch === "(" || ch === ")") o += "\\" + ch;
    else if (c >= 32 && c <= 126) o += ch;
    else if (EXTRA[ch]) o += "\\" + EXTRA[ch][0].toString(8);
    else o += "?";
  }
  return "(" + o + ")";
}
function wrapLines(s, width, size, bold) {
  const out = [];
  for (const para of String(s).split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? line + " " + word : word;
      if (textWidth(next, size, bold) <= width || !line) line = next; else { out.push(line); line = word; }
    }
    out.push(line);
  }
  return out;
}
const f2 = (n) => (Math.round(n * 100) / 100).toString();

/** → PDF bytes.  o.cpaName / o.cpaReg print in the heading and footer (both optional). */
export function makeApplicationFormPdf(o = {}) {
  const cpa = String(o.cpaName || "").trim(), reg = String(o.cpaReg || "").trim();
  const objs = [null];                                   // objs[n] = body string
  const add = (body) => { objs.push(body); return objs.length - 1; };
  const reserve = () => add(null);
  const stream = (dict, data) => `<< ${dict} /Length ${data.length} >>\nstream\n${data}\nendstream`;

  const CATALOG = reserve(), PAGES = reserve();
  const HELV = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const HELVB = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const ZADB = add("<< /Type /Font /Subtype /Type1 /BaseFont /ZapfDingbats >>");
  const fields = [], names = new Set(), pages = [];

  // tick-box appearances (shared): a box, and a box with a tick
  const boxAp = (s, tick) => add(stream(`/Type /XObject /Subtype /Form /BBox [0 0 ${s} ${s}] /Resources << /Font << /ZaDb ${ZADB} 0 R >> >>`,
    `${LINE} RG 0.8 w 0.4 0.4 ${f2(s - 0.8)} ${f2(s - 0.8)} re S` + (tick ? ` BT /ZaDb ${f2(s * 0.78)} Tf 0 g ${f2(s * 0.16)} ${f2(s * 0.2)} Td (4) Tj ET` : "")));
  const CHK = 10, AP_ON = boxAp(CHK, true), AP_OFF = boxAp(CHK, false);

  function page() {
    const p = { ops: [], annots: [], bottom: 0, right: 0 };
    const Y = (top) => PH - top;                          // layout runs top-down; PDF runs bottom-up
    p.text = (x, top, s, size = 9, bold = false, color = "0 0 0") => {
      p.bottom = Math.max(p.bottom, top + size); p.right = Math.max(p.right, x + textWidth(s, size, bold));
      p.ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color} rg ${f2(x)} ${f2(Y(top) - size)} Td ${pdfStr(s)} Tj ET`);
    };
    p.para = (x, top, width, s, size = 9, bold = false, color = "0 0 0", lead = 1.32) => {
      const lines = wrapLines(s, width, size, bold);
      lines.forEach((l, i) => p.text(x, top + i * size * lead, l, size, bold, color));
      return top + lines.length * size * lead;
    };
    p.rect = (x, top, w, h, { fill, stroke, lw = 0.7 } = {}) => {
      p.bottom = Math.max(p.bottom, top + h); p.right = Math.max(p.right, x + w);
      if (fill) p.ops.push(`${fill} rg ${f2(x)} ${f2(Y(top + h))} ${f2(w)} ${f2(h)} re f`);
      if (stroke) p.ops.push(`${stroke} RG ${lw} w ${f2(x)} ${f2(Y(top + h))} ${f2(w)} ${f2(h)} re S`);
    };
    p.hline = (x1, x2, top, color = LINE, lw = 0.6) => p.ops.push(`${color} RG ${lw} w ${f2(x1)} ${f2(Y(top))} m ${f2(x2)} ${f2(Y(top))} l S`);
    const uniq = (name) => { if (names.has(name)) throw new Error("Duplicate field " + name); names.add(name); return name; };
    // a type-in box: drawn on the page too, so the printed form shows where to write
    p.field = (name, x, top, w, h, { multiline = false, size = multiline ? 9 : 10, tip = "" } = {}) => {
      p.rect(x, top, w, h, { fill: "1 1 1", stroke: LINE });
      const n = add(`<< /Type /Annot /Subtype /Widget /FT /Tx /T ${pdfStr(uniq(name))}${tip ? ` /TU ${pdfStr(tip)}` : ""} /F 4 /Rect [${f2(x + 1)} ${f2(Y(top + h) + 1)} ${f2(x + w - 1)} ${f2(Y(top) - 1)}]`
        + ` /DA (/Helv ${size} Tf 0 g)${multiline ? " /Ff 4096" : ""} /MK << >> /Border [0 0 0] >>`);
      fields.push(n); p.annots.push(n);
    };
    p.check = (name, x, top, tip = "") => {
      p.rect(x, top, CHK, CHK, { stroke: LINE, lw: 0.8 });
      const n = add(`<< /Type /Annot /Subtype /Widget /FT /Btn /T ${pdfStr(uniq(name))}${tip ? ` /TU ${pdfStr(tip)}` : ""} /F 4 /V /Off /AS /Off`
        + ` /Rect [${f2(x)} ${f2(Y(top + CHK))} ${f2(x + CHK)} ${f2(Y(top))}] /DA (/ZaDb 0 Tf 0 g) /MK << /CA (4) >>`
        + ` /AP << /N << /Yes ${AP_ON} 0 R /Off ${AP_OFF} 0 R >> /D << /Yes ${AP_ON} 0 R /Off ${AP_OFF} 0 R >> >> >>`);
      fields.push(n); p.annots.push(n);
    };
    // label above a type-in box; returns the top of the next row
    p.labelled = (name, label, x, top, w, h = 18, opts = {}) => {
      p.text(x, top, label, 7.5, false, GREY);
      p.field(name, x, top + 10, w, h, { tip: label, ...opts });
      return top + 10 + h + 7;
    };
    p.section = (top, title) => {
      p.rect(M, top, PW - 2 * M, 17, { fill: NAVY });
      p.text(M + 7, top + 4.5, title, 9.5, true, "1 1 1");
      return top + 25;
    };
    pages.push(p);
    return p;
  }
  const W = PW - 2 * M, col = (frac) => W * frac, GAP = 10;

  /* ---------------- page 1: the family and the claim ---------------- */
  let p = page(), y = M;
  if (cpa) { p.text(M, y, cpa, 13, true, NAVY); y += 16; }
  if (reg) { p.text(M, y, `Registration no. ${reg}`, 8, false, GREY); y += 11; }
  p.text(M, y + 4, "APPLICATION FOR MEMBERSHIP", 16, true); y += 24;
  p.text(M, y, "New family application — Master Beneficiary Register", 10, false, GREY);
  // office-use box, top right
  const bx = PW - M - 160;
  p.rect(bx, M - 2, 160, 114, { fill: SHADE, stroke: LINE });
  p.text(bx + 8, M + 4, "FOR OFFICE USE", 7.5, true, NAVY);
  let by = M + 15;
  by = p.labelled("office_application_no", "Application no.", bx + 8, by, 144, 15);
  by = p.labelled("office_date_received", "Date received", bx + 8, by, 144, 15);
  p.labelled("office_received_by", "Received by", bx + 8, by, 144, 15);
  y = Math.max(y + 22, M + 124);
  y = p.para(M, y, W, "Use this form when a family that descends from an Original Dispossessed Individual (ODI) of the CPA asks to be added to the beneficiary register. "
    + "Type in the boxes, or print the form and complete it by hand in BLOCK LETTERS. Attach certified copies of the documents listed in Section D — "
    + "the police affidavit is required before the committee can consider the application.", 8.5, false, GREY) + 10;

  y = p.section(y, "A.  THE FAMILY APPLYING");
  y = p.labelled("family_name", "Family making the application (e.g. the Mabuza family)", M, y, W);
  let r = y;
  p.labelled("applicant_name", "Applicant — full name of the person lodging the application for the family", M, r, col(0.62) - GAP / 2);
  y = p.labelled("applicant_id", "Applicant's ID number", M + col(0.62) + GAP / 2, r, col(0.38) - GAP / 2);
  r = y;
  const third = (W - 2 * GAP) / 3;
  p.labelled("applicant_dob", "Date of birth (DD/MM/YYYY)", M, r, third);
  p.labelled("contact", "Contact number", M + third + GAP, r, third);
  y = p.labelled("email", "Email address (optional)", M + 2 * (third + GAP), r, third);
  y = p.labelled("address", "Physical address", M, y, W, 32, { multiline: true });

  y = p.section(y + 2, "B.  THE CLAIM");
  r = y;
  p.labelled("claimed_odi", "Full name of the ODI the family descends from", M, r, col(0.62) - GAP / 2);
  y = p.labelled("household_ref", "ODI household no. (if known)", M + col(0.62) + GAP / 2, r, col(0.38) - GAP / 2);
  r = y;
  p.labelled("relationship", "Applicant's relationship to the ODI (e.g. grandson)", M, r, col(0.62) - GAP / 2);
  y = p.labelled("members_count", "Number of people this application covers", M + col(0.62) + GAP / 2, r, col(0.38) - GAP / 2);
  y = p.labelled("descent", "How does the family descend from the ODI? Name each generation, from the ODI down to the applicant", M, y, W, 92, { multiline: true });
  y = p.labelled("previous", "Has this family applied before, or been listed with another family or CPA? If yes, give details", M, y, W, 44, { multiline: true });

  /* ---------------- page 2: family members + documents ---------------- */
  p = page(); y = M;
  y = p.section(y, "C.  FAMILY MEMBERS APPLYING");
  y = p.para(M, y, W, "List everyone this application covers, including the applicant. If there are more people, attach a page with the same columns.", 8.5, false, GREY) + 6;
  const cols = [["No.", 22], ["Full name", 142], ["ID number", 96], ["Date of birth", 62], ["Relationship to the ODI", 104], ["Parent's name", W - 22 - 142 - 96 - 62 - 104]];
  const keys = [null, "name", "id", "dob", "relationship", "parent"];
  let cx = M;
  p.rect(M, y, W, 16, { fill: SHADE, stroke: LINE });
  cols.forEach(([h, w]) => { p.text(cx + 4, y + 4.5, h, 7.5, true, NAVY); cx += w; });
  y += 16;
  const RH = 19;
  for (let i = 1; i <= MEMBER_ROWS; i++) {
    cx = M;
    cols.forEach(([, w], c) => {
      if (c === 0) { p.rect(cx, y, w, RH, { stroke: LINE }); p.text(cx + 6, y + 6, String(i), 8, false, GREY); }
      else p.field(`member${i}_${keys[c]}`, cx, y, w, RH, { size: 8.5, tip: `Member ${i}: ${cols[c][0]}` });
      cx += w;
    });
    y += RH;
  }
  y += 14;
  y = p.section(y, "D.  SUPPORTING DOCUMENTS ATTACHED");
  y = p.para(M, y, W, "Tick each document attached. Copies must be certified (not older than 3 months).", 8.5, false, GREY) + 5;
  FORM_EVIDENCE.forEach((label, i) => {
    p.check(`evidence_${i + 1}`, M + 2, y, label);
    p.text(M + CHK + 10, y + 1, label, 9, i === 1);
    y += 15.5;
  });
  p.check("evidence_other", M + 2, y, "Other documents");
  p.text(M + CHK + 10, y + 1, "Other (list):", 9);
  p.field("evidence_other_list", M + CHK + 80, y - 3, W - CHK - 82, 16, { size: 9, tip: "Other documents attached" });

  /* ---------------- page 3: declaration + office use ---------------- */
  p = page(); y = M;
  y = p.section(y, "E.  DECLARATION BY THE APPLICANT");
  y = p.para(M, y, W, "I declare that the information in this application and the documents attached are true and correct to the best of my knowledge. "
    + "I understand that the CPA will verify this application, may ask for more documents or interview family members, and that false or misleading "
    + "information may lead to the application being rejected and may be a criminal offence. Lodging an application does not make anyone a member: "
    + "membership is decided by the CPA committee and, where the constitution requires it, the general meeting.", 9) + 8;
  p.check("popia_consent", M + 2, y, "POPIA consent");
  y = p.para(M + CHK + 10, y, W - CHK - 10, "I consent to the CPA processing the personal information in this application, including identity documents, "
    + "only to verify membership and keep the beneficiary register, as allowed by the Protection of Personal Information Act (POPIA).", 9) + 10;
  r = y;
  p.labelled("declaration_name", "Full name", M, r, col(0.5) - GAP / 2);
  y = p.labelled("declaration_place", "Place", M + col(0.5) + GAP / 2, r, col(0.5) - GAP / 2);
  r = y;
  p.labelled("declaration_signature", "Signature (sign by hand after printing, or add a digital signature)", M, r, col(0.62) - GAP / 2, 40);
  y = p.labelled("declaration_date", "Date", M + col(0.62) + GAP / 2, r, col(0.38) - GAP / 2);
  y = Math.max(y, r + 10 + 40 + 7) + 8;

  y = p.section(y, "F.  FOR OFFICE USE ONLY");
  const yn = (name, label, top) => {
    p.text(M, top + 1, label, 9);
    p.check(`${name}_yes`, M + 260, top, `${label}: Yes`); p.text(M + 275, top + 1, "Yes", 9);
    p.check(`${name}_no`, M + 320, top, `${label}: No`); p.text(M + 335, top + 1, "No", 9);
    return top + 17;
  };
  y = yn("office_affidavit", "Police affidavit received", y);
  y = yn("office_evidence_complete", "All required documents received", y);
  y = yn("office_family_confirmed", "Descent confirmed with the ODI family / representative", y);
  p.text(M, y + 1, "Committee decision", 9);
  [["office_recommended", "Recommended"], ["office_approved", "Approved"], ["office_rejected", "Rejected"]].forEach(([n, l], i) => {
    p.check(n, M + 140 + i * 105, y, l); p.text(M + 155 + i * 105, y + 1, l, 9);
  });
  y += 22;
  r = y;
  p.labelled("office_decision_date", "Decision date", M, r, third);
  p.labelled("office_resolution", "Meeting / resolution no.", M + third + GAP, r, third);
  y = p.labelled("office_added_on", "Added to the register on", M + 2 * (third + GAP), r, third);
  y = p.labelled("office_member_numbers", "Member numbers allocated", M, y, W);
  y = p.labelled("office_reasons", "Reasons for the decision / notes", M, y, W, 44, { multiline: true });
  r = y;
  p.labelled("office_chair", "Chairperson — name and signature", M, r, col(0.5) - GAP / 2, 30);
  p.labelled("office_secretary", "Secretary — name and signature", M + col(0.5) + GAP / 2, r, col(0.5) - GAP / 2, 30);

  /* ---------------- footer, pages, catalog ---------------- */
  if (o.onLayout) o.onLayout(pages.map((pg) => ({ bottom: pg.bottom, right: pg.right })), { width: PW, height: PH, margin: M, footerTop: PH - 34 });
  const pageNums = [];
  pages.forEach((pg, i) => {
    pg.hline(M, PW - M, PH - 30);
    const foot = `${cpa ? cpa + " · " : ""}Application for membership · Page ${i + 1} of ${pages.length}`;
    pg.text(M, PH - 26, foot.replace(/·/g, "-"), 7.5, false, GREY);
    const content = add(stream("", pg.ops.join("\n")));
    pageNums.push(add(`<< /Type /Page /Parent ${PAGES} 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents ${content} 0 R`
      + ` /Resources << /Font << /F1 ${HELV} 0 R /F2 ${HELVB} 0 R >> >> /Annots [${pg.annots.map((n) => n + " 0 R").join(" ")}] >>`));
  });
  objs[PAGES] = `<< /Type /Pages /Kids [${pageNums.map((n) => n + " 0 R").join(" ")}] /Count ${pageNums.length} >>`;
  objs[CATALOG] = `<< /Type /Catalog /Pages ${PAGES} 0 R /AcroForm << /Fields [${fields.map((n) => n + " 0 R").join(" ")}]`
    + ` /NeedAppearances true /DA (/Helv 0 Tf 0 g) /DR << /Font << /Helv ${HELV} 0 R /ZaDb ${ZADB} 0 R >> >> >> >>`;
  const INFO = add(`<< /Title ${pdfStr("Application for membership" + (cpa ? " - " + cpa : ""))} /Author ${pdfStr(cpa || "CPA360")} /Producer (CPA360) >>`);

  // serialise (every byte above is ASCII, so string length = byte length)
  let out = "%PDF-1.7\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [];
  for (let n = 1; n < objs.length; n++) { offsets[n] = out.length; out += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xref = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length} /Root ${CATALOG} 0 R /Info ${INFO} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // the header's four high bytes are the only non-ASCII characters: write them as single bytes
  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

export function fieldNames(bytes) {
  const s = new TextDecoder("latin1").decode(bytes);
  return [...s.matchAll(/\/T \(([^)]*)\)/g)].map((m) => m[1]);
}
