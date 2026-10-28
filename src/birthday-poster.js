/* CPA360 — Birthday shoutout poster (Beneficiaries → Birthdays → "Birthday shoutout").
   Builds a 1080 × 1920 poster (the 9:16 shape of a WhatsApp Status) that lists everyone whose birthday it is, with their
   ages, in the CPA's colours and logo. WhatsApp offers no way for software to publish a Status, so the platform makes
   the picture and the person posts it from the phone (the UI hands it to WhatsApp's share sheet, or downloads it).
   Pure functions (no DOM, no network) so they can be unit-tested; birthday-poster-ui.js does the dialog.
   · splitPosters()   more than MAX_PER_POSTER people → several balanced posters ("1 of 2", "2 of 2")
   · cardMetrics()    the size of each name card for n people, so 1 person is big and 8 still fit
   · posterSvg()      the poster itself as SVG text
   · captionText()    the caption to paste under the Status */
export const W = 1080, H = 1920, MAX_PER_POSTER = 8;

/* Greeting lines. English is the reference; the isiZulu and siSwati lines are best-effort wording and are editable in the
   dialog before anything is posted — have a first-language speaker confirm them once. */
export const GREETINGS = {
  en: { label: "English", text: "Happy Birthday!" },
  zu: { label: "isiZulu", text: "Usuku lokuzalwa oluhle!" },
  ss: { label: "siSwati", text: "Lusuku lwekutalwa lolumnandzi!" },
};
export const WISH = "Wishing you good health and a blessed year ahead.";
const FONT = "'Public Sans','Segoe UI',Helvetica,Arial,sans-serif";
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Balanced split: 9 people → 5 + 4, not 8 + 1. */
export function splitPosters(people, max = MAX_PER_POSTER) {
  const n = people.length;
  if (!n) return [];
  const pages = Math.ceil(n / max), per = Math.ceil(n / pages), out = [];
  for (let i = 0; i < n; i += per) out.push(people.slice(i, i + per));
  return out;
}

/** Card geometry for n people in the space between the headline and the footer. */
export function cardMetrics(n, availH) {
  const gap = n <= 3 ? 34 : n <= 5 ? 24 : 16;
  const rowH = Math.max(88, Math.min(n <= 1 ? 330 : n <= 3 ? 250 : 200, Math.floor((availH - gap * (n - 1)) / Math.max(1, n))));
  return { gap, rowH, nameSize: Math.round(Math.min(78, rowH * 0.36)), ageSize: Math.round(Math.min(84, rowH * 0.46)), total: rowH * n + gap * (n - 1) };
}

/** Largest font size (≤ max) at which `text` fits `width` using a conservative glyph-width estimate
 *  (`glyph` = average glyph width as a fraction of the font size; `spacing` = letter-spacing in px). */
export function fitSize(text, width, max, min = 28, glyph = 0.56, spacing = 0) {
  const n = Math.max(1, String(text).length);
  return Math.max(min, Math.min(max, Math.floor((width / n - spacing) / glyph)));
}

