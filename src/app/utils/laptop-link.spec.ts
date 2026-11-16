import { codeFromLink, isThisComputerOnly, laptopLink } from './laptop-link';

describe('laptop links (what a QR code opens)', () => {
  it('is the shop address and /l/ and the code', () => {
    expect(laptopLink('https://thastore.example', 'LP-0042')).toBe('https://thastore.example/l/LP-0042');
    expect(laptopLink('http://192.168.1.20:4000', 'LP-0007')).toBe('http://192.168.1.20:4000/l/LP-0007');
  });

  it('a slash at the end of the address, or spaces round it, make no double slash', () => {
    expect(laptopLink('https://thastore.example/', 'LP-0042')).toBe('https://thastore.example/l/LP-0042');
    expect(laptopLink('  https://thastore.example///  ', 'LP-0042')).toBe('https://thastore.example/l/LP-0042');
  });

  it('gives the code back from a link', () => {
    expect(codeFromLink('https://thastore.example/l/LP-0042')).toBe('LP-0042');
    expect(codeFromLink('http://localhost:4000/l/lp-0042?x=1')).toBe('LP-0042');
    expect(codeFromLink('https://thastore.example/menu')).toBeNull();
    expect(codeFromLink('https://thastore.example/l/LP-')).toBeNull();
  });

  it('knows an address that only works on this computer', () => {
    for (const base of ['http://localhost:4000', 'http://localhost', 'https://127.0.0.1:4000/', 'http://0.0.0.0:4200', 'http://[::1]:4000']) {
      expect(isThisComputerOnly(base)).withContext(base).toBeTrue();
    }
    for (const base of ['https://thastore.example', 'http://192.168.1.20:4000', 'https://localhost.example.com']) {
      expect(isThisComputerOnly(base)).withContext(base).toBeFalse();
    }
  });
});
