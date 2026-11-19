import * as QRCode from 'qrcode';

/** A QR code as plain squares: `runs` are the dark squares (a row of x..x+w), `path` draws them all as one SVG shape. */
export interface QrDrawing {
  /** Squares along one side (without the white border). */
  size: number;
  runs: { x: number; y: number; w: number }[];
  /** SVG path data in "square" units: draw it in a viewBox of `-border -border size+2*border size+2*border`. */
  path: string;
}

/** The white border round a QR code, in squares (the scanner needs it: 4 is the rule, 2 still scans and saves label space). */
export const QR_BORDER = 2;

/**
 * Makes the QR code of a text (a laptop link). It is a REAL code any phone camera reads. Medium error correction: a scratched or
 * dirty sticker still scans.
 */
export function qrDrawing(text: string): QrDrawing {
  const code = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const size = code.modules.size;
  const data = code.modules.data;
  const runs: QrDrawing['runs'] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) { x++; continue; }
      let w = 1;
      while (x + w < size && data[y * size + x + w]) w++;
      runs.push({ x, y, w });
      x += w;
    }
  }
  return { size, runs, path: runs.map(r => `M${r.x} ${r.y}h${r.w}v1h-${r.w}z`).join('') };
}

/** The QR code as a PNG picture (black on white, with its white border), `pixels` wide: for "Download the QR picture". */
export function qrPng(drawing: QrDrawing, pixels = 800): Promise<Blob> {
  const total = drawing.size + QR_BORDER * 2;
  const scale = Math.max(1, Math.floor(pixels / total));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = total * scale;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('The picture could not be made'));
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  for (const run of drawing.runs) context.fillRect((run.x + QR_BORDER) * scale, (run.y + QR_BORDER) * scale, run.w * scale, scale);
  return new Promise((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('The picture could not be made'))), 'image/png'));
}
