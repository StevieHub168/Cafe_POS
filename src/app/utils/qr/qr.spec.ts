import jsQR from 'jsqr';
import * as QRCode from 'qrcode';
import { QR_BORDER, qrDrawing, qrPng } from './qr';

/** Draws the drawing as pixels (the way a printed label looks) so a QR reader can try to read it. */
function pixelsOf(drawing: ReturnType<typeof qrDrawing>, scale = 8): ImageData {
  const total = drawing.size + QR_BORDER * 2;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = total * scale;
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000';
  for (const run of drawing.runs) context.fillRect((run.x + QR_BORDER) * scale, (run.y + QR_BORDER) * scale, run.w * scale, scale);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

describe('qrDrawing (the QR code of a laptop)', () => {
  const LINK = 'https://thastore.example/l/LP-0042';

  it('is a REAL QR code: a QR reader reads the link back from it', () => {
    const image = pixelsOf(qrDrawing(LINK));
    expect(jsQR(image.data, image.width, image.height)?.data).toBe(LINK);
  });

  it('reads back every kind of laptop link (a long address, a Wi-Fi address with a port, capital letters)', () => {
    for (const link of ['http://192.168.1.20:4000/l/LP-0007', 'https://very-long-shop-name.example.com/some/path/l/LP-0119', 'https://thastore.example/l/LP-12345']) {
      const image = pixelsOf(qrDrawing(link));
      expect(jsQR(image.data, image.width, image.height)?.data).withContext(link).toBe(link);
    }
  });

  it('the squares are exactly the code of the library (nothing lost when rows are joined into runs)', () => {
    const drawing = qrDrawing(LINK);
    const reference = QRCode.create(LINK, { errorCorrectionLevel: 'M' }).modules;
    expect(drawing.size).toBe(reference.size);
    const dark = new Set(drawing.runs.flatMap(r => Array.from({ length: r.w }, (_, i) => `${r.x + i},${r.y}`)));
    let expected = 0;
    for (let y = 0; y < reference.size; y++) {
      for (let x = 0; x < reference.size; x++) {
        const on = !!reference.data[y * reference.size + x];
        if (on) expected++;
        expect(dark.has(`${x},${y}`)).withContext(`${x},${y}`).toBe(on);
      }
    }
    expect(dark.size).toBe(expected);
  });

  it('draws the path in one piece (the same squares as the runs)', () => {
    const drawing = qrDrawing(LINK);
    expect(drawing.path.split('M').length - 1).toBe(drawing.runs.length);
    expect(drawing.path.startsWith('M0 0h7')).toBeTrue();                       // the top-left corner mark starts the first row
  });

  it('another laptop is another code, and the same laptop always the same', () => {
    expect(qrDrawing('https://a.example/l/LP-0001').path).not.toBe(qrDrawing('https://a.example/l/LP-0002').path);
    expect(qrDrawing(LINK).path).toBe(qrDrawing(LINK).path);
  });
});

describe('qrPng (Download the QR picture)', () => {
  it('is a PNG picture of the code that a QR reader can read', async () => {
    const link = 'https://thastore.example/l/LP-0042';
    const blob = await qrPng(qrDrawing(link), 600);
    expect(blob.type).toBe('image/png');
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    expect(bitmap.width).toBe(bitmap.height);
    expect(bitmap.width).toBeGreaterThanOrEqual(400);
    expect(jsQR(image.data, image.width, image.height)?.data).toBe(link);
  });
});
