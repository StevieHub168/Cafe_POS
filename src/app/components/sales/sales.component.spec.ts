import { environment } from '../../../environments/environment';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { SalesComponent } from './sales.component';
import { InvoiceFormComponent } from '../invoices/invoice-form.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { RepairFormComponent } from '../repairs/repair-form.component';
import { InvoiceService } from '../../services/invoice.service';
import { ProductService } from '../../services/product.service';
import { RepairService } from '../../services/repair.service';
import { Invoice } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { Paged, SalesCounts } from '../../models/paged.model';
import { isUnderWarranty } from '../../utils/warranty';
import { TelegramNotifier } from '../../services/telegram-notifier.service';

/** Where uploaded photos are served from (the API's address without /api): whatever the app is set to. */
const apiOrigin = environment.apiUrl.replace(/\/api$/, '');

// "Today" in every test: Wednesday 11 Nov 2026.
const TODAY = new Date(2026, 10, 11, 10, 0);

const base: Invoice = {
  number: 41, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara',
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '2_weeks', deposit: 824, total: 824, balance: 0,
  items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }, { name: 'Laptop bag', qty: 1, unit_price: 15 }, { name: 'Wireless mouse', qty: 1, unit_price: 10 }],
};
// Newest first, like the API.
const THIS_MONTH_A: Invoice = { ...base, id: 3, number: 44, invoice_date: '2026-11-10', customer_name: null, phone: '12121212', telegram: '@soklea', warranty: '1_week', deposit: 1299, total: 1299, balance: 0, items: [{ name: 'MacBook Air 15" M3', qty: 1, unit_price: 1299 }] };
const THIS_MONTH_B: Invoice = { ...base, id: 2, number: 42, invoice_date: '2026-11-03', warranty: '2_weeks', deposit: 824, total: 824 };
const LAST_MONTH: Invoice = { ...base, id: 1, number: 36, invoice_date: '2026-10-05', customer_name: 'Vanna Chea', phone: '099 111 222', telegram: null, warranty: '1_week', deposit: 1000, total: 1499, balance: 499, items: [{ name: 'Asus ROG Strix G16', qty: 1, unit_price: 1499 }] };
const ALL = [THIS_MONTH_A, THIS_MONTH_B, LAST_MONTH];

/** What the API sends for a page: the rows, where they are in the list, and the numbers of the tabs. */
const countsOf = (rows: Invoice[]): SalesCounts => ({
  all: rows.length,
  month: rows.filter(r => r.invoice_date.slice(0, 7) === '2026-11').length,
  warranty: rows.filter(r => isUnderWarranty(r.invoice_date, r.warranty, TODAY)).length,
});
const pageOf = (rows: Invoice[], over: Partial<Paged<Invoice, { counts: SalesCounts }>> = {}): Paged<Invoice, { counts: SalesCounts }> =>
  ({ page: 1, per_page: 10, total: rows.length, total_pages: 1, results: rows, meta: { counts: countsOf(rows) }, ...over });