/* deterministic confetti — the same people give the same poster every time */
function confetti(th, seed) {
  let s = seed || 7;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const cols = [th.accent, "#ffffff", th.secondary, "#f3c969", "#ffffff"];
  let out = "";
  for (let i = 0; i < 70; i++) {
    const x = Math.round(rnd() * W), y = Math.round(rnd() * H), c = cols[i % cols.length], o = (0.16 + rnd() * 0.3).toFixed(2), r = Math.round(rnd() * 360);
    out += i % 3 === 0 ? `<circle cx="${x}" cy="${y}" r="${6 + Math.round(rnd() * 8)}" fill="${c}" fill-opacity="${o}"/>`
      : `<rect x="${x}" y="${y}" width="${10 + Math.round(rnd() * 16)}" height="${6 + Math.round(rnd() * 8)}" rx="2" fill="${c}" fill-opacity="${o}" transform="rotate(${r} ${x} ${y})"/>`;
  }
  return out;
}
function balloon(cx, cy, r, fill, th) {
  return `<g><path d="M${cx} ${cy + r * 1.25} C ${cx - 14} ${cy + r * 1.6}, ${cx + 16} ${cy + r * 1.9}, ${cx} ${cy + r * 2.3}" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="3"/>
    <ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 1.25}" fill="${fill}"/><ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.45}" rx="${r * 0.22}" ry="${r * 0.38}" fill="#fff" fill-opacity=".38" transform="rotate(-25 ${cx - r * 0.35} ${cy - r * 0.45})"/>
    <path d="M${cx - 9} ${cy + r * 1.25 + 7} L${cx} ${cy + r * 1.25 - 2} L${cx + 9} ${cy + r * 1.25 + 7} Z" fill="${fill}"/></g>`;
}
const star = (cx, cy, r, fill) => { let d = ""; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; d += (i ? "L" : "M") + (cx + rr * Math.cos(a)).toFixed(1) + " " + (cy + rr * Math.sin(a)).toFixed(1); } return `<path d="${d}Z" fill="${fill}"/>`; };

/** o: { people:[{name, age}], theme, cpaName, logo?, dateLabel, greetings:[line, line…] (the first is the big one), wish?, showAges, page?, pages?, seed? }
 *  → { width, height, svg } */
