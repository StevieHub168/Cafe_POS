import { canShare, fetchImageFile, share } from './share';

/** Puts a pretend navigator.share / navigator.canShare in place for one test. */
function pretendBrowser(options: { share?: jasmine.Spy | null; canShare?: jasmine.Spy | null }): void {
  const set = (name: string, value: unknown) => {
    if (value) Object.defineProperty(navigator, name, { value, configurable: true, writable: true });
    else Object.defineProperty(navigator, name, { value: undefined, configurable: true, writable: true });
  };
  set('share', options.share ?? null);
  set('canShare', options.canShare ?? null);
}

describe('sharing several things at once', () => {
  const photo = new File(['p'], 'laptop.jpg', { type: 'image/jpeg' });
  const paper = new File(['i'], 'invoice-000041.png', { type: 'image/png' });

  afterEach(() => {
    // take the pretend ones away (the real browser's own, if any, show through again)
    delete (navigator as unknown as Record<string, unknown>)['share'];
    delete (navigator as unknown as Record<string, unknown>)['canShare'];
  });

  describe('canShare', () => {
    it('is false in a browser with no share menu', () => {
      pretendBrowser({});
      expect(canShare([photo], 'hi')).toBeFalse();
    });

    it('is false when the browser can share but not files (share without canShare)', () => {
      pretendBrowser({ share: jasmine.createSpy('share') });
      expect(canShare([photo], 'hi')).toBeFalse();
    });

    it('asks the browser with the files and the text', () => {
      const can = jasmine.createSpy('canShare').and.returnValue(true);
      pretendBrowser({ share: jasmine.createSpy('share'), canShare: can });
      expect(canShare([photo, paper], 'hello')).toBeTrue();
      expect(can).toHaveBeenCalledOnceWith({ files: [photo, paper], text: 'hello' });
    });

    it('leaves out empty text and an empty list of files', () => {
      const can = jasmine.createSpy('canShare').and.returnValue(true);
      pretendBrowser({ share: jasmine.createSpy('share'), canShare: can });
      canShare([], 'only text');
      canShare([photo], '');
      expect(can.calls.argsFor(0)).toEqual([{ text: 'only text' }]);
      expect(can.calls.argsFor(1)).toEqual([{ files: [photo] }]);
    });

    it('is false when the browser says it cannot, or throws', () => {
      pretendBrowser({ share: jasmine.createSpy('share'), canShare: jasmine.createSpy('canShare').and.returnValue(false) });
      expect(canShare([photo])).toBeFalse();
      pretendBrowser({ share: jasmine.createSpy('share'), canShare: jasmine.createSpy('canShare').and.throwError('no') });
      expect(canShare([photo])).toBeFalse();
    });
  });

  describe('share', () => {
    it('opens the share menu with the files and the text, and says it was shared', async () => {
      const menu = jasmine.createSpy('share').and.resolveTo(undefined);
      pretendBrowser({ share: menu, canShare: jasmine.createSpy('canShare').and.returnValue(true) });
      expect(await share([photo, paper], 'Booking Details')).toBe('shared');
      expect(menu).toHaveBeenCalledOnceWith({ files: [photo, paper], text: 'Booking Details' });
    });

    it('does not open anything when the browser cannot ("unsupported")', async () => {
      const menu = jasmine.createSpy('share');
      pretendBrowser({ share: menu, canShare: jasmine.createSpy('canShare').and.returnValue(false) });
      expect(await share([photo], 'x')).toBe('unsupported');
      expect(menu).not.toHaveBeenCalled();
    });

    it('closing the share menu is "cancelled", not an error', async () => {
      pretendBrowser({
        share: jasmine.createSpy('share').and.rejectWith(new DOMException('closed', 'AbortError')),
        canShare: jasmine.createSpy('canShare').and.returnValue(true),
      });
      expect(await share([photo], 'x')).toBe('cancelled');
    });

    it('any other problem is "failed" (it never throws)', async () => {
      pretendBrowser({
        share: jasmine.createSpy('share').and.rejectWith(new DOMException('not allowed', 'NotAllowedError')),
        canShare: jasmine.createSpy('canShare').and.returnValue(true),
      });
      expect(await share([photo], 'x')).toBe('failed');
      pretendBrowser({ share: jasmine.createSpy('share').and.rejectWith(null), canShare: jasmine.createSpy('canShare').and.returnValue(true) });
      expect(await share([photo], 'x')).toBe('failed');
    });
  });

  describe('fetchImageFile', () => {
    const answer = (blob: Blob, ok = true) => spyOn(window, 'fetch').and.resolveTo({ ok, blob: () => Promise.resolve(blob) } as Response);

    it('downloads a picture as a file with a name that fits its kind', async () => {
      answer(new Blob(['x'], { type: 'image/png' }));
      const file = await fetchImageFile('http://localhost:3000/uploads/a', 'laptop');
      expect(file!.name).toBe('laptop.png');
      expect(file!.type).toBe('image/png');
      expect(window.fetch).toHaveBeenCalledOnceWith('http://localhost:3000/uploads/a');
    });

    it('knows jpg, webp and gif; an unknown picture kind gets .jpg', async () => {
      let kind = 'image/jpeg';
      spyOn(window, 'fetch').and.callFake(() => Promise.resolve({ ok: true, blob: () => Promise.resolve(new Blob(['x'], { type: kind })) } as Response));
      for (const [type, name] of [['image/jpeg', 'laptop.jpg'], ['image/webp', 'laptop.webp'], ['image/gif', 'laptop.gif'], ['image/x-strange', 'laptop.jpg']]) {
        kind = type;
        expect((await fetchImageFile('u', 'laptop'))!.name).withContext(type).toBe(name);
      }
    });

    it('is null when the address answers with an error', async () => {
      answer(new Blob(['x'], { type: 'image/png' }), false);
      expect(await fetchImageFile('u', 'laptop')).toBeNull();
    });

    it('is null when it is not a picture (a web page, JSON...)', async () => {
      answer(new Blob(['<html>'], { type: 'text/html' }));
      expect(await fetchImageFile('u', 'laptop')).toBeNull();
    });

    it('is null when there is no network or the other site does not allow it', async () => {
      spyOn(window, 'fetch').and.rejectWith(new TypeError('Failed to fetch'));
      expect(await fetchImageFile('u', 'laptop')).toBeNull();
    });
  });
});
