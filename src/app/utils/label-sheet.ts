import { QR_BORDER, QrDrawing, qrDrawing } from './qr';

export type LabelSize = '60x40' | '40x30';

/** Where the labels are printed: a roll in a label printer (one label on each page) or an A4 sheet of stickers. */
export type LabelPaper = 'roll' | 'sheet';

/** How a label is laid out: millimetres for lengths, points for text. */
interface Layout {
  /** Space between the label's edge and what is inside: left and right / above and below. */
  padding: number;
  padY: number;
  /** The QR picture (a square). */
  qr: number;
  /** Between the QR and the words. */
  gap: number;
  /** The LAPTOP / CHARGER tag. */
  tag: number;
  name: number;
  code: number;
  /** Extra space above and below the code, so it stands apart from the name and the specs. */
  codeSpace: number;
  /** Between the tag, the name, the code, the specs and the price. */
  wordsGap: number;
  specs: number;
  price: number;
  /** The three boxes to tick under the QR (Sold, Book, Repair): the square, its text, the least space between two of them. */
  box: number;
  tick: number;
  tickGap: number;
  /** How many spec lines fit under the name, the code and the price: without / with the LAPTOP / CHARGER tag. */
  maxSpecs: number;
  maxSpecsWithTag: number;
  /** How much bigger the labels are shown in the preview of a roll (the printed page is not changed). */
  zoom: number;
}

export interface LabelSizeInfo { value: LabelSize; label: string; width: number; height: number; layout: Layout }

export const LABEL_SIZES: LabelSizeInfo[] = [
  { value: '60x40', label: '60 × 40 mm', width: 60, height: 40,
    layout: { padding: 2.5, padY: 2.5, qr: 23, gap: 2, tag: 7, name: 10, code: 10, codeSpace: 1, wordsGap: 0.6, specs: 8.5, price: 13, box: 3.2, tick: 7, tickGap: 2, maxSpecs: 5, maxSpecsWithTag: 4, zoom: 1.4 } },
  { value: '40x30', label: '40 × 30 mm', width: 40, height: 30,
    layout: { padding: 2.5, padY: 2.5, qr: 17, gap: 1.8, tag: 5.5, name: 6.5, code: 7.5, codeSpace: 0.5, wordsGap: 0.8, specs: 4.8, price: 8, box: 2.5, tick: 5.5, tickGap: 1.2, maxSpecs: 4, maxSpecsWithTag: 4, zoom: 2 } },
];

export interface LabelItem {
  code: string;
  name: string;
  /** What is stuck on: the laptop itself or its charger (so the two never get mixed up). */
  kind: 'laptop' | 'charger';
  link: string;
  /** The laptop's specs, one short line each ("Ryzen 5 8645HS", "Ram 16GB DDR5", "SSD 512GB"). The laptop and the charger label both have them. */
  specs: string[];
  /** The selling price as text ("$1,049"), '' = none. */
  price: string;
}

const esc = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const PX_PER_MM = 96 / 25.4;
/** White space around the labels on screen, and between two labels (mm). */
const PAGE_PADDING_MM = 10;
const LABEL_GAP_MM = 2;

/**
 * The page the preview of a LABEL ROLL needs, in screen pixels: the labels one under the other (each one prints on its own page),
 * shown bigger than they print (`zoom`). The preview box takes its shape and its size from this, so no empty paper is shown.
 */
export function rollPreviewSize(size: LabelSize, count: number): { width: number; height: number } {
  const s = LABEL_SIZES.find(x => x.value === size) ?? LABEL_SIZES[0];
  const rows = Math.max(1, count);
  const widthMm = s.width + 2 * PAGE_PADDING_MM;
  const heightMm = 2 * PAGE_PADDING_MM + rows * s.height + (rows - 1) * LABEL_GAP_MM;
  return { width: Math.ceil(widthMm * PX_PER_MM * s.layout.zoom), height: Math.ceil(heightMm * PX_PER_MM * s.layout.zoom) };
}

/** How many labels fit on one A4 sheet (10 mm margins, 2 mm between labels). */
export function labelsPerPage(size: LabelSize): number {
  const s = LABEL_SIZES.find(x => x.value === size) ?? LABEL_SIZES[0];
  const columns = Math.floor((190 + 2) / (s.width + 2));
  const rows = Math.floor((277 + 2) / (s.height + 2));
  return columns * rows;
}

/** The specs written in a product ("Chip M3\nRam 8GB | Storage 512GB") as short lines: "Chip M3", "Ram 8GB", "Storage 512GB". */
export function specLines(description: string | null | undefined): string[] {
  return (description ?? '').split(/\n|\|/).map(line => line.trim()).filter(line => line !== '');
}

/** One label per laptop, or two (laptop + charger). `link` makes the address inside the QR. Both labels have the specs and the price. */
export function buildLabels(laptops: { code: string; name: string; specs?: string[]; price?: string }[], perLaptop: 1 | 2, link: (code: string) => string): LabelItem[] {
  const labels: LabelItem[] = [];
  for (const laptop of laptops) {
    labels.push({ code: laptop.code, name: laptop.name, kind: 'laptop', link: link(laptop.code), specs: laptop.specs ?? [], price: laptop.price ?? '' });
    if (perLaptop === 2) labels.push({ code: laptop.code, name: laptop.name, kind: 'charger', link: link(laptop.code), specs: laptop.specs ?? [], price: laptop.price ?? '' });
  }
  return labels;
}

