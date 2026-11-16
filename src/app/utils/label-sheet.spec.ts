import jsQR from 'jsqr';
import { LABEL_SIZES, buildLabels, labelSheetHtml, labelsPerPage } from './label-sheet';

const LAPTOPS = [{ code: 'LP-0042', name: 'MacBook Air 13" M1' }, { code: 'LP-0043', name: 'Dell XPS 13' }];
const link = (code: string) => `https://thastore.example/l/${code}`;
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html');

describe('labels', () => {
  describe('buildLabels', () => {
    it('2 labels for each laptop: the laptop and its charger, in that order', () => {
      const labels = buildLabels(LAPTOPS, 2, link);
      expect(labels.map(l => `${l.code} ${l.kind}`)).toEqual(['LP-0042 laptop', 'LP-0042 charger', 'LP-0043 laptop', 'LP-0043 charger']);
      expect(labels[1].link).toBe('https://thastore.example/l/LP-0042');
    });

    it('1 label for each laptop', () => {
      expect(buildLabels(LAPTOPS, 1, link).map(l => l.kind)).toEqual(['laptop', 'laptop']);
    });

    it('nothing picked, nothing made', () => {
      expect(buildLabels([], 2, link)).toEqual([]);
    });
  });

  describe('labelsPerPage', () => {
    it('50 x 30 mm: 3 across, 8 down on A4 with 10 mm margins', () => expect(labelsPerPage('50x30')).toBe(24));
    it('40 x 25 mm: 4 across, 10 down', () => expect(labelsPerPage('40x25')).toBe(40));
  });

  describe('labelSheetHtml (the page that is printed)', () => {
    it('on screen the preview has the same margin as the printed page, so it shows the same labels per row', () => {
      const html = labelSheetHtml(buildLabels(LAPTOPS, 1, link), '50x30');
      expect(html).toContain('@media screen { body { padding: 10mm; } }');
    });

    it('is a whole page for A4 sticker paper', () => {
      const html = labelSheetHtml(buildLabels(LAPTOPS, 2, link), '50x30');
      expect(html.startsWith('<!doctype html>')).toBeTrue();
      expect(html).toContain('@page { size: A4 portrait; margin: 10mm; }');
    });

    it('has one label per label, each with its own QR picture, code and shop name', () => {
      const doc = parse(labelSheetHtml(buildLabels(LAPTOPS, 2, link), '50x30'));
      const labels = Array.from(doc.querySelectorAll('.label'));
      expect(labels.length).toBe(4);
      expect(labels.every(l => l.querySelectorAll('svg path').length === 1)).toBeTrue();
      expect(labels.map(l => l.querySelector('.code')!.textContent)).toEqual(['LP-0042', 'LP-0042', 'LP-0043', 'LP-0043']);
      expect(labels[0].querySelector('.shop')!.textContent).toBe('ThaStore');
      expect(labels[0].querySelector('.name')!.textContent).toBe('MacBook Air 13" M1');
    });

    it('says LAPTOP or CHARGER only when there are both (with 1 label there is nothing to tell apart)', () => {
      const two = parse(labelSheetHtml(buildLabels(LAPTOPS, 2, link), '50x30'));
      expect(Array.from(two.querySelectorAll('.tag')).map(t => t.textContent)).toEqual(['LAPTOP', 'CHARGER', 'LAPTOP', 'CHARGER']);
      const one = parse(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '50x30'));
      expect(one.querySelectorAll('.tag').length).toBe(0);
    });

    it('the label has the size that was picked', () => {
      expect(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '50x30')).toContain('width: 50mm; height: 30mm;');
      expect(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '40x25')).toContain('width: 40mm; height: 25mm;');
      expect(LABEL_SIZES.map(s => s.label)).toEqual(['50 × 30 mm', '40 × 25 mm']);
    });

    it('a name written by a person cannot break the page (it is escaped)', () => {
      const html = labelSheetHtml(buildLabels([{ code: 'LP-0001', name: '<script>alert(1)</script> & "Pro"' }], 1, link), '50x30');
      const doc = parse(html);
      expect(doc.querySelectorAll('script').length).toBe(0);
      expect(doc.querySelector('.name')!.textContent).toBe('<script>alert(1)</script> & "Pro"');
    });

    it('an empty sheet is still a valid page', () => {
      const doc = parse(labelSheetHtml([], '50x30'));
      expect(doc.querySelectorAll('.label').length).toBe(0);
    });

    it('the QR on a label is a real one: drawn from the label\'s own path, a reader gets the laptop link back', () => {
      const doc = parse(labelSheetHtml(buildLabels([LAPTOPS[0]], 1, link), '50x30'));
      const svg = doc.querySelector('.label svg')!;
      const [minX, minY, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      const scale = 8;
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#000';
      // the path is "M x y h w v1 h-w z" for each run of squares
      for (const m of svg.querySelector('path')!.getAttribute('d')!.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
        context.fillRect((Number(m[1]) - minX) * scale, (Number(m[2]) - minY) * scale, Number(m[3]) * scale, scale);
      }
      const image = context.getImageData(0, 0, canvas.width, canvas.height);
      expect(jsQR(image.data, image.width, image.height)?.data).toBe('https://thastore.example/l/LP-0042');
    });
  });
});
