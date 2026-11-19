import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';

import { MenuComponent } from './menu.component';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../services/category.service';
import { BookingService } from '../services/booking.service';
import { InvoiceService } from '../services/invoice.service';
import { RepairService } from '../services/repair.service';
import { RepairFormComponent } from '../components/repairs/repair-form.component';
import { BookingFormComponent } from '../components/bookings/booking-form.component';
import { InvoiceFormComponent } from '../components/invoices/invoice-form.component';
import { TelegramNotifier } from '../services/telegram-notifier.service';
import { ScanActionService } from '../services/scan-action.service';

function product(id: number, images: string[] | undefined, extra: object = {}): any {
  return {
    id, sku: `S-${id}`, name: `Laptop ${id}`, category_id: 1, category_name: 'Mac', brand: 'Apple', model: '',
    description: null, selling_price: 100, extra_prices: [], track_stock: 0, stock_quantity: 1, min_stock_level: 0,
    is_archived: false, images, image_url: images?.[0] ?? null, ...extra,
  };
}

const THREE = ['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg'];

describe('MenuComponent', () => {
  // Sending to Telegram is replaced by a spy here: the real one is tested in telegram-notifier.service.spec.ts.
  let telegramApi: { send: jasmine.Spy };
  beforeEach(() => { telegramApi = { send: jasmine.createSpy('send') }; });

  let component: MenuComponent;
  let fixture: ComponentFixture<MenuComponent>;

  let productsApi: { [k: string]: jasmine.Spy };
  let bookingsApi: { [k: string]: jasmine.Spy };
  let invoicesApi: { [k: string]: jasmine.Spy };
  let repairsApi: { [k: string]: jasmine.Spy };

  /** `beforeStart` runs before the Menu is made (a request from the scan screen is already waiting when the Menu opens). */
  async function create(products: any[], beforeStart?: (scan: ScanActionService) => void): Promise<void> {
    productsApi = {
      getAllProducts: jasmine.createSpy('getAllProducts').and.callFake(() => of(products.filter(p => !p.is_archived))),
      updateProduct: jasmine.createSpy('updateProduct').and.callFake((id: number, changes: any) => of({ ...products.find(p => p.id === id), ...changes })),
      uploadImage: jasmine.createSpy('uploadImage').and.returnValue(of({ url: '/uploads/x.png' })),
      discardImage: jasmine.createSpy('discardImage').and.returnValue(of({ message: 'ok' })),
    };
    bookingsApi = {
      createBooking: jasmine.createSpy('createBooking').and.callFake((b: any) => of({ id: 5, remaining_balance: b.full_price - b.deposit, ...b })),
    };
    invoicesApi = {
      getNextNumber: jasmine.createSpy('getNextNumber').and.returnValue(of(44)),
      createInvoice: jasmine.createSpy('createInvoice').and.callFake((b: any) => {
        const total = b.items.reduce((sum: number, i: any) => sum + i.qty * i.unit_price, 0);
        return of({ id: 99, number: 44, total, balance: total - b.deposit, ...b });
      }),
      updateInvoice: jasmine.createSpy('updateInvoice').and.callFake((id: number, b: any) => of({ id, number: 44, total: 100, balance: 0, ...b })),
    };
    repairsApi = {
      createRepair: jasmine.createSpy('createRepair').and.callFake((r: any) => of({ id: 7, status: 'received', fixed_date: null, picked_up_date: null, ...r })),
      updateRepair: jasmine.createSpy('updateRepair').and.callFake((id: number, r: any) => of({ id, ...r })),
    };
    await TestBed.configureTestingModule({
      imports: [MenuComponent],
      providers: [
        { provide: ProductService, useValue: productsApi },
        { provide: TelegramNotifier, useValue: telegramApi },
        { provide: RepairService, useValue: repairsApi },
        { provide: CategoryService, useValue: { getCategories: () => of([{ id: 1, name: 'Mac', brands: ['Apple'] }]) } },
        { provide: BookingService, useValue: bookingsApi },
        { provide: InvoiceService, useValue: invoicesApi },
      ],
    }).compileComponents();
    beforeStart?.(TestBed.inject(ScanActionService));
    fixture = TestBed.createComponent(MenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const cards = () => Array.from(dom().querySelectorAll('.group.flex')) as HTMLElement[];
  const shownSrc = (card: HTMLElement) => (card.querySelector('img') as HTMLImageElement | null)?.getAttribute('src');
  const click = (card: HTMLElement, selector: string) => { (card.querySelector(selector) as HTMLButtonElement).click(); fixture.detectChanges(); };

  it('should create', async () => {
    await create([]);
    expect(component).toBeTruthy();
  });

  it('while the laptops load it shows the grey shapes of the cards (no spinner), then the cards', async () => {
    await create([]);
    const pending = new Subject<any[]>();
    productsApi['getAllProducts'].and.returnValue(pending);
    component.loadData();
    fixture.detectChanges();
    expect(dom().querySelectorAll('[data-skeleton][data-kind="product-cards"] [data-skeleton-item]').length).toBe(10);
    expect(dom().querySelector('.animate-spin')).toBeNull();
    expect(dom().textContent).not.toContain('No laptops');
    pending.next([{ id: 1, sku: 'MAC-001', name: 'MacBook Air', category_id: 1, brand: 'Apple', selling_price: 999, stock_quantity: 1, min_stock_level: 0, is_archived: false }]);
    pending.complete();
    fixture.detectChanges();
    expect(dom().querySelector('[data-skeleton]')).toBeNull();
    expect(cards().length).toBe(1);
  });

  describe('brand chips with logos', () => {
    const chips = () => Array.from(dom().querySelectorAll('button')).filter(b => b.querySelector('app-brand-logo')) as HTMLButtonElement[];
    const showWindows = async (brands: string[]) => {
      await create([product(1, [], { category_id: 2, category_name: 'Windows', brand: brands[0] })]);
      component.categories = [{ id: 2, name: 'Windows', brands } as any];
      component.setCategory(2);
      fixture.detectChanges();
    };

    it('each brand chip shows the logo of the brand before its name', async () => {
      await showWindows(['Asus', 'Dell', 'Surface']);
      expect(chips().map(c => c.textContent!.trim())).toEqual(['Asus', 'Dell', 'Surface']);
      for (const chip of chips()) {
        expect(chip.querySelector('app-brand-logo svg')).withContext(chip.textContent ?? '').not.toBeNull();
      }
    });

    it('the logo sits on a white plate, so it can be read on the blue of the chosen chip', async () => {
      await showWindows(['Asus', 'Dell']);
      chips()[1].click();
      fixture.detectChanges();
      expect(component.selectedBrand).toBe('Dell');
      expect(chips()[1].classList).toContain('bg-primary-600');
      expect(chips()[1].querySelector('app-brand-logo')!.parentElement!.classList).toContain('bg-white');
    });

    it('a brand with no logo yet shows a grey letter, and the chip still filters', async () => {
      await showWindows(['Asus', 'Framework']);
      const chip = chips().find(c => c.textContent!.includes('Framework'))!;
      expect(chip.querySelector('app-brand-logo svg')).toBeNull();
      expect(chip.querySelector('app-brand-logo')!.textContent!.trim()).toBe('F');
      chip.click();
      expect(component.selectedBrand).toBe('Framework');
    });
  });

  describe('photos on a card', () => {
    it('shows the cover (the first photo)', async () => {
      await create([product(1, THREE)]);
      expect(shownSrc(cards()[0])).toBe(THREE[0]);
    });

    it('a product with several photos gets arrows and one dot per photo', async () => {
      await create([product(1, THREE)]);
      const card = cards()[0];
      expect(card.querySelector('button[aria-label="Previous photo"]')).not.toBeNull();
      expect(card.querySelector('button[aria-label="Next photo"]')).not.toBeNull();
      expect(card.querySelectorAll('button[aria-label^="Photo "]').length).toBe(3);
    });

    it('a product with one photo has no arrows or dots', async () => {
      await create([product(1, [THREE[0]])]);
      const card = cards()[0];
      expect(card.querySelector('button[aria-label="Next photo"]')).toBeNull();
      expect(card.querySelectorAll('button[aria-label^="Photo "]').length).toBe(0);
      expect(shownSrc(card)).toBe(THREE[0]);
    });

    it('a product with no photo shows the picture placeholder and no controls', async () => {
      await create([product(1, [])]);
      const card = cards()[0];
      expect(card.querySelector('img')).toBeNull();
      expect(card.querySelector('svg')).not.toBeNull();
      expect(card.querySelector('button[aria-label="Next photo"]')).toBeNull();
    });

    it('an older product that only has a cover (no photo list) still shows it', async () => {
      await create([product(1, undefined, { image_url: 'https://a.example/only.jpg' })]);
      expect(shownSrc(cards()[0])).toBe('https://a.example/only.jpg');
    });

    it('Next shows the next photo, and wraps around to the first after the last', async () => {
      await create([product(1, THREE)]);
      const card = cards()[0];
      click(card, 'button[aria-label="Next photo"]');
      expect(shownSrc(card)).toBe(THREE[1]);
      click(card, 'button[aria-label="Next photo"]');
      expect(shownSrc(card)).toBe(THREE[2]);
      click(card, 'button[aria-label="Next photo"]');
      expect(shownSrc(card)).toBe(THREE[0]);
    });

    it('Previous goes back, and wraps around to the last from the first', async () => {
      await create([product(1, THREE)]);
      const card = cards()[0];
      click(card, 'button[aria-label="Previous photo"]');
      expect(shownSrc(card)).toBe(THREE[2]);
      click(card, 'button[aria-label="Previous photo"]');
      expect(shownSrc(card)).toBe(THREE[1]);
    });

    it('a dot jumps straight to that photo, and the current dot is highlighted', async () => {
      await create([product(1, THREE)]);
      const card = cards()[0];
      click(card, 'button[aria-label="Photo 3 of 3"]');
      expect(shownSrc(card)).toBe(THREE[2]);
      const dots = Array.from(card.querySelectorAll('button[aria-label^="Photo "]'));
      expect(dots.map(d => d.classList.contains('bg-white'))).toEqual([false, false, true]);
    });

    it('every card keeps its own place: flipping one does not move the others', async () => {
      await create([product(1, THREE), product(2, THREE)]);
      click(cards()[0], 'button[aria-label="Next photo"]');
      expect(shownSrc(cards()[0])).toBe(THREE[1]);
      expect(shownSrc(cards()[1])).toBe(THREE[0]);
    });

    it('stays on a photo that exists when the photos change underneath (never shows nothing)', async () => {
      await create([product(1, THREE)]);
      component.goTo(component.products[0], 2);
      component.products = [product(1, [THREE[0]])];             // photos were removed meanwhile
      expect(component.photoNumber(component.products[0])).toBe(1);
      expect(component.currentPhoto(component.products[0])).toBe(THREE[0]);
    });

    it('Next / Previous do nothing for a product with fewer than 2 photos', async () => {
      await create([product(1, [THREE[0]])]);
      component.step(component.products[0], 1);
      component.step(component.products[0], -1);
      expect(component.currentPhoto(component.products[0])).toBe(THREE[0]);
    });

    it('arrows can be reached by keyboard and are labelled', async () => {
      await create([product(1, THREE)]);
      const next = cards()[0].querySelector('button[aria-label="Next photo"]') as HTMLButtonElement;
      expect(next.tagName).toBe('BUTTON');
      expect(next.type).toBe('button');
    });
  });

  describe('detail view (click a product)', () => {
    const detail = () => dom().querySelector('[role="dialog"]') as HTMLElement | null;
    const key = (name: string) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: name })); fixture.detectChanges(); };
    const FULL = product(1, THREE, {
      name: 'MacBook Air M1', brand: 'Apple', model: 'Air 13', sku: 'MAC-001', selling_price: 799,
      description: 'Chip M1\nRam 8GB | Storage 256GB', extra_prices: [{ label: '16GB / 512GB', price: 949 }],
      track_stock: 1, stock_quantity: 6, min_stock_level: 2,
    });

    it('shows the code of the laptop next to its SKU', async () => {
      await create([{ ...FULL, code: 'LP-0042' }]);
      cards()[0].click();
      fixture.detectChanges();
      expect(detail()!.querySelector('[data-code]')!.textContent).toBe('LP-0042');
    });

    it('a laptop without a code just shows its SKU', async () => {
      await create([FULL]);
      cards()[0].click();
      fixture.detectChanges();
      expect(detail()!.querySelector('[data-code]')).toBeNull();
      expect(detail()!.textContent).toContain('MAC-001');
    });

    it('the search finds a laptop by its code', async () => {
      await create([{ ...FULL, code: 'LP-0042' }, product(2, [], { name: 'Other', sku: 'OTH-1', code: 'LP-0043' })]);
      component.searchQuery = 'lp-0043';
      expect(component.filteredProducts.map(p => p.name)).toEqual(['Other']);
    });

    it('is closed until a product is clicked', async () => {
      await create([FULL]);
      expect(detail()).toBeNull();
    });

    it('is a panel on the right edge (like the Add / Edit product drawer), full height', async () => {
      await create([FULL]);
      cards()[0].click();
      fixture.detectChanges();
      const backdrop = dom().querySelector('.detail-backdrop') as HTMLElement;
      expect(backdrop.classList).toContain('justify-end');
      expect(detail()!.classList).toContain('h-full');
      expect(detail()!.classList).not.toContain('rounded-2xl');
    });

    it('clicking a card opens the detail of THAT product', async () => {
      await create([product(1, THREE, { name: 'First' }), product(2, THREE, { name: 'Second' })]);
      cards()[1].click();
      fixture.detectChanges();
      expect(detail()).not.toBeNull();
      expect(detail()!.querySelector('h2')!.textContent).toContain('Second');
    });

    it('shows the price, other prices, specs (line by line), SKU, model and stock', async () => {
      await create([FULL]);
      cards()[0].click();
      fixture.detectChanges();
      const text = detail()!.textContent!;
      expect(text).toContain('MacBook Air M1');
      expect(text).toContain('$799.00');
      expect(text).toContain('16GB / 512GB');
      expect(text).toContain('$949');
      expect(text).toContain('Ram 8GB | Storage 256GB');
      expect(text).toContain('MAC-001');
      expect(text).toContain('Air 13');
      expect(text).toContain('In stock · 6');
      const specs = Array.from(detail()!.querySelectorAll('p')).find(p => p.textContent!.includes('Chip M1'))!;
      expect(getComputedStyle(specs).whiteSpace).toBe('pre-line');
    });

    it('leaves out the sections a product does not have', async () => {
      await create([product(1, [], { description: null, extra_prices: [] })]);
      cards()[0].click();
      fixture.detectChanges();
      const text = detail()!.textContent!;
      expect(text).not.toContain('Other prices');
      expect(text).not.toContain('Specs');
      expect(detail()!.querySelector('img')).toBeNull();
    });

    it('says what the stock is: single item / in stock / low / out', async () => {
      await create([FULL]);
      const p = component.products[0];
      expect(component.stockInfo({ ...p, track_stock: false }).text).toBe('Single item');
      expect(component.stockInfo({ ...p, stock_quantity: 6 }).tone).toBe('success');
      expect(component.stockInfo({ ...p, stock_quantity: 2 })).toEqual({ text: 'Low stock · 2 left', tone: 'warning' });
      expect(component.stockInfo({ ...p, stock_quantity: 0 })).toEqual({ text: 'Out of stock', tone: 'danger' });
    });

    it('the close button, Esc and a click on the dark background all close it', async () => {
      await create([FULL]);
      const open = () => { cards()[0].click(); fixture.detectChanges(); };

      open();
      (detail()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(detail()).toBeNull();

      open();
      key('Escape');
      expect(detail()).toBeNull();

      open();
      (dom().querySelector('.detail-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(detail()).toBeNull();
    });

    it('a click INSIDE the detail does not close it', async () => {
      await create([FULL]);
      cards()[0].click();
      fixture.detectChanges();
      detail()!.click();
      fixture.detectChanges();
      expect(detail()).not.toBeNull();
    });

    it('thumbnails, arrows and the ← → keys flip the big photo, and the card keeps the same photo', async () => {
      await create([FULL]);
      cards()[0].click();
      fixture.detectChanges();
      const big = () => detail()!.querySelector('img')!.getAttribute('src');
      expect(big()).toBe(THREE[0]);

      (detail()!.querySelector('button[aria-label="Next photo"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(big()).toBe(THREE[1]);

      key('ArrowRight');
      expect(big()).toBe(THREE[2]);
      key('ArrowLeft');
      expect(big()).toBe(THREE[1]);

      (detail()!.querySelector('button[aria-label="Show photo 3"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(big()).toBe(THREE[2]);

      key('Escape');
      expect(shownSrc(cards()[0])).toBe(THREE[2]);
    });

    it('opening a product that was already flipped starts on the photo the card shows', async () => {
      await create([FULL]);
      click(cards()[0], 'button[aria-label="Next photo"]');
      cards()[0].click();
      fixture.detectChanges();
      expect(detail()!.querySelector('img')!.getAttribute('src')).toBe(THREE[1]);
    });

    it('flipping photos on the card (arrows / dots) does NOT open the detail', async () => {
      await create([FULL]);
      click(cards()[0], 'button[aria-label="Next photo"]');
      click(cards()[0], 'button[aria-label="Previous photo"]');
      click(cards()[0], 'button[aria-label="Photo 3 of 3"]');
      expect(detail()).toBeNull();
      expect(shownSrc(cards()[0])).toBe(THREE[2]);
    });

    it('a card can be opened with the keyboard (Enter / Space), but Enter on an arrow only flips', async () => {
      await create([FULL]);
      const card = cards()[0];
      expect(card.getAttribute('role')).toBe('button');
      expect(card.getAttribute('tabindex')).toBe('0');

      card.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      expect(detail()).not.toBeNull();
      key('Escape');

      card.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      fixture.detectChanges();
      expect(detail()).not.toBeNull();
      key('Escape');

      card.querySelector('button[aria-label="Next photo"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      fixture.detectChanges();
      expect(detail()).toBeNull();
    });

    it('arrow keys and Esc do nothing while the detail is closed', async () => {
      await create([FULL]);
      key('ArrowRight');
      key('Escape');
      expect(detail()).toBeNull();
      expect(shownSrc(cards()[0])).toBe(THREE[0]);
    });

    it('a product with a single photo has no arrows or thumbnails in the detail', async () => {
      await create([product(1, [THREE[0]])]);
      cards()[0].click();
      fixture.detectChanges();
      expect(detail()!.querySelector('button[aria-label="Next photo"]')).toBeNull();
      expect(detail()!.querySelector('button[aria-label^="Show photo"]')).toBeNull();
    });
  });
  // ---------------------------------------------------------------------------------------------
  describe('Sell / Book / Repair from a laptop', () => {
    const SINGLE = () => product(1, ['https://a.example/1.jpg'], { name: 'Laptop 1', selling_price: 100, track_stock: 0, stock_quantity: 1 });
    const COUNTED = () => product(2, ['https://a.example/2.jpg'], { name: 'MacBook Air 13" M1', selling_price: 799, track_stock: 1, stock_quantity: 6, min_stock_level: 2, brand: 'Apple' });
    const GONE = () => product(3, [], { name: 'Dell XPS 13', selling_price: 1199, track_stock: 1, stock_quantity: 0, min_stock_level: 1 });

    const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); fixture.detectChanges(); };
    const detailPanel = () => dom().querySelector('[aria-labelledby="product-detail-title"]') as HTMLElement | null;
    const bookDialog = () => dom().querySelector('[role="dialog"][aria-label="Book this laptop"]') as HTMLElement | null;
    const editor = () => dom().querySelector('app-invoice-editor [role="dialog"]') as HTMLElement | null;
    const viewer = () => dom().querySelector('app-invoice-viewer [role="dialog"]') as HTMLElement | null;
    const question = () => dom().querySelector('app-ask-dialog [role="alertdialog"]') as HTMLElement | null;
    /** The "Mark this laptop as sold?" review under the invoice paper. */
    const review = () => dom().querySelector('app-invoice-viewer [aria-labelledby="sold-review-title"]') as HTMLElement | null;
    const reviewText = () => (review()?.textContent ?? '').replace(/\s+/g, ' ');
    const notice = () => (dom().querySelector('[role="status"]')?.textContent ?? '').trim();
    /** A button by its words. Sell / Book / Repair in the laptop window are found by their data-action (each has a title and a line under it). */
    const ACTIONS: Record<string, string> = { Sell: 'sell', Book: 'book', Repair: 'repair' };
    const word = (label: string, root: ParentNode = dom()) => {
      const action = ACTIONS[label] ? root.querySelector(`button[data-action="${ACTIONS[label]}"]`) : null;
      return (action ?? Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === label)) as HTMLButtonElement;
    };
    const repairDialog = () => dom().querySelector('app-repair-form [role="dialog"]') as HTMLElement | null;
    const repairForm = () => fixture.debugElement.query(By.directive(RepairFormComponent)).componentInstance as RepairFormComponent;
    const bookingForm = () => fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
    const invoiceForm = () => fixture.debugElement.query(By.directive(InvoiceFormComponent)).componentInstance as InvoiceFormComponent;
    const esc = () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); fixture.detectChanges(); };

    /** Opens the laptop window of the n-th card. */
    const openLaptop = async (index = 0) => { cards()[index].click(); await settle(); };

    describe('a request from the scan screen (a scanned label)', () => {
      it('Sell opens the sale invoice of that laptop by itself', async () => {
        await create([SINGLE(), COUNTED()], scan => scan.ask({ kind: 'sell', productId: 2 }));
        await settle();
        expect(editor()).toBeTruthy();
        expect(component.invoicing?.type).toBe('sale');
        expect(component.invoicing?.product?.id).toBe(2);
      });

      it('Book opens the booking window of that laptop by itself', async () => {
        await create([SINGLE(), COUNTED()], scan => scan.ask({ kind: 'book', productId: 1 }));
        await settle();
        expect(bookDialog()).toBeTruthy();
        expect(component.bookingProduct?.id).toBe(1);
      });

      it('Repair opens the repair form of that laptop by itself', async () => {
        await create([SINGLE(), COUNTED()], scan => scan.ask({ kind: 'repair', productId: 1 }));
        await settle();
        expect(repairDialog()).toBeTruthy();
        expect(component.repairing?.prefill.product_id).toBe(1);
      });

      it('a request is used once: the next time the Menu loads nothing opens', async () => {
        await create([SINGLE()], scan => scan.ask({ kind: 'book', productId: 1 }));
        await settle();
        expect(component.bookingProduct?.id).toBe(1);
        component.closeBooking();
        component.loadData();
        await settle();
        expect(component.bookingProduct).toBeNull();
      });

      it('a laptop that is not on the Menu any more says so and opens nothing', async () => {
        await create([SINGLE()], scan => scan.ask({ kind: 'sell', productId: 99 }));
        await settle();
        expect(notice()).toBe('That laptop is not on the Menu any more.');
        expect(editor()).toBeNull();
        expect(bookDialog()).toBeNull();
        expect(repairDialog()).toBeNull();
      });

      it('a counted laptop with none left cannot be sold from here either', async () => {
        await create([GONE()], scan => scan.ask({ kind: 'sell', productId: 3 }));
        await settle();
        expect(editor()).toBeNull();
      });

      it('a pickup request is not for the Menu: it stays waiting for the Bookings page', async () => {
        let scanApi!: ScanActionService;
        await create([SINGLE()], scan => { scanApi = scan; scan.ask({ kind: 'pickup', bookingId: 3 }); });
        await settle();
        expect(editor()).toBeNull();
        expect(scanApi.takePickup()).toEqual({ kind: 'pickup', bookingId: 3 });
      });

      it('with no request the Menu opens nothing', async () => {
        await create([SINGLE()]);
        await settle();
        expect(editor() ?? bookDialog() ?? repairDialog()).toBeNull();
      });
    });

    describe('the buttons', () => {
      it('each choice has a short label, a clear full name for screen readers, and says what it does when you point at it', async () => {
        await create([SINGLE()]);
        await openLaptop();
        const info = (label: string) => { const b = word(label, detailPanel()!); return [b.textContent!.trim(), b.getAttribute('aria-label'), b.getAttribute('title')]; };
        expect(info('Sell')).toEqual(['Sell', 'Sell this laptop', 'Make a Sale and its invoice']);
        expect(info('Book')).toEqual(['Book', 'Book this laptop', 'Take a deposit and set the pickup day']);
        expect(info('Repair')).toEqual(['Repair', 'Repair this laptop', 'Start a repair job with 3 steps']);
      });

      it('they are one slim row of three equal buttons, in a group with a name, with an icon each', async () => {
        await create([SINGLE()]);
        await openLaptop();
        const group = detailPanel()!.querySelector('[role="group"][aria-label="What do you want to do with this laptop?"]') as HTMLElement;
        expect(group.classList).toContain('grid-cols-3');
        expect(Array.from(group.querySelectorAll('button')).map(b => b.textContent!.trim())).toEqual(['Sell', 'Book', 'Repair']);
        for (const b of Array.from(group.querySelectorAll('button'))) {
          expect(b.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
          expect(b.classList).toContain('h-12');                  // one line high, but a comfortable thumb target
        }
      });

      it('Sell is the main button (blue); Book and Repair are plain', async () => {
        await create([SINGLE()]);
        await openLaptop();
        expect(word('Sell', detailPanel()!).classList).toContain('bg-primary-600');
        expect(word('Book', detailPanel()!).classList).not.toContain('bg-primary-600');
        expect(word('Repair', detailPanel()!).classList).not.toContain('bg-primary-600');
      });

      it('an out-of-stock laptop says why it cannot be sold, under the buttons', async () => {
        await create([GONE()]);
        await openLaptop();
        expect(detailPanel()!.querySelector('[data-sell-note]')!.textContent!.trim()).toBe('Out of stock: nothing to sell.');
        expect(word('Sell', detailPanel()!).getAttribute('title')).toBe('Out of stock: nothing to sell');
      });

      it('a laptop that can be sold has no such note', async () => {
        await create([SINGLE()]);
        await openLaptop();
        expect(detailPanel()!.querySelector('[data-sell-note]')).toBeNull();
      });

      it('Sell, Book and Repair are at the bottom of the laptop window', async () => {
        await create([SINGLE()]);
        await openLaptop();
        for (const label of ['Sell', 'Book', 'Repair']) expect(word(label, detailPanel()!)).toBeTruthy();
      });

      it('all three can be used on a single laptop and on one with stock', async () => {
        await create([SINGLE(), COUNTED()]);
        await openLaptop(1);
        for (const label of ['Sell', 'Book', 'Repair']) expect(word(label, detailPanel()!).disabled).toBeFalse();
      });

      it('Sell is off when a counted laptop has none left (Book and Repair still work)', async () => {
        await create([GONE()]);
        await openLaptop();
        const sell = word('Sell', detailPanel()!);
        expect(sell.disabled).toBeTrue();
        expect(sell.getAttribute('title')).toBe('Out of stock: nothing to sell');
        expect(word('Book', detailPanel()!).disabled).toBeFalse();
        expect(word('Repair', detailPanel()!).disabled).toBeFalse();
        component.startSell(component.products[0]);
        fixture.detectChanges();
        expect(editor()).toBeNull();
      });

      it('starting one closes the laptop window (only one window at a time)', async () => {
        await create([SINGLE()]);
        for (const label of ['Sell', 'Book', 'Repair']) {
          await openLaptop();
          word(label, detailPanel()!).click();
          await settle();
          expect(detailPanel()).toBeNull();
          esc();
          if (label !== 'Book') esc();
        }
      });
    });

    describe('Book', () => {
      it('opens the booking form with this laptop filled in (name, link and price)', async () => {
        await create([COUNTED()]);
        await openLaptop();
        word('Book', detailPanel()!).click();
        await settle();
        expect(bookDialog()).not.toBeNull();
        expect(bookDialog()!.textContent).toContain('MacBook Air 13" M1');
        expect(bookingForm().form.product_name).toBe('MacBook Air 13" M1');
        expect(bookingForm().form.product_id).toBe(2);
        expect(bookingForm().form.full_price).toBe(799);
      });

      it('Esc, the ✕ and the dark background close it without booking', async () => {
        await create([COUNTED()]);
        for (const how of ['esc', 'x', 'backdrop']) {
          await openLaptop();
          word('Book', detailPanel()!).click();
          await settle();
          if (how === 'esc') esc();
          if (how === 'x') (bookDialog()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
          if (how === 'backdrop') (bookDialog()!.parentElement as HTMLElement).click();
          fixture.detectChanges();
          expect(bookDialog()).toBeNull();
        }
        expect(bookingsApi['createBooking']).not.toHaveBeenCalled();
        expect(question()).toBeNull();
      });

      it('cannot be closed while the booking is being saved', async () => {
        await create([COUNTED()]);
        await openLaptop();
        word('Book', detailPanel()!).click();
        await settle();
        bookingsApi['createBooking'].and.returnValue(new Subject<any>());
        Object.assign(bookingForm().form, { phone: '011968240', pickup_date: '2026-11-20' });
        bookingForm().submit();
        esc();
        component.closeBooking();
        expect(bookDialog()).not.toBeNull();
      });

      describe('after the booking is saved', () => {
        const book = async (index = 0) => {
          await openLaptop(index);
          word('Book', detailPanel()!).click();
          await settle();
          Object.assign(bookingForm().form, { phone: '011968240', telegram: '@Horth_Heng', deposit: 200, pickup_date: '2026-11-20', booking_date: '2026-11-10' });
          bookingForm().submit();
          await settle();
        };

        it('asks "Create the invoice now?" about THAT booking', async () => {
          await create([COUNTED()]);
          await book();
          expect(bookDialog()).toBeNull();
          expect(bookingsApi['createBooking']).toHaveBeenCalledTimes(1);
          expect(bookingsApi['createBooking'].calls.mostRecent().args[0].product_id).toBe(2);
          const box = question()!.textContent!.replace(/\s+/g, ' ');
          expect(box).toContain('Booking saved. Create the invoice now?');
          expect(box).toContain('MacBook Air 13" M1 · pickup 20/11/2026');
          expect(word('Yes, create invoice', question()!)).toBeTruthy();
          expect(word('Not now', question()!)).toBeTruthy();
        });

        it('has the focus on Yes (the likely answer)', async () => {
          await create([COUNTED()]);
          await book();
          expect(document.activeElement).toBe(word('Yes, create invoice', question()!));
        });

        it('Esc and the dark background do not answer it', async () => {
          await create([COUNTED()]);
          await book();
          esc();
          (dom().querySelector('.ask-backdrop') as HTMLElement).click();
          fixture.detectChanges();
          expect(question()).not.toBeNull();
        });

        it('"Not now" closes it, says the booking is saved, and makes no invoice', async () => {
          await create([COUNTED()]);
          await book();
          word('Not now', question()!).click();
          fixture.detectChanges();
          expect(question()).toBeNull();
          expect(editor()).toBeNull();
          expect(notice()).toBe('Booking saved.');
        });

        it('"Yes" opens the BOOKING invoice, filled in from the booking', async () => {
          await create([COUNTED()]);
          await book();
          word('Yes, create invoice', question()!).click();
          await settle();
          expect(question()).toBeNull();
          expect(editor()!.getAttribute('aria-label')).toBe('New booking invoice');
          const f = invoiceForm();
          expect(f.kind).toBe('booking');
          expect(f.form.booking_id).toBe(5);
          expect(f.form.phone).toBe('011968240');
          expect(f.form.telegram).toBe('@Horth_Heng');
          expect(f.form.pickup_date).toBe('2026-11-20');
          expect(f.form.items).toEqual([{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }]);
          expect(f.form.deposit).toBe(200);
          expect(notice()).toBe('Booking saved.');
        });

        it('saving that invoice opens the paper, and it is linked to the booking', async () => {
          await create([COUNTED()]);
          await book();
          word('Yes, create invoice', question()!).click();
          await settle();
          invoiceForm().form.warranty = '1_month';
          invoiceForm().submit();
          fixture.detectChanges();
          expect(invoicesApi['createInvoice'].calls.mostRecent().args[0].booking_id).toBe(5);
          expect(editor()).toBeNull();
          expect(viewer()!.textContent).toContain('Invoice 000044');
          expect(notice()).toBe('Invoice 000044 saved.');
          expect(question()).toBeNull();                 // a booking never asks "mark as sold"
          expect(productsApi['updateProduct']).not.toHaveBeenCalled();
        });
      });
    });

    describe('Sell', () => {
      const sell = async (index = 0) => {
        await openLaptop(index);
        word('Sell', detailPanel()!).click();
        await settle();
      };
      const save = (changes: (form: InvoiceFormComponent) => void = () => undefined) => {
        invoiceForm().form.warranty = '2_weeks';
        changes(invoiceForm());
        invoiceForm().submit();
        fixture.detectChanges();
      };

      it('opens a SALE invoice with this laptop and its price on the first line', async () => {
        await create([COUNTED()]);
        await sell();
        expect(editor()!.getAttribute('aria-label')).toBe('New sale invoice');
        expect(invoiceForm().kind).toBe('sale');
        expect(invoiceForm().form.items).toEqual([{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }]);
        expect(invoiceForm().form.deposit).toBe(799);        // paid in full, as on every new sale
      });

      it('Esc closes it: nothing is saved, nothing is asked, the laptop is not touched', async () => {
        await create([COUNTED()]);
        await sell();
        esc();
        expect(editor()).toBeNull();
        expect(question()).toBeNull();
        expect(invoicesApi['createInvoice']).not.toHaveBeenCalled();
        expect(productsApi['updateProduct']).not.toHaveBeenCalled();
      });

      it('after saving: the laptop is sold at once, with NO question. The paper opens to print or copy', async () => {
        await create([SINGLE()]);
        await sell();
        save();
        await settle();
        expect(editor()).toBeNull();
        expect(viewer()).not.toBeNull();
        expect(question()).toBeNull();
        expect(review()).toBeNull();
        expect(productsApi['updateProduct']).toHaveBeenCalledOnceWith(1, { is_archived: true });
        expect(dom().textContent).not.toContain('Mark this laptop as sold?');
        expect(dom().textContent).not.toContain('Not now');
      });

      it('says it is sold, and the Menu is read again (a single laptop is hidden from it)', async () => {
        await create([SINGLE()]);
        await sell();
        const loadsBefore = productsApi['getAllProducts'].calls.count();
        save();
        await settle();
        expect(notice()).toBe('“Laptop 1” marked as sold.');
        expect(productsApi['getAllProducts'].calls.count()).toBe(loadsBefore + 1);
      });

      it('the paper can be closed like any paper (✕ and Esc work), and printed and changed', async () => {
        await create([COUNTED()]);
        await sell();
        save();
        await settle();
        const close = viewer()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
        expect(close.disabled).toBeFalse();
        expect(word('Print / Save PDF', viewer()!).disabled).toBeFalse();
        expect(word('Edit', viewer()!)).toBeTruthy();
        esc();
        expect(viewer()).toBeNull();
      });

      it('a repair invoice (made from the repair form) never marks anything as sold', async () => {
        await create([COUNTED()]);
        await openLaptop();
        word('Repair', detailPanel()!).click();
        await settle();
        Object.assign(repairForm().form, { problem: 'Screen flickers', makeInvoice: true });
        repairForm().submit();
        await settle();
        Object.assign(invoiceForm().form, { warranty: '1_week' });
        invoiceForm().form.items = [{ name: 'Screen', qty: 1, unit_price: 50 }];
        invoiceForm().submit();
        await settle();
        expect(viewer()).not.toBeNull();
        expect(review()).toBeNull();
        expect(productsApi['updateProduct']).not.toHaveBeenCalled();
      });

      describe('a laptop with counted stock', () => {
        it('goes down by one (6 -> 5)', async () => {
          await create([COUNTED()]);
          await sell();
          save();
          await settle();
          expect(productsApi['updateProduct']).toHaveBeenCalledOnceWith(2, { stock_quantity: 5 });
          expect(notice()).toBe('“MacBook Air 13" M1” marked as sold.');
        });

        it('uses the quantity written on the invoice line of this laptop (2 pieces: 6 -> 4)', async () => {
          await create([COUNTED()]);
          await sell();
          save(f => { f.form.items[0].qty = 2; });
          await settle();
          expect(productsApi['updateProduct']).toHaveBeenCalledOnceWith(2, { stock_quantity: 4 });
        });

        it('finds the line however the capitals are written (3 pieces: 6 -> 3)', async () => {
          await create([COUNTED()]);
          await sell();
          save(f => { f.form.items[0].name = 'macbook AIR 13" m1'; f.form.items[0].qty = 3; });
          await settle();
          expect(productsApi['updateProduct']).toHaveBeenCalledOnceWith(2, { stock_quantity: 3 });
        });

        it('if the line was renamed it counts one piece (6 -> 5)', async () => {
          await create([COUNTED()]);
          await sell();
          save(f => { f.form.items[0].name = 'Something else'; f.form.items[0].qty = 3; });
          await settle();
          expect(productsApi['updateProduct']).toHaveBeenCalledOnceWith(2, { stock_quantity: 5 });
        });

        it('the stock never goes below 0', async () => {
          await create([product(2, [], { name: 'Charger', selling_price: 10, track_stock: 1, stock_quantity: 1, min_stock_level: 0 })]);
          await sell();
          save(f => { f.form.items[0].qty = 5; });
          await settle();
          expect(productsApi['updateProduct']).toHaveBeenCalledOnceWith(2, { stock_quantity: 0 });
        });
      });

      describe('when the laptop could not be marked as sold (no internet, ...)', () => {
        const saveWhileFailing = async (error: unknown = { error: { error: 'Product not found' } }) => {
          await create([SINGLE()]);
          await sell();
          productsApi['updateProduct'].and.returnValue(throwError(() => error));
          save();
          await settle();
        };

        it('the invoice is saved and its paper opens, and ONLY NOW the question shows, with the reason', async () => {
          await saveWhileFailing();
          expect(invoicesApi['createInvoice']).toHaveBeenCalledTimes(1);
          expect(viewer()).not.toBeNull();
          expect(review()).not.toBeNull();
          expect(reviewText()).toContain('Mark this laptop as sold?');
          expect(reviewText()).toContain('Laptop 1');
          expect(reviewText()).toContain('Product not found');
          expect(word('Mark as sold', review()!)).toBeTruthy();
          expect(word('Not now', review()!)).toBeTruthy();
        });

        it('a failure with no reason says so in plain words', async () => {
          await saveWhileFailing(new Error('offline'));
          expect(reviewText()).toContain('Could not update the laptop. Please try again.');
        });

        it('nothing is sent to Telegram, and the paper cannot be closed by mistake while the question waits', async () => {
          await saveWhileFailing();
          expect(telegramApi.send).not.toHaveBeenCalled();
          expect((viewer()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).disabled).toBeTrue();
          esc();
          expect(viewer()).not.toBeNull();
        });

        it('"Mark as sold" tries again: it works this time, the question goes away and the sale is sent to Telegram', async () => {
          await saveWhileFailing();
          expect(word('Mark as sold', review()!).disabled).toBeFalse();
          productsApi['updateProduct'].and.returnValue(of({}));
          word('Mark as sold', review()!).click();
          await settle();
          expect(review()).toBeNull();
          expect(notice()).toBe('“Laptop 1” marked as sold.');
          expect(telegramApi.send).toHaveBeenCalledTimes(1);
          expect((viewer()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).disabled).toBeFalse();
        });

        it('"Not now" changes nothing, says so, sends nothing, and the paper stays to print', async () => {
          await saveWhileFailing();
          word('Not now', review()!).click();
          fixture.detectChanges();
          expect(review()).toBeNull();
          expect(viewer()).not.toBeNull();
          expect(notice()).toBe('“Laptop 1” was not marked as sold.');
          expect(telegramApi.send).not.toHaveBeenCalled();
        });

        it('while a try is being done the buttons are off and a second click does nothing', async () => {
          await saveWhileFailing();
          const pending = new Subject<any>();
          productsApi['updateProduct'].and.returnValue(pending);
          word('Mark as sold', review()!).click();
          fixture.detectChanges();
          expect(word('Please wait...', review()!).disabled).toBeTrue();
          expect(word('Not now', review()!).disabled).toBeTrue();
          component.markSold();
          component.skipSold();
          expect(productsApi['updateProduct']).toHaveBeenCalledTimes(2);       // the first try, and this one
          expect(review()).not.toBeNull();
          pending.next({});
          pending.complete();
          await settle();
          expect(review()).toBeNull();
        });
      });

      it('while the laptop is being marked, a second click on anything does not sell it twice', async () => {
        await create([SINGLE()]);
        await sell();
        const pending = new Subject<any>();
        productsApi['updateProduct'].and.returnValue(pending);
        save();
        await settle();
        component.markSold();                                    // (there is no question to answer: nothing happens)
        expect(productsApi['updateProduct']).toHaveBeenCalledTimes(1);
        expect(telegramApi.send).not.toHaveBeenCalled();          // not sold yet: nothing is sent yet
        pending.next({});
        pending.complete();
        await settle();
        expect(telegramApi.send).toHaveBeenCalledTimes(1);
        expect(notice()).toBe('“Laptop 1” marked as sold.');
      });

      describe('changing the invoice from its paper (Edit)', () => {
        const edit = async () => { word('Edit', viewer()!).click(); await settle(); };

        it('after the sale it does not sell again, and does not send again', async () => {
          await create([COUNTED()]);
          await sell();
          save();
          await settle();
          await edit();
          expect(editor()!.getAttribute('aria-label')).toBe('Edit invoice 000044');
          invoiceForm().form.customer_name = 'Sok Dara';
          invoiceForm().submit();
          await settle();
          expect(invoicesApi['updateInvoice']).toHaveBeenCalledTimes(1);
          expect(review()).toBeNull();
          expect(notice()).toBe('Invoice 000044 changed.');
          expect(productsApi['updateProduct']).toHaveBeenCalledTimes(1);
          expect(telegramApi.send).toHaveBeenCalledTimes(1);
        });

        describe('while the question waits (marking failed)', () => {
          const failedSale = async () => {
            await create([COUNTED()]);
            await sell();
            productsApi['updateProduct'].and.returnValue(throwError(() => ({ error: { error: 'down' } })));
            save();
            await settle();
          };

          it('Edit opens the editor; saving brings back the paper AND the question', async () => {
            await failedSale();
            await edit();
            expect(viewer()).toBeNull();
            invoiceForm().form.customer_name = 'Sok Dara';
            invoiceForm().submit();
            await settle();
            expect(viewer()).not.toBeNull();
            expect(review()).not.toBeNull();
          });

          it('the question follows a changed quantity (1 -> 2 pieces: stock 6 -> 4)', async () => {
            await failedSale();
            expect(reviewText()).toContain('Stock goes from 6 to 5.');
            await edit();
            invoiceForm().form.items[0].qty = 2;
            invoiceForm().submit();
            await settle();
            expect(reviewText()).toContain('2 sold on this invoice. Stock goes from 6 to 4.');
            productsApi['updateProduct'].and.returnValue(of({}));
            word('Mark as sold', review()!).click();
            await settle();
            expect(productsApi['updateProduct'].calls.mostRecent().args).toEqual([2, { stock_quantity: 4 }]);
          });

          it('cancelling the change brings back the same paper and its question', async () => {
            await failedSale();
            await edit();
            word('Cancel', editor()!).click();
            await settle();
            expect(editor()).toBeNull();
            expect(viewer()).not.toBeNull();
            expect(review()).not.toBeNull();
            expect(viewer()!.textContent).toContain('Invoice 000044');
            expect(detailPanel()).toBeNull();
          });
        });
      });

      it('each sale sells ITS laptop (a second sale after the first)', async () => {
        await create([SINGLE(), COUNTED()]);
        await sell(0);
        save();
        await settle();
        esc();
        await sell(1);
        save();
        await settle();
        expect(productsApi['updateProduct'].calls.allArgs()).toEqual([[1, { is_archived: true }], [2, { stock_quantity: 5 }]]);
      });
    });

    describe('Repair', () => {
      const repair = async (index = 0) => {
        await openLaptop(index);
        word('Repair', detailPanel()!).click();
        await settle();
      };

      it('opens the REPAIR form (a repair job) with this laptop picked from the shop', async () => {
        await create([COUNTED()]);
        await repair();
        expect(repairDialog()!.getAttribute('aria-label')).toBe('New repair');
        expect(repairForm().form.source).toBe('shop');
        expect(repairForm().form.product_id).toBe(2);
        expect(repairForm().form.device).toBe('MacBook Air 13" M1');
        expect(repairForm().form.problem).toBe('');
        expect(editor()).toBeNull();                        // not an invoice
      });

      it('after saving: the repair is created for this laptop, and the notice says where to follow it', async () => {
        await create([COUNTED()]);
        await repair();
        repairForm().form.problem = 'Screen flickers';
        repairForm().submit();
        await settle();
        const sent = repairsApi['createRepair'].calls.mostRecent().args[0];
        expect(sent.product_id).toBe(2);
        expect(sent.device).toBe('MacBook Air 13" M1');
        expect(sent.problem).toBe('Screen flickers');
        expect(repairDialog()).toBeNull();
        expect(editor()).toBeNull();                        // the invoice is optional: none was asked for
        expect(question()).toBeNull();
        expect(productsApi['updateProduct']).not.toHaveBeenCalled();
        expect(notice()).toBe('Repair started for “MacBook Air 13" M1”. You can follow it in Repairs.');
      });

      it('with "Make an invoice now" on, the repair invoice opens next, filled from the repair and pointing at it', async () => {
        await create([COUNTED()]);
        await repair();
        Object.assign(repairForm().form, { problem: 'Screen flickers', cost: 80, makeInvoice: true });
        repairForm().submit();
        await settle();
        expect(editor()!.getAttribute('aria-label')).toBe('New repair invoice');
        expect(invoiceForm().form.device).toBe('MacBook Air 13" M1');
        expect(invoiceForm().form.problem).toBe('Screen flickers');
        expect(invoiceForm().form.repair_id).toBe(7);
        expect(invoiceForm().form.items).toEqual([{ name: 'Repair', qty: 1, unit_price: 80 }]);
      });

      it('Esc closes it without saving', async () => {
        await create([COUNTED()]);
        await repair();
        esc();
        expect(repairDialog()).toBeNull();
        expect(repairsApi['createRepair']).not.toHaveBeenCalled();
      });
    });

    // -------------------------------------------------------------------------------------------
    describe('a booking or repair takes the laptop off the shelf (the Menu is read again, and the notice says what happened)', () => {
      const reads = () => productsApi['getAllProducts'].calls.count();
      const startBooking = async () => {
        await openLaptop(0);
        word('Book', detailPanel()!).click();
        await settle();
        Object.assign(bookingForm().form, { phone: '011968240', deposit: 50, pickup_date: '2026-11-20', booking_date: '2026-11-10' });
      };

      it('a single laptop that is booked: the Menu is read again and the notice says it was set aside', async () => {
        await create([SINGLE()]);
        bookingsApi['createBooking'].and.callFake((b: any) => of({ id: 5, remaining_balance: b.full_price - b.deposit, ...b, stock_held: true, product_track_stock: false }));
        await startBooking();
        const before = reads();
        bookingForm().submit();
        await settle();
        expect(reads()).toBe(before + 1);
        word('Not now', question()!).click();
        fixture.detectChanges();
        expect(notice()).toBe('Booking saved. The laptop is set aside as Booked and left the Menu.');
      });

      it('"Yes, create invoice" says the same in its notice', async () => {
        await create([SINGLE()]);
        bookingsApi['createBooking'].and.callFake((b: any) => of({ id: 5, remaining_balance: b.full_price - b.deposit, ...b, stock_held: true, product_track_stock: false }));
        await startBooking();
        bookingForm().submit();
        await settle();
        word('Yes, create invoice', question()!).click();
        await settle();
        expect(notice()).toBe('Booking saved. The laptop is set aside as Booked and left the Menu.');
      });

      it('counted stock that is booked: one less in stock', async () => {
        await create([COUNTED()]);
        bookingsApi['createBooking'].and.callFake((b: any) => of({ id: 5, remaining_balance: b.full_price - b.deposit, ...b, stock_held: true, product_track_stock: true }));
        await startBooking();
        bookingForm().submit();
        await settle();
        word('Not now', question()!).click();
        fixture.detectChanges();
        expect(notice()).toBe('Booking saved. One laptop less in stock.');
      });

      it('a single laptop in repair: the Menu is read again and the notice says it was set aside as In repair', async () => {
        await create([SINGLE()]);
        repairsApi['createRepair'].and.callFake((r: any) => of({ id: 7, status: 'received', fixed_date: null, picked_up_date: null, ...r, stock_held: true, product_track_stock: false }));
        await openLaptop(0);
        word('Repair', detailPanel()!).click();
        await settle();
        repairForm().form.problem = 'Screen flickers';
        const before = reads();
        repairForm().submit();
        await settle();
        expect(reads()).toBe(before + 1);
        expect(notice()).toBe('Repair started for “Laptop 1”. You can follow it in Repairs. The laptop is set aside as In repair and left the Menu.');
      });

      it('cancelling the Book or Repair window reads nothing again (nothing changed)', async () => {
        await create([SINGLE()]);
        await openLaptop(0);
        const before = reads();
        word('Book', detailPanel()!).click();
        await settle();
        esc();
        expect(reads()).toBe(before);
      });

      it('a laptop that is booked or in repair is not on the Menu, even if the API sent it', async () => {
        await create([product(1, [], { hold_status: 'booked' }), product(2, [], { hold_status: 'repair' }), product(3, [])]);
        expect(cards().length).toBe(1);
        expect(cards()[0].textContent).toContain('Laptop 3');
      });
    });

    // -------------------------------------------------------------------------------------------
    describe('Telegram: what is sent, and when', () => {
      const sellAndSave = async () => {
        await openLaptop(0);
        word('Sell', detailPanel()!).click();
        await settle();
        invoiceForm().form.warranty = '2_weeks';
        invoiceForm().submit();
        await settle();
      };

      it('a saved booking is sent as a booking (the laptop photo and the details)', async () => {
        await create([COUNTED()]);
        await openLaptop(0);
        word('Book', detailPanel()!).click();
        await settle();
        Object.assign(bookingForm().form, { phone: '011968240', deposit: 50, pickup_date: '2026-11-20', booking_date: '2026-11-10' });
        bookingForm().submit();
        await settle();
        expect(telegramApi.send).toHaveBeenCalledOnceWith('booking', 5);
      });

      it('a saved repair is sent as a repair', async () => {
        await create([COUNTED()]);
        await openLaptop(0);
        word('Repair', detailPanel()!).click();
        await settle();
        repairForm().form.problem = 'Screen flickers';
        repairForm().submit();
        await settle();
        expect(telegramApi.send).toHaveBeenCalledOnceWith('repair', 7);
      });

      it('a saved sale is sent as soon as the laptop is sold: the sale with its paper (so the picture is made), once, with no question', async () => {
        await create([SINGLE()]);
        await sellAndSave();
        expect(telegramApi.send).toHaveBeenCalledTimes(1);
        const [kind, id, invoice] = telegramApi.send.calls.mostRecent().args;
        expect([kind, id, invoice.number, invoice.type]).toEqual(['sold', 99, 44, 'sale']);
        expect(review()).toBeNull();
      });

      it('closing the Book, Repair and Sell windows without saving sends nothing', async () => {
        await create([COUNTED()]);
        for (const action of ['Book', 'Repair', 'Sell']) {
          await openLaptop(0);
          word(action, detailPanel()!).click();
          await settle();
          esc();
        }
        expect(telegramApi.send).not.toHaveBeenCalled();
      });

      it('a sale whose laptop could not be updated sends nothing (the question comes: the sale is sent when it is tried again and works)', async () => {
        await create([SINGLE()]);
        await openLaptop(0);
        word('Sell', detailPanel()!).click();
        await settle();
        productsApi['updateProduct'].and.returnValue(throwError(() => ({ error: { error: 'down' } })));
        invoiceForm().form.warranty = '2_weeks';
        invoiceForm().submit();
        await settle();
        expect(telegramApi.send).not.toHaveBeenCalled();
        productsApi['updateProduct'].and.returnValue(of({}));
        word('Mark as sold', review()!).click();
        await settle();
        expect(telegramApi.send).toHaveBeenCalledTimes(1);
      });
    });

    // -------------------------------------------------------------------------------------------
    describe('going back (clicking Book / Sell / Repair by mistake costs nothing)', () => {
      const LAPTOP = () => product(2, THREE, { name: 'MacBook Air 13" M1', selling_price: 799, track_stock: 1, stock_quantity: 6, min_stock_level: 2, brand: 'Apple' });
      const laptopTitle = () => detailPanel()?.querySelector('#product-detail-title')?.textContent?.trim();
      const start = async (label: string) => {
        await openLaptop();
        word(label, detailPanel()!).click();
        await settle();
      };
      const back = (root: ParentNode) => Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === 'Back to laptop') as HTMLButtonElement | undefined;

      /** The ways to leave the Book window / the invoice window without saving. */
      const bookWays: Record<string, () => void> = {
        'the Back to laptop button': () => back(bookDialog()!)!.click(),
        'the ✕': () => (bookDialog()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click(),
        'Esc': () => esc(),
        'the dark background': () => (bookDialog()!.parentElement as HTMLElement).click(),
        'the form\'s Cancel': () => word('Cancel', bookDialog()!).click(),
      };
      const invoiceWays: Record<string, () => void> = {
        'the Back to laptop button': () => back(editor()!)!.click(),
        'the ✕': () => (editor()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click(),
        'Esc': () => esc(),
        'the dark background': () => (dom().querySelector('.editor-backdrop') as HTMLElement).click(),
        'the form\'s Cancel': () => word('Cancel', editor()!).click(),
      };

      describe('Book', () => {
        it('is a SIDE panel from the right edge (like the laptop window), not a centered popup', async () => {
          await create([LAPTOP()]);
          await start('Book');
          const backdrop = bookDialog()!.parentElement!;
          expect(backdrop.classList).toContain('justify-end');
          expect(backdrop.classList).not.toContain('items-center');
          expect(bookDialog()!.classList).toContain('h-full');
          expect(bookDialog()!.classList).toContain('max-w-lg');
          expect(bookDialog()!.classList).not.toContain('rounded-xl');
        });

        it('has a "Back to laptop" button', async () => {
          await create([LAPTOP()]);
          await start('Book');
          expect(back(bookDialog()!)).toBeTruthy();
        });

        for (const way of Object.keys(bookWays)) {
          it(`${way} goes back to THE SAME laptop window, and nothing is booked`, async () => {
            await create([product(1, [], { name: 'Other laptop' }), LAPTOP()]);
            await openLaptop(1);
            word('Book', detailPanel()!).click();
            await settle();
            expect(detailPanel()).toBeNull();
            bookWays[way]();
            fixture.detectChanges();
            expect(bookDialog()).toBeNull();
            expect(detailPanel()).not.toBeNull();
            expect(laptopTitle()).toBe('MacBook Air 13" M1');
            expect(bookingsApi['createBooking']).not.toHaveBeenCalled();
            expect(question()).toBeNull();
          });
        }

        it('is not possible while the booking is being saved', async () => {
          await create([LAPTOP()]);
          await start('Book');
          bookingsApi['createBooking'].and.returnValue(new Subject<any>());
          Object.assign(bookingForm().form, { phone: '011968240', pickup_date: '2026-11-20' });
          bookingForm().submit();
          back(bookDialog()!)!.click();
          esc();
          expect(bookDialog()).not.toBeNull();
          expect(detailPanel()).toBeNull();
        });

        it('once the booking is SAVED the laptop window does not come back', async () => {
          await create([LAPTOP()]);
          await start('Book');
          Object.assign(bookingForm().form, { phone: '011968240', pickup_date: '2026-11-20' });
          bookingForm().submit();
          await settle();
          expect(detailPanel()).toBeNull();
          word('Not now', question()!).click();
          fixture.detectChanges();
          expect(detailPanel()).toBeNull();
        });

        it('one Esc goes back and the laptop window STAYS open (a second window does not close it at once)', async () => {
          await create([LAPTOP()]);
          await start('Book');
          esc();
          expect(detailPanel()).not.toBeNull();
          esc();                                  // a second Esc closes the laptop window, as before
          expect(detailPanel()).toBeNull();
        });
      });

      for (const [label, title] of [['Sell', 'New sale invoice']] as const) {
        describe(label, () => {
          it('has a "Back to laptop" button', async () => {
            await create([LAPTOP()]);
            await start(label);
            expect(editor()!.getAttribute('aria-label')).toBe(title);
            expect(back(editor()!)).toBeTruthy();
          });

          for (const way of Object.keys(invoiceWays)) {
            it(`${way} goes back to THE SAME laptop window, and nothing is saved or changed`, async () => {
              await create([product(1, [], { name: 'Other laptop' }), LAPTOP()]);
              await openLaptop(1);
              word(label, detailPanel()!).click();
              await settle();
              expect(detailPanel()).toBeNull();
              invoiceWays[way]();
              fixture.detectChanges();
              expect(editor()).toBeNull();
              expect(detailPanel()).not.toBeNull();
              expect(laptopTitle()).toBe('MacBook Air 13" M1');
              expect(invoicesApi['createInvoice']).not.toHaveBeenCalled();
              expect(productsApi['updateProduct']).not.toHaveBeenCalled();
              expect(question()).toBeNull();
            });
          }

          it('one Esc goes back and the laptop window STAYS open', async () => {
            await create([LAPTOP()]);
            await start(label);
            esc();
            expect(detailPanel()).not.toBeNull();
          });

          it('once the invoice is SAVED the laptop window does not come back', async () => {
            await create([LAPTOP()]);
            await start(label);
            Object.assign(invoiceForm().form, { warranty: '1_week', problem: 'Screen' });
            invoiceForm().form.items = [{ name: 'Work', qty: 1, unit_price: 50 }];     // (a repair starts with no lines)
            invoiceForm().form.deposit = 0;
            invoiceForm().submit();
            await settle();
            expect(viewer()).not.toBeNull();
            expect(detailPanel()).toBeNull();
            esc();
            expect(detailPanel()).toBeNull();
          });
        });
      }

      describe('Repair', () => {
        const repairWays: Record<string, () => void> = {
          'the Back to laptop button': () => back(repairDialog()!)!.click(),
          'the ✕': () => (repairDialog()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click(),
          'Esc': () => esc(),
          'the dark background': () => (dom().querySelector('.repair-backdrop') as HTMLElement).click(),
          'the form\'s Cancel': () => word('Cancel', repairDialog()!).click(),
        };

        it('has a "Back to laptop" button', async () => {
          await create([LAPTOP()]);
          await start('Repair');
          expect(repairDialog()!.getAttribute('aria-label')).toBe('New repair');
          expect(back(repairDialog()!)).toBeTruthy();
        });

        for (const way of Object.keys(repairWays)) {
          it(`${way} goes back to THE SAME laptop window, and nothing is saved or changed`, async () => {
            await create([product(1, [], { name: 'Other laptop' }), LAPTOP()]);
            await openLaptop(1);
            word('Repair', detailPanel()!).click();
            await settle();
            expect(detailPanel()).toBeNull();
            repairWays[way]();
            fixture.detectChanges();
            expect(repairDialog()).toBeNull();
            expect(detailPanel()).not.toBeNull();
            expect(laptopTitle()).toBe('MacBook Air 13" M1');
            expect(repairsApi['createRepair']).not.toHaveBeenCalled();
            expect(productsApi['updateProduct']).not.toHaveBeenCalled();
          });
        }

        it('one Esc goes back and the laptop window STAYS open', async () => {
          await create([LAPTOP()]);
          await start('Repair');
          esc();
          expect(detailPanel()).not.toBeNull();
        });

        it('once the repair is SAVED the laptop window does not come back', async () => {
          await create([LAPTOP()]);
          await start('Repair');
          repairForm().form.problem = 'Screen';
          repairForm().submit();
          await settle();
          expect(repairDialog()).toBeNull();
          expect(detailPanel()).toBeNull();
          esc();
          expect(detailPanel()).toBeNull();
        });

        it('is not possible while the repair is being saved', async () => {
          await create([LAPTOP()]);
          await start('Repair');
          repairsApi['createRepair'].and.returnValue(new Subject<any>());
          repairForm().form.problem = 'Screen';
          repairForm().submit();
          back(repairDialog()!)!.click();
          esc();
          expect(repairDialog()).not.toBeNull();
          expect(detailPanel()).toBeNull();
        });
      });

      it('the laptop window comes back on the photo that was showing', async () => {
        await create([LAPTOP()]);
        await openLaptop();
        component.goTo(component.products[0], 1);
        fixture.detectChanges();
        word('Repair', detailPanel()!).click();
        await settle();
        esc();
        expect(detailPanel()!.querySelector('img')!.getAttribute('src')).toBe(THREE[1]);
      });

      it('can be done again and again (Book, back, Sell, back, Repair, back)', async () => {
        await create([LAPTOP()]);
        await openLaptop();
        for (const label of ['Book', 'Sell', 'Repair']) {
          word(label, detailPanel()!).click();
          await settle();
          expect(detailPanel()).toBeNull();
          esc();
          expect(detailPanel()).not.toBeNull();
        }
      });

      it('going back from one laptop never opens another laptop\'s window', async () => {
        await create([product(1, [], { name: 'First' }), LAPTOP()]);
        await openLaptop(0);
        word('Book', detailPanel()!).click();
        await settle();
        esc();
        esc();                                    // closes the first laptop
        await openLaptop(1);
        word('Sell', detailPanel()!).click();
        await settle();
        esc();
        expect(laptopTitle()).toBe('MacBook Air 13" M1');
      });

      it('the booking invoice that follows a booking has no Back button, and closing it does not open the laptop', async () => {
        await create([LAPTOP()]);
        await start('Book');
        Object.assign(bookingForm().form, { phone: '011968240', pickup_date: '2026-11-20' });
        bookingForm().submit();
        await settle();
        word('Yes, create invoice', question()!).click();
        await settle();
        expect(back(editor()!)).toBeUndefined();
        esc();
        expect(editor()).toBeNull();
        expect(detailPanel()).toBeNull();
      });

      it('changing an invoice from its paper has no Back button, and closing does not open a laptop', async () => {
        await create([LAPTOP()]);
        await start('Sell');
        Object.assign(invoiceForm().form, { warranty: '1_week' });
        invoiceForm().submit();
        await settle();
        word('Edit', viewer()!).click();
        await settle();
        expect(back(editor()!)).toBeUndefined();
        esc();
        expect(editor()).toBeNull();
        expect(detailPanel()).toBeNull();
      });
    });

    it('a notice goes away by itself after a few seconds', async () => {
      await create([SINGLE()]);
      jasmine.clock().install();
      try {
        await openLaptop();
        word('Book', detailPanel()!).click();
        await settle();
        Object.assign(bookingForm().form, { phone: '011968240', pickup_date: '2026-11-20' });
        bookingForm().submit();
        await settle();
        word('Not now', question()!).click();
        fixture.detectChanges();
        expect(notice()).toBe('Booking saved.');
        jasmine.clock().tick(5001);
        fixture.detectChanges();
        expect(notice()).toBe('');
      } finally {
        jasmine.clock().uninstall();
      }
    });
  });
});
