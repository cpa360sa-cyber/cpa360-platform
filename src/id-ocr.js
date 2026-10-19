/* CPA360 — read text off a photo / scan of an ID copy, on this computer.
   Uses Tesseract (OCR) loaded on demand; the picture never leaves the browser. Printed ID cards and ID
   books read reasonably well; handwriting, glare and blur don't — that's what the "Read with AI" option and
   the manual form are for. Everything read is only a SUGGESTION that the person adding the member checks. */
import { loadPdfJs } from "./pdf-table.js";

const TJS = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
let loading = null;
function loadTesseract() {
  if (window.Tesseract) return Promise.resolve(window.Tesseract);
  return (loading ||= new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = TJS; s.onload = () => res(window.Tesseract);
    s.onerror = () => { loading = null; rej(new Error("The on-device reader couldn't be loaded — check your internet connection, or type the details in.")); };
    document.head.appendChild(s);
  }));
}

/** A File (picture or PDF) → a JPEG blob ≤ 2200px — the form every step below works from. PDFs: first page. */
export async function toPicture(file, max = 2200) {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    const pdfjs = await loadPdfJs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await doc.getPage(1), vp0 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: Math.min(3, max / Math.max(vp0.width, vp0.height)) });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: cx, viewport: vp }).promise;
    return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
  }
  let bmp;
  try { bmp = await createImageBitmap(file); } catch (e) { throw new Error(`“${file.name}” couldn't be opened as a picture (iPhone HEIC photos need to be shared as JPG, or take the photo again).`); }
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(bmp.width * k)); c.height = Math.max(1, Math.round(bmp.height * k));
  const cx = c.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, c.width, c.height); cx.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob(res, "image/jpeg", 0.9));
}

/** Greyscale + stretch the contrast; small pictures are enlarged (OCR wants text ≥ ~30px tall). */
async function enhance(blob) {
  const bmp = await createImageBitmap(blob);
  const up = bmp.width < 1400 ? 1400 / bmp.width : 1;
  const c = document.createElement("canvas"); c.width = Math.round(bmp.width * up); c.height = Math.round(bmp.height * up);
  const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(bmp, 0, 0, c.width, c.height);
  const img = cx.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0; d[i] = d[i + 1] = d[i + 2] = g; hist[g]++; }
  const n = c.width * c.height; let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.02) { lo = v; break; } }
  acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= n * 0.02) { hi = v; break; } }
  const span = Math.max(40, hi - lo);
  for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / span)); d[i] = d[i + 1] = d[i + 2] = v; }
  cx.putImageData(img, 0, 0);
  return c;
}

/** → plain text from one or more picture blobs (every picture, two reading modes each). */
export async function ocrText(blobs, onStatus) {
  const T = await loadTesseract();
  const say = (t) => { if (onStatus) onStatus(t); };
  say("Loading the reader… the first time takes a moment.");
  const worker = await T.createWorker("eng", 1, { logger: (m) => { if (m.status === "recognizing text") say(`Reading… ${Math.round((m.progress || 0) * 100)}%`); else if (/loading|initializ/i.test(m.status || "")) say("Loading the reader… the first time takes a moment."); } });
  let text = "";
  try {
    for (const b of blobs) {
      const canvas = await enhance(b);
      for (const psm of ["6", "11"]) {
        await worker.setParameters({ tessedit_pageseg_mode: psm });
        const r = await worker.recognize(canvas);
        text += "\n" + (r.data.text || "");
      }
    }
  } finally { try { await worker.terminate(); } catch (e) { /* ignore */ } }
  return text;
}
