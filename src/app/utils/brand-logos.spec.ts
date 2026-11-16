import { brandLogo } from './brand-logos';

describe('brandLogo', () => {
  it('has a logo for every brand in the shop (Apple, Asus, Dell, HP, Acer, Surface, MSI)', () => {
    for (const brand of ['Apple', 'Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI']) {
      expect(brandLogo(brand)).withContext(brand).not.toBeNull();
    }
  });

  it('also knows other laptop brands a shop may add later', () => {
    for (const brand of ['Lenovo', 'Samsung', 'Huawei', 'Xiaomi', 'LG', 'Alienware', 'Toshiba']) {
      expect(brandLogo(brand)).withContext(brand).not.toBeNull();
    }
  });

  it('ignores capitals, spaces and signs', () => {
    expect(brandLogo('msi')).toBe(brandLogo('MSI'));
    expect(brandLogo('  M.S.I. ')).toBe(brandLogo('MSI'));
    expect(brandLogo('aSuS')).toBe(brandLogo('Asus'));
  });

  it('Surface shows the Microsoft mark (four coloured squares), the same as "Microsoft Surface"', () => {
    const surface = brandLogo('Surface')!;
    expect(surface.name).toBe('Microsoft');
    expect(surface.paths.length).toBe(4);
    expect(new Set(surface.paths.map(p => p.fill)).size).toBe(4);
    expect(brandLogo('Microsoft Surface')).toBe(surface);
  });

  it('the long names of a brand find the same logo', () => {
    expect(brandLogo('Hewlett-Packard')).toBe(brandLogo('HP'));
    expect(brandLogo('ASUSTeK')).toBe(brandLogo('Asus'));
  });

  it('gives nothing for an unknown, empty or missing brand', () => {
    expect(brandLogo('Totally New Brand')).toBeNull();
    expect(brandLogo('')).toBeNull();
    expect(brandLogo('   ')).toBeNull();
    expect(brandLogo('---')).toBeNull();
    expect(brandLogo(null)).toBeNull();
    expect(brandLogo(undefined)).toBeNull();
  });

  it('every logo has a box around its shape and at least one shape with a colour', () => {
    for (const brand of ['Apple', 'Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI', 'Lenovo', 'Samsung', 'Huawei', 'Xiaomi', 'LG', 'Alienware', 'Toshiba']) {
      const logo = brandLogo(brand)!;
      const [x, y, width, height] = logo.viewBox.split(' ').map(Number);
      expect([x, y, width, height].every(Number.isFinite)).withContext(brand + ' viewBox').toBeTrue();
      expect(width).withContext(brand + ' width').toBeGreaterThan(0);
      expect(height).withContext(brand + ' height').toBeGreaterThan(0);
      expect(logo.paths.length).withContext(brand + ' shapes').toBeGreaterThan(0);
      for (const shape of logo.paths) {
        expect(shape.d.length).toBeGreaterThan(10);
        expect(shape.fill).withContext(brand + ' colour').toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
