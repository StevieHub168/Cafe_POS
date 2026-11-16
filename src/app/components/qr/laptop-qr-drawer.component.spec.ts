import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { LaptopQrDrawerComponent } from './laptop-qr-drawer.component';
import { ConfigService } from '../../services/config.service';
import { Product } from '../../models/product.model';

const LAPTOP: Product = {
  id: 7, sku: 'MAC-005', code: 'LP-0042', name: 'MacBook Air 13" M1', category_id: 1, category_name: 'Mac', brand: 'Apple',
  selling_price: 799, stock_quantity: 1, min_stock_level: 0, is_archived: false, image_url: '/uploads/a.png',
};

describe('LaptopQrDrawerComponent (the QR code of a laptop)', () => {
  let fixture: ComponentFixture<LaptopQrDrawerComponent>;
  let component: LaptopQrDrawerComponent;
  let navigate: jasmine.Spy;
  let closed: number;

  async function open(over: { product?: Product; justSaved?: boolean; base?: { url: string; fromSettings: boolean } } = {}): Promise<void> {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    await TestBed.configureTestingModule({
      imports: [LaptopQrDrawerComponent],
      providers: [
        { provide: ConfigService, useValue: { baseUrl: () => of(over.base ?? { url: 'https://thastore.example', fromSettings: true }) } },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LaptopQrDrawerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('product', over.product ?? LAPTOP);
    if (over.justSaved) fixture.componentRef.setInput('justSaved', true);
    closed = 0;
    component.closed.subscribe(() => closed++);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const dialog = () => dom().querySelector('[role="dialog"]') as HTMLElement;
  const button = (label: string) => Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement;

  it('is a SIDE drawer from the right edge, not a centered popup', async () => {
    await open();
    const backdrop = dialog().parentElement!;
    expect(backdrop.classList).toContain('justify-end');
    expect(backdrop.classList).not.toContain('items-center');
    expect(dialog().classList).toContain('h-full');
    expect(dialog().getAttribute('aria-label')).toBe('QR code');
  });

  it('shows the laptop, its code, its QR and the address inside the QR', async () => {
    await open();
    expect(dom().querySelector('[data-name]')!.textContent).toBe('MacBook Air 13" M1');
    expect(text()).toContain('Apple · Mac · $799');
    expect(dom().querySelector('[data-code]')!.textContent).toBe('LP-0042');
    expect(dom().querySelector('[data-link]')!.textContent).toBe('https://thastore.example/l/LP-0042');
    const qr = dom().querySelector('svg[data-qr]')!;
    expect(qr.getAttribute('aria-label')).toBe('QR code of laptop LP-0042');
    expect(qr.querySelector('path')!.getAttribute('d')!.length).toBeGreaterThan(100);
  });

  it('right after a new laptop was saved the title says so', async () => {
    await open({ justSaved: true });
    expect(dialog().getAttribute('aria-label')).toBe('Laptop saved');
    expect(text()).toContain('The QR code was made for you.');
  });

  it('with the shop address set there is no warning', async () => {
    await open();
    expect(dom().querySelector('[data-address-warning]')).toBeNull();
  });

  it('the address warning is switched off in this window (the address is still shown under the code)', async () => {
    await open({ base: { url: 'http://localhost:4000', fromSettings: false } });
    expect(dom().querySelector('[data-address-warning]')).toBeNull();
    expect((dom().querySelector('[data-link]') as HTMLElement).textContent).toContain('http://localhost:4000/l/');
  });

  it('"Print 2 labels" opens the labels page with this laptop picked and 2 labels each, and closes', async () => {
    await open();
    button('Print 2 labels (laptop + charger)').click();
    expect(navigate).toHaveBeenCalledOnceWith(['/labels'], { queryParams: { ids: 7, per: 2 } });
    expect(closed).toBe(1);
  });

  it('"Download the QR picture" saves a PNG named after the code', async () => {
    await open();
    const saved: string[] = [];
    spyOn(HTMLAnchorElement.prototype, 'click').and.callFake(function (this: HTMLAnchorElement) { saved.push(this.download); });
    button('Download the QR picture').click();
    await new Promise(resolve => setTimeout(resolve, 300));
    fixture.detectChanges();
    expect(saved).toEqual(['LP-0042-qr.png']);
    expect(text()).toContain('Picture saved.');
  });

  it('Done, the ✕, the dark background and Esc all close it', async () => {
    await open();
    button('Done').click();
    button('Close').click();
    dialog().parentElement!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(4);
  });

  it('a click inside the drawer does not close it', async () => {
    await open();
    dialog().click();
    expect(closed).toBe(0);
  });

  it('a product with no code shows no QR (and nothing breaks)', async () => {
    await open({ product: { ...LAPTOP, code: undefined } });
    expect(dom().querySelector('svg[data-qr]')).toBeNull();
    expect(text()).toContain('MacBook Air 13" M1');
  });
});