describe('SalesComponent', () => {
  // Sending to Telegram is replaced by a spy here: the real one is tested in telegram-notifier.service.spec.ts.
  let telegramApi: { send: jasmine.Spy };
  beforeEach(() => { telegramApi = { send: jasmine.createSpy('send') }; });

  let fixture: ComponentFixture<SalesComponent>;
  let component: SalesComponent;
  let invoicesApi: { [k: string]: jasmine.Spy };
  let productsApi: { [k: string]: jasmine.Spy };
  let repairsApi: { [k: string]: jasmine.Spy };
  let navigate: jasmine.Spy;
  /** Every question the page asked the API, as it was when it was asked (page, size, tab, search). */
  let asked: { page: number; perPage: number; type?: string; period?: string; search?: string }[];
  /** What the API answers from now on: an answer, or a function that makes one for each question. */
  const answer = (value: Observable<Paged<Invoice>> | (() => Observable<Paged<Invoice>>)) =>
    invoicesApi['getInvoicePage'].and.callFake((state: { page: number; perPage: number }, filters: object) => {
      asked.push({ page: state.page, perPage: state.perPage, ...filters });
      return typeof value === 'function' ? value() : value;
    });

  async function create(list: Invoice[] = ALL, catalogue: Product[] = []): Promise<void> {
    asked = [];
    invoicesApi = {
      getInvoicePage: jasmine.createSpy('getInvoicePage'),
      getNextNumber: jasmine.createSpy('getNextNumber').and.returnValue(of(47)),
      createInvoice: jasmine.createSpy('createInvoice').and.callFake((b: any) => of({ id: 99, number: 47, total: 10, deposit: 0, balance: 10, ...b })),
      updateInvoice: jasmine.createSpy('updateInvoice').and.callFake((id: number, b: any) => of({ ...THIS_MONTH_A, ...b, id })),
      deleteInvoice: jasmine.createSpy('deleteInvoice').and.returnValue(of({ message: 'ok' })),
    };
    answer(of(pageOf(list)));
    productsApi = { getAllProducts: jasmine.createSpy('getAllProducts').and.returnValue(of(catalogue)) };
    repairsApi = { createRepair: jasmine.createSpy('createRepair').and.callFake((r: any) => of({ id: 9, fixed_date: null, picked_up_date: null, ...r })) };
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);

    await TestBed.configureTestingModule({
      imports: [SalesComponent],
      providers: [
        { provide: InvoiceService, useValue: invoicesApi },
        { provide: ProductService, useValue: productsApi },
        { provide: TelegramNotifier, useValue: telegramApi },
        { provide: RepairService, useValue: repairsApi },
        { provide: Router, useValue: { navigate } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SalesComponent);
    component = fixture.componentInstance;
    spyOn(component as any, 'now').and.returnValue(TODAY);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const cards = () => Array.from(dom().querySelectorAll('[data-sale]')) as HTMLElement[];
  const numbers = () => cards().map(c => c.querySelector('[data-number]')!.textContent!.trim());
  const buttonIn = (root: ParentNode, label: string) => Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const tab = (label: string) => Array.from(dom().querySelectorAll('[role="group"] button')).find(b => b.textContent!.trim().startsWith(label)) as HTMLButtonElement;
  const dialog = () => dom().querySelector('[role="alertdialog"]') as HTMLElement | null;
  const editor = () => dom().querySelector('app-invoice-editor [role="dialog"]') as HTMLElement | null;
  const invoiceForm = () => fixture.debugElement.query(By.directive(InvoiceFormComponent)).componentInstance as InvoiceFormComponent;
  const viewerComponent = () => fixture.debugElement.query(By.directive(InvoiceViewerComponent)).componentInstance as InvoiceViewerComponent;
  const repairDialog = () => dom().querySelector('app-repair-form [role="dialog"]') as HTMLElement | null;
  const repairForm = () => fixture.debugElement.query(By.directive(RepairFormComponent)).componentInstance as RepairFormComponent;
  const search = (value: string) => {
    const box = dom().querySelector('input[aria-label="Search sales"]') as HTMLInputElement;
    box.value = value;
    box.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const key = (name: string) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: name })); fixture.detectChanges(); };
  const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); fixture.detectChanges(); };

  it('should create', async () => {
    await create([]);
    expect(component).toBeTruthy();
  });

  describe('the list', () => {
    it('asks for the SALE invoices only (the paper of a booking or a repair is not a sale), the first page, 10 on a page', async () => {
      await create();
      expect(asked).toEqual([{ page: 1, perPage: 10, type: 'sale', period: undefined, search: '' }]);
    });

    it('shows each sale as a card: number, "Sold" date, what was sold, customer, contact, total', async () => {
      await create();
      expect(numbers()).toEqual(['000044', '000042', '000036']);
      const first = cards()[1];
      const t = first.textContent!.replace(/\s+/g, ' ');
      expect(t).toContain('Sold 03/11/2026');
      expect(first.querySelector('[data-title]')!.textContent!.trim()).toBe('MacBook Air 13" M1');
      expect(first.querySelector('[data-customer]')!.textContent!.trim()).toBe('Sok Dara');
      expect(first.querySelector('[data-contact]')!.textContent!.trim()).toBe('012 345 678 · @sok_dara');
      expect(first.querySelector('[data-total]')!.textContent!.trim()).toBe('$824');
    });

    it('the first line is the title (WHAT was sold) and the other lines are listed under it', async () => {
      await create();
      expect(cards()[1].querySelector('[data-others]')!.textContent!.trim()).toBe('+ Laptop bag, Wireless mouse');
      expect(cards()[0].querySelector('[data-others]')).toBeNull();
    });

    it('a customer with no name shows a dash, and a sale with no contact shows a dash too', async () => {
      await create([{ ...THIS_MONTH_A, phone: null, telegram: null }]);
      expect(cards()[0].querySelector('[data-customer]')!.textContent!.trim()).toBe('—');
      expect(cards()[0].querySelector('[data-contact]')!.textContent!.trim()).toBe('—');
    });

    it('a sale paid in full says "Paid" in green; one with money still to come says the balance in amber', async () => {
      await create();
      const tag = (i: number) => cards()[i].querySelector('[data-paid]')!;
      expect(tag(0).textContent!.trim()).toBe('Paid');
      expect(tag(0).innerHTML).toContain('green');
      expect(tag(2).textContent!.trim()).toBe('Balance $499');
      expect(tag(2).innerHTML).toContain('amber');
    });

    it('the warranty says the length and the days left (counted from the invoice date, today is 11/11/2026)', async () => {
      await create();
      const warranty = (i: number) => cards()[i].querySelector('[data-warranty]')!.textContent!.trim();
      expect(warranty(0)).toBe('1 week · 6 days left');
      expect(warranty(1)).toBe('2 weeks · 6 days left');
      expect(warranty(2)).toBe('1 week · ended');
    });

    it('a sale with no warranty says "No warranty"', async () => {
      await create([{ ...THIS_MONTH_A, warranty: 'none' }]);
      expect(cards()[0].querySelector('[data-warranty]')!.textContent!.trim()).toBe('No warranty');
    });

    it('is a grid of cards, two to a row on a wide screen, and not a table', async () => {
      await create();
      expect(dom().querySelector('table')).toBeNull();
      expect(cards()[0].tagName.toLowerCase()).toBe('article');
      expect(cards()[0].parentElement!.classList).toContain('xl:grid-cols-2');
    });

    it('says so when there are no sales yet, and where to make one', async () => {
      await create([]);
      expect(text()).toContain('No sales yet.');
      expect(text()).toContain('Use New sale above, or press Sell this laptop on a laptop in the Menu.');
    });

    it('shows the reason when the sales cannot be loaded', async () => {
      await create();
      answer(throwError(() => ({ error: { error: 'Database is down' } })));
      component.loadSales();
      fixture.detectChanges();
      expect(text()).toContain('Database is down');
    });

    it('a load error with no reason says so in plain words', async () => {
      await create();
      answer(throwError(() => new Error('offline')));
      component.loadSales();
      fixture.detectChanges();
      expect(text()).toContain('Failed to load sales.');
    });

    it('while loading it shows the grey shapes of the cards and of the numbers, not "No sales yet."', async () => {
      await TestBed.configureTestingModule({
        imports: [SalesComponent],
        providers: [
          { provide: InvoiceService, useValue: { getInvoicePage: () => new Subject<Paged<Invoice>>() } },
          { provide: ProductService, useValue: { getAllProducts: () => of([]) } },
          { provide: TelegramNotifier, useValue: telegramApi },
          { provide: RepairService, useValue: {} },
          { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(SalesComponent);
      fixture.detectChanges();
      expect(dom().querySelectorAll('[data-skeleton][data-kind="cards"] [data-skeleton-item]').length).toBe(4);
      expect(dom().querySelectorAll('[data-skeleton][data-kind="stats"] [data-skeleton-item]').length).toBe(2);
      expect(dom().querySelector('[data-summary]')).toBeNull();
      expect(dom().querySelector('[data-pagination]')).toBeNull();
      expect(text()).not.toContain('No sales yet.');
    });
  });

  describe('the photo of what was sold', () => {
    const laptop = (over: Partial<Product> = {}): Product => ({
      id: 10, sku: 'S-10', name: 'MacBook Air 15" M3', category_id: 1, brand: 'Apple', selling_price: 1299, stock_quantity: 1, min_stock_level: 0,
      is_archived: false, image_url: '/uploads/air.png', images: ['/uploads/air.png'], ...over,
    });
    const photo = (i: number) => cards()[i].querySelector('img') as HTMLImageElement | null;

    it('asks for ALL products, the sold (hidden) ones too, because a sold laptop is hidden from the Menu', async () => {
      await create();
      expect(productsApi['getAllProducts']).toHaveBeenCalledOnceWith(true);
    });

    it('shows the photo of the product whose name is on the first line, also when that laptop was SOLD (hidden)', async () => {
      await create(ALL, [laptop({ is_archived: true })]);
      expect(photo(0)!.getAttribute('src')).toBe(`${apiOrigin}/uploads/air.png`);
      expect(photo(1)).toBeNull();                                  // another laptop: a grey box
      expect(cards()[1].querySelector('.bg-gray-100 svg')).not.toBeNull();
    });

    it('still lists the sales when the products cannot be loaded (grey boxes)', async () => {
      await create();
      productsApi['getAllProducts'].and.returnValue(throwError(() => new Error('down')));
      component.ngOnInit();
      fixture.detectChanges();
      expect(cards().length).toBe(3);
      expect(photo(0)).toBeNull();
    });
  });

  describe('the numbers on top', () => {
    it('count the sales of this month and the warranties still running (no money numbers)', async () => {
      await create();
      expect(dom().querySelector('[data-sold]')!.textContent!.trim()).toBe('2');
      expect(dom().querySelector('[data-warranty-count]')!.textContent!.trim()).toBe('2');          // the last one ended
      expect(dom().querySelectorAll('[data-summary] > div').length).toBe(2);
      expect(text()).not.toContain('Money received');
    });

    it('say "laptop" for one and "laptops" for the others', async () => {
      // (the number and the word sit in two tags, so the text has no space between them)
      const summary = () => dom().querySelector('[data-summary]')!.textContent!.replace(/\s+/g, '');
      await create([THIS_MONTH_A]);
      expect(summary()).toContain('1laptop');
      expect(summary()).not.toContain('1laptops');
      TestBed.resetTestingModule();
      await create(ALL);
      expect(summary()).toContain('2laptops');
    });

    it('are zero when there are no sales', async () => {
      await create([]);
      expect(dom().querySelector('[data-sold]')!.textContent!.trim()).toBe('0');
      expect(dom().querySelector('[data-warranty-count]')!.textContent!.trim()).toBe('0');
    });

    it('are the API\'s counts of ALL the sales, not of the page that is on screen', async () => {
      await create(ALL);
      answer(of(pageOf([THIS_MONTH_A], { total: 40, total_pages: 4, meta: { counts: { all: 40, month: 12, warranty: 7 } } })));
      component.loadSales();
      fixture.detectChanges();
      expect(dom().querySelector('[data-sold]')!.textContent!.trim()).toBe('12');
      expect(dom().querySelector('[data-warranty-count]')!.textContent!.trim()).toBe('7');
      expect(tab('All').textContent!.replace(/\s+/g, '')).toBe('All40');
    });
  });

  describe('tabs and search', () => {
    const lastAsk = () => asked[asked.length - 1];

    it('has All, This month and Under warranty, with the number of sales in each (counted by the API)', async () => {
      await create();
      expect(['All', 'This month', 'Under warranty'].map(l => tab(l).textContent!.replace(/\s+/g, ''))).toEqual(['All3', 'Thismonth2', 'Underwarranty2']);
    });

    it('"This month" asks the API for this month\'s sales, shows what it sends, and is marked as the current one', async () => {
      await create();
      answer(of(pageOf([THIS_MONTH_A, THIS_MONTH_B], { meta: { counts: countsOf(ALL) } })));
      tab('This month').click();
      fixture.detectChanges();
      expect(lastAsk()).toEqual({ page: 1, perPage: 10, type: 'sale', period: 'month', search: '' });
      expect(numbers()).toEqual(['000044', '000042']);
      expect(tab('This month').getAttribute('aria-pressed')).toBe('true');
      expect(tab('All').getAttribute('aria-pressed')).toBe('false');
    });

    it('"Under warranty" asks for the sales whose warranty is still running; "All" asks for everything again', async () => {
      await create();
      tab('Under warranty').click();
      fixture.detectChanges();
      expect(lastAsk().period).toBe('warranty');
      tab('All').click();
      fixture.detectChanges();
      expect(lastAsk().period).toBeUndefined();
    });

    it('pressing the tab you are on asks nothing', async () => {
      await create();
      const before = asked.length;
      tab('All').click();
      fixture.detectChanges();
      expect(asked.length).toBe(before);
    });

    it('the numbers of the tabs do not change with the tab or the search (the API counts them all)', async () => {
      await create();
      answer(of(pageOf([LAST_MONTH], { total: 1, meta: { counts: countsOf(ALL) } })));
      tab('Under warranty').click();
      fixture.detectChanges();
      expect(['All', 'This month', 'Under warranty'].map(l => tab(l).textContent!.replace(/\s+/g, ''))).toEqual(['All3', 'Thismonth2', 'Underwarranty2']);
    });

    it('typing in the search box asks the API with that text, from the first page, when the typing stops', fakeAsync(() => {
      create().then(() => {
        const before = asked.length;
        search('vanna');
        expect(asked.length).toBe(before);          // not yet: the person may still be typing
        tick(299);
        expect(asked.length).toBe(before);
        tick(1);
        expect(asked.length).toBe(before + 1);
        expect(lastAsk()).toEqual({ page: 1, perPage: 10, type: 'sale', period: undefined, search: 'vanna' });
      });
      tick();
    }));

    it('a word typed letter by letter is ONE question, not one for each letter', fakeAsync(() => {
      create().then(() => {
        const before = asked.length;
        for (const text of ['v', 'va', 'van', 'vann', 'vanna']) { search(text); tick(100); }
        tick(300);
        expect(asked.length).toBe(before + 1);
        expect(lastAsk().search).toBe('vanna');
      });
      tick();
    }));

    it('a new search starts from the first page', fakeAsync(() => {
      create().then(() => {
        answer(of(pageOf([THIS_MONTH_A], { page: 3, total: 25, total_pages: 3 })));
        component.loadSales();
        fixture.detectChanges();
        expect(component.paging.page).toBe(3);
        search('dell');
        tick(300);
        expect(lastAsk().page).toBe(1);
      });
      tick();
    }));

    it('search and tab work together, and "No sales found." appears when nothing matches', fakeAsync(() => {
      create().then(() => {
        answer(of(pageOf([], { meta: { counts: countsOf(ALL) } })));
        tab('This month').click();
        search('vanna');
        tick(300);
        fixture.detectChanges();
        expect(lastAsk()).toEqual({ page: 1, perPage: 10, type: 'sale', period: 'month', search: 'vanna' });
        expect(cards().length).toBe(0);
        expect(text()).toContain('No sales found.');
        expect(text()).not.toContain('No sales yet.');
      });
      tick();
    }));

    it('while the answer to a tab is coming, the grey shapes are shown', async () => {
      await create();
      const pending = new Subject<Paged<Invoice>>();
      answer(pending);
      tab('This month').click();
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
      expect(cards().length).toBe(0);
      pending.next(pageOf([THIS_MONTH_A]));
      pending.complete();
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).toBeNull();
      expect(numbers()).toEqual(['000044']);
    });
  });

  describe('the pages', () => {
    const lastAsk = () => asked[asked.length - 1];
    const bar = () => dom().querySelector('[data-pagination]') as HTMLElement | null;
    const barText = () => bar()!.querySelector('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim();
    const manyPages = (rows: Invoice[], over: Partial<Paged<Invoice, { counts: SalesCounts }>> = {}) =>
      pageOf(rows, { page: 1, per_page: 10, total: 25, total_pages: 3, meta: { counts: { all: 25, month: 5, warranty: 4 } }, ...over });

    beforeEach(() => spyOn(window, 'scrollTo'));

    it('says which sales are on screen: "Showing 1–3 of 3" (no "Per page" box: even 10 on a page shows them all)', async () => {
      await create();
      expect(barText()).toBe('Showing 1–3 of 3');
      expect(bar()!.querySelector('[data-per-page]')).toBeNull();
      expect(bar()!.querySelector('[data-next]')).toBeNull();            // one page: no buttons
    });

    it('with many sales: "Showing 1–10 of 25", and Next, the page numbers and "Page 1 of 3"', async () => {
      await create();
      answer(of(manyPages(ALL)));
      component.loadSales();
      fixture.detectChanges();
      expect(barText()).toBe('Showing 1–10 of 25');
      expect(bar()!.querySelectorAll('[data-page]').length).toBe(3);
      expect(bar()!.querySelector('[data-page-of]')!.textContent!.trim()).toBe('Page 1 of 3');
    });

    it('Next asks the API for the next page, shows the grey shapes meanwhile, and shows the new page', async () => {
      await create();
      answer(of(manyPages(ALL)));
      component.loadSales();
      fixture.detectChanges();

      const pending = new Subject<Paged<Invoice, { counts: SalesCounts }>>();
      answer(pending);
      (bar()!.querySelector('[data-next]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(lastAsk().page).toBe(2);
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
      expect(bar()).toBeNull();

      pending.next(manyPages([LAST_MONTH], { page: 2 }));
      pending.complete();
      fixture.detectChanges();
      expect(numbers()).toEqual(['000036']);
      expect(barText()).toBe('Showing 11–20 of 25');
      expect(window.scrollTo as jasmine.Spy).toHaveBeenCalled();
    });

    it('a page number asks for that page', async () => {
      await create();
      answer(of(manyPages(ALL)));
      component.loadSales();
      fixture.detectChanges();
      Array.from(bar()!.querySelectorAll('[data-page]') as NodeListOf<HTMLButtonElement>).find(b => b.textContent!.trim() === '3')!.click();
      expect(lastAsk().page).toBe(3);
    });

    it('"Per page" asks for that many on a page, from the first page', async () => {
      await create();
      answer(of(manyPages(ALL, { page: 2 })));
      component.loadSales();
      fixture.detectChanges();
      const select = bar()!.querySelector('[data-per-page]') as HTMLSelectElement;
      select.value = '50';
      select.dispatchEvent(new Event('change'));
      expect(lastAsk()).toEqual(jasmine.objectContaining({ page: 1, perPage: 50 }));
    });

    it('a tab starts from the first page', async () => {
      await create();
      answer(of(manyPages(ALL, { page: 3 })));
      component.loadSales();
      fixture.detectChanges();
      tab('This month').click();
      expect(lastAsk().page).toBe(1);
    });

    it('a new sale goes to the first page (the newest sale is the first one)', async () => {
      await create();
      answer(of(manyPages(ALL, { page: 3 })));
      component.loadSales();
      fixture.detectChanges();
      buttonIn(dom(), 'New sale').click();
      await settle();
      invoiceForm().form.items = [{ name: 'Mouse', qty: 1, unit_price: 10 }];
      invoiceForm().form.warranty = '1_week';
      invoiceForm().submit();
      fixture.detectChanges();
      expect(lastAsk().page).toBe(1);
    });

    it('changing a sale stays on the same page', async () => {
      await create();
      answer(of(manyPages(ALL, { page: 2 })));
      component.loadSales();
      fixture.detectChanges();
      buttonIn(cards()[1], 'Edit').click();
      await settle();
      invoiceForm().form.customer_name = 'Sok Dara Jr.';
      invoiceForm().submit();
      fixture.detectChanges();
      expect(lastAsk().page).toBe(2);
    });

    it('after the last sale of a page is deleted, the page before it is shown (not an empty page)', async () => {
      await create();
      answer(of(manyPages([LAST_MONTH], { page: 3, total: 21 })));
      component.loadSales();
      fixture.detectChanges();
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      // the API now has 20 sales: page 3 is empty
      const answers = [manyPages([], { page: 3, total: 20, total_pages: 2 }), manyPages(ALL, { page: 2, total: 20, total_pages: 2 })];
      answer(() => of(answers.shift()!));
      buttonIn(dialog()!, 'Delete sale').click();
      fixture.detectChanges();
      expect(lastAsk().page).toBe(2);
      expect(component.paging.page).toBe(2);
      expect(cards().length).toBe(3);
    });

    it('a slow answer to an old question never replaces the answer to a newer one', async () => {
      await create();
      const slow = new Subject<Paged<Invoice, { counts: SalesCounts }>>();
      const fast = new Subject<Paged<Invoice, { counts: SalesCounts }>>();
      const queue = [slow, fast];
      answer(() => queue.shift()!);
      tab('This month').click();
      tab('Under warranty').click();
      fixture.detectChanges();
      fast.next(pageOf([THIS_MONTH_B]));
      slow.next(pageOf([LAST_MONTH]));
      fixture.detectChanges();
      expect(numbers()).toEqual(['000042']);
    });

    it('no bar while there is nothing to page through', async () => {
      await create([]);
      expect(bar()).toBeNull();
    });
  });

  describe('writing a new sale (its invoice)', () => {
    it('"New sale" opens the writing window for a sale', async () => {
      await create();
      buttonIn(dom(), 'New sale').click();
      await settle();
      expect(editor()!.getAttribute('aria-label')).toBe('New sale invoice');
      expect(invoiceForm().kind).toBe('sale');
    });

    it('hands your products to the form (the ones still for sale)', async () => {
      await create(ALL, [{ id: 1, name: 'Dell XPS 13', is_archived: false } as Product, { id: 2, name: 'Old', is_archived: true } as Product]);
      buttonIn(dom(), 'New sale').click();
      await settle();
      expect(invoiceForm().products.map(p => p.name)).toEqual(['Dell XPS 13']);
    });

    it('after saving: the window closes, the list is loaded again, the PAPER opens, and it says "Sale 000047 saved."', async () => {
      await create();
      buttonIn(dom(), 'New sale').click();
      await settle();
      const loads = asked.length;
      invoiceForm().form.items = [{ name: 'Mouse', qty: 1, unit_price: 10 }];
      invoiceForm().form.warranty = '1_week';
      invoiceForm().submit();
      fixture.detectChanges();
      expect(invoicesApi['createInvoice']).toHaveBeenCalledTimes(1);
      expect(editor()).toBeNull();
      expect(viewerComponent().invoice.number).toBe(47);
      expect(asked.length).toBe(loads + 1);
      expect(text()).toContain('Sale 000047 saved.');
    });

    it('Esc closes the writing window without saving', async () => {
      await create();
      buttonIn(dom(), 'New sale').click();
      await settle();
      key('Escape');
      expect(editor()).toBeNull();
      expect(invoicesApi['createInvoice']).not.toHaveBeenCalled();
    });
  });

  describe('looking at and changing a sale', () => {
    it('"View invoice" opens the paper of THAT sale', async () => {
      await create();
      buttonIn(cards()[1], 'View invoice').click();
      fixture.detectChanges();
      expect(viewerComponent().invoice.number).toBe(42);
    });

    it('closing the paper goes back to the list', async () => {
      await create();
      buttonIn(cards()[0], 'View invoice').click();
      fixture.detectChanges();
      key('Escape');
      expect(dom().querySelector('app-invoice-viewer')).toBeNull();
      expect(cards().length).toBe(3);
    });

    it('the paper\'s Edit button opens the writing window for it (and the paper closes)', async () => {
      await create();
      buttonIn(cards()[0], 'View invoice').click();
      fixture.detectChanges();
      buttonIn(dom().querySelector('app-invoice-viewer') as HTMLElement, 'Edit').click();
      await settle();
      expect(dom().querySelector('app-invoice-viewer')).toBeNull();
      expect(invoiceForm().invoice!.number).toBe(44);
    });

    it('"Edit" opens the writing window with that sale in it, and saving says "changed"', async () => {
      await create();
      buttonIn(cards()[1], 'Edit').click();
      await settle();
      expect(editor()!.getAttribute('aria-label')).toBe('Edit invoice 000042');
      invoiceForm().form.customer_name = 'Sok Dara Jr.';
      invoiceForm().submit();
      fixture.detectChanges();
      expect(invoicesApi['updateInvoice'].calls.mostRecent().args[0]).toBe(2);
      expect(text()).toContain('Sale 000042 changed.');
    });
  });

  describe('a repair of a laptop we sold (warranty)', () => {
    it('"Repair" opens the repair form filled from the sale: the laptop, the buyer, and the Sale', async () => {
      await create();
      buttonIn(cards()[1], 'Repair').click();
      await settle();
      expect(repairDialog()!.getAttribute('aria-label')).toBe('New repair');
      expect(repairForm().form.device).toBe('MacBook Air 13" M1');
      expect(repairForm().form.customer_name).toBe('Sok Dara');
      expect(repairForm().form.phone).toBe('012 345 678');
      expect(repairForm().form.telegram).toBe('@sok_dara');
      expect(repairForm().form.sale_invoice_id).toBe(2);
      expect(repairForm().form.source).toBe('customer');
    });

    it('the form says "Sold by you" with the warranty (it knows the Sales)', async () => {
      await create();
      buttonIn(cards()[1], 'Repair').click();
      await settle();
      expect(dom().querySelector('[data-sale-note]')!.textContent!.replace(/\s+/g, ' ')).toContain('Sold by you: Sale 000042. Warranty: 2 weeks');
    });

    it('after saving the repair, the Repairs page opens', async () => {
      await create();
      buttonIn(cards()[1], 'Repair').click();
      await settle();
      repairForm().form.problem = 'Keyboard';
      repairForm().submit();
      await settle();
      expect(repairsApi['createRepair'].calls.mostRecent().args[0].sale_invoice_id).toBe(2);
      expect(repairDialog()).toBeNull();
      expect(navigate).toHaveBeenCalledOnceWith(['/repairs']);
    });

    it('Esc closes the form: nothing is saved, the page stays', async () => {
      await create();
      buttonIn(cards()[1], 'Repair').click();
      await settle();
      key('Escape');
      expect(repairDialog()).toBeNull();
      expect(repairsApi['createRepair']).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('Telegram: what is sent, and when', () => {
    it('a NEW sale is sent as a sale, with its paper (for the picture)', async () => {
      await create();
      buttonIn(dom(), 'New sale').click();
      await settle();
      invoiceForm().form.items = [{ name: 'Mouse', qty: 1, unit_price: 10 }];
      invoiceForm().form.warranty = '1_week';
      invoiceForm().submit();
      fixture.detectChanges();
      expect(telegramApi.send).toHaveBeenCalledTimes(1);
      const [kind, id, invoice] = telegramApi.send.calls.mostRecent().args;
      expect([kind, id, invoice.number]).toEqual(['sold', 99, 47]);
    });

    it('changing a sale sends nothing', async () => {
      await create();
      buttonIn(cards()[1], 'Edit').click();
      await settle();
      invoiceForm().form.customer_name = 'Sok Dara Jr.';
      invoiceForm().submit();
      fixture.detectChanges();
      expect(telegramApi.send).not.toHaveBeenCalled();
    });

    it('the warranty repair made from a sale is sent as a repair', async () => {
      await create();
      buttonIn(cards()[1], 'Repair').click();
      await settle();
      repairForm().form.problem = 'Keyboard';
      repairForm().submit();
      await settle();
      expect(telegramApi.send).toHaveBeenCalledTimes(1);
      expect(telegramApi.send.calls.mostRecent().args[0]).toBe('repair');
    });
  });

  describe('deleting a sale (our own dialog)', () => {
    const open = async (i = 1) => { await create(); buttonIn(cards()[i], 'Delete').click(); fixture.detectChanges(); };

    it('asks first: which sale, what was sold, the customer and the total', async () => {
      await open();
      const box = dialog()!.textContent!.replace(/\s+/g, ' ');
      expect(box).toContain('Delete this sale?');
      expect(box).toContain('Sale 000042');
      expect(box).toContain('MacBook Air 13" M1 · Sok Dara · $824');
      expect(box).toContain("This can't be undone.");
      expect(invoicesApi['deleteInvoice']).not.toHaveBeenCalled();
    });

    it('Cancel, Esc and the dark background close it without deleting', async () => {
      await open();
      buttonIn(dialog()!, 'Cancel').click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      buttonIn(cards()[1], 'Delete').click();
      fixture.detectChanges();
      key('Escape');
      expect(dialog()).toBeNull();
      buttonIn(cards()[1], 'Delete').click();
      fixture.detectChanges();
      (dom().querySelector('.confirm-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      expect(invoicesApi['deleteInvoice']).not.toHaveBeenCalled();
    });

    it('"Delete sale" deletes THAT sale, reloads and says so', async () => {
      await open(2);
      const loads = asked.length;
      buttonIn(dialog()!, 'Delete sale').click();
      fixture.detectChanges();
      expect(invoicesApi['deleteInvoice']).toHaveBeenCalledOnceWith(1);
      expect(dialog()).toBeNull();
      expect(asked.length).toBe(loads + 1);
      expect(text()).toContain('Sale 000036 deleted.');
    });

    it('stays open and says why when it fails', async () => {
      await open();
      invoicesApi['deleteInvoice'].and.returnValue(throwError(() => ({ error: { error: 'Invoice not found' } })));
      buttonIn(dialog()!, 'Delete sale').click();
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();
      expect(dialog()!.textContent).toContain('Invoice not found');
    });

    it('while deleting, the buttons are off and a second click does nothing', async () => {
      await open();
      const pending = new Subject<unknown>();
      invoicesApi['deleteInvoice'].and.returnValue(pending);
      buttonIn(dialog()!, 'Delete sale').click();
      fixture.detectChanges();
      expect(buttonIn(dialog()!, 'Deleting...').disabled).toBeTrue();
      component.confirmDeleteNow();
      component.cancelDelete();
      expect(invoicesApi['deleteInvoice']).toHaveBeenCalledTimes(1);
      expect(dialog()).not.toBeNull();
      pending.next({ message: 'ok' });
      pending.complete();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
    });
  });
});
