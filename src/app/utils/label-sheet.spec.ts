import jsQR from 'jsqr';
import { LABEL_SIZES, buildLabels, labelSheetHtml, labelsPerPage, rollPreviewSize, specLines } from './label-sheet';

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

    it('the laptop label and the charger label both have the specs', () => {
      const labels = buildLabels([{ code: 'LP-0042', name: 'HP Victus 16', specs: ['Ryzen 5', 'Ram 16GB'] }], 2, link);
      expect(labels.map(l => l.specs)).toEqual([['Ryzen 5', 'Ram 16GB'], ['Ryzen 5', 'Ram 16GB']]);
    });

    it('a laptop given without specs gets none', () => {
      expect(buildLabels(LAPTOPS, 1, link).map(l => l.specs)).toEqual([[], []]);
    });

    it('the laptop label and the charger label both have the price; no price is an empty text', () => {
      expect(buildLabels([{ code: 'LP-0042', name: 'HP', price: '$1,049' }], 2, link).map(l => l.price)).toEqual(['$1,049', '$1,049']);
      expect(buildLabels(LAPTOPS, 1, link).map(l => l.price)).toEqual(['', '']);
    });
  });

  describe('specLines', () => {
    it('one short line for each spec: new lines and | both start a new line', () => {
      expect(specLines('Ryzen 5 8645HS\nRam 16GB DDR5 | SSD 512GB\nGPU RTX 4050 6GB')).toEqual(['Ryzen 5 8645HS', 'Ram 16GB DDR5', 'SSD 512GB', 'GPU RTX 4050 6GB']);
    });

    it('empty lines and extra spaces are dropped', () => {
      expect(specLines('  Chip M3  \n\n |  Ram 8GB \r\n')).toEqual(['Chip M3', 'Ram 8GB']);
    });

    it('no description, no specs', () => {
      expect(specLines(null)).toEqual([]);
      expect(specLines(undefined)).toEqual([]);
      expect(specLines('')).toEqual([]);
    });
  });

  describe('labelsPerPage', () => {
    it('40 x 30 mm: 4 across, 8 down on A4 with 10 mm margins', () => expect(labelsPerPage('40x30')).toBe(32));
    it('60 x 40 mm: 3 across, 6 down', () => expect(labelsPerPage('60x40')).toBe(18));
  });

  describe('rollPreviewSize (the page the preview of a roll shows)', () => {
    const MM = 96 / 25.4;
    it('one label wide: the label + 10 mm on each side, shown bigger by the zoom of its size', () => {
      expect(rollPreviewSize('60x40', 1).width).toBe(Math.ceil(80 * MM * 1.4));
      expect(rollPreviewSize('40x30', 1).width).toBe(Math.ceil(60 * MM * 2));
    });

    it('as high as its labels one under the other (2 mm between them), 10 mm above and below', () => {
      expect(rollPreviewSize('60x40', 1).height).toBe(Math.ceil(60 * MM * 1.4));
      expect(rollPreviewSize('60x40', 3).height).toBe(Math.ceil((20 + 3 * 40 + 2 * 2) * MM * 1.4));
    });

    it('nothing to show is still one label high (the box is not squashed)', () => {
      expect(rollPreviewSize('60x40', 0)).toEqual(rollPreviewSize('60x40', 1));
    });

    it('is the same page the preview HTML lays out: the same margin and gap', () => {
      const html = labelSheetHtml(buildLabels(LAPTOPS, 1, link), '60x40', 'roll');
      expect(html).toContain('body { padding: 10mm; }');
      expect(html).toContain('gap: 2mm;');
    });
  });

  describe('labelSheetHtml (the page that is printed)', () => {
    it('on screen the preview has the same margin as the printed page, so it shows the same labels per row', () => {
      const html = labelSheetHtml(buildLabels(LAPTOPS, 1, link), '60x40');
      expect(html).toContain('@media screen { body { padding: 10mm; } }');
    });

    it('is a whole page for A4 sticker paper', () => {
      const html = labelSheetHtml(buildLabels(LAPTOPS, 2, link), '60x40');
      expect(html.startsWith('<!doctype html>')).toBeTrue();
      expect(html).toContain('@page { size: A4 portrait; margin: 10mm; }');
    });

    it('has one label per label, each with its own QR picture, code and name', () => {
      const doc = parse(labelSheetHtml(buildLabels(LAPTOPS, 2, link), '60x40'));
      const labels = Array.from(doc.querySelectorAll('.label'));
      expect(labels.length).toBe(4);
      expect(labels.every(l => l.querySelectorAll('svg path').length === 1)).toBeTrue();
      expect(labels.map(l => l.querySelector('.code')!.textContent)).toEqual(['LP-0042', 'LP-0042', 'LP-0043', 'LP-0043']);
      expect(doc.body.textContent).not.toContain('ThaStore');      // the shop name is not printed
      expect(labels[0].querySelector('.name')!.textContent).toBe('MacBook Air 13" M1');
    });

    it('says LAPTOP or CHARGER only when there are both (with 1 label there is nothing to tell apart)', () => {
      const two = parse(labelSheetHtml(buildLabels(LAPTOPS, 2, link), '60x40'));
      expect(Array.from(two.querySelectorAll('.tag')).map(t => t.textContent)).toEqual(['LAPTOP', 'CHARGER', 'LAPTOP', 'CHARGER']);
      const one = parse(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '60x40'));
      expect(one.querySelectorAll('.tag').length).toBe(0);
    });

    it('the label has the size that was picked', () => {
      expect(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '40x30')).toContain('width: 40mm; height: 30mm;');
      expect(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '60x40')).toContain('width: 60mm; height: 40mm;');
      expect(LABEL_SIZES.map(s => s.label)).toEqual(['60 × 40 mm', '40 × 30 mm']);        // the two label rolls of the shop
    });

    it('a name written by a person cannot break the page (it is escaped)', () => {
      const html = labelSheetHtml(buildLabels([{ code: 'LP-0001', name: '<script>alert(1)</script> & "Pro"' }], 1, link), '60x40');
      const doc = parse(html);
      expect(doc.querySelectorAll('script').length).toBe(0);
      expect(doc.querySelector('.name')!.textContent).toBe('<script>alert(1)</script> & "Pro"');
    });

    describe('specs on the label', () => {
      const HP = { code: 'LP-0130', name: 'HP Victus 16', specs: specLines('Ryzen 5 8645HS\nRam 16GB DDR5 | SSD 512GB\nGPU RTX 4050 6GB') };
      const specsOf = (label: Element) => Array.from(label.querySelectorAll('.specs div')).map(d => d.textContent);

      it('are under the code, one line each (and above the price, when it has one)', () => {
        const label = parse(labelSheetHtml(buildLabels([HP], 1, link), '60x40')).querySelector('.label')!;
        expect(specsOf(label)).toEqual(['Ryzen 5 8645HS', 'Ram 16GB DDR5', 'SSD 512GB', 'GPU RTX 4050 6GB']);
        expect(Array.from(label.querySelector('.words')!.children).map(c => c.className)).toEqual(['name', 'code', 'specs']);      // this laptop has no price
      });

      it('with a charger label too: both labels have them', () => {
        const labels = parse(labelSheetHtml(buildLabels([HP], 2, link), '60x40')).querySelectorAll('.label');
        expect(specsOf(labels[0]).length).toBe(4);
        expect(specsOf(labels[1])).toEqual(specsOf(labels[0]));
      });

      it('a laptop with no specs has no empty space for them', () => {
        const doc = parse(labelSheetHtml(buildLabels([{ code: 'LP-0001', name: 'Old laptop' }], 1, link), '60x40'));
        expect(doc.querySelector('.specs')).toBeNull();
      });

      it('at most 5 lines on a 60 x 40 label and 4 on a 40 x 30 label (the rest would not fit)', () => {
        const long = { code: 'LP-0002', name: 'Laptop', specs: ['a', 'b', 'c', 'd', 'e', 'f'] };
        expect(specsOf(parse(labelSheetHtml(buildLabels([long], 1, link), '60x40')).querySelector('.label')!)).toEqual(['a', 'b', 'c', 'd', 'e']);
        expect(specsOf(parse(labelSheetHtml(buildLabels([long], 1, link), '40x30')).querySelector('.label')!)).toEqual(['a', 'b', 'c', 'd']);
      });

      it('one line less on a 60 x 40 label that also has the LAPTOP / CHARGER tag', () => {
        const long = { code: 'LP-0002', name: 'Laptop', specs: ['a', 'b', 'c', 'd', 'e'] };
        const labels = parse(labelSheetHtml(buildLabels([long], 2, link), '60x40')).querySelectorAll('.label');
        expect(labels.length).toBe(2);
        labels.forEach(label => expect(specsOf(label)).toEqual(['a', 'b', 'c', 'd']));
      });

      it('text written by a person cannot break the page (it is escaped)', () => {
        const doc = parse(labelSheetHtml(buildLabels([{ code: 'LP-0003', name: 'X', specs: ['<img src=x onerror=alert(1)> & "RAM"'] }], 1, link), '60x40'));
        expect(doc.querySelectorAll('img').length).toBe(0);
        expect(doc.querySelector('.specs div')!.textContent).toBe('<img src=x onerror=alert(1)> & "RAM"');
      });
    });

    describe('price on the label', () => {
      const HP = { code: 'LP-0130', name: 'HP Victus 16', price: '$1,049' };
      const priceOf = (label: Element) => Array.from(label.querySelectorAll('.price')).map(e => e.textContent);

      it('is on the laptop label and on the charger label, under the specs', () => {
        const labels = parse(labelSheetHtml(buildLabels([{ ...HP, specs: ['Ryzen 5'] }], 2, link), '60x40')).querySelectorAll('.label');
        expect(labels.length).toBe(2);
        labels.forEach(label => {
          expect(priceOf(label)).toEqual(['$1,049']);
          expect(Array.from(label.querySelector('.words')!.children).map(c => c.className).slice(-2)).toEqual(['specs', 'price']);
        });
      });

      it('is bigger than the specs and the name, so it is easy to see (both sizes)', () => {
        for (const [size, pt] of [['60x40', 13], ['40x30', 8]] as const) {
          const html = labelSheetHtml(buildLabels([HP], 1, link), size);
          expect(html).toContain(`.price { font-size: ${pt}pt; font-weight: 700;`);
        }
      });

      it('no price: nothing is printed for it', () => {
        for (const size of ['60x40', '40x30'] as const) {
          const label = parse(labelSheetHtml(buildLabels([{ code: 'LP-0001', name: 'Old' }], 1, link), size)).querySelector('.label')!;
          expect(label.querySelector('.price')).toBeNull();
        }
      });

      it('text written by a person cannot break the page (it is escaped)', () => {
        const doc = parse(labelSheetHtml(buildLabels([{ code: 'LP-0003', name: 'X', price: '<b>$1</b> & "2"' }], 1, link), '60x40'));
        expect(doc.querySelectorAll('.price b').length).toBe(0);
        expect(doc.querySelector('.price')!.textContent).toBe('<b>$1</b> & "2"');
      });
    });

    describe('boxes to tick', () => {
      const boxesOf = (label: Element) => Array.from(label.querySelectorAll('.ticks span')).map(e => e.textContent);

      it('every label has three empty boxes, Sold, Book and Repair, under the QR (so the state is seen without scanning)', () => {
        const labels = parse(labelSheetHtml(buildLabels(LAPTOPS, 2, link), '60x40')).querySelectorAll('.label');
        expect(labels.length).toBe(4);
        labels.forEach(label => {
          expect(boxesOf(label)).toEqual(['Sold', 'Book', 'Repair']);
          expect(label.querySelectorAll('.ticks i').length).toBe(3);
          expect(Array.from(label.querySelector('.left')!.children).map(c => c.tagName.toLowerCase())).toEqual(['svg', 'div']);      // QR first, boxes under it
        });
      });

      it('the boxes are empty (no tick is printed) and have a visible border', () => {
        const doc = parse(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '60x40'));
        doc.querySelectorAll('.ticks i').forEach(box => expect(box.textContent).toBe(''));
        expect(doc.head.textContent).toMatch(/\.ticks i \{[^}]*border: 0\.3mm solid #000/);
      });

      it('both sizes have them', () => {
        for (const size of ['60x40', '40x30'] as const) {
          const label = parse(labelSheetHtml(buildLabels(LAPTOPS, 1, link), size)).querySelector('.label')!;
          expect(boxesOf(label)).toEqual(['Sold', 'Book', 'Repair']);
        }
      });
    });

    describe('40 x 30 mm (the XP-365B label roll)', () => {
      const FULL = { code: 'LP-0130', name: 'HP Victus 16', specs: specLines('Ryzen 5 8645HS\nRam 16GB DDR5 | SSD 512GB\nGPU RTX 4050 6GB'), price: '$1,049' };
      const label = (kinds: 1 | 2, paper: 'roll' | 'sheet' = 'roll') => parse(labelSheetHtml(buildLabels([FULL], kinds, link), '40x30', paper));

      it('the words fit next to the QR: a QR of 17 mm and 1.8 mm between leave 16.2 mm of the 35 mm inside', () => {
        const css = label(1).head.textContent!;
        expect(css).toContain('padding: 2.5mm');
        expect(css).toContain('.left svg { width: 17mm; height: 17mm;');
        expect(css).toContain('gap: 1.8mm;');
        expect(Math.round((40 - 2 * 2.5 - 17 - 1.8) * 10) / 10).toBe(16.2);
      });

      it('the boxes to tick are bigger (2.5 mm, text 5.5 pt), each word under its box, and the QR with them is no higher than what is inside the label (30 - 2 x 2.5 = 25 mm)', () => {
        expect(label(1).head.textContent).toContain('.ticks i { width: 2.5mm; height: 2.5mm;');
        expect(label(1).head.textContent).toContain('font-size: 5.5pt;');
        expect(17 + 0.8 + (2.5 + 0.5 + 5.5 * 0.3528)).toBeLessThanOrEqual(25);
      });

      it('the code is smaller (7.5 pt) and has 0.5 mm of space above and below it', () => {
        expect(label(1).head.textContent).toContain('font-size: 7.5pt; font-weight: 700; line-height: 1; margin: 0.5mm 0; }');
      });

      it('the spec text is 4.8 pt, as big as a line like "GPU RTX 4050 6GB" can be and still fit on one line (5 pt cuts it off)', () => {
        expect(label(1).head.textContent).toContain('.specs { font-size: 4.8pt;');
        expect(label(1).head.textContent).toContain('.name { font-size: 6.5pt;');
      });

      it('has the specs and the price, and 4 spec lines, also under the LAPTOP / CHARGER tag (the label is 30 mm high)', () => {
        const doc = label(1);
        expect(Array.from(doc.querySelectorAll('.specs div')).map(d => d.textContent)).toEqual(['Ryzen 5 8645HS', 'Ram 16GB DDR5', 'SSD 512GB', 'GPU RTX 4050 6GB']);
        expect(doc.querySelector('.price')!.textContent).toBe('$1,049');
        const two = label(2).querySelectorAll('.label');
        expect(two.length).toBe(2);
        two.forEach(l => expect(l.querySelectorAll('.specs div').length).toBe(4));
      });
    });

    describe('60 x 40 mm (the bigger label roll)', () => {
      const FULL = { code: 'LP-0130', name: 'HP Victus 16', specs: specLines('Ryzen 5 8645HS\nRam 16GB DDR5 | SSD 512GB\nGPU RTX 4050 6GB'), price: '$1,049' };
      const page = (kinds: 1 | 2, extra: Partial<typeof FULL> & { specs?: string[] } = {}) => parse(labelSheetHtml(buildLabels([{ ...FULL, ...extra }], kinds, link), '60x40', 'roll'));

      it('is bigger all over: a 23 mm QR and bigger text than the 40 x 30 label', () => {
        const css = page(1).head.textContent!;
        expect(css).toContain('.left svg { width: 23mm; height: 23mm;');
        expect(css).toContain('.price { font-size: 13pt;');
        expect(css).toContain('.code { font-family: "Courier New", monospace; font-size: 10pt;');
        expect(css).toContain('.specs { font-size: 8.5pt;');
        expect(css).toContain('.name { font-size: 10pt;');
      });

      it('the words have the width of the label: 2.5 mm at the edges and 2 mm after the QR leave 30 mm, so a long line like "Ram 16GB LPDDR5X" is not cut off', () => {
        const css = page(1).head.textContent!;
        expect(css).toContain('padding: 2.5mm 2.5mm;');
        expect(css).toContain('gap: 2mm;');
        expect(60 - 2 * 2.5 - 23 - 2).toBe(30);
      });

      it('the code is a little smaller than the price and has 1 mm of space above and below it', () => {
        expect(page(1).head.textContent).toContain('font-size: 10pt; font-weight: 700; line-height: 1; margin: 1mm 0; }');
      });

      it('the boxes to tick are bigger (3.2 mm, text 7 pt), each word under its box, and the QR with them is no higher than what is inside the label (40 - 2 x 2.5 = 35 mm)', () => {
        expect(page(1).head.textContent).toContain('.ticks i { width: 3.2mm; height: 3.2mm;');
        expect(page(1).head.textContent).toContain('font-size: 7pt;');
        expect(23 + 0.8 + (3.2 + 0.5 + 7 * 0.3528)).toBeLessThanOrEqual(35);
      });

      it('has 5 spec lines (4 when the LAPTOP / CHARGER tag takes a line)', () => {
        const six = ['a', 'b', 'c', 'd', 'e', 'f'];
        expect(page(1, { specs: six }).querySelectorAll('.specs div').length).toBe(5);
        page(2, { specs: six }).querySelectorAll('.label').forEach(l => expect(l.querySelectorAll('.specs div').length).toBe(4));
      });

      it('a roll of this size prints one 60 x 40 mm label on each page', () => {
        expect(labelSheetHtml(buildLabels([FULL], 2, link), '60x40', 'roll')).toContain('@page { size: 60mm 40mm; margin: 0; }');
      });

      it('the LAPTOP / CHARGER tag grows with the label (its size is in the CSS of the label)', () => {
        expect(page(2).head.textContent).toContain('.tag { align-self: flex-start; font-size: 7pt;');
        expect(parse(labelSheetHtml(buildLabels([FULL], 2, link), '40x30', 'roll')).head.textContent).toContain('.tag { align-self: flex-start; font-size: 5.5pt;');
      });
    });

    describe('paper: a label roll or an A4 sheet', () => {
      const html = (paper?: 'roll' | 'sheet', size: '40x30' | '60x40' = '40x30') => labelSheetHtml(buildLabels(LAPTOPS, 1, link), size, paper);

      it('no paper given = the A4 sheet, as before', () => {
        expect(html()).toBe(html('sheet'));
        expect(html()).toContain('@page { size: A4 portrait; margin: 10mm; }');
      });

      it('a roll: the printed page is exactly one label (no margin), and every label is its own page', () => {
        const page = html('roll');
        expect(page).toContain('@page { size: 40mm 30mm; margin: 0; }');
        expect(page).not.toContain('A4 portrait');
        expect(page).toContain('break-after: page; page-break-after: always;');
        expect(html('roll', '60x40')).toContain('@page { size: 60mm 40mm; margin: 0; }');
      });

      it('a roll: no page break after the last label (a printer would feed an empty label), and no dashed line when printed', () => {
        const css = parse(html('roll')).head.textContent!;
        expect(css).toContain('.label:last-child { break-after: auto; page-break-after: auto; }');
        expect(css).toMatch(/@media print \{[^]*\.label \{[^}]*border: 0;/);
      });

      it('a roll: a label is a hair smaller than the page, so it never pushes an empty page out', () => {
        expect(parse(html('roll')).head.textContent).toContain('height: 29.7mm;');
      });

      it('a roll shows the same labels as the sheet (the preview): same number, same words and QR', () => {
        const strip = (doc: Document) => Array.from(doc.querySelectorAll('.label')).map(l => l.querySelector('.code')!.textContent + '|' + l.querySelector('svg path')!.getAttribute('d'));
        expect(strip(parse(html('roll')))).toEqual(strip(parse(html('sheet'))));
        expect(parse(html('roll')).querySelectorAll('.label').length).toBe(2);
      });

      it('a roll: on screen the labels are shown bigger (a readable preview), when printed at their real size', () => {
        const css = parse(html('roll')).head.textContent!;
        expect(css).toContain('@media screen { body { zoom: 2; } }');
        expect(css.slice(css.indexOf('@media print'))).not.toContain('zoom');
        expect(parse(labelSheetHtml(buildLabels(LAPTOPS, 1, link), '60x40', 'roll')).head.textContent).toContain('@media screen { body { zoom: 1.4; } }');
      });

      it('the sheet has none of the roll rules', () => {
        expect(html('sheet')).not.toContain('break-after: page');
        expect(html('sheet')).not.toContain('size: 40mm 30mm');
      });
    });

    it('an empty sheet is still a valid page', () => {
      const doc = parse(labelSheetHtml([], '60x40'));
      expect(doc.querySelectorAll('.label').length).toBe(0);
    });

    it('the QR on a label is a real one: drawn from the label\'s own path, a reader gets the laptop link back', () => {
      const doc = parse(labelSheetHtml(buildLabels([LAPTOPS[0]], 1, link), '60x40'));
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