export function posterSvg(o) {
  const th = o.theme, people = o.people || [], pad = 70;
  const lines = (o.greetings && o.greetings.length ? o.greetings : [GREETINGS.en.text]).map((s) => String(s).trim()).filter(Boolean);
  const headH = 620 + Math.max(0, lines.length - 1) * 70 + (o.wish === "" ? 0 : 40);
  const footH = 290, y0 = headH + 40, availH = H - footH - y0;
  const m = cardMetrics(Math.max(1, people.length), availH);
  const top = y0 + Math.max(0, Math.round((availH - m.total) / 2));
  const bigSize = fitSize(lines[0], W - 2 * pad, 150, 70);

  const logo = o.logo ? `<rect x="${W / 2 - 78}" y="70" width="156" height="156" rx="30" fill="#fff"/><image href="${esc(o.logo)}" x="${W / 2 - 66}" y="82" width="132" height="132" preserveAspectRatio="xMidYMid meet"/>`
    : `<circle cx="${W / 2}" cy="148" r="78" fill="rgba(255,255,255,.16)"/>${star(W / 2, 148, 46, th.accent)}`;
  const greet = lines.map((t, i) => {
    const size = i === 0 ? bigSize : fitSize(t, W - 2 * pad, 60, 34);
    const y = i === 0 ? 470 : 470 + 70 * i + (i === 1 ? 6 : 0);
    return `<text x="${W / 2}" y="${y}" text-anchor="middle" font-size="${size}" font-weight="${i === 0 ? 800 : 600}" ${i ? 'font-style="italic" fill-opacity=".92"' : ""} fill="#fff" font-family="${FONT}">${esc(t)}</text>`;
  }).join("");
  const wishY = 470 + 70 * (lines.length - 1) + 78;

  const cards = people.map((p, i) => {
    const y = top + i * (m.rowH + m.gap), x = pad, w = W - 2 * pad, badge = Math.round(m.rowH * 0.78), badgeCx = x + w - badge / 2 - 26, cy = y + m.rowH / 2;
    const room = w - 60 - (o.showAges === false ? 0 : badge + 40), name = String(p.name || "").trim();
    const sz = fitSize(name, room, m.nameSize, 30), tooWide = name.length * sz * 0.56 > room;
    return `<g><rect x="${x}" y="${y}" width="${w}" height="${m.rowH}" rx="30" fill="#fff" fill-opacity=".97"/><rect x="${x}" y="${y}" width="16" height="${m.rowH}" rx="8" fill="${th.accent}"/>
      <text x="${x + 52}" y="${cy + sz * 0.34}" font-size="${sz}" font-weight="800" fill="${th.ink}" font-family="${FONT}"${tooWide ? ` textLength="${room}" lengthAdjust="spacingAndGlyphs"` : ""}>${esc(name)}</text>
      ${o.showAges === false ? "" : `<circle cx="${badgeCx}" cy="${cy}" r="${badge / 2}" fill="${th.primary}"/><circle cx="${badgeCx}" cy="${cy}" r="${badge / 2 - 6}" fill="none" stroke="${th.accent}" stroke-width="4"/>
      <text x="${badgeCx}" y="${cy + (m.rowH >= 140 ? m.ageSize * 0.2 : m.ageSize * 0.34)}" text-anchor="middle" font-size="${m.ageSize}" font-weight="800" fill="#fff" font-family="${FONT}">${esc(p.age)}</text>
      ${m.rowH >= 140 ? `<text x="${badgeCx}" y="${cy + badge / 2 - 14}" text-anchor="middle" font-size="${Math.round(badge * 0.15)}" font-weight="700" letter-spacing="2" fill="#fff" fill-opacity=".85" font-family="${FONT}">YEARS</text>` : ""}`}</g>`;
  }).join("");

  const pageNote = o.pages > 1 ? `<text x="${W - pad}" y="${H - 52}" text-anchor="end" font-size="28" fill="#fff" fill-opacity=".8" font-family="${FONT}">${o.page || 1} of ${o.pages}</text>` : "";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="${th.primary}"/><stop offset="1" stop-color="${th.secondary}"/></linearGradient></defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>${confetti(th, o.seed || 7)}
  ${balloon(110, 150, 54, th.accent, th)}${balloon(205, 235, 42, "#ffffff", th)}${balloon(W - 110, 150, 52, "#ffffff", th)}${balloon(W - 205, 235, 40, th.accent, th)}
  ${logo}
  <text x="${W / 2}" y="290" text-anchor="middle" font-size="${fitSize(String(o.cpaName || ""), W - 2 * pad, 30, 18, 0.7, 6)}" font-weight="800" letter-spacing="6" fill="#fff" fill-opacity=".85" font-family="${FONT}">${esc(String(o.cpaName || "").toUpperCase())}</text>
  ${greet}
  ${o.wish === "" ? "" : `<text x="${W / 2}" y="${wishY}" text-anchor="middle" font-size="${fitSize(o.wish || WISH, W - 2 * pad, 34, 22)}" fill="#fff" fill-opacity=".9" font-family="${FONT}">${esc(o.wish || WISH)}</text>`}
  <rect x="${pad}" y="${headH - 22}" width="${W - 2 * pad}" height="5" rx="2.5" fill="${th.accent}"/>
  ${cards}
  <rect x="${pad}" y="${H - footH + 46}" width="${W - 2 * pad}" height="3" fill="#fff" fill-opacity=".35"/>
  <text x="${W / 2}" y="${H - 160}" text-anchor="middle" font-size="${fitSize("With love from " + (o.cpaName || "your CPA"), W - 2 * pad, 46, 24, 0.62)}" font-weight="700" fill="#fff" font-family="${FONT}">${esc("With love from " + (o.cpaName || "your CPA"))}</text>
  <text x="${W / 2}" y="${H - 104}" text-anchor="middle" font-size="30" fill="#fff" fill-opacity=".85" font-family="${FONT}">${esc(o.dateLabel || "")}</text>
  ${pageNote}</svg>`;
  return { width: W, height: H, svg };
}

export function captionText(people, cpaName, dateLabel, showAges) {
  const list = people.map((p) => (showAges === false ? p.name : `${p.name} (${p.age})`)).join(", ");
  return `🎉 Happy Birthday to ${list}! ${WISH} — ${cpaName || "Your CPA"}${dateLabel ? " · " + dateLabel : ""}`;
}

/** DOM only (not unit-tested): the SVG as a PNG blob. */
export async function posterPng(p) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error("The poster couldn't be drawn")); img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(p.svg); });
  const c = document.createElement("canvas"); c.width = p.width; c.height = p.height;
  c.getContext("2d").drawImage(img, 0, 0, p.width, p.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't create the picture"))), "image/png"));
}
