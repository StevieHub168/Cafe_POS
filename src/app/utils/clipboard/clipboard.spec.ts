import { copyToClipboard } from './clipboard';

describe('copyToClipboard', () => {
  it('uses the browser clipboard when it is there', async () => {
    const write = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText: write } as unknown as Clipboard);
    expect(await copyToClipboard('hello')).toBeTrue();
    expect(write).toHaveBeenCalledWith('hello');
  });

  it('falls back to the older "copy" when the browser clipboard is not allowed (plain http, phone)', async () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText: () => Promise.reject(new Error('denied')) } as unknown as Clipboard);
    let copied = '';
    const exec = spyOn(document, 'execCommand').and.callFake(() => {
      copied = (document.activeElement as HTMLTextAreaElement).value;
      return true;
    });
    expect(await copyToClipboard('Booking Details\n• Product: X')).toBeTrue();
    expect(exec).toHaveBeenCalledWith('copy');
    expect(copied).toBe('Booking Details\n• Product: X');
  });

  it('falls back too when there is no browser clipboard at all', async () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue(undefined as unknown as Clipboard);
    spyOn(document, 'execCommand').and.returnValue(true);
    expect(await copyToClipboard('x')).toBeTrue();
  });

  it('says false (never throws) when nothing works', async () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue({ writeText: () => Promise.reject(new Error('denied')) } as unknown as Clipboard);
    spyOn(document, 'execCommand').and.returnValue(false);
    expect(await copyToClipboard('x')).toBeFalse();
  });

  it('says false (never throws) even when the browser fails in an unexpected way', async () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue(undefined as unknown as Clipboard);
    spyOn(document, 'execCommand').and.throwError('boom');
    expect(await copyToClipboard('x')).toBeFalse();
    expect(document.querySelectorAll('textarea').length).toBe(0);
  });

  it('leaves nothing behind on the page', async () => {
    spyOnProperty(navigator, 'clipboard', 'get').and.returnValue(undefined as unknown as Clipboard);
    spyOn(document, 'execCommand').and.returnValue(true);
    const before = document.querySelectorAll('textarea').length;
    await copyToClipboard('x');
    expect(document.querySelectorAll('textarea').length).toBe(before);
  });
});
