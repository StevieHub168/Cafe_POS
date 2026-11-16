import { QR_BORDER, QrDrawing, qrDrawing } from './qr';

export type LabelSize = '50x30' | '40x25';

export const LABEL_SIZES: { value: LabelSize; label: string; width: number; height: number }[] = [
  { value: '50x30', label: '50 × 30 mm', width: 50, height: 30 },
  { value: '40x25', label: '40 × 25 mm', width: 40, height: 25 },
];

export interface LabelItem {
  code: string;
  name: string;
  /** What is stuck on: the laptop itself or its charger (so the two never get mixed up). */
  kind: 'laptop' | 'charger';
  link: string;
}

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** How many labels fit on one A4 sheet (10 mm margins, 2 mm between labels). */
export function labelsPerPage(size: LabelSize): number {
  const s = LABEL_SIZES.find(x => x.value === size) ?? LABEL_SIZES[0];
  const columns = Math.floor((190 + 2) / (s.width + 2));
  const rows = Math.floor((277 + 2) / (s.height + 2));
  return columns * rows;
}

/** One label per laptop, or two (laptop + charger). `link` makes the address inside the QR. */
export function buildLabels(laptops: { code: string; name: string }[], perLaptop: 1 | 2, link: (code: string) => string): LabelItem[] {
  const labels: LabelItem[] = [];
  for (const laptop of laptops) {
    labels.push({ code: laptop.code, name: laptop.name, kind: 'laptop', link: link(laptop.code) });
    if (perLaptop === 2) labels.push({ code: laptop.code, name: laptop.name, kind: 'charger', link: link(laptop.code) });
  }
  return labels;
}

function labelHtml(label: LabelItem, drawing: QrDrawing, twoKinds: boolean): string {
  const total = drawing.size + QR_BORDER * 2;
  const tag = twoKinds
    ? `<span class="tag ${label.kind}">${label.kind === 'laptop' ? 'LAPTOP' : 'CHARGER'}</span>`
    : '';
  return `<div class="label">
  <svg viewBox="${-QR_BORDER} ${-QR_BORDER} ${total} ${total}" role="img" aria-label="QR code of ${esc(label.code)}"><rect x="${-QR_BORDER}" y="${-QR_BORDER}" width="${total}" height="${total}" fill="#fff"/><path d="${drawing.path}" fill="#000"/></svg>
  <div class="words">${tag}<div class="name">${esc(label.name)}</div><div class="code">${esc(label.code)}</div><div class="shop">ThaStore</div></div>
</div>`;
}

/**
 * The sheet of labels as ONE complete web page: the preview shows it, and printing prints exactly that page (A4 sticker paper,
 * every label the size picked). Kept apart from the app on purpose, so the app's own print rules (the invoice) never touch it.
 */
export function labelSheetHtml(labels: LabelItem[], size: LabelSize): string {
  const s = LABEL_SIZES.find(x => x.value === size) ?? LABEL_SIZES[0];
  const cache = new Map<string, QrDrawing>();
  const drawingOf = (link: string): QrDrawing => {
    let found = cache.get(link);
    if (!found) { found = qrDrawing(link); cache.set(link, found); }
    return found;
  };
  const twoKinds = new Set(labels.map(l => l.kind)).size > 1;
  const qr = s.height - 8;       // the picture is the height of the label minus the padding
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Labels</title>
<style>
@page { size: A4 portrait; margin: 10mm; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media screen { body { padding: 10mm; } }
.sheet { display: grid; grid-template-columns: repeat(auto-fill, ${s.width}mm); gap: 2mm; align-content: start; }
.label { width: ${s.width}mm; height: ${s.height}mm; padding: 3mm; display: flex; align-items: center; gap: 2.5mm; border: 0.2mm dashed #9ca3af; border-radius: 1.5mm; break-inside: avoid; overflow: hidden; }
.label svg { width: ${qr}mm; height: ${qr}mm; flex: none; display: block; }
.words { min-width: 0; display: flex; flex-direction: column; gap: 1mm; }
.tag { align-self: flex-start; font-size: 5.5pt; font-weight: 700; letter-spacing: 0.4pt; padding: 0.2mm 1.4mm; border-radius: 0.8mm; }
.tag.laptop { background: #000; color: #fff; }
.tag.charger { border: 0.3mm solid #000; color: #000; }
.name { font-size: ${s.width >= 50 ? 7 : 6}pt; font-weight: 600; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
.code { font-family: "Courier New", monospace; font-size: ${s.width >= 50 ? 10 : 8.5}pt; font-weight: 700; }
.shop { font-size: 5pt; color: #4b5563; }
</style></head>
<body><div class="sheet">
${labels.map(label => labelHtml(label, drawingOf(label.link), twoKinds)).join('\n')}
</div></body></html>`;
}
