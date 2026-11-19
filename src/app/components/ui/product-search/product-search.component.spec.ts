import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductSearchComponent } from './product-search.component';
import { Product } from '../../../models/product/product.model';

const product = (id: number, name: string, over: Partial<Product> = {}): Product => ({
  id, sku: `S-${id}`, name, category_id: 1, brand: 'Apple', model: '', selling_price: 999, extra_prices: [], stock_quantity: 1,
  min_stock_level: 0, is_archived: false, image_url: null, ...over,
});

const LIST = [
  product(1, 'MacBook Air M5', { sku: 'MAC-901', selling_price: 999 }),
  product(2, 'MacBook Pro 14 M5', { sku: 'MAC-902', selling_price: 1999, image_url: '/uploads/pro.png' }),
  product(3, 'Asus TUF A15', { sku: 'WIN-ASU-004', brand: 'Asus', model: 'TUF Gaming A15', selling_price: 749 }),
  product(4, 'Old MacBook', { sku: 'MAC-009', is_archived: true }),
  product(5, 'Dell XPS 13', { sku: 'DEL-005', brand: 'Dell', hold_status: 'booked' }),
];

describe('ProductSearchComponent', () => {
  let fixture: ComponentFixture<ProductSearchComponent>;
  let component: ProductSearchComponent;
  let typed: string[];
  let picked: Product[];

  async function create(inputs: Partial<Pick<ProductSearchComponent, 'products' | 'text' | 'hideHeld' | 'limit' | 'inputId'>> = {}): Promise<void> {
    await TestBed.configureTestingModule({ imports: [ProductSearchComponent] }).compileComponents();
    fixture = TestBed.createComponent(ProductSearchComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('products', inputs.products ?? LIST);
    for (const [key, value] of Object.entries(inputs)) if (key !== 'products') fixture.componentRef.setInput(key, value);
    typed = [];
    picked = [];
    component.textChange.subscribe(t => typed.push(t));
    component.picked.subscribe(p => picked.push(p));
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const box = () => dom().querySelector('input') as HTMLInputElement;
  const type = (value: string) => { box().value = value; box().dispatchEvent(new Event('input')); fixture.detectChanges(); };
  const rows = () => Array.from(dom().querySelectorAll('ul[aria-label="Your products that match"] li')) as HTMLElement[];
  const names = () => rows().map(li => li.querySelector('.truncate')!.textContent!.trim());
  const press = (index: number) => rows()[index].querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));

  it('is a plain text box with the id it was given, and lists nothing before something is typed', async () => {
    await create({ inputId: 'b-product' });
    expect(box().type).toBe('text');
    expect(box().id).toBe('b-product');
    expect(rows().length).toBe(0);
  });

  it('shows the text it is given, and follows when the parent changes it', async () => {
    await create({ text: 'MacBook Air M5' });
    expect(box().value).toBe('MacBook Air M5');
    fixture.componentRef.setInput('text', 'Asus TUF A15');
    fixture.detectChanges();
    expect(box().value).toBe('Asus TUF A15');
  });

  it('tells the parent every change of the text', async () => {
    await create();
    type('mac');
    type('macb');
    expect(typed).toEqual(['mac', 'macb']);
  });

  it('lists the products that match every word typed (name, brand, model or SKU), never archived ones', async () => {
    await create();
    type('macbook');
    expect(names()).toEqual(['MacBook Air M5', 'MacBook Pro 14 M5']);
    type('air m5');
    expect(names()).toEqual(['MacBook Air M5']);
    type('tuf gaming');
    expect(names()).toEqual(['Asus TUF A15']);
    type('win-asu');
    expect(names()).toEqual(['Asus TUF A15']);
    type('old');
    expect(rows().length).toBe(0);
    type('xyz');
    expect(rows().length).toBe(0);
  });

  it('shows each one with its price and photo', async () => {
    await create();
    type('macbook');
    expect(rows()[0].textContent).toContain('$999');
    expect(rows()[1].textContent).toContain('$1,999');
    expect(rows()[1].querySelector('img')!.getAttribute('src')).toContain('/uploads/pro.png');
  });

  it('lists at most 6 (or the limit it is given)', async () => {
    const many = Array.from({ length: 10 }, (_, i) => product(i + 1, `Laptop ${i}`));
    await create({ products: many });
    type('laptop');
    expect(rows().length).toBe(6);
    fixture.componentRef.setInput('limit', 3);
    type('laptop');
    expect(rows().length).toBe(3);
  });

  describe('a laptop that is booked or in repair', () => {
    it('is offered with a small tag by default', async () => {
      await create();
      type('dell');
      expect(names()).toEqual(['Dell XPS 13']);
      expect(rows()[0].textContent).toContain('Booked');
      TestBed.resetTestingModule();
      await create({ products: [product(6, 'HP 15', { hold_status: 'repair' })] });
      type('hp');
      expect(rows()[0].textContent).toContain('In repair');
    });

    it('is left out when hideHeld is on', async () => {
      await create({ hideHeld: true });
      type('dell');
      expect(rows().length).toBe(0);
    });
  });

  describe('choosing', () => {
    it('clicking a match tells the parent which product, and closes the list', async () => {
      await create();
      type('air m5');
      press(0);
      fixture.detectChanges();
      expect(picked.map(p => p.id)).toEqual([1]);
      expect(rows().length).toBe(0);
    });

    it('the click does not take the focus from the box first (mousedown is stopped)', async () => {
      await create();
      type('air m5');
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
      rows()[0].querySelector('button')!.dispatchEvent(down);
      expect(down.defaultPrevented).toBeTrue();
    });

    it('Enter picks the first match instead of submitting a form; with no match Enter is left alone', async () => {
      await create();
      type('macbook');
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      box().dispatchEvent(enter);
      expect(enter.defaultPrevented).toBeTrue();
      expect(picked.map(p => p.id)).toEqual([1]);

      type('nothing like this');
      const second = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      box().dispatchEvent(second);
      expect(second.defaultPrevented).toBeFalse();
      expect(picked.length).toBe(1);
    });

    it('leaving the box closes the list', async () => {
      await create();
      type('macbook');
      expect(rows().length).toBe(2);
      box().dispatchEvent(new Event('blur'));
      fixture.detectChanges();
      expect(rows().length).toBe(0);
    });
  });
});
