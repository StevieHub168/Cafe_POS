import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { BehaviorSubject, NEVER, of, throwError } from 'rxjs';
import { LaptopScanComponent } from './laptop-scan.component';
import { ProductService } from '../../services/product.service';
import { BookingService } from '../../services/booking.service';
import { RepairService } from '../../services/repair.service';
import { InvoiceService } from '../../services/invoice.service';
import { ScanActionService } from '../../services/scan-action.service';
import { Product } from '../../models/product.model';
import { Booking } from '../../models/booking.model';
import { Repair } from '../../models/repair.model';
import { Invoice } from '../../models/invoice.model';
import { toIso } from '../../utils/dates';

/** "YYYY-MM-DD" of a day this many days from today. */
const inDays = (n: number): string => { const d = new Date(); d.setDate(d.getDate() + n); return toIso(d); };

const laptop = (over: Partial<Product> = {}): Product => ({
  id: 7, sku: 'MAC-007', code: 'LP-0007', name: 'MacBook Air 15" M3', brand: 'Apple', category_id: 1, selling_price: 1299,
  track_stock: false, stock_quantity: 1, min_stock_level: 0, is_archived: false, hold_status: null,
  description: 'Chip M3\nRam 16GB | Storage 512GB', image_url: '/uploads/air.png', images: ['/uploads/air.png'], ...over,
});
const booking = (over: Partial<Booking> = {}): Booking => ({
  id: 3, product_id: 7, product_name: 'MacBook Air 15" M3', phone: '011968240', telegram: '@Horth_Heng', full_price: 1050, deposit: 500, remaining_balance: 550,
  booking_date: '2026-11-08', pickup_date: inDays(2), status: 'booked', ...over,
});
const repair = (over: Partial<Repair> = {}): Repair => ({
  id: 4, product_id: 7, device: 'MacBook Air 15" M3', customer_name: 'Vanna Chea', phone: '099111222', telegram: null, problem: 'Screen flickers',
  received_date: inDays(-1), back_on: inDays(3), cost: null, status: 'received', fixed_date: null, picked_up_date: null, sale_invoice_id: null, ...over,
});
const sale = (over: Partial<Invoice> = {}): Invoice => ({
  id: 9, number: 44, type: 'sale', invoice_date: '2026-11-10', customer_name: null, phone: '12121212', telegram: '@soklea', device: null, problem: null,
  pickup_date: null, booking_id: null, warranty: '1_week', items: [{ name: 'MacBook Air 15" M3', qty: 1, unit_price: 1299 }], total: 1299, deposit: 1299, ...over,
});