function labelHtml(label: LabelItem, drawing: QrDrawing, twoKinds: boolean, maxSpecs: number): string {
  const total = drawing.size + QR_BORDER * 2;
  const tag = twoKinds
    ? `<span class="tag ${label.kind}">${label.kind === 'laptop' ? 'LAPTOP' : 'CHARGER'}</span>`
    : '';
  const specs = label.specs.slice(0, maxSpecs);
  const specsHtml = specs.length ? `<div class="specs">${specs.map(line => `<div>${esc(line)}</div>`).join('')}</div>` : '';
  const priceHtml = label.price ? `<div class="price">${esc(label.price)}</div>` : '';
  // Under the QR: three empty boxes to tick with a pen (sold / booked / in repair), so the state can be seen at a glance without scanning.
  const ticks = `<div class="ticks"><span><i></i>Sold</span><span><i></i>Book</span><span><i></i>Repair</span></div>`;
  return `<div class="label">
  <div class="left"><svg viewBox="${-QR_BORDER} ${-QR_BORDER} ${total} ${total}" role="img" aria-label="QR code of ${esc(label.code)}"><rect x="${-QR_BORDER}" y="${-QR_BORDER}" width="${total}" height="${total}" fill="#fff"/><path d="${drawing.path}" fill="#000"/></svg>${ticks}</div>
  <div class="words">${tag}<div class="name">${esc(label.name)}</div><div class="code">${esc(label.code)}</div>${specsHtml}${priceHtml}</div>
</div>`;
}

/**
 * The labels as ONE complete web page: the preview shows it, and printing prints exactly that page. Kept apart from the app on
 * purpose, so the app's own print rules (the invoice) never touch it.
 *   'sheet' = A4 sticker paper, every label the size picked, side by side.
 *   'roll'  = a label printer: the page IS one label (e.g. 40 x 30 mm) and every label is its own page. The preview still shows
 *             them one under the other (`rollPreviewSize` is that page), so you can see them all.
 */
export function labelSheetHtml(labels: LabelItem[], size: LabelSize, paper: LabelPaper = 'sheet'): string {
  const s = LABEL_SIZES.find(x => x.value === size) ?? LABEL_SIZES[0];
  const l = s.layout;
  const cache = new Map<string, QrDrawing>();
  const drawingOf = (link: string): QrDrawing => {
    let found = cache.get(link);
    if (!found) { found = qrDrawing(link); cache.set(link, found); }
    return found;
  };
  const twoKinds = new Set(labels.map(x => x.kind)).size > 1;
  const maxSpecs = twoKinds ? l.maxSpecsWithTag : l.maxSpecs;
  // A label that is exactly as high as the page can push an empty page out of a printer, so on a roll it is a hair smaller.
  // (On screen the labels are shown bigger, so the preview can be read; the printed page is not changed.)
  const rollRules = `@media screen { body { zoom: ${l.zoom}; } }
@media print {
  @page { size: ${s.width}mm ${s.height}mm; margin: 0; }
  body { padding: 0; }
  .sheet { display: block; }
  .label { height: ${s.height - 0.3}mm; border: 0; border-radius: 0; break-after: page; page-break-after: always; }
  .label:last-child { break-after: auto; page-break-after: auto; }
}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Labels</title>
<style>
${paper === 'roll' ? '' : '@page { size: A4 portrait; margin: 10mm; }\n'}* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; color: #000; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
@media screen { body { padding: ${PAGE_PADDING_MM}mm; } }
.sheet { display: grid; grid-template-columns: repeat(auto-fill, ${s.width}mm); gap: ${LABEL_GAP_MM}mm; align-content: start; }
.label { width: ${s.width}mm; height: ${s.height}mm; padding: ${l.padY}mm ${l.padding}mm; display: flex; align-items: center; gap: ${l.gap}mm; border: 0.2mm dashed #9ca3af; border-radius: 1.5mm; break-inside: avoid; overflow: hidden; }
.left { flex: none; display: flex; flex-direction: column; gap: 0.8mm; }
.left svg { width: ${l.qr}mm; height: ${l.qr}mm; display: block; }
.ticks { width: ${l.qr}mm; display: flex; justify-content: space-between; gap: ${l.tickGap}mm; align-items: flex-start; font-size: ${l.tick}pt; line-height: 1; white-space: nowrap; }
.ticks span { display: flex; flex-direction: column; align-items: center; gap: 0.5mm; }
.ticks i { width: ${l.box}mm; height: ${l.box}mm; border: 0.3mm solid #000; border-radius: 0.3mm; display: block; }
.words { min-width: 0; display: flex; flex-direction: column; gap: ${l.wordsGap}mm; }
.tag { align-self: flex-start; font-size: ${l.tag}pt; font-weight: 700; letter-spacing: 0.07em; padding: 0.1em 0.72em; border-radius: 0.4em; }
.tag.laptop { background: #000; color: #fff; }
.tag.charger { border: 0.15em solid #000; color: #000; }
.name { font-size: ${l.name}pt; font-weight: 600; line-height: 1.2; max-height: 2.4em; overflow: hidden; }
.code { font-family: "Courier New", monospace; font-size: ${l.code}pt; font-weight: 700; line-height: 1; margin: ${l.codeSpace}mm 0; }
.specs { font-size: ${l.specs}pt; line-height: 1.1; }
.specs div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.price { font-size: ${l.price}pt; font-weight: 700; line-height: 1.1; }
${paper === 'roll' ? rollRules + '\n' : ''}</style></head>
<body><div class="sheet">
${labels.map(label => labelHtml(label, drawingOf(label.link), twoKinds, maxSpecs)).join('\n')}
</div></body></html>`;
}
