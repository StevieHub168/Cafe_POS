import { computeStats } from './dashboard-stats';
import { Category } from '../../models/category.model';
import { Product } from '../../models/product.model';

const MAC: Category = { id: 1, name: 'Mac', brands: ['Apple'] };
const WINDOWS: Category = { id: 2, name: 'Windows', brands: ['Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI'] };

function product(id: number, categoryId: number, brand: string | null, extra: Partial<Product> = {}): Product {
  return {
    id, sku: `SKU-${id}`, name: `Product ${id}`, category_id: categoryId, brand: brand ?? undefined,
    selling_price: 100, track_stock: 0, stock_quantity: 1, min_stock_level: 0, is_archived: false, ...extra,
  } as Product;
}

const DATA: Product[] = [
  product(1, 1, 'Apple', { track_stock: 1 }),
  product(2, 1, 'Apple'),
  product(3, 2, 'Asus', { track_stock: 1 }),
  product(4, 2, 'Asus', { track_stock: 1 }),
  product(5, 2, 'Dell'),
  product(6, 2, 'Lenovo', { track_stock: 1 }),   // a brand that is not in the Windows list
  product(7, 2, null),                            // no brand
  product(8, 2, 'Asus', { is_archived: true }),   // archived: never counted
];

describe('computeStats', () => {
  const stats = computeStats(DATA, [MAC, WINDOWS]);
  const windows = stats.categories[1];

  it('counts only active products and reports the archived ones separately', () => {
    expect(stats.total).toBe(7);
    expect(stats.archived).toBe(1);
  });

  it('counts products per category', () => {
    expect(stats.categories.map(c => [c.name, c.count])).toEqual([['Mac', 2], ['Windows', 5]]);
  });

  it('counts products per brand, most first, equal counts keep the brand-list order', () => {
    expect(windows.brands.map(b => [b.name, b.count])).toEqual([
      ['Asus', 2], ['Dell', 1], ['Lenovo', 1], ['HP', 0], ['Acer', 0], ['Surface', 0], ['MSI', 0],
    ]);
  });

  it('never counts an archived product in a brand', () => {
    expect(windows.brands.find(b => b.name === 'Asus')?.count).toBe(2);   // not 3
  });

  it('adds a brand that is on products but missing from the category list', () => {
    expect(windows.brands.some(b => b.name === 'Lenovo')).toBeTrue();
  });

  it('counts products that have no brand', () => {
    expect(windows.noBrand).toBe(1);
    expect(stats.categories[0].noBrand).toBe(0);
  });

  it('splits active products into stock counted and single items', () => {
    expect(stats.tracked).toBe(4);
    expect(stats.single).toBe(3);
    expect(stats.tracked + stats.single).toBe(stats.total);
  });

  it('matches brands ignoring capital letters and spaces', () => {
    const result = computeStats([product(1, 2, '  asus '), product(2, 2, 'ASUS')], [WINDOWS]);
    expect(result.categories[0].brands[0]).toEqual({ name: 'Asus', count: 2 });
    expect(result.categories[0].brands.length).toBe(6);   // no extra "asus" row
  });

  it('builds the brand list from the products when the category has no brand list', () => {
    const free: Category = { id: 3, name: 'Accessories', brands: null };
    const result = computeStats([product(1, 3, 'Logitech'), product(2, 3, 'logitech'), product(3, 3, 'Anker')], [free]);
    expect(result.categories[0].brands.map(b => [b.name, b.count])).toEqual([['Logitech', 2], ['Anker', 1]]);
  });

  it('shows a category with no products as zero', () => {
    const result = computeStats([product(1, 1, 'Apple')], [MAC, WINDOWS]);
    expect(result.categories[1].count).toBe(0);
    expect(result.categories[1].brands.every(b => b.count === 0)).toBeTrue();
  });

  it('is all zeros when there is nothing yet', () => {
    expect(computeStats([], [])).toEqual({ total: 0, archived: 0, tracked: 0, single: 0, categories: [] });
    expect(computeStats([], [MAC]).categories[0].count).toBe(0);
  });

  it('does not change the lists it is given', () => {
    const products = DATA.map(p => ({ ...p }));
    const categories = [{ ...MAC, brands: [...(MAC.brands ?? [])] }, { ...WINDOWS, brands: [...(WINDOWS.brands ?? [])] }];
    computeStats(products, categories);
    expect(products).toEqual(DATA.map(p => ({ ...p })));
    expect(categories[1].brands).toEqual(['Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI']);
  });
});
