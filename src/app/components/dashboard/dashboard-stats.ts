import { Category } from '../../models/category.model';
import { Product } from '../../models/product.model';

export interface BrandCount {
  name: string;
  count: number;
}

export interface CategoryStats {
  id: number | undefined;
  name: string;
  /** Active products in this category. */
  count: number;
  /** Brands of this category with how many products each has (most first). */
  brands: BrandCount[];
  /** Products in this category that have no brand. */
  noBrand: number;
}

export interface DashboardStats {
  /** Active products (not archived). */
  total: number;
  /** Archived products, not counted anywhere else. */
  archived: number;
  /** Active products that count their stock. */
  tracked: number;
  /** Active products that are a single item (stock tracking off). */
  single: number;
  categories: CategoryStats[];
}

const same = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();

/**
 * Turns the products and categories you already have into the numbers shown on the Dashboard.
 * Only active (not archived) products are counted, and everything is counted from your real data.
 */
export function computeStats(products: Product[], categories: Category[]): DashboardStats {
  const active = products.filter(p => !p.is_archived);

  const perCategory = categories.map((category): CategoryStats => {
    const mine = active.filter(p => p.category_id === category.id);
    const listed = category.brands ?? [];

    const brands: BrandCount[] = listed.map(name => ({ name, count: mine.filter(p => same(p.brand, name)).length }));

    // Brands that are on products but not in the category's brand list (free-text categories, older data).
    const others = new Map<string, BrandCount>();
    let noBrand = 0;
    for (const product of mine) {
      const brand = (product.brand ?? '').trim();
      if (!brand) {
        noBrand++;
      } else if (!listed.some(l => same(l, brand))) {
        const known = others.get(brand.toLowerCase());
        if (known) known.count++;
        else others.set(brand.toLowerCase(), { name: brand, count: 1 });
      }
    }
    brands.push(...others.values());
    brands.sort((a, b) => b.count - a.count);   // stable: equal counts keep the order of the brand list

    return { id: category.id, name: category.name, count: mine.length, brands, noBrand };
  });

  const tracked = active.filter(p => !!p.track_stock).length;
  return {
    total: active.length,
    archived: products.length - active.length,
    tracked,
    single: active.length - tracked,
    categories: perCategory
  };
}
