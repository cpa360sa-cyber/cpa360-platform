/* CPA360 — read a table out of a PDF (household registers, family-tree lists).
   · readPdf(buf)      — browser: loads pdf.js on demand and returns the positioned text of every page.
                         Digital PDFs (typed in Word/Excel and saved as PDF) are read right here on the
                         computer — nothing is uploaded. Scanned pages have no text and come back empty.
   · itemsToTable(pages) — pure: turns positioned text into rows × columns (cells on a line, columns found
                         by where cells start, wrapped lines folded back into their row). Unit-tested. */

const PDFJS = "3.11.174";
let lib = null;

export async function loadPdfJs() {
  if (lib) return lib;
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.min.js`;
      s.onload = res; s.onerror = () => rej(new Error("The PDF reader couldn't be loaded — check your internet connection and try again."));
      document.head.appendChild(s);
    });
  }
  lib = window.pdfjsLib;
  // a cross-origin worker is not allowed directly; a tiny same-origin blob that imports it is
  lib.GlobalWorkerOptions.workerSrc = URL.createObjectURL(new Blob([`importScripts("https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS}/build/pdf.worker.min.js");`], { type: "text/javascript" }));
  return lib;
}

/** → { numPages, pages: [[{ s, x, y, w, h }]] } (positions in PDF points, y grows upward) */
export async function readPdf(buf, onPage) {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    pages.push(textItems(tc.items));
    if (onPage) onPage(p, doc.numPages);
  }
  return { numPages: doc.numPages, pages };
}
export const textItems = (items) => items.filter((i) => i && typeof i.str === "string" && i.str.trim())
  .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || i.str.length * 4, h: Math.abs(i.transform[3]) || i.height || 10 }));

const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** Group items into lines (top to bottom) and each line into cells (left to right). */
function pageLines(items) {
  const medH = median(items.map((i) => i.h)) || 10;
  const lineTol = Math.max(2, medH * 0.45);
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const L = lines[lines.length - 1];
    if (L && Math.abs(L.y - it.y) <= lineTol) { L.items.push(it); L.y = (L.y * (L.items.length - 1) + it.y) / L.items.length; }
    else lines.push({ y: it.y, items: [it] });
  }
  const gap = Math.max(4, medH * 0.9);
  lines.forEach((L) => {
    L.items.sort((a, b) => a.x - b.x);
    const cells = [];
    for (const it of L.items) {
      const c = cells[cells.length - 1];
      if (c && it.x - c.x1 < gap) { c.text += (it.x - c.x1 > medH * 0.12 ? " " : "") + it.s; c.x1 = it.x + it.w; }
      else cells.push({ text: it.s, x0: it.x, x1: it.x + it.w });
    }
    L.cells = cells.map((c) => ({ ...c, text: c.text.replace(/\s+/g, " ").trim() })).filter((c) => c.text);
  });
  return { lines: lines.filter((L) => L.cells.length), medH };
}

/** Column start positions: x values where many lines start a cell (clustered). */
function anchorsOf(lines, medH) {
  const tol = Math.max(6, medH * 0.8), xs = [];
  lines.forEach((L) => L.cells.forEach((c) => xs.push(c.x0)));
  xs.sort((a, b) => a - b);
  const groups = [];
  for (const x of xs) {
    const g = groups[groups.length - 1];
    if (g && x - g[g.length - 1] <= tol) g.push(x); else groups.push([x]);
  }
  const need = Math.max(2, Math.round(lines.length * 0.2));
  return groups.filter((g) => g.length >= need).map((g) => median(g));
}

/** pages (from readPdf) → { rows: string[][], columns, quality } */
export function itemsToTable(pages) {
  const all = [];
  let ncols = 0;
  const perPage = pages.map((items) => {
    if (!items.length) return null;
    const { lines, medH } = pageLines(items);
    const body = lines.filter((L) => !(L.cells.length === 1 && /^(page\s+\d+(\s+of\s+\d+)?|\d+\s*\/\s*\d+|-\s*\d+\s*-)$/i.test(L.cells[0].text)));
    return { lines: body, medH, anchors: anchorsOf(body, medH) };
  });
  // use the richest page's columns for every page (continuation pages of one table)
  const ref = perPage.filter(Boolean).sort((a, b) => b.anchors.length - a.anchors.length)[0];
  if (!ref || ref.anchors.length < 2) return { rows: [], columns: 0, quality: 0 };
  const anchors = ref.anchors; ncols = anchors.length;
  const tol = Math.max(6, ref.medH * 0.8);
  const colOf = (x0) => { let k = 0; for (let i = 0; i < anchors.length; i++) if (anchors[i] <= x0 + tol) k = i; return k; };
  let regular = 0, total = 0, prevY = null, prev = null;
  perPage.forEach((pg) => {
    if (!pg) return;
    prevY = null; prev = null;
    pg.lines.forEach((L) => {
      const row = new Array(ncols).fill("");
      L.cells.forEach((c) => { const k = colOf(c.x0); row[k] = row[k] ? row[k] + " " + c.text : c.text; });
      const filled = row.filter(Boolean).length;
      total++; if (filled >= Math.ceil(ncols * 0.5)) regular++;
      // a wrapped line: tight under the previous row, nothing in the first column, only in columns the row above also uses
      const wraps = prev && !row[0] && prev[0] && prevY != null && (prevY - L.y) < pg.medH * 1.8 && row.every((v, i) => !v || prev[i]);
      if (wraps) row.forEach((v, i) => { if (v) prev[i] += " " + v; });
      else { all.push(row); prev = row; }
      prevY = L.y;
    });
  });
  // titles above the table (a single cell on the line) are not part of it
  while (all.length > 1 && all[0].filter(Boolean).length <= 1) all.shift();
  // a header repeated at the top of each page → keep only the first
  const first = all[0] ? all[0].join("|").toLowerCase() : "";
  const rows = all.filter((r, i) => i === 0 || r.join("|").toLowerCase() !== first);
  return { rows, columns: ncols, quality: total ? regular / total : 0 };
}
