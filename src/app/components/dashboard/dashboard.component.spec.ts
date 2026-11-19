import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { DashboardComponent } from './dashboard.component';
import { ProductService } from '../../services/product/product.service';
import { CategoryService } from '../../services/category/category.service';

const CATEGORIES = [
  { id: 1, name: 'Mac', brands: ['Apple'] },
  { id: 2, name: 'Windows', brands: ['Asus', 'Dell', 'HP'] },
];

function product(id: number, categoryId: number, brand: string | null, extra: object = {}): any {
  return { id, sku: `S-${id}`, name: `P${id}`, category_id: categoryId, brand, selling_price: 1, track_stock: 0,
    stock_quantity: 1, min_stock_level: 0, is_archived: false, ...extra };
}

const PRODUCTS = [
  product(1, 1, 'Apple', { track_stock: 1 }),
  product(2, 1, 'Apple'),
  product(3, 2, 'Asus', { track_stock: 1 }),
  product(4, 2, 'Asus', { track_stock: 1 }),
  product(5, 2, 'Dell'),
  product(6, 2, 'Asus', { is_archived: true }),
];

describe('DashboardComponent', () => {
  let fixture: ComponentFixture<DashboardComponent>;
  let component: DashboardComponent;
  let products: { getAllProducts: jasmine.Spy };
  let categories: { getCategories: jasmine.Spy };

  async function create(): Promise<void> {
    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');

  beforeEach(async () => {
    products = { getAllProducts: jasmine.createSpy('getAllProducts').and.returnValue(of(PRODUCTS)) };
    categories = { getCategories: jasmine.createSpy('getCategories').and.returnValue(of(CATEGORIES)) };
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), { provide: ProductService, useValue: products }, { provide: CategoryService, useValue: categories }],
    }).compileComponents();
  });

  it('asks for every product (so archived ones can be reported) and every category', async () => {
    await create();
    expect(products.getAllProducts).toHaveBeenCalledWith(true);
    expect(categories.getCategories).toHaveBeenCalled();
  });

  it('shows the totals, one card per category, and the stock split', async () => {
    await create();
    const cards = Array.from(dom().querySelectorAll('app-stat-card')).map(c => (c.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(cards.length).toBe(5);
    expect(cards[0]).toContain('Total products');
    expect(cards[0]).toContain('5');
    expect(cards[0]).toContain('1 archived (not counted)');
    expect(cards[1]).toContain('Mac');
    expect(cards[1]).toContain('2');
    expect(cards[2]).toContain('Windows');
    expect(cards[2]).toContain('3');
    expect(cards[3]).toContain('Stock counted');
    expect(cards[3]).toContain('3');
    expect(cards[4]).toContain('Single items');
    expect(cards[4]).toContain('2');
  });

  /** The text of one brand row, e.g. "Asus 2 · 67%" (spacing inside a row depends on the layout, so it is normalised). */
  const row = (brand: string): string =>
    (Array.from(dom().querySelectorAll('li')).find(li => (li.textContent ?? '').trim().startsWith(brand))?.textContent ?? '')
      .replace(/\s+/g, ' ').trim();

  it('lists the brands of each category with counts and percentages', async () => {
    await create();
    expect(text()).toContain('Windows by brand');
    expect(row('Asus')).toMatch(/^Asus\s*2\s*·\s*67%$/);
    expect(row('Dell')).toMatch(/^Dell\s*1\s*·\s*33%$/);
    expect(row('HP')).toMatch(/^HP\s*0\s*·\s*0%$/);
    expect(row('Apple')).toMatch(/^Apple\s*2\s*·\s*100%$/);
  });

  it('draws each bar as wide as its share', async () => {
    await create();
    const asus = Array.from(dom().querySelectorAll('li')).find(li => (li.textContent ?? '').includes('Asus')) as HTMLElement;
    const bar = asus.querySelector('.bar-fill') as HTMLElement;
    expect(bar.style.width).toBe('67%');
  });

  it('every number links to the Products page already filtered', async () => {
    await create();
    const hrefs = Array.from(dom().querySelectorAll('a')).map(a => a.getAttribute('href'));
    expect(hrefs).toContain('/products');                                   // total
    expect(hrefs).toContain('/products?category=2');                        // Windows card
    expect(hrefs).toContain('/products?category=2&brand=Asus');             // Asus row
    expect(hrefs).toContain('/products?category=1&brand=Apple');
  });

  it('shows the stock-tracking bar with both counts', async () => {
    await create();
    expect(text()).toContain('Stock tracking');
    expect(text()).toMatch(/Counted\s*3\s*\(60%\)/);
    expect(text()).toMatch(/Single items\s*2\s*\(40%\)/);
  });

  it('shows a friendly message and no charts when there are no products yet', async () => {
    products.getAllProducts.and.returnValue(of([]));
    await create();
    expect(text()).toContain('No products yet');
    expect(text()).not.toContain('by brand');
    expect(text()).not.toContain('Stock tracking');
  });

  it('shows a loading placeholder until the data arrives', async () => {
    const waiting = new Subject<any[]>();
    products.getAllProducts.and.returnValue(waiting);
    await create();
    expect(dom().querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(dom().querySelectorAll('[data-skeleton][data-kind="stats"] [data-skeleton-item]').length).toBe(5);

    waiting.next(PRODUCTS);
    waiting.complete();
    fixture.detectChanges();
    expect(dom().querySelector('[aria-busy="true"]')).toBeNull();
    expect(text()).toContain('Total products');
  });

  it('shows the error with a Try again button that loads it again', async () => {
    products.getAllProducts.and.returnValue(throwError(() => ({ error: { error: 'Server is down' } })));
    await create();
    expect(text()).toContain('Server is down');

    products.getAllProducts.and.returnValue(of(PRODUCTS));
    (Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').includes('Try again')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(text()).not.toContain('Server is down');
    expect(text()).toContain('Total products');
  });

  it('Refresh loads the latest numbers', async () => {
    await create();
    products.getAllProducts.and.returnValue(of([...PRODUCTS, product(9, 1, 'Apple')]));
    (Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').includes('Refresh')) as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(products.getAllProducts).toHaveBeenCalledTimes(2);
    expect(row('Apple')).toMatch(/^Apple\s*3\s*·\s*100%$/);
  });
});
