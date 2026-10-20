/* CPA360 — a tiny PDF writer for "one picture per page" documents (the family-tree downloads).
   Each page holds a JPEG scaled to fit; JPEG data goes in untouched (DCTDecode), so there is no library and no
   fonts to embed — the text is already in the picture. Pure (Uint8Array in, Uint8Array out) so it is unit-tested. */

const enc = new TextEncoder();
const cat = (parts) => { let n = 0; parts.forEach((p) => (n += p.length)); const out = new Uint8Array(n); let o = 0; parts.forEach((p) => { out.set(p, o); o += p.length; }); return out; };

/** JPEG bytes → { w, h } read from its SOF marker (no decoding needed). */
export function jpegSize(b) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  throw new Error("Not a JPEG picture");
}

/** pages: [{ jpeg: Uint8Array, pageW?: pt, pageH?: pt, margin?: pt }] — page size defaults to the picture at 0.75 pt/px.
    → PDF bytes.  A picture is scaled to fit the page (never cropped) and centred. */
export function makePdf(pages, { title = "Family trees", author = "CPA360" } = {}) {
  const parts = []; const offsets = []; let size = 0;
  const push = (x) => { const b = typeof x === "string" ? enc.encode(x) : x; parts.push(b); size += b.length; };
  const obj = (n, body) => { offsets[n] = size; push(`${n} 0 obj\n`); push(body); push("\nendobj\n"); };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const n = pages.length, pageObj = (i) => 3 + i * 3, contentObj = (i) => 4 + i * 3, imgObj = (i) => 5 + i * 3, infoObj = 3 + n * 3;
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pages.map((_, i) => pageObj(i) + " 0 R").join(" ")}] /Count ${n} >>`);
  pages.forEach((pg, i) => {
    const { w, h } = jpegSize(pg.jpeg);
    const pw = pg.pageW || Math.round(w * 0.75), ph = pg.pageH || Math.round(h * 0.75), m = pg.margin == null ? 0 : pg.margin;
    const k = Math.min((pw - 2 * m) / w, (ph - 2 * m) / h), iw = w * k, ih = h * k, x = (pw - iw) / 2, y = (ph - ih) / 2;
    const content = `q ${iw.toFixed(2)} 0 0 ${ih.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q`;
    obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${imgObj(i)} 0 R >> >> /Contents ${contentObj(i)} 0 R >>`);
    obj(contentObj(i), `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    offsets[imgObj(i)] = size;
    push(`${imgObj(i)} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${pg.jpeg.length} >>\nstream\n`);
    push(pg.jpeg); push("\nendstream\nendobj\n");
  });
  const clean = (s) => String(s).replace(/[()\\\r\n]/g, " ").replace(/[^\x20-\x7e]/g, "?");
  obj(infoObj, `<< /Title (${clean(title)}) /Author (${clean(author)}) /Producer (CPA360) >>`);
  const xref = size, total = infoObj + 1;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
  push(x + `trailer\n<< /Size ${total} /Root 1 0 R /Info ${infoObj} 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return cat(parts);
}