describe('LaptopScanComponent (a scanned label)', () => {
  let fixture: ComponentFixture<LaptopScanComponent>;
  let component: LaptopScanComponent;
  let navigate: jasmine.Spy;
  let scan: ScanActionService;
  let byCode: jasmine.Spy;
  let bookingsApi: { getBookings: jasmine.Spy };
  let repairsApi: { getRepairs: jasmine.Spy };
  let invoicesApi: { getInvoices: jasmine.Spy };
  let params: BehaviorSubject<ReturnType<typeof convertToParamMap>>;

  async function open(product: unknown = of(laptop()), code = 'LP-0007'): Promise<void> {
    params = new BehaviorSubject(convertToParamMap({ code }));
    byCode = jasmine.createSpy('getProductByCode').and.returnValue(product);
    await TestBed.configureTestingModule({
      imports: [LaptopScanComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { paramMap: params.asObservable() } },
        { provide: Router, useValue: { navigate } },
        { provide: ProductService, useValue: { getProductByCode: byCode } },
        { provide: BookingService, useValue: bookingsApi },
        { provide: RepairService, useValue: repairsApi },
        { provide: InvoiceService, useValue: invoicesApi },
      ],
    }).compileComponents();
    scan = TestBed.inject(ScanActionService);
    fixture = TestBed.createComponent(LaptopScanComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const q = (selector: string) => dom().querySelector(selector) as HTMLElement | null;
  const action = (name: string) => q(`[data-action="${name}"]`) as HTMLButtonElement | null;
  const rows = () => Array.from(dom().querySelectorAll('[data-rows] > div')).map(r => (r.textContent ?? '').replace(/\s+/g, ' ').trim());

  beforeEach(() => {
    navigate = jasmine.createSpy('navigate');
    bookingsApi = { getBookings: jasmine.createSpy('getBookings').and.returnValue(of([])) };
    repairsApi = { getRepairs: jasmine.createSpy('getRepairs').and.returnValue(of([])) };
    invoicesApi = { getInvoices: jasmine.createSpy('getInvoices').and.returnValue(of([])) };
  });

  it('opens the laptop of the code in the address (the code is written the same whatever the capitals)', async () => {
    await open(of(laptop()), 'lp-0007');
    expect(byCode).toHaveBeenCalledOnceWith('LP-0007');
    expect(q('[data-name]')!.textContent).toBe('MacBook Air 15" M3');
    expect(q('[data-code]')!.textContent).toBe('LP-0007');
    expect(text()).toContain('Apple ·');
    expect(q('[data-price]')!.textContent).toBe('$1,299');
  });

  it('shows the photo (a grey box with a picture when there is none) and the spec lines', async () => {
    await open();
    expect(q('[data-photo] img')!.getAttribute('src')).toContain('/uploads/air.png');
    expect(Array.from(dom().querySelectorAll('[data-specs] p')).map(p => p.textContent)).toEqual(['Chip M3', 'Ram 16GB | Storage 512GB']);

    TestBed.resetTestingModule();
    await open(of(laptop({ image_url: null, images: [], description: '' })));
    expect(q('[data-photo] img')).toBeNull();
    expect(q('[data-photo] svg')).not.toBeNull();
    expect(q('[data-specs]')).toBeNull();
  });

  it('shows "Loading" shapes first', async () => {
    await open(NEVER);                                  // never answers
    expect(q('[data-loading]')).not.toBeNull();
    expect(q('[data-name]')).toBeNull();
  });

  describe('an available laptop', () => {
    it('says Available and offers Sell, Book and Repair (and the label)', async () => {
      await open();
      expect(q('[data-state="available"]')).not.toBeNull();
      expect(q('[data-badge]')!.textContent!.trim()).toBe('Available');
      expect(q('[data-sentence]')!.textContent).toBe('Ready to sell. Nobody has booked it.');
      for (const name of ['sell', 'book', 'repair', 'label']) expect(action(name)).withContext(name).not.toBeNull();
      expect(action('sell')!.disabled).toBeFalse();
      expect(q('[data-locked]')).toBeNull();
      expect(bookingsApi.getBookings).not.toHaveBeenCalled();
      expect(repairsApi.getRepairs).not.toHaveBeenCalled();
    });

    it('a laptop with counted stock says how many are in stock', async () => {
      await open(of(laptop({ track_stock: true, stock_quantity: 5, min_stock_level: 1 })));
      expect(q('[data-sentence]')!.textContent).toBe('5 in stock and ready.');
    });

    it('running low is said', async () => {
      await open(of(laptop({ track_stock: true, stock_quantity: 1, min_stock_level: 2 })));
      expect(q('[data-sentence]')!.textContent).toBe('Only 1 left in stock.');
    });

    it('none left: Out of stock, Sell is off, Book and Repair stay', async () => {
      await open(of(laptop({ track_stock: true, stock_quantity: 0 })));
      expect(q('[data-badge]')!.textContent!.trim()).toBe('Out of stock');
      expect(action('sell')!.disabled).toBeTrue();
      expect(action('book')!.disabled).toBeFalse();
      action('sell')!.click();
      expect(navigate).not.toHaveBeenCalled();
      expect(scan.takeLaptop()).toBeNull();
    });

    for (const kind of ['sell', 'book', 'repair'] as const) {
      it(`"${kind}" sends the request to the Menu, which opens that window for this laptop`, async () => {
        await open();
        action(kind)!.click();
        expect(navigate).toHaveBeenCalledOnceWith(['/menu']);
        expect(scan.takeLaptop()).toEqual({ kind, productId: 7 });
      });
    }

    it('"Print label" opens the labels page with this laptop picked, 2 labels', async () => {
      await open();
      action('label')!.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/labels'], { queryParams: { ids: 7, per: 2 } });
    });
  });

  describe('a booked laptop', () => {
    const booked = () => of(laptop({ hold_status: 'booked' }));

    it('shows the booking of THIS laptop: customer, money, dates and when the pickup is', async () => {
      bookingsApi.getBookings.and.returnValue(of([
        booking({ id: 1, product_id: 99, telegram: '@other' }),                 // another laptop
        booking({ id: 2, status: 'cancelled', telegram: '@cancelled' }),        // not waiting any more
        booking({ id: 3 }),
      ]));
      await open(booked());
      expect(q('[data-state="booked"]')).not.toBeNull();
      expect(q('[data-badge]')!.textContent!.trim()).toBe('Booked');
      expect(q('[data-hint]')!.textContent).toBe('Pickup in 2 days');
      expect(rows()).toEqual([
        'Customer@Horth_Heng · 011968240',
        'Full price$1,050',
        'Deposit$500',
        'Balance to pay$550',
        'Booked on08/11/2026',
        jasmine.stringMatching(/^Pickup\d{2}\/\d{2}\/\d{4} \([A-Z][a-z]+day\)$/) as never,
      ]);
    });

    it('with two bookings on it, the newest one is shown', async () => {
      bookingsApi.getBookings.and.returnValue(of([booking({ id: 3, telegram: '@old' }), booking({ id: 8, telegram: '@new' })]));
      await open(booked());
      expect(rows()[0]).toBe('Customer@new · 011968240');
    });

    it('the pickup hint: today, tomorrow, late', async () => {
      for (const [days, hint] of [[0, 'Pickup today'], [1, 'Pickup tomorrow'], [-1, '1 day late'], [-3, '3 days late']] as const) {
        TestBed.resetTestingModule();
        bookingsApi.getBookings.and.returnValue(of([booking({ pickup_date: inDays(days) })]));
        await open(booked());
        expect(q('[data-hint]')!.textContent).withContext(String(days)).toBe(hint);
      }
    });

    it('Sell, Book and Repair are not offered, and the page says why', async () => {
      bookingsApi.getBookings.and.returnValue(of([booking()]));
      await open(booked());
      for (const name of ['sell', 'book', 'repair', 'label']) expect(action(name)).withContext(name).toBeNull();
      expect(q('[data-locked]')!.textContent).toBe('It is booked, so Sell, Book and Repair are off for this laptop.');
    });

    it('"Customer is here: Sell" asks the Bookings page to open the pickup of this booking', async () => {
      bookingsApi.getBookings.and.returnValue(of([booking({ id: 3 })]));
      await open(booked());
      action('pickup')!.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/bookings']);
      expect(scan.takePickup()).toEqual({ kind: 'pickup', bookingId: 3 });
    });

    it('"Open Bookings" only goes to the page', async () => {
      bookingsApi.getBookings.and.returnValue(of([booking()]));
      await open(booked());
      action('bookings')!.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/bookings']);
      expect(scan.takePickup()).toBeNull();
    });

    it('when the booking cannot be loaded the laptop is still shown, with a message and no pickup button', async () => {
      bookingsApi.getBookings.and.returnValue(throwError(() => new Error('down')));
      await open(booked());
      expect(q('[data-name]')!.textContent).toBe('MacBook Air 15" M3');
      expect(q('[data-details-problem]')!.textContent).toContain('Could not load the details.');
      expect(action('pickup')).toBeNull();
      expect(action('bookings')).not.toBeNull();
    });
  });

  describe('a laptop in repair', () => {
    const inRepair = () => of(laptop({ hold_status: 'repair' }));

    it('shows the repair of THIS laptop that is still in the shop', async () => {
      repairsApi.getRepairs.and.returnValue(of([
        repair({ id: 1, product_id: 99, problem: 'another laptop' }),
        repair({ id: 2, status: 'fixed', problem: 'an old repair' }),
        repair({ id: 4 }),
      ]));
      await open(inRepair());
      expect(q('[data-state="repair"]')).not.toBeNull();
      expect(q('[data-badge]')!.textContent!.trim()).toBe('In repair');
      expect(q('[data-hint]')!.textContent).toBe('1 day in repair');
      const shown = rows();
      expect(shown[0]).toBe('ProblemScreen flickers');
      expect(shown[2]).toBe('CustomerVanna Chea · 099111222');
      expect(shown.length).toBe(4);                       // no cost yet: not shown
    });

    it('the cost is shown once it is set; a repair with no back-on date says so', async () => {
      repairsApi.getRepairs.and.returnValue(of([repair({ cost: 45, back_on: null })]));
      await open(inRepair());
      const shown = rows();
      expect(shown).toContain('Back onNot set');
      expect(shown).toContain('Repair cost$45');
    });

    it('a repair received today says so', async () => {
      repairsApi.getRepairs.and.returnValue(of([repair({ received_date: inDays(0) })]));
      await open(inRepair());
      expect(q('[data-hint]')!.textContent).toBe('Received today');
    });

    it('only "Open Repairs" is offered, with the reason', async () => {
      repairsApi.getRepairs.and.returnValue(of([repair()]));
      await open(inRepair());
      for (const name of ['sell', 'book', 'repair', 'label', 'pickup']) expect(action(name)).withContext(name).toBeNull();
      action('repairs')!.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/repairs']);
      expect(q('[data-locked]')!.textContent).toBe('Finish the repair first. Then the laptop is available again.');
    });
  });

  describe('a sold laptop', () => {
    const sold = () => of(laptop({ is_archived: true }));

    it('shows the sale: customer, price, invoice, date and warranty', async () => {
      invoicesApi.getInvoices.and.returnValue(of([sale()]));
      await open(sold());
      expect(invoicesApi.getInvoices).toHaveBeenCalledOnceWith('sale');
      expect(q('[data-state="sold"]')).not.toBeNull();
      expect(q('[data-badge]')!.textContent!.trim()).toBe('Sold');
      expect(q('[data-hint]')!.textContent).toBe('10/11/2026');
      expect(rows()).toEqual([
        'Customer@soklea · 12121212',
        'Price$1,299',
        'Invoice000044',
        'Date10/11/2026',
        'Warranty1 week',
      ]);
    });

    it('finds the sale by the name of the laptop even when the line has its specs after a "|" (capitals and spaces do not matter)', async () => {
      invoicesApi.getInvoices.and.returnValue(of([
        sale({ number: 40, items: [{ name: 'Dell XPS 13', qty: 1, unit_price: 800 }] }),
        sale({ number: 45, items: [{ name: 'macbook  AIR 15" m3 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1299 }] }),
      ]));
      await open(sold());
      expect(rows()).toContain('Invoice000045');
    });

    it('of two sales with that name the last one is shown', async () => {
      invoicesApi.getInvoices.and.returnValue(of([sale({ number: 44 }), sale({ number: 51 }), sale({ number: 47 })]));
      await open(sold());
      expect(rows()).toContain('Invoice000051');
    });

    it('with no sale paper found it still says Sold, without details', async () => {
      await open(sold());
      expect(q('[data-badge]')!.textContent!.trim()).toBe('Sold');
      expect(q('[data-rows]')).toBeNull();
    });

    it('only "Open Sales" is offered, with the reason', async () => {
      await open(sold());
      for (const name of ['sell', 'book', 'repair', 'label', 'pickup']) expect(action(name)).withContext(name).toBeNull();
      action('sales')!.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/sales']);
      expect(q('[data-locked]')!.textContent).toBe('It is sold, so Sell, Book and Repair are off for this laptop.');
    });
  });

  describe('when something is wrong', () => {
    it('a code that no laptop has says so, and leads to the Menu', async () => {
      await open(throwError(() => ({ status: 404 })), 'LP-9999');
      expect(q('[data-not-found]')!.textContent).toContain('No laptop has the code LP-9999.');
      expect(q('[data-name]')).toBeNull();
      (q('[data-not-found] button') as HTMLButtonElement).click();
      expect(navigate).toHaveBeenCalledOnceWith(['/menu']);
    });

    it('a laptop that cannot be loaded says so and "Try again" loads it again', async () => {
      await open(throwError(() => ({ status: 0 })));
      expect(q('[data-problem]')!.textContent).toContain('Could not open the laptop.');
      expect(q('[data-not-found]')).toBeNull();

      byCode.and.returnValue(of(laptop()));
      action('retry')!.click();
      fixture.detectChanges();
      expect(q('[data-problem]')).toBeNull();
      expect(q('[data-name]')!.textContent).toBe('MacBook Air 15" M3');
    });

    it('a second label scanned while the page is open loads that laptop', async () => {
      await open();
      byCode.and.returnValue(of(laptop({ id: 8, code: 'LP-0008', name: 'Dell XPS 13' })));
      params.next(convertToParamMap({ code: 'lp-0008' }));
      fixture.detectChanges();
      expect(byCode).toHaveBeenCalledWith('LP-0008');
      expect(q('[data-name]')!.textContent).toBe('Dell XPS 13');
    });

    it('the Menu button at the top leads to the Menu', async () => {
      await open();
      action('back')!.click();
      expect(navigate).toHaveBeenCalledOnceWith(['/menu']);
    });
  });

  it('forgets the address watch when the page closes', async () => {
    await open();
    fixture.destroy();
    byCode.calls.reset();
    params.next(convertToParamMap({ code: 'LP-0001' }));
    expect(byCode).not.toHaveBeenCalled();
    expect(component).toBeTruthy();
  });
});
