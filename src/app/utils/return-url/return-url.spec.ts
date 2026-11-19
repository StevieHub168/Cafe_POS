import { safeReturnUrl, scannedCodeOf } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps a page of this app, with its query', () => {
    expect(safeReturnUrl('/l/LP-0042')).toBe('/l/LP-0042');
    expect(safeReturnUrl('/labels?ids=3&per=2')).toBe('/labels?ids=3&per=2');
  });

  it('goes to the Menu when there is nothing', () => {
    expect(safeReturnUrl(null)).toBe('/menu');
    expect(safeReturnUrl(undefined)).toBe('/menu');
    expect(safeReturnUrl('')).toBe('/menu');
  });

  it('never leaves the app: another site is refused', () => {
    for (const url of ['https://evil.example', 'http://evil.example/l/LP-1', '//evil.example', '/\\evil.example', 'evil', 'javascript:alert(1)']) {
      expect(safeReturnUrl(url)).withContext(url).toBe('/menu');
    }
  });

  it('never goes back to Login, and refuses control characters', () => {
    expect(safeReturnUrl('/login')).toBe('/menu');
    expect(safeReturnUrl('/login?returnUrl=%2Fmenu')).toBe('/menu');
    expect(safeReturnUrl('/loginx')).toBe('/loginx');
    expect(safeReturnUrl('/menu\n')).toBe('/menu');
  });

  it('uses the fallback it is given', () => {
    expect(safeReturnUrl('x', '/sales')).toBe('/sales');
  });
});

describe('scannedCodeOf', () => {
  it('finds the code of a scanned laptop', () => {
    expect(scannedCodeOf('/l/LP-0042')).toBe('LP-0042');
    expect(scannedCodeOf('/l/lp-0042')).toBe('LP-0042');
    expect(scannedCodeOf('/l/LP-0042?x=1')).toBe('LP-0042');
  });

  it('is empty for any other page', () => {
    expect(scannedCodeOf('/menu')).toBe('');
    expect(scannedCodeOf('/l/hello')).toBe('');
    expect(scannedCodeOf('/l/LP-0042/extra')).toBe('');
  });
});
