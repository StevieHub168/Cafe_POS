import { ScanActionService } from '../../services/scan-action.service';
import { environment } from '../../../environments/environment';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Observable, Subject, of, throwError } from 'rxjs';
import { BookingsComponent } from './bookings.component';
import { BookingFormComponent } from './booking-form.component';
import { InvoiceFormComponent } from '../invoices/invoice-form.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { BookingService } from '../../services/booking.service';
import { ProductService } from '../../services/product.service';
import { InvoiceService } from '../../services/invoice.service';
import { ShareService } from '../../services/share.service';
import { BookingPickupComponent } from './booking-pickup.component';
import { Booking } from '../../models/booking.model';
import { BookingCounts, Paged } from '../../models/paged.model';
import { Invoice } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { TelegramNotifier } from '../../services/telegram-notifier.service';

/** Where uploaded photos are served from (the API's address without /api): whatever the app is set to. */
const apiOrigin = environment.apiUrl.replace(/\/api$/, '');

// "Today" in every test: Monday 9 Nov 2026.
const TODAY = new Date(2026, 10, 9, 10, 0);

// The booking from the shop's own example message.
const EXAMPLE: Booking = {
  id: 1, product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
  full_price: 1050, deposit: 500, remaining_balance: 550, booking_date: '2026-11-08', pickup_date: '2026-11-12',
  status: 'booked', product_image: '/uploads/air.png',
};

const booking = (over: Partial<Booking> = {}): Booking => ({ ...EXAMPLE, ...over });

/** What the API sends for a page: the rows, where they are in the list, and how many bookings are in each status. */
const countsOf = (rows: Booking[]): BookingCounts => ({
  booked: rows.filter(b => b.status === 'booked').length,
  picked_up: rows.filter(b => b.status === 'picked_up').length,
  cancelled: rows.filter(b => b.status === 'cancelled').length,
});
const pageOf = (rows: Booking[], over: Partial<Paged<Booking, { counts: BookingCounts }>> = {}): Paged<Booking, { counts: BookingCounts }> =>
  ({ page: 1, per_page: 10, total: rows.length, total_pages: 1, results: rows, meta: { counts: countsOf(rows) }, ...over });
const product = (over: Partial<Product> = {}): Product => ({
  id: 7, sku: 'MAC-901', name: 'MacBook Air M5', category_id: 1, brand: 'Apple', model: '', selling_price: 999,
  extra_prices: [], stock_quantity: 1, min_stock_level: 0, is_archived: false, image_url: '/uploads/air.png', ...over,
});

