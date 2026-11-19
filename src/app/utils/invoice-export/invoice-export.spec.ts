import { copyImage, downloadBlob, fontsReady, invoiceFileName, paperToPng, printPage, toPngBlob } from './invoice-export';

describe('invoice export helpers', () => {
  it('the picture is named after the invoice number', () => {
    expect(invoiceFileName({ number: 41 })).toBe('invoice-000041.png');
    expect(invoiceFileName({ number: 123456 })).toBe('invoice-123456.png');
  });

  describe('printing', () => {
    it('opens the print dialog once the fonts are ready', async () => {
      const print = spyOn(window, 'print');
      await printPage();
      expect(print).toHaveBeenCalledTimes(1);
    });

    it('waits for the fonts before printing', async () => {
      const order: string[] = [];
      spyOnProperty(document, 'fonts', 'get').and.returnValue({ ready: new Promise<void>(resolve => setTimeout(() => { order.push('fonts'); resolve(); }, 30)) } as unknown as FontFaceSet);
      spyOn(window, 'print').and.callFake(() => { order.push('print'); });
      await printPage();
      expect(order).toEqual(['fonts', 'print']);
    });

    it('still prints when the fonts cannot be waited for', async () => {
      spyOnProperty(document, 'fonts', 'get').and.returnValue({ ready: Promise.reject(new Error('no fonts')) } as unknown as FontFaceSet);
      const print = spyOn(window, 'print');
      await expectAsync(fontsReady()).toBeResolved();
      await printPage();
      expect(print).toHaveBeenCalled();
    });
  });

  describe('copying the picture', () => {
    const png = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });

    it('puts it on the clipboard as an image', async () => {
      const write = jasmine.createSpy('write').and.returnValue(Promise.resolve());
      spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ write } as unknown as Clipboard);
      expect(await copyImage(png)).toBeTrue();
      const item = write.calls.mostRecent().args[0][0] as ClipboardItem;
      expect(item.types).toEqual(['image/png']);
    });

    // The clipboard takes pictures only as PNG, but laptop photos are mostly JPEG (or WebP).
    describe('a photo that is not a PNG', () => {
      /** A real picture of the given kind and size. */
      const picture = (type: string, width = 40, height = 20) => new Promise<Blob>((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#c33';
        context.fillRect(0, 0, width, height);
        canvas.toBlob(b => (b ? resolve(b) : reject(new Error('no picture'))), type);
      });
      const sizeOf = async (blob: Blob) => { const bitmap = await createImageBitmap(blob); const size = [bitmap.width, bitmap.height]; bitmap.close(); return size; };
      const startsLikePng = async (blob: Blob) => Array.from(new Uint8Array(await blob.slice(0, 4).arrayBuffer())).join(',') === '137,80,78,71';
      const clipboardThatReads = () => {
        const write = jasmine.createSpy('write').and.callFake(async (items: ClipboardItem[]) => { await items[0].getType('image/png'); });
        spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ write } as unknown as Clipboard);
        return write;
      };

      it('is put on the clipboard as a PNG (a JPEG would be refused)', async () => {
        const write = clipboardThatReads();
        expect(await copyImage(await picture('image/jpeg'))).toBeTrue();
        const item = write.calls.mostRecent().args[0][0] as ClipboardItem;
        expect(item.types).toEqual(['image/png']);
        const onClipboard = await item.getType('image/png');
        expect(onClipboard.type).toBe('image/png');
        expect(await startsLikePng(onClipboard)).toBeTrue();
        expect(await sizeOf(onClipboard)).toEqual([40, 20]);
      });

      it('WebP too', async () => {
        const write = clipboardThatReads();
        expect(await copyImage(await picture('image/webp'))).toBeTrue();
        const onClipboard = await (write.calls.mostRecent().args[0][0] as ClipboardItem).getType('image/png');
        expect(await startsLikePng(onClipboard)).toBeTrue();
      });

      it('a PNG is put there as it is (nothing is redrawn)', async () => {
        const write = clipboardThatReads();
        const original = await picture('image/png');
        await copyImage(original);
        expect(await (write.calls.mostRecent().args[0][0] as ClipboardItem).getType('image/png')).toBe(original);
      });

      it('says false (never throws) when the photo cannot be turned into a picture', async () => {
        clipboardThatReads();
        expect(await copyImage(new Blob(['not a picture'], { type: 'image/jpeg' }))).toBeFalse();
      });

      describe('toPngBlob', () => {
        it('keeps the size of a normal photo', async () => {
          const png = await toPngBlob(await picture('image/jpeg', 300, 200));
          expect(png.type).toBe('image/png');
          expect(await sizeOf(png)).toEqual([300, 200]);
        });

        it('makes a very big photo smaller (longest side 2400 px), in the same shape', async () => {
          const png = await toPngBlob(await picture('image/jpeg', 4000, 3000));
          expect(await sizeOf(png)).toEqual([2400, 1800]);
        });

        it('the largest size can be chosen', async () => {
          const png = await toPngBlob(await picture('image/jpeg', 400, 200), 100);
          expect(await sizeOf(png)).toEqual([100, 50]);
        });

        it('refuses something that is not a picture', async () => {
          await expectAsync(toPngBlob(new Blob(['x'], { type: 'image/jpeg' }))).toBeRejected();
        });
      });
    });

    it('says false when the browser has no image clipboard (plain http, older browsers)', async () => {
      spyOnProperty(navigator, 'clipboard', 'get').and.returnValue(undefined as unknown as Clipboard);
      expect(await copyImage(png)).toBeFalse();
    });

    it('says false (never throws) when the browser refuses', async () => {
      spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ write: () => Promise.reject(new Error('denied')) } as unknown as Clipboard);
      expect(await copyImage(png)).toBeFalse();
    });
  });

  describe('saving a file', () => {
    it('downloads it under the given name and leaves nothing on the page', () => {
      let clicked: HTMLAnchorElement | null = null;
      spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { clicked = this; });
      const before = document.querySelectorAll('a').length;
      downloadBlob(new Blob(['x'], { type: 'image/png' }), 'invoice-000041.png');
      expect(clicked).not.toBeNull();
      expect(clicked!.download).toBe('invoice-000041.png');
      expect(clicked!.href).toMatch(/^blob:/);
      expect(document.querySelectorAll('a').length).toBe(before);
    });
  });

  describe('the picture of the paper', () => {
    it('is a PNG made from the page element', async () => {
      const box = document.createElement('div');
      box.style.cssText = 'width:592px;height:840px;background:#fff;color:#123;font:20px sans-serif';
      box.textContent = 'Invoice 000041 · $824';
      document.body.appendChild(box);
      try {
        const blob = await paperToPng(box);
        expect(blob.type).toBe('image/png');
        expect(blob.size).toBeGreaterThan(500);
        const bitmap = await createImageBitmap(blob);
        expect(bitmap.width).toBe(592 * 2);          // twice the size, so it stays sharp on Telegram
        expect(bitmap.height).toBe(840 * 2);
        bitmap.close();
      } finally {
        box.remove();
      }
    });
  });
});