describe('BookingsComponent', () => {
  // Sending to Telegram is replaced by a spy here: the real one is tested in telegram-notifier.service.spec.ts.
  let telegramApi: { send: jasmine.Spy };
  beforeEach(() => { telegramApi = { send: jasmine.createSpy('send') }; });

  let fixture: ComponentFixture<BookingsComponent>;
  let component: BookingsComponent;
  let bookingsApi: { [k: string]: jasmine.Spy };
  let productsApi: { [k: string]: jasmine.Spy };
  let invoicesApi: { [k: string]: jasmine.Spy };
  let sharingApi: { [k: string]: jasmine.Spy };
  /** Every question the page asked the API, as it was when it was asked (page, size, tab, search). */
  let asked: { page: number; perPage: number; status?: string; excludeStatus?: string; search?: string }[];
  /** What the API answers from now on: an answer, or a function that makes one for each question. */
  const answer = (value: Observable<Paged<Booking>> | (() => Observable<Paged<Booking>>)) =>
    bookingsApi['getBookingPage'].and.callFake((state: { page: number; perPage: number }, filters: object) => {
      asked.push({ page: state.page, perPage: state.perPage, ...filters });
      return typeof value === 'function' ? value() : value;
    });

  /** `beforeStart` runs before the page is made (a request from the scan screen is already waiting when Bookings opens).
   *  `list` = every booking that exists; `onPage` = the ones the first page shows (all of them, unless a test says otherwise). */
  // (By default the shop has the laptop of the example, with its photo: a booking for it goes to Telegram with the picture.)
  async function create(list: Booking[] = [EXAMPLE], catalogue: Product[] = [product()], invoices: Invoice[] = [], beforeStart?: (scan: ScanActionService) => void, onPage: Booking[] = list): Promise<void> {
    asked = [];
    bookingsApi = {
      getBookingPage: jasmine.createSpy('getBookingPage'),
      // A booking read by its number (a scanned laptop): any of the list, or "not found".
      getBooking: jasmine.createSpy('getBooking').and.callFake((id: number) => {
        const found = list.find(b => b.id === id);
        return found ? of(found) : throwError(() => ({ status: 404, error: { error: 'Booking not found' } }));
      }),
      createBooking: jasmine.createSpy('createBooking').and.callFake((b: any) => of({ id: 99, remaining_balance: b.full_price - b.deposit, ...b })),
      updateBooking: jasmine.createSpy('updateBooking').and.callFake((id: number, c: any) => of({ ...EXAMPLE, ...c, id })),
      deleteBooking: jasmine.createSpy('deleteBooking').and.returnValue(of({ message: 'ok' })),
      pickUp: jasmine.createSpy('pickUp').and.callFake((id: number, body: any) => of({
        booking: { ...EXAMPLE, id, status: 'picked_up', sale_invoice_id: 77, sale_invoice_number: 44 },
        invoice: { id: 77, number: 44, type: 'sale', invoice_date: '2026-11-09', customer_name: body.customer_name || null, phone: body.phone, telegram: body.telegram,
          device: null, problem: null, pickup_date: null, booking_id: null, warranty: body.warranty, deposit: 1050, total: 1050, balance: 0,
          items: [{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }] },
        laptop: 'hidden',
      })),
    };
    answer(of(pageOf(onPage)));
    invoicesApi = {
      getInvoices: jasmine.createSpy('getInvoices').and.returnValue(of(invoices)),
      getNextNumber: jasmine.createSpy('getNextNumber').and.returnValue(of(44)),
      createInvoice: jasmine.createSpy('createInvoice').and.callFake((b: any) => of({ id: 99, number: 44, total: 1050, balance: 550, ...b })),
      updateInvoice: jasmine.createSpy('updateInvoice').and.callFake((id: number, b: any) => of({ id, number: 44, total: 1050, balance: 550, ...b })),
    };
    productsApi = {
      getAllProducts: jasmine.createSpy('getAllProducts').and.returnValue(of(catalogue)),
      uploadImage: jasmine.createSpy('uploadImage').and.returnValue(of({ url: '/uploads/receipt.png' })),
      discardImage: jasmine.createSpy('discardImage').and.returnValue(of({ message: 'Photo removed' })),
    };

    // The invoice window uses the browser's share menu, the network and the clipboard: pretend ones here.
    sharingApi = {
      canShare: jasmine.createSpy('canShare').and.returnValue(true),
      share: jasmine.createSpy('share').and.resolveTo('shared'),
      fetchImage: jasmine.createSpy('fetchImage').and.resolveTo(new File(['photo'], 'laptop.jpg', { type: 'image/jpeg' })),
      makePng: jasmine.createSpy('makePng').and.resolveTo(new Blob(['png'], { type: 'image/png' })),
      copyText: jasmine.createSpy('copyText').and.resolveTo(true),
      copyImage: jasmine.createSpy('copyImage').and.resolveTo(true),
      save: jasmine.createSpy('save'),
    };

    await TestBed.configureTestingModule({
      imports: [BookingsComponent],
      providers: [
        { provide: BookingService, useValue: bookingsApi },
        { provide: ProductService, useValue: productsApi },
        { provide: TelegramNotifier, useValue: telegramApi },
        { provide: InvoiceService, useValue: invoicesApi },
        { provide: ShareService, useValue: sharingApi },
      ],
    }).compileComponents();

    beforeStart?.(TestBed.inject(ScanActionService));

    fixture = TestBed.createComponent(BookingsComponent);
    component = fixture.componentInstance;
    spyOn(component as any, 'now').and.returnValue(TODAY);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => dom().textContent ?? '';
  const cards = () => Array.from(dom().querySelectorAll('[data-booking]')) as HTMLElement[];
  const drawer = () => dom().querySelector('[role="dialog"]') as HTMLElement | null;
  const dialog = () => dom().querySelector('[role="alertdialog"]') as HTMLElement | null;
  const buttonIn = (root: ParentNode, label: string) =>
    Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const type = (selector: string, value: string) => {
    const input = dom().querySelector(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (name: string) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: name })); fixture.detectChanges(); };
  // Lets the promises that are already waiting finish (Angular wires a form box a moment after it appears), then redraws.
  // (Not fixture.whenStable(): the notice's 4 second timer would make that wait, and then the notice is gone.)
  const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };

  it('should create', async () => {
    await create([]);
    expect(component).toBeTruthy();
  });

  // ---------------------------------------------------------------------------------------------
  describe('the list', () => {
    it('asks for the first page of the bookings that are not picked up (those became Sales), 10 on a page', async () => {
      await create();
      expect(asked).toEqual([{ page: 1, perPage: 10, excludeStatus: 'picked_up', search: '' }]);
    });

    it('while loading it shows the grey shapes of the cards and of the number, not "No bookings yet."', async () => {
      await create();
      const pending = new Subject<Paged<Booking>>();
      answer(pending);
      component.loadBookings(true);
      fixture.detectChanges();
      expect(dom().querySelectorAll('[data-skeleton][data-kind="cards"] [data-skeleton-item]').length).toBe(4);
      expect(dom().querySelector('[data-pagination]')).toBeNull();
      expect(text()).not.toContain('No bookings yet.');
      pending.next(pageOf([EXAMPLE]));
      pending.complete();
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton]')).toBeNull();
      expect(cards().length).toBe(1);
    });

    it('the number on top is grey until the API has counted', async () => {
      await TestBed.configureTestingModule({
        imports: [BookingsComponent],
        providers: [
          { provide: BookingService, useValue: { getBookingPage: () => new Subject<Paged<Booking>>(), getBooking: () => of(EXAMPLE) } },
          { provide: ProductService, useValue: { getAllProducts: () => of([]) } },
          { provide: InvoiceService, useValue: { getInvoices: () => of([]) } },
          { provide: TelegramNotifier, useValue: telegramApi },
          { provide: ShareService, useValue: {} },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(BookingsComponent);
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton][data-kind="stats"] [data-skeleton-item]')).not.toBeNull();
      expect(dom().querySelector('[data-summary]')).toBeNull();
    });

    it('shows each booking as a card with everything from the message', async () => {
      await create();
      const card = cards()[0];
      const t = card.textContent!;
      expect(t).toContain('MacBook Air M5 | RAM 16GB | SSD 512GB');
      expect(t).toContain('12/11/2026');
      expect(t).toContain('(Thursday)');
      expect(t).toContain('011968240');
      expect(t).toContain('@Horth_Heng');
      expect(t).toContain('$1,050');
      expect(t).toContain('$500');
      expect(t).toContain('$550');
      expect(t).toContain('08/11/2026');
      expect(t).toContain('Booked');
    });

    it('phone and Telegram are links that open the dialler / Telegram', async () => {
      await create([booking({ phone: '+855 11 968 240' })]);
      const links = Array.from(cards()[0].querySelectorAll('a')) as HTMLAnchorElement[];
      expect(links.find(a => a.getAttribute('href')!.startsWith('tel:'))!.getAttribute('href')).toBe('tel:+85511968240');
      const telegram = links.find(a => a.href.includes('t.me'))!;
      expect(telegram.getAttribute('href')).toBe('https://t.me/Horth_Heng');
      expect(telegram.getAttribute('target')).toBe('_blank');
      expect(telegram.getAttribute('rel')).toContain('noopener');
    });

    it('a missing phone or Telegram shows a dash, not a broken link', async () => {
      await create([booking({ phone: null, telegram: null })]);
      expect(cards()[0].querySelectorAll('a').length).toBe(0);
      expect(cards()[0].textContent).toContain('—');
    });

    it('shows the photo of the linked product, or a picture placeholder', async () => {
      await create([booking({ product_image: '/uploads/air.png' }), booking({ id: 2, product_image: null })]);
      expect(cards()[0].querySelector('img')!.getAttribute('src')).toContain('/uploads/air.png');
      expect(cards()[1].querySelector('img')).toBeNull();
      expect(cards()[1].querySelector('svg')).not.toBeNull();
    });

    it('the balance still to pay is highlighted only while the booking is open', async () => {
      await create([booking({ id: 1 }), booking({ id: 2, status: 'cancelled' })]);
      const balance = (card: HTMLElement) => Array.from(card.querySelectorAll('dd')).find(dd => dd.textContent!.includes('$550'))!;
      expect(balance(cards()[0]).className).toContain('text-amber-700');
      expect(balance(cards()[1]).className).not.toContain('text-amber-700');
    });

    it('is two per row on a wide screen and one per row on a phone', async () => {
      await create();
      const grid = cards()[0].parentElement!;
      expect(grid.classList).toContain('grid-cols-1');
      expect(grid.classList).toContain('xl:grid-cols-2');
    });

    it('a cancelled booking is dimmed', async () => {
      await create([booking({ status: 'cancelled' })]);
      expect(cards()[0].className).toContain('opacity-60');
      expect(cards()[0].textContent).toContain('Cancelled');
    });

    it('says so when there are no bookings yet', async () => {
      await create([]);
      expect(text()).toContain('No bookings yet.');
    });

    it('shows the reason when the bookings cannot be loaded', async () => {
      await create();
      answer(throwError(() => ({ error: { error: 'Database is down' } })));
      component.loadBookings();
      fixture.detectChanges();
      expect(text()).toContain('Database is down');
    });

    describe('tabs and search', () => {
      const list = () => [
        booking({ id: 1, product_name: 'MacBook Air M5', status: 'booked' }),
        booking({ id: 2, product_name: 'Dell XPS 13', phone: '012 345 678', telegram: '@dell_fan', status: 'booked' }),
        booking({ id: 3, product_name: 'Asus TUF A15', phone: '099 111 222', telegram: null, status: 'cancelled' }),
        booking({ id: 4, product_name: 'MSI Cyborg', status: 'cancelled' }),
      ];
      const tab = (label: string) => Array.from(dom().querySelectorAll('[role="group"] button')).find(b => b.textContent!.trim().startsWith(label)) as HTMLButtonElement;
      const lastAsk = () => asked[asked.length - 1];
      const names = () => cards().map(c => c.querySelector('h3')!.textContent!.trim());

      it('has a tab per status with the number of bookings in it, counted by the API (no "Picked up": that became a Sale)', async () => {
        await create(list());
        expect(['All', 'Booked', 'Cancelled'].map(l => tab(l).textContent!.replace(/\s+/g, '')))
          .toEqual(['All4', 'Booked2', 'Cancelled2']);
        expect(tab('Picked up')).toBeUndefined();
      });

      it('"All" is the booked and the cancelled ones: a picked-up booking (it became a Sale) is not asked for, and is not counted', async () => {
        await create();
        answer(of(pageOf(list(), { meta: { counts: { booked: 2, cancelled: 2, picked_up: 7 } } })));
        component.loadBookings();
        fixture.detectChanges();
        expect(lastAsk().excludeStatus).toBe('picked_up');
        expect(lastAsk().status).toBeUndefined();
        expect(tab('All').textContent!.replace(/\s+/g, '')).toBe('All4');
        expect(text()).not.toContain('Became Sale');
      });

      it('a tab asks the API for that status, shows what it sends, and is marked as the current one', async () => {
        await create(list());
        answer(of(pageOf(list().slice(0, 2), { meta: { counts: countsOf(list()) } })));
        tab('Booked').click();
        fixture.detectChanges();
        expect(lastAsk()).toEqual({ page: 1, perPage: 10, status: 'booked', search: '' });
        expect(names()).toEqual(['MacBook Air M5', 'Dell XPS 13']);
        expect(tab('Booked').getAttribute('aria-pressed')).toBe('true');
        expect(tab('All').getAttribute('aria-pressed')).toBe('false');

        answer(of(pageOf(list().slice(2), { meta: { counts: countsOf(list()) } })));
        tab('Cancelled').click();
        fixture.detectChanges();
        expect(lastAsk().status).toBe('cancelled');
        expect(names()).toEqual(['Asus TUF A15', 'MSI Cyborg']);

        answer(of(pageOf(list())));
        tab('All').click();
        fixture.detectChanges();
        expect(lastAsk()).toEqual({ page: 1, perPage: 10, excludeStatus: 'picked_up', search: '' });
        expect(cards().length).toBe(4);
      });

      it('pressing the tab you are on asks nothing', async () => {
        await create(list());
        const before = asked.length;
        tab('All').click();
        fixture.detectChanges();
        expect(asked.length).toBe(before);
      });

      it('the numbers of the tabs do not change with the tab or the search (the API counts them all)', async () => {
        await create(list());
        answer(of(pageOf([list()[2]], { total: 1, meta: { counts: countsOf(list()) } })));
        tab('Cancelled').click();
        fixture.detectChanges();
        expect(['All', 'Booked', 'Cancelled'].map(l => tab(l).textContent!.replace(/\s+/g, ''))).toEqual(['All4', 'Booked2', 'Cancelled2']);
      });

      it('typing in the search box asks the API with that text, from the first page, when the typing stops', fakeAsync(() => {
        create(list()).then(() => {
          const before = asked.length;
          type('input[aria-label="Search bookings"]', 'xps');
          expect(asked.length).toBe(before);                 // not yet: the person may still be typing
          tick(299);
          expect(asked.length).toBe(before);
          tick(1);
          expect(asked.length).toBe(before + 1);
          expect(lastAsk()).toEqual({ page: 1, perPage: 10, excludeStatus: 'picked_up', search: 'xps' });
        });
        tick();
      }));

      it('a word typed letter by letter is ONE question, not one for each letter', fakeAsync(() => {
        create(list()).then(() => {
          const before = asked.length;
          for (const typed of ['d', 'de', 'del', 'dell']) { type('input[aria-label="Search bookings"]', typed); tick(100); }
          tick(300);
          expect(asked.length).toBe(before + 1);
          expect(lastAsk().search).toBe('dell');
        });
        tick();
      }));

      it('search and tab work together, and "No bookings found." appears when nothing matches', fakeAsync(() => {
        create(list()).then(() => {
          answer(of(pageOf([], { meta: { counts: countsOf(list()) } })));
          tab('Cancelled').click();
          type('input[aria-label="Search bookings"]', 'xps');
          tick(300);
          fixture.detectChanges();
          expect(lastAsk()).toEqual({ page: 1, perPage: 10, status: 'cancelled', search: 'xps' });
          expect(cards().length).toBe(0);
          expect(text()).toContain('No bookings found.');
          expect(text()).not.toContain('No bookings yet.');
        });
        tick();
      }));

      it('while the answer to a tab is coming, the grey shapes are shown', async () => {
        await create(list());
        const pending = new Subject<Paged<Booking>>();
        answer(pending);
        tab('Booked').click();
        fixture.detectChanges();
        expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
        expect(cards().length).toBe(0);
        pending.next(pageOf(list().slice(0, 2)));
        pending.complete();
        fixture.detectChanges();
        expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).toBeNull();
        expect(names()).toEqual(['MacBook Air M5', 'Dell XPS 13']);
      });
    });

    describe('the pages', () => {
      const lastAsk = () => asked[asked.length - 1];
      const bar = () => dom().querySelector('[data-pagination]') as HTMLElement | null;
      const barText = () => bar()!.querySelector('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim();
      const many = (rows: Booking[], over: Partial<Paged<Booking, { counts: BookingCounts }>> = {}) =>
        pageOf(rows, { page: 1, per_page: 10, total: 25, total_pages: 3, meta: { counts: { booked: 20, cancelled: 5, picked_up: 2 } }, ...over });
      const tab = (label: string) => Array.from(dom().querySelectorAll('[role="group"] button')).find(b => b.textContent!.trim().startsWith(label)) as HTMLButtonElement;

      beforeEach(() => spyOn(window, 'scrollTo'));

      it('says which bookings are on screen: "Showing 1–1 of 1", with no "Per page" box and no buttons for one page', async () => {
        await create();
        expect(barText()).toBe('Showing 1–1 of 1');
        expect(bar()!.querySelector('[data-per-page]')).toBeNull();
        expect(bar()!.querySelector('[data-next]')).toBeNull();
      });

      it('with many bookings: "Showing 1–10 of 25" and Next', async () => {
        await create();
        answer(of(many([EXAMPLE])));
        component.loadBookings();
        fixture.detectChanges();
        expect(barText()).toBe('Showing 1–10 of 25');
        expect(bar()!.querySelector('[data-page-of]')!.textContent!.trim()).toBe('Page 1 of 3');
      });

      it('Next asks the API for the next page, shows the grey shapes meanwhile, and shows the new page', async () => {
        await create();
        answer(of(many([EXAMPLE])));
        component.loadBookings();
        fixture.detectChanges();

        const pending = new Subject<Paged<Booking>>();
        answer(pending);
        (bar()!.querySelector('[data-next]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(lastAsk().page).toBe(2);
        expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
        expect(bar()).toBeNull();

        pending.next(many([booking({ id: 11, product_name: 'Second page laptop' })], { page: 2 }));
        pending.complete();
        fixture.detectChanges();
        expect(cards().map(c => c.querySelector('h3')!.textContent!.trim())).toEqual(['Second page laptop']);
        expect(barText()).toBe('Showing 11–20 of 25');
      });

      it('"Per page" asks for that many on a page, from the first page', async () => {
        await create();
        answer(of(many([EXAMPLE], { page: 2 })));
        component.loadBookings();
        fixture.detectChanges();
        const select = bar()!.querySelector('[data-per-page]') as HTMLSelectElement;
        select.value = '20';
        select.dispatchEvent(new Event('change'));
        expect(lastAsk()).toEqual(jasmine.objectContaining({ page: 1, perPage: 20 }));
      });

      it('a tab starts from the first page', async () => {
        await create();
        answer(of(many([EXAMPLE], { page: 3 })));
        component.loadBookings();
        fixture.detectChanges();
        tab('Booked').click();
        expect(lastAsk().page).toBe(1);
      });

      it('after the last booking of a page is deleted, the page before it is shown (not an empty page)', async () => {
        await create();
        const cancelled = booking({ status: 'cancelled' });
        answer(of(many([cancelled], { page: 3, total: 21 })));
        component.loadBookings();
        fixture.detectChanges();
        buttonIn(cards()[0], 'Delete').click();
        fixture.detectChanges();
        const answers = [many([], { page: 3, total: 20, total_pages: 2 }), many([cancelled], { page: 2, total: 20, total_pages: 2 })];
        answer(() => of(answers.shift()!));
        buttonIn(dialog()!, 'Delete booking').click();
        fixture.detectChanges();
        expect(lastAsk().page).toBe(2);
        expect(component.paging.page).toBe(2);
        expect(cards().length).toBe(1);
      });

      it('saving or changing a booking reads the page you are on again (you stay where you are)', async () => {
        await create();
        answer(of(many([EXAMPLE], { page: 2 })));
        component.loadBookings();
        fixture.detectChanges();
        buttonIn(cards()[0], 'Edit').click();
        await settle();
        fillValidAndSave();
        fixture.detectChanges();
        expect(lastAsk().page).toBe(2);

        function fillValidAndSave() {
          const form = fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
          form.form.deposit = 400;
          form.submit();
        }
      });

      it('a slow answer to an old question never replaces the answer to a newer one', async () => {
        await create();
        const slow = new Subject<Paged<Booking>>();
        const fast = new Subject<Paged<Booking>>();
        const queue = [slow, fast];
        answer(() => queue.shift()!);
        tab('Booked').click();
        tab('Cancelled').click();
        fixture.detectChanges();
        fast.next(pageOf([booking({ id: 3, product_name: 'The cancelled one', status: 'cancelled' })]));
        slow.next(pageOf([booking({ id: 1, product_name: 'The booked one' })]));
        fixture.detectChanges();
        expect(cards().map(c => c.querySelector('h3')!.textContent!.trim())).toEqual(['The cancelled one']);
      });

      it('no bar while there is nothing to page through', async () => {
        await create([]);
        expect(bar()).toBeNull();
      });
    });

    describe('pickup reminder (booked ones only)', () => {
      const hint = async (pickup: string, status: Booking['status'] = 'booked') => {
        await create([booking({ pickup_date: pickup, status })]);
        return cards()[0].querySelector('p.text-xs.font-medium') as HTMLElement | null;
      };

      it('today and tomorrow are amber', async () => {
        const today = await hint('2026-11-09');
        expect(today!.textContent!.trim()).toBe('Pickup today');
        expect(today!.className).toContain('text-amber-600');
      });

      it('tomorrow', async () => {
        TestBed.resetTestingModule();
        expect((await hint('2026-11-10'))!.textContent!.trim()).toBe('Pickup tomorrow');
      });

      it('within a week it says how many days', async () => {
        TestBed.resetTestingModule();
        expect((await hint('2026-11-12'))!.textContent!.trim()).toBe('In 3 days');
      });

      it('further away: no reminder', async () => {
        TestBed.resetTestingModule();
        expect(await hint('2026-11-17')).toBeNull();
      });

      it('late ones are red and count the days', async () => {
        TestBed.resetTestingModule();
        const late = await hint('2026-11-07');
        expect(late!.textContent!.trim()).toBe('Overdue by 2 days');
        expect(late!.className).toContain('text-red-600');
      });

      it('one day late is "1 day"', async () => {
        TestBed.resetTestingModule();
        expect((await hint('2026-11-08'))!.textContent!.trim()).toBe('Overdue by 1 day');
      });

      it('a picked-up or cancelled booking has no reminder, even if the date is in the past', async () => {
        TestBed.resetTestingModule();
        expect(await hint('2026-11-01', 'cancelled')).toBeNull();
        TestBed.resetTestingModule();
        expect(await hint('2026-11-01', 'cancelled')).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the New / Edit drawer (the form itself is tested in booking-form.component.spec.ts)', () => {
    const formComponent = () => fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
    const fillValid = () => Object.assign(formComponent().form, {
      product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
      full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12',
    });
    const openNew = async () => { buttonIn(dom(), 'New booking').click(); await settle(); };

    it('"New booking" opens a drawer from the right edge with an empty form and today as the booking date', async () => {
      await create();
      await openNew();
      expect(drawer()!.getAttribute('aria-label')).toBe('New booking');
      expect(dom().querySelector('.drawer-backdrop')!.classList).toContain('justify-end');
      expect(formComponent().booking).toBeNull();
      expect(formComponent().form.product_name).toBe('');
      expect(formComponent().form.booking_date).toBe('2026-11-09');
    });

    it('"Edit" opens the same drawer with that booking in it', async () => {
      await create([EXAMPLE, booking({ id: 2, product_name: 'Other' })]);
      buttonIn(cards()[1], 'Edit').click();
      await settle();
      expect(drawer()!.getAttribute('aria-label')).toBe('Edit booking');
      expect(formComponent().booking).toBe(component.bookings[1]);
      expect(formComponent().form.product_name).toBe('Other');
      expect(buttonIn(drawer()!, 'Save changes')).toBeTruthy();
    });

    it('hands your products to the form, so the Product box can suggest them', async () => {
      await create([], [product({ id: 1 }), product({ id: 2, name: 'Dell' })]);
      await openNew();
      expect(formComponent().products.length).toBe(2);
    });

    it('every time it opens the form starts fresh', async () => {
      await create();
      await openNew();
      formComponent().form.product_name = 'half typed';
      key('Escape');
      await openNew();
      expect(formComponent().form.product_name).toBe('');
    });

    it('saving a new booking closes the drawer, reloads the list and says "Booking saved."', async () => {
      await create();
      await openNew();
      fillValid();
      const loadsBefore = asked.length;
      formComponent().submit();
      fixture.detectChanges();
      expect(bookingsApi['createBooking']).toHaveBeenCalledTimes(1);
      expect(drawer()).toBeNull();
      expect(asked.length).toBe(loadsBefore + 1);
      expect(text()).toContain('Booking saved.');
    });

    it('after a save the notice only says it is saved (nothing to copy)', async () => {
      await create();
      await openNew();
      fillValid();
      formComponent().submit();
      fixture.detectChanges();
      const notice = dom().querySelector('[role="status"]') as HTMLElement;
      expect(notice.textContent).toContain('Booking saved.');
      expect(notice.querySelector('button')).toBeNull();
      expect(text()).not.toContain('Copy details');
    });

    it('saving changes to a booking says "Changes saved."', async () => {
      await create();
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      formComponent().form.deposit = 600;
      formComponent().submit();
      fixture.detectChanges();
      expect(bookingsApi['updateBooking']).toHaveBeenCalledTimes(1);
      expect(drawer()).toBeNull();
      expect(text()).toContain('Changes saved.');
    });

    it('the form\'s Cancel, the ✕, Esc and the dark background all close the drawer', async () => {
      await create();
      await openNew();
      buttonIn(drawer()!, 'Cancel').click();
      fixture.detectChanges();
      expect(drawer()).toBeNull();

      await openNew();
      (drawer()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(drawer()).toBeNull();

      await openNew();
      key('Escape');
      expect(drawer()).toBeNull();

      await openNew();
      (dom().querySelector('.drawer-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(drawer()).toBeNull();
    });

    it('a click inside the drawer does not close it', async () => {
      await create();
      await openNew();
      drawer()!.click();
      fixture.detectChanges();
      expect(drawer()).not.toBeNull();
    });

    it('cannot be closed while a save is running, and closes when the save is done', async () => {
      await create();
      const pending = new Subject<Booking>();
      bookingsApi['createBooking'].and.returnValue(pending);
      await openNew();
      fillValid();
      formComponent().submit();
      fixture.detectChanges();
      key('Escape');
      (dom().querySelector('.drawer-backdrop') as HTMLElement).click();
      component.closeDrawer();
      fixture.detectChanges();
      expect(drawer()).not.toBeNull();
      pending.next(booking());
      pending.complete();
      fixture.detectChanges();
      expect(drawer()).toBeNull();
    });

    it('closing it without saving throws away pictures that were uploaded in it', async () => {
      await create();
      await openNew();
      formComponent().form.images = [];
      const box = fixture.debugElement.query(By.css('app-photo-upload')).componentInstance;
      box.onFilesSelected({ target: { files: [new File([new Uint8Array(10)], 'receipt.png', { type: 'image/png' })], value: '' } } as unknown as Event);
      fixture.detectChanges();
      expect(formComponent().form.images).toEqual(['/uploads/receipt.png']);
      key('Escape');
      expect(productsApi['discardImage']).toHaveBeenCalledOnceWith('/uploads/receipt.png');
    });
  });

  // ---------------------------------------------------------------------------------------------
  // ---------------------------------------------------------------------------------------------
  describe('the invoice (the paper) of a booking', () => {
    const MADE: Invoice = {
      id: 40, number: 42, type: 'booking', invoice_date: '2026-11-08', customer_name: null, phone: '011968240', telegram: '@Horth_Heng',
      device: null, problem: null, pickup_date: '2026-11-12', booking_id: 1, warranty: '1_month', deposit: 500, total: 1050, balance: 550,
      items: [{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }],
    };
    const invoiceForm = () => fixture.debugElement.query(By.directive(InvoiceFormComponent)).componentInstance as InvoiceFormComponent;
    const invoiceViewer = () => fixture.debugElement.query(By.directive(InvoiceViewerComponent)).componentInstance as InvoiceViewerComponent;
    const invoiceButton = (card: HTMLElement) => Array.from(card.querySelectorAll('button')).find(b => ['Invoice', 'View invoice'].includes(b.textContent!.trim())) as HTMLButtonElement;
    const openInvoice = async () => { invoiceButton(cards()[0]).click(); await settle(); };

    it('asks which bookings already have an invoice', async () => {
      await create();
      expect(invoicesApi['getInvoices']).toHaveBeenCalledOnceWith();
    });

    it('a booking without an invoice has an "Invoice" button; one with an invoice says "View invoice"', async () => {
      await create([booking({ id: 1 }), booking({ id: 2 })], [], [MADE]);
      expect(invoiceButton(cards()[0]).textContent!.trim()).toBe('View invoice');
      expect(invoiceButton(cards()[1]).textContent!.trim()).toBe('Invoice');
    });

    it('the buttons still say "Invoice" when the invoices cannot be asked', async () => {
      await create();
      invoicesApi['getInvoices'].and.returnValue(throwError(() => new Error('offline')));
      component.ngOnInit();
      fixture.detectChanges();
      expect(invoiceButton(cards()[0]).textContent!.trim()).toBe('Invoice');
    });

    describe('"Invoice" (a new one)', () => {
      it('opens the invoice form for a BOOKING, filled in from the booking', async () => {
        await create();
        await openInvoice();
        expect(drawer()!.getAttribute('aria-label')).toBe('New booking invoice');
        const f = invoiceForm();
        expect(f.kind).toBe('booking');
        expect(f.form.invoice_date).toBe('2026-11-08');                       // the booking date
        expect(f.form.phone).toBe('011968240');
        expect(f.form.telegram).toBe('@Horth_Heng');
        expect(f.form.pickup_date).toBe('2026-11-12');
        expect(f.form.items).toEqual([{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }]);
        expect(f.form.deposit).toBe(500);
        expect(f.form.booking_id).toBe(1);
        expect(f.form.customer_name).toBe('');                                // not known: it can be typed
        expect(f.form.warranty).toBe('');                                     // has to be chosen
      });

      it('shows the balance from the booking: $1,050 - $500 = $550', async () => {
        await create();
        await openInvoice();
        const line = (drawer()!.querySelector('[aria-live="polite"]')!.textContent ?? '').replace(/\s+/g, ' ');
        expect(line).toContain('$550');
      });

      it('saving sends the invoice with the booking link', async () => {
        await create();
        await openInvoice();
        invoiceForm().form.customer_name = 'Horth';
        invoiceForm().form.warranty = '1_month';
        invoiceForm().submit();
        const sent = invoicesApi['createInvoice'].calls.mostRecent().args[0];
        expect(sent.type).toBe('booking');
        expect(sent.booking_id).toBe(1);
        expect(sent.pickup_date).toBe('2026-11-12');
        expect(sent.deposit).toBe(500);
        expect(sent.customer_name).toBe('Horth');
        expect(sent.items).toEqual([{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }]);
      });

      it('a product name longer than the paper holds (90 characters) is cut, not refused', async () => {
        await create([booking({ product_name: 'M'.repeat(120) })]);
        await openInvoice();
        expect(invoiceForm().form.items[0].name).toBe('M'.repeat(90));
      });

      it('after saving, the paper opens so it can be printed, and the button now says "View invoice"', async () => {
        await create();
        await openInvoice();
        invoiceForm().form.warranty = '1_month';
        invoicesApi['getInvoices'].and.returnValue(of([{ ...MADE, number: 44 }]));
        invoiceForm().submit();
        fixture.detectChanges();
        expect(dom().querySelector('app-invoice-editor')).toBeNull();
        expect(invoiceViewer().invoice.number).toBe(44);
        expect(dom().querySelector('app-invoice-viewer')!.textContent).toContain('Invoice 000044');
        expect(invoicesApi['getInvoices'].calls.count()).toBe(2);
        expect(invoiceButton(cards()[0]).textContent!.trim()).toBe('View invoice');
      });

      it('shows the reason when the invoice is refused (for example the booking already has one)', async () => {
        await create();
        await openInvoice();
        invoicesApi['createInvoice'].and.returnValue(throwError(() => ({ error: { error: 'This booking already has an invoice' } })));
        invoiceForm().form.warranty = '1_month';
        invoiceForm().submit();
        fixture.detectChanges();
        expect(dom().querySelector('app-invoice-editor')!.textContent).toContain('This booking already has an invoice');
      });

      it('Esc closes the invoice form and nothing else on the page', async () => {
        await create();
        await openInvoice();
        key('Escape');
        expect(dom().querySelector('app-invoice-editor')).toBeNull();
        expect(cards().length).toBe(1);
      });

      it('gives your products to the form, so item names can be picked', async () => {
        await create([EXAMPLE], [product({ id: 1, name: 'MacBook Air M5' })]);
        await openInvoice();
        expect(invoiceForm().products.length).toBe(1);
      });
    });

    describe('"View invoice" (it already exists)', () => {
      it('shows the paper of that invoice straight away, without making another', async () => {
        await create([EXAMPLE], [], [MADE]);
        await openInvoice();
        expect(invoiceViewer().invoice.id).toBe(40);
        expect(dom().querySelector('app-invoice-editor')).toBeNull();
        expect(invoicesApi['createInvoice']).not.toHaveBeenCalled();
      });

      it('the paper\'s Edit button opens the form for that invoice, and saving changes it (no new one)', async () => {
        await create([EXAMPLE], [], [MADE]);
        await openInvoice();
        const viewerEl = dom().querySelector('app-invoice-viewer') as HTMLElement;
        buttonIn(viewerEl, 'Edit').click();
        await settle();
        expect(dom().querySelector('app-invoice-viewer')).toBeNull();
        expect(invoiceForm().invoice!.id).toBe(40);
        expect(drawer()!.getAttribute('aria-label')).toBe('Edit invoice 000042');
        invoiceForm().form.customer_name = 'Horth Heng';
        invoiceForm().submit();
        fixture.detectChanges();
        expect(invoicesApi['updateInvoice'].calls.mostRecent().args[0]).toBe(40);
        expect(invoicesApi['createInvoice']).not.toHaveBeenCalled();
      });

      it('closing the paper goes back to the bookings', async () => {
        await create([EXAMPLE], [], [MADE]);
        await openInvoice();
        key('Escape');
        expect(dom().querySelector('app-invoice-viewer')).toBeNull();
      });
    });

    it('while an invoice window is open, Esc does not also close what is under it', async () => {
      await create();
      component.askToDelete(component.bookings[0]);
      component.invoicing = { prefill: {}, invoice: null };
      component.onEscape();
      expect(component.deleteTarget).not.toBeNull();
      component.invoicing = null;
      component.viewingInvoice = MADE;
      component.onEscape();
      expect(component.deleteTarget).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('photos on a card', () => {
    it('shows the booking\'s photos (e.g. the deposit receipt) as small pictures that open big', async () => {
      await create([booking({ images: ['/uploads/receipt-1.png', '/uploads/receipt-2.png'] })]);
      const links = Array.from(cards()[0].querySelectorAll('ul[aria-label="Photos"] a')) as HTMLAnchorElement[];
      expect(links.length).toBe(2);
      expect(links[0].getAttribute('href')).toContain('/uploads/receipt-1.png');
      expect(links[0].getAttribute('target')).toBe('_blank');
      expect(links[0].querySelector('img')!.getAttribute('src')).toContain('/uploads/receipt-1.png');
    });

    it('shows no photo strip when there are none', async () => {
      await create([booking({ images: [] }), booking({ id: 2, images: undefined })]);
      expect(cards()[0].querySelector('ul[aria-label="Photos"]')).toBeNull();
      expect(cards()[1].querySelector('ul[aria-label="Photos"]')).toBeNull();
    });
  });
  // ---------------------------------------------------------------------------------------------
  describe('quick actions on a card', () => {
    it('a booked card\'s main button says what to collect, and opens "Customer picked up"', async () => {
      await create([EXAMPLE]);
      const main = cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement;
      expect(main.textContent!.trim()).toBe('Customer picked up · collect $550');
      main.click();
      fixture.detectChanges();
      expect(dom().querySelector('app-booking-pickup [role="dialog"]')).not.toBeNull();
      expect(bookingsApi['updateBooking']).not.toHaveBeenCalled();        // nothing changes until the Sale button
    });

    it('with nothing left to collect the button just says "Customer picked up"', async () => {
      await create([booking({ deposit: 1050, remaining_balance: 0 })]);
      expect(cards()[0].querySelector('[data-action="pickup"]')!.textContent!.trim()).toBe('Customer picked up');
    });

    it('is only there for bookings still booked', async () => {
      await create([booking({ id: 1 }), booking({ id: 2, status: 'cancelled' })]);
      expect(cards().map(c => !!c.querySelector('[data-action="pickup"]'))).toEqual([true, false]);
    });

    describe('the layout of the buttons', () => {
      const labels = (root: ParentNode) => Array.from(root.querySelectorAll('button')).map(b => b.textContent!.trim());

      it('the main button is on its own full-width row, above the other three', async () => {
        await create([EXAMPLE]);
        const main = cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement;
        expect(main.classList).toContain('w-full');
        const row = cards()[0].querySelector('.grid-cols-3') as HTMLElement;
        expect(row).not.toBeNull();
        expect(main.compareDocumentPosition(row) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(row.contains(main)).toBeFalse();
      });

      it('the other three sit in one even row: Invoice, Edit, Cancel (each with an icon and its name under it)', async () => {
        await create([EXAMPLE]);
        const row = cards()[0].querySelector('.grid-cols-3') as HTMLElement;
        expect(labels(row)).toEqual(['Invoice', 'Edit', 'Cancel']);
        for (const button of Array.from(row.querySelectorAll('button'))) {
          expect(button.querySelector('svg')).withContext(button.textContent ?? '').not.toBeNull();
          expect(button.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
        }
      });

      it('a booking that is not "booked" has only the row of three, with Delete instead of Cancel (no empty gap where the main button was)', async () => {
        await create([booking({ id: 2, status: 'cancelled' }), booking({ id: 3, status: 'cancelled' })]);
        expect(labels(cards()[0])).toEqual(['Invoice', 'Edit', 'Delete']);
        expect(labels(cards()[1])).toEqual(['Invoice', 'Edit', 'Delete']);
      });

      it('there is no "Copy details" button (the booking message is sent to Telegram by the app)', async () => {
        await create([EXAMPLE]);
        expect(text()).not.toContain('Copy details');
        expect(dom().querySelector('app-booking-share-dialog')).toBeNull();
      });
    });

  });

  // ---------------------------------------------------------------------------------------------
  describe('a request from the scan screen ("Customer is here: Sell" on a scanned laptop)', () => {
    const drawer = () => dom().querySelector('app-booking-pickup [role="dialog"]') as HTMLElement | null;

    it('opens the pickup window of that booking by itself', async () => {
      await create([booking({ id: 1 }), booking({ id: 2, product_name: 'Dell XPS 13', telegram: '@second' })], [], [], scan => scan.ask({ kind: 'pickup', bookingId: 2 }));
      await settle();
      expect(drawer()).toBeTruthy();
      expect(component.pickingUp?.id).toBe(2);
      expect(drawer()!.textContent).toContain('Dell XPS 13');
    });

    it('a booking that is not waiting for pickup any more says so and opens nothing', async () => {
      await create([booking({ id: 1, status: 'cancelled' })], [], [], scan => scan.ask({ kind: 'pickup', bookingId: 1 }));
      await settle();
      expect(drawer()).toBeNull();
      expect(component.errorMessage).toBe('That booking is not waiting for pickup any more.');
    });

    it('the booking is read by its number, so it opens also when it is not on the page on screen', async () => {
      const onAnotherPage = booking({ id: 2, product_name: 'On another page' });
      await create([booking({ id: 1 }), onAnotherPage], [], [], scan => scan.ask({ kind: 'pickup', bookingId: 2 }), [booking({ id: 1 })]);
      await settle();
      expect(cards().length).toBe(1);                                   // the page on screen does not have it
      expect(bookingsApi['getBooking']).toHaveBeenCalledWith(2);
      expect(component.pickingUp?.id).toBe(2);
    });

    it('a booking that does not exist says so too', async () => {
      await create([booking({ id: 1 })], [], [], scan => scan.ask({ kind: 'pickup', bookingId: 404 }));
      await settle();
      expect(drawer()).toBeNull();
      expect(component.errorMessage).toBe('That booking is not waiting for pickup any more.');
    });

    it('a request is used once: loading the list again opens nothing', async () => {
      await create([booking({ id: 1 })], [], [], scan => scan.ask({ kind: 'pickup', bookingId: 1 }));
      await settle();
      component.closePickup();
      await settle();
      expect(component.pickingUp).toBeNull();
    });

    it('a Sell / Book / Repair request is not for this page: it stays waiting for the Menu', async () => {
      let scanApi!: ScanActionService;
      await create([booking({ id: 1 })], [], [], scan => { scanApi = scan; scan.ask({ kind: 'sell', productId: 7 }); });
      await settle();
      expect(drawer()).toBeNull();
      expect(scanApi.takeLaptop()).toEqual({ kind: 'sell', productId: 7 });
    });

    it('with no request the page opens nothing', async () => {
      await create();
      await settle();
      expect(drawer()).toBeNull();
      expect(component.errorMessage).toBe('');
    });
  });

  describe('customer picked up: the booking becomes a Sale', () => {
    const drawerEl = () => dom().querySelector('app-booking-pickup [role="dialog"]') as HTMLElement | null;
    const pickupComponent = () => fixture.debugElement.query(By.directive(BookingPickupComponent)).componentInstance as BookingPickupComponent;
    const startPickup = async (list: Booking[] = [EXAMPLE]) => {
      await create(list);
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      await settle();
    };

    it('the drawer shows the money: full price, the deposit already paid, and what to collect now', async () => {
      await startPickup();
      const t = drawerEl()!.textContent!.replace(/\s+/g, ' ');
      expect(t).toContain('Customer picked up');
      expect(t).toContain('MacBook Air M5 | RAM 16GB | SSD 512GB');
      expect(drawerEl()!.querySelector('[data-full]')!.textContent!.trim()).toBe('$1,050');
      expect(drawerEl()!.querySelector('[data-deposit]')!.textContent).toContain('$500');
      expect(drawerEl()!.querySelector('[data-collect]')!.textContent!.trim()).toBe('$550');
    });

    it('starts from the booking: phone and Telegram filled, warranty 1 week', async () => {
      await startPickup();
      expect(pickupComponent().form.phone).toBe('011968240');
      expect(pickupComponent().form.telegram).toBe('@Horth_Heng');
      expect(pickupComponent().form.warranty).toBe('1_week');
    });

    it('says what will happen: the booking is picked up, a Sale is made, the laptop leaves the Menu', async () => {
      await startPickup();
      const steps = drawerEl()!.querySelector('[data-steps]')!.textContent!.replace(/\s+/g, ' ');
      expect(steps).toContain('The booking becomes Picked up.');
      expect(steps).toContain('A Sale is made, paid in full ($1,050), with its invoice.');
      expect(steps).toContain('The laptop is marked as sold and leaves the Menu.');
    });

    it('the button says how much is collected', async () => {
      await startPickup();
      expect(buttonIn(drawerEl()!, 'Collect $550 and make the sale')).toBeTruthy();
    });

    it('when the deposit already covers everything the button just says "Make the sale"', async () => {
      await startPickup([booking({ deposit: 1050, remaining_balance: 0 })]);
      expect(buttonIn(drawerEl()!, 'Make the sale')).toBeTruthy();
      expect(drawerEl()!.querySelector('[data-collect]')!.textContent!.trim()).toBe('$0');
    });

    it('the warranty can be chosen (1 week, 2 weeks, 1 month, None)', async () => {
      await startPickup();
      const radios = Array.from(drawerEl()!.querySelectorAll('[role="radio"]')) as HTMLButtonElement[];
      expect(radios.map(r => r.textContent!.trim())).toEqual(['1 week', '2 weeks', '1 month', 'None']);
      radios[2].click();
      fixture.detectChanges();
      expect(pickupComponent().form.warranty).toBe('1_month');
      expect(radios.map(r => r.getAttribute('aria-checked'))).toEqual(['false', 'false', 'true', 'false']);
    });

    it('Cancel, the ✕, Esc and the dark background close it without doing anything', async () => {
      await startPickup();
      buttonIn(drawerEl()!, 'Cancel').click();
      fixture.detectChanges();
      expect(drawerEl()).toBeNull();
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      (drawerEl()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(drawerEl()).toBeNull();
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      key('Escape');
      expect(drawerEl()).toBeNull();
      expect(bookingsApi['pickUp']).not.toHaveBeenCalled();
    });

    it('the button makes the Sale: ONE call with the warranty and the contact, then the paper of the Sale opens', async () => {
      await startPickup();
      pickupComponent().form.customer_name = ' Sok Dara ';
      pickupComponent().form.warranty = '2_weeks';
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(bookingsApi['pickUp']).toHaveBeenCalledOnceWith(1, { warranty: '2_weeks', customer_name: 'Sok Dara', phone: '011968240', telegram: '@Horth_Heng' });
      expect(drawerEl()).toBeNull();
      expect(fixture.debugElement.query(By.directive(InvoiceViewerComponent)).componentInstance.invoice.number).toBe(44);
      expect(bookingsApi['updateBooking']).not.toHaveBeenCalled();         // the server does it all in one step
    });

    it('says the Sale was made and that the laptop is sold, and loads the lists again', async () => {
      await startPickup();
      const loads = asked.length;
      const invoiceLoads = invoicesApi['getInvoices'].calls.count();
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(text()).toContain('Sale 000044 made. The laptop is marked as sold.');
      expect(asked.length).toBe(loads + 1);
      expect(invoicesApi['getInvoices'].calls.count()).toBe(invoiceLoads + 1);
    });

    it('a counted laptop says one less in stock', async () => {
      await startPickup();
      bookingsApi['pickUp'].and.returnValue(of({ booking: { ...EXAMPLE, status: 'picked_up' }, invoice: { id: 5, number: 45, items: [] }, laptop: 'stock_lowered' }));
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(text()).toContain('Sale 000045 made. One less laptop in stock.');
    });

    it('when the laptop could not be updated the Sale is still reported, with a red line saying what to do', async () => {
      await startPickup();
      bookingsApi['pickUp'].and.returnValue(of({ booking: { ...EXAMPLE, status: 'picked_up' }, invoice: { id: 5, number: 45, items: [] }, laptop: 'failed' }));
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(text()).toContain('Sale 000045 made.');
      expect(text()).toContain('The sale was made, but the laptop could not be updated. Hide it from the Menu in Products.');
    });

    it('a booking with no laptop of the shop just says the Sale was made', async () => {
      await startPickup();
      bookingsApi['pickUp'].and.returnValue(of({ booking: { ...EXAMPLE, status: 'picked_up' }, invoice: { id: 5, number: 45, items: [] }, laptop: 'none' }));
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(text()).toContain('Sale 000045 made.');
      expect(text()).not.toContain('Menu');
    });

    it('when it fails (e.g. someone was faster) the drawer stays open and says why', async () => {
      await startPickup();
      bookingsApi['pickUp'].and.returnValue(throwError(() => ({ error: { error: 'This booking is already picked up' } })));
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(drawerEl()).not.toBeNull();
      expect(drawerEl()!.querySelector('[role="alert"]')!.textContent).toContain('This booking is already picked up');
      expect(buttonIn(drawerEl()!, 'Collect $550 and make the sale').disabled).toBeFalse();
    });

    it('a failure with no reason says nothing was changed', async () => {
      await startPickup();
      bookingsApi['pickUp'].and.returnValue(throwError(() => new Error('offline')));
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(drawerEl()!.querySelector('[role="alert"]')!.textContent).toContain('Nothing was changed');
    });

    it('closing the drawer after a failure loads the list again, so it tells the truth', async () => {
      await startPickup();
      const loads = asked.length;
      buttonIn(drawerEl()!, 'Cancel').click();
      fixture.detectChanges();
      expect(asked.length).toBe(loads + 1);
    });

    it('while the Sale is being made the buttons are off, a second press does nothing, and it cannot be closed', async () => {
      await startPickup();
      const pending = new Subject<any>();
      bookingsApi['pickUp'].and.returnValue(pending);
      buttonIn(drawerEl()!, 'Collect $550 and make the sale').click();
      fixture.detectChanges();
      expect(buttonIn(drawerEl()!, 'Making the sale...').disabled).toBeTrue();
      expect(buttonIn(drawerEl()!, 'Cancel').disabled).toBeTrue();
      pickupComponent().submit();
      key('Escape');
      expect(bookingsApi['pickUp']).toHaveBeenCalledTimes(1);
      expect(drawerEl()).not.toBeNull();
    });

    it('Esc does not also close something behind the drawer', async () => {
      await create([EXAMPLE]);
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      component.pickingUp = EXAMPLE;
      fixture.detectChanges();
      key('Escape');
      expect(drawerEl()).toBeNull();
      expect(drawer()).not.toBeNull();            // the edit drawer is still open: one Esc, one window
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('cancelling a booking', () => {
    const cancelButton = (index = 0) => cards()[index].querySelector('[data-action="cancel"]') as HTMLButtonElement;

    it('asks first (our own dialog, not a browser pop-up), says it stays in the list, and the focus is on "No, keep it"', async () => {
      await create([EXAMPLE]);
      cancelButton().click();
      fixture.detectChanges();
      const box = dom().querySelector('app-ask-dialog [role="alertdialog"]') as HTMLElement;
      const t = box.textContent!.replace(/\s+/g, ' ');
      expect(t).toContain('Cancel this booking?');
      expect(t).toContain('MacBook Air M5 | RAM 16GB | SSD 512GB');
      expect(t).toContain('It stays in the list as Cancelled. The deposit of $500 was taken on 08/11/2026.');
      expect(document.activeElement).toBe(buttonIn(box, 'No, keep it'));
      expect(bookingsApi['updateBooking']).not.toHaveBeenCalled();
    });

    it('"No, keep it" changes nothing', async () => {
      await create([EXAMPLE]);
      cancelButton().click();
      fixture.detectChanges();
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'No, keep it').click();
      fixture.detectChanges();
      expect(dom().querySelector('app-ask-dialog')).toBeNull();
      expect(bookingsApi['updateBooking']).not.toHaveBeenCalled();
    });

    it('"Yes, cancel it" sets the status to cancelled, reloads and says so', async () => {
      await create([EXAMPLE]);
      const loads = asked.length;
      cancelButton().click();
      fixture.detectChanges();
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'Yes, cancel it').click();
      await settle();
      expect(bookingsApi['updateBooking']).toHaveBeenCalledOnceWith(1, { status: 'cancelled' });
      expect(dom().querySelector('app-ask-dialog')).toBeNull();
      expect(asked.length).toBe(loads + 1);
      expect(text()).toContain('Booking cancelled.');
    });

    it('stays open and says why when it fails', async () => {
      await create([EXAMPLE]);
      cancelButton().click();
      fixture.detectChanges();
      bookingsApi['updateBooking'].and.returnValue(throwError(() => ({ error: { error: 'Booking not found' } })));
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'Yes, cancel it').click();
      await settle();
      expect(dom().querySelector('app-ask-dialog')!.textContent).toContain('Booking not found');
    });

    it('Esc does not answer it (the person has to pick)', async () => {
      await create([EXAMPLE]);
      cancelButton().click();
      fixture.detectChanges();
      key('Escape');
      expect(dom().querySelector('app-ask-dialog')).not.toBeNull();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('a booking takes the laptop off the shelf (see the API: counted stock -1, a single laptop is set aside)', () => {
    const single = (over: Partial<Booking> = {}) => booking({ stock_held: true, product_track_stock: false, ...over });
    const counted = (over: Partial<Booking> = {}) => booking({ stock_held: true, product_track_stock: true, ...over });
    const productReads = () => productsApi['getAllProducts'].calls.count();
    const askBox = () => dom().querySelector('app-ask-dialog [role="alertdialog"]') as HTMLElement;
    const cancelFirst = async () => {
      (cards()[0].querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
    };
    const hold = (over: Partial<Booking> = {}) => ({ id: 99, remaining_balance: 550, ...EXAMPLE, ...over });

    it('reads the products with the held ones too (a booking holds its own laptop), without the sold ones', async () => {
      await create([EXAMPLE], [product({ id: 1 }), product({ id: 2, is_archived: true }), product({ id: 3, hold_status: 'booked' })]);
      expect(productsApi['getAllProducts']).toHaveBeenCalledWith(true);
      expect(component.products.map(p => p.id)).toEqual([1, 3]);
    });

    it('cancelling a booking that holds a single laptop: the box and the notice say it is back on the Menu, and the products are read again', async () => {
      await create([single()]);
      const reads = productReads();
      await cancelFirst();
      expect(askBox().textContent!.replace(/\s+/g, ' ')).toContain('The laptop is back on the Menu.');
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'Yes, cancel it').click();
      await settle();
      expect(text()).toContain('Booking cancelled. The laptop is back on the Menu.');
      expect(productReads()).toBe(reads + 1);
    });

    it('cancelling a booking that holds counted stock says one is back in stock', async () => {
      await create([counted()]);
      await cancelFirst();
      expect(askBox().textContent!.replace(/\s+/g, ' ')).toContain('One laptop is back in stock.');
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'Yes, cancel it').click();
      await settle();
      expect(text()).toContain('Booking cancelled. One laptop is back in stock.');
    });

    it('cancelling a booking that held nothing (no laptop of the shop) says nothing about stock', async () => {
      await create([booking({ stock_held: false, product_track_stock: null })]);
      await cancelFirst();
      expect(askBox().textContent).not.toContain('back');
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'Yes, cancel it').click();
      await settle();
      expect(text()).toContain('Booking cancelled.');
      expect(text()).not.toContain('back on the Menu');
      expect(text()).not.toContain('back in stock');
    });

    it('deleting a booked booking that holds a laptop says it is given back (in the box and after)', async () => {
      await create([single()]);
      component.askToDelete(component.bookings[0]);
      fixture.detectChanges();
      expect(dialog()!.textContent!.replace(/\s+/g, ' ')).toContain('The laptop is back on the Menu.');
      const reads = productReads();
      buttonIn(dialog()!, 'Delete booking').click();
      await settle();
      expect(text()).toContain('Booking deleted. The laptop is back on the Menu.');
      expect(productReads()).toBe(reads + 1);
    });

    it('deleting a cancelled booking gives nothing back, so it says nothing about it', async () => {
      await create([single({ status: 'cancelled', stock_held: false })]);
      component.askToDelete(component.bookings[0]);
      fixture.detectChanges();
      expect(dialog()!.textContent).not.toContain('back');
      buttonIn(dialog()!, 'Delete booking').click();
      await settle();
      expect(text()).toContain('Booking deleted.');
      expect(text()).not.toContain('back on the Menu');
    });

    it('a new booking of a single laptop says it was set aside, and the products are read again', async () => {
      await create([], [product({ id: 7, stock_quantity: 1, track_stock: false })]);
      bookingsApi['createBooking'].and.callFake((b: any) => of(hold({ ...b, stock_held: true, product_track_stock: false })));
      buttonIn(dom(), 'New booking').click();
      await settle();
      const form = fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
      Object.assign(form.form, { product_id: 7, product_name: 'MacBook Air M5', phone: '011968240', full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12' });
      const reads = productReads();
      form.submit();
      fixture.detectChanges();
      expect(text()).toContain('Booking saved. The laptop is set aside as Booked and left the Menu.');
      expect(productReads()).toBe(reads + 1);
    });

    it('a new booking of counted stock says one less in stock', async () => {
      await create([], [product({ id: 7, stock_quantity: 3, track_stock: true })]);
      bookingsApi['createBooking'].and.callFake((b: any) => of(hold({ ...b, stock_held: true, product_track_stock: true })));
      buttonIn(dom(), 'New booking').click();
      await settle();
      const form = fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
      Object.assign(form.form, { product_id: 7, product_name: 'MacBook Air M5', phone: '011968240', full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12' });
      form.submit();
      fixture.detectChanges();
      expect(text()).toContain('Booking saved. One laptop less in stock.');
    });

    it('editing something else (the laptop stays held) says only "Changes saved."', async () => {
      await create([single()]);
      bookingsApi['updateBooking'].and.callFake((id: number, c: any) => of({ ...single(), ...c, id }));
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      const form = fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
      form.form.deposit = 600;
      form.submit();
      fixture.detectChanges();
      expect(text()).toContain('Changes saved.');
      expect(text()).not.toContain('set aside');
      expect(text()).not.toContain('back on the Menu');
    });

    it('changing the status to Cancelled in the Edit drawer says the laptop is back', async () => {
      await create([single()]);
      bookingsApi['updateBooking'].and.callFake((id: number, c: any) => of({ ...single(), ...c, id, stock_held: false }));
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      const form = fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
      form.form.status = 'cancelled';
      form.submit();
      fixture.detectChanges();
      expect(text()).toContain('Changes saved. The laptop is back on the Menu.');
    });

    it('picking up: a held single laptop is sold, a held counted laptop keeps the stock it already took, and the products are read again', async () => {
      await create([single()]);
      const reads = productReads();
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      await settle();
      const steps = dom().querySelector('[data-steps]')!.textContent!.replace(/\s+/g, ' ');
      expect(steps).toContain('The laptop is marked as sold. It is already off the Menu.');
      bookingsApi['pickUp'].and.returnValue(of({ booking: { ...EXAMPLE, status: 'picked_up' }, invoice: { id: 5, number: 45, items: [] }, laptop: 'stock_kept' }));
      buttonIn(drawer()!, 'Collect $550 and make the sale').click();
      await settle();
      expect(text()).toContain('Sale 000045 made. Its stock was already taken when it was booked.');
      expect(productReads()).toBe(reads + 1);
    });

    it('the pickup drawer says a counted booking already took its unit, an old booking leaves the Menu, and no laptop says nothing', async () => {
      await create([counted()]);
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      await settle();
      expect(dom().querySelector('[data-steps]')!.textContent!.replace(/\s+/g, ' ')).toContain('One was already taken from stock when it was booked.');
      key('Escape');

      const pickup = (b: Booking) => { component.pickingUp = b; fixture.detectChanges(); return dom().querySelector('[data-steps]')!.textContent!.replace(/\s+/g, ' '); };
      expect(pickup(booking({ stock_held: false }))).toContain('The laptop is marked as sold and leaves the Menu.');
      component.pickingUp = null; fixture.detectChanges();
      const none = pickup(booking({ product_id: null, stock_held: false }));
      expect(none).toContain('A Sale is made');
      expect(none).not.toContain('laptop is');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('Telegram: what is sent, and when', () => {
    const formComponent = () => fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
    const makeBooking = async (status: 'booked' | 'cancelled' = 'booked') => {
      buttonIn(dom(), 'New booking').click();
      await settle();
      Object.assign(formComponent().form, { product_id: 7, product_name: 'MacBook Air M5', phone: '011968240', full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12', status });
      formComponent().submit();
      await settle();
    };

    it('a NEW booking is sent as a booking', async () => {
      await create([]);
      await makeBooking();
      expect(telegramApi.send).toHaveBeenCalledOnceWith('booking', 99);
    });

    it('a booking made already cancelled is not sent', async () => {
      await create([]);
      await makeBooking('cancelled');
      expect(telegramApi.send).not.toHaveBeenCalled();
    });

    it('changing a booking, cancelling it or deleting it sends nothing', async () => {
      await create([EXAMPLE, booking({ id: 2, status: 'cancelled' })]);
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      formComponent().form.deposit = 600;
      formComponent().submit();
      await settle();
      (cards()[0].querySelector('[data-action="cancel"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      buttonIn(dom().querySelector('app-ask-dialog') as HTMLElement, 'Yes, cancel it').click();
      await settle();
      component.askToDelete(component.bookings[1]);
      fixture.detectChanges();
      buttonIn(dom().querySelector('[role="alertdialog"]') as HTMLElement, 'Delete booking').click();
      await settle();
      expect(telegramApi.send).not.toHaveBeenCalled();
    });

    it('"Customer picked up" sends the SALE it made, with its paper (for the picture)', async () => {
      await create([EXAMPLE]);
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      await settle();
      buttonIn(dom().querySelector('app-booking-pickup [role="dialog"]') as HTMLElement, 'Collect $550 and make the sale').click();
      await settle();
      expect(telegramApi.send).toHaveBeenCalledTimes(1);
      const [kind, id, invoice] = telegramApi.send.calls.mostRecent().args;
      expect([kind, id, invoice.number]).toEqual(['sold', 77, 44]);
    });

    it('a pickup that fails sends nothing', async () => {
      await create([EXAMPLE]);
      (cards()[0].querySelector('[data-action="pickup"]') as HTMLButtonElement).click();
      await settle();
      bookingsApi['pickUp'].and.returnValue(throwError(() => ({ error: { error: 'Someone just picked this booking up' } })));
      buttonIn(dom().querySelector('app-booking-pickup [role="dialog"]') as HTMLElement, 'Collect $550 and make the sale').click();
      await settle();
      expect(telegramApi.send).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the numbers on top', () => {
    const LIST = [
      booking({ id: 1, deposit: 500, remaining_balance: 550 }),
      booking({ id: 2, deposit: 300, full_price: 1199, remaining_balance: 899 }),
      booking({ id: 3, status: 'picked_up', deposit: 1499, full_price: 1499, remaining_balance: 0 }),
      booking({ id: 4, status: 'cancelled', deposit: 100, remaining_balance: 950 }),
    ];

    it('count only the bookings still waiting (no money numbers)', async () => {
      await create(LIST);
      expect(dom().querySelector('[data-waiting]')!.textContent!.trim()).toBe('2');
      expect(dom().querySelectorAll('[data-summary] > div').length).toBe(1);
      expect(text()).not.toContain('Deposits we are holding');
      expect(text()).not.toContain('Balance to collect');
    });

    it('is zero when nothing is booked', async () => {
      await create([]);
      expect(dom().querySelector('[data-waiting]')!.textContent!.trim()).toBe('0');
    });

    it('say in one line what the page is for', async () => {
      await create([]);
      expect(text()).toContain('');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('deleting a booking (our own dialog)', () => {
    // (A booked card has "Cancel"; the Delete button is on the finished and cancelled ones. The dialog itself works for every status.)
    const open = async (b: Booking = EXAMPLE) => {
      await create([b]);
      component.askToDelete(component.bookings[0]);
      fixture.detectChanges();
    };

    it('asks first: the booking, the contact and the pickup date, and "This can\'t be undone."', async () => {
      await open();
      const t = dialog()!.textContent!;
      expect(t).toContain('Delete this booking?');
      expect(t).toContain('MacBook Air M5 | RAM 16GB | SSD 512GB');
      expect(t).toContain('011968240 · Pickup 12/11/2026');
      expect(t).toContain("This can't be undone.");
      expect(bookingsApi['deleteBooking']).not.toHaveBeenCalled();
    });

    it('shows the product photo', async () => {
      await open();
      expect(dialog()!.querySelector('img')!.getAttribute('src')).toContain('/uploads/air.png');
    });

    it('warns when a deposit is recorded on an open booking', async () => {
      await open();
      expect(dialog()!.textContent).toContain('A deposit of $500 is recorded on this booking.');
    });

    it('no deposit warning when there is no deposit, or the booking is already finished', async () => {
      await open(booking({ deposit: 0 }));
      expect(dialog()!.textContent).not.toContain('deposit of');
      TestBed.resetTestingModule();
      await open(booking({ status: 'cancelled' }));
      expect(dialog()!.textContent).not.toContain('deposit of');
    });

    it('uses the Telegram name when there is no phone', async () => {
      await open(booking({ phone: null }));
      expect(dialog()!.textContent).toContain('@Horth_Heng · Pickup 12/11/2026');
    });

    it('Cancel has the focus when it opens, so a stray Enter cannot delete anything', async () => {
      await open();
      expect(document.activeElement).toBe(buttonIn(dialog()!, 'Cancel'));
    });

    it('Cancel, Esc and the dark background close it without deleting', async () => {
      await open();
      buttonIn(dialog()!, 'Cancel').click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();

      component.askToDelete(component.bookings[0]);
      fixture.detectChanges();
      key('Escape');
      expect(dialog()).toBeNull();

      component.askToDelete(component.bookings[0]);
      fixture.detectChanges();
      (dom().querySelector('.confirm-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      expect(bookingsApi['deleteBooking']).not.toHaveBeenCalled();
    });

    it('Esc closes the dialog first, not the drawer behind it', async () => {
      await open();
      component.openAdd();
      fixture.detectChanges();
      key('Escape');
      expect(dialog()).toBeNull();
      expect(drawer()).not.toBeNull();
    });

    it('"Delete booking" deletes THAT booking, closes, reloads and says so', async () => {
      await create([EXAMPLE, booking({ id: 2, product_name: 'Other', status: 'cancelled' })]);
      buttonIn(cards()[1], 'Delete').click();
      fixture.detectChanges();
      const loadsBefore = asked.length;
      buttonIn(dialog()!, 'Delete booking').click();
      fixture.detectChanges();
      expect(bookingsApi['deleteBooking']).toHaveBeenCalledOnceWith(2);
      expect(dialog()).toBeNull();
      expect(asked.length).toBe(loadsBefore + 1);
      expect(text()).toContain('Booking deleted.');
    });

    it('stays open and says why when it fails', async () => {
      await open();
      bookingsApi['deleteBooking'].and.returnValue(throwError(() => ({ error: { error: 'Booking not found' } })));
      buttonIn(dialog()!, 'Delete booking').click();
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();
      expect(dialog()!.textContent).toContain('Booking not found');
      expect(buttonIn(dialog()!, 'Delete booking').disabled).toBeFalse();
    });

    it('while deleting, the buttons are off and a second click does nothing', async () => {
      await open();
      const pending = new Subject<unknown>();
      bookingsApi['deleteBooking'].and.returnValue(pending);
      buttonIn(dialog()!, 'Delete booking').click();
      fixture.detectChanges();
      expect(buttonIn(dialog()!, 'Deleting...').disabled).toBeTrue();
      expect(buttonIn(dialog()!, 'Cancel').disabled).toBeTrue();
      component.confirmDeleteNow();
      component.cancelDelete();
      expect(bookingsApi['deleteBooking']).toHaveBeenCalledTimes(1);
      expect(dialog()).not.toBeNull();
      pending.next({ message: 'ok' });
      pending.complete();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
    });
  });
});
