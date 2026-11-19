import { environment } from '../../../environments/environment';
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Observable, Subject, of, throwError } from 'rxjs';
import { RepairsComponent } from './repairs.component';
import { RepairFormComponent } from './repair-form.component';
import { InvoiceFormComponent } from '../invoices/invoice-form.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { RepairService } from '../../services/repair.service';
import { InvoiceService } from '../../services/invoice.service';
import { ProductService } from '../../services/product.service';
import { Repair } from '../../models/repair.model';
import { Invoice } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { Paged, RepairCounts } from '../../models/paged.model';
import { TelegramNotifier } from '../../services/telegram-notifier.service';

/** Where uploaded photos are served from (the API's address without /api): whatever the app is set to. */
const apiOrigin = environment.apiUrl.replace(/\/api$/, '');

// "Today" in every test: Wednesday 11 Nov 2026.
const TODAY = new Date(2026, 10, 11, 10, 0);

const RECEIVED: Repair = {
  id: 1, product_id: null, device: 'Dell Inspiron 15', customer_name: 'Vanna Chea', phone: '099 111 222', telegram: null,
  problem: 'Screen flickers when moved', received_date: '2026-11-10', back_on: '2026-11-14', cost: 60, status: 'received',
  fixed_date: null, picked_up_date: null, sale_invoice_id: null,
};
const FIXED: Repair = {
  ...RECEIVED, id: 2, device: 'HP Pavilion 15', customer_name: 'Sok Dara', phone: '012 345 678', problem: 'Some keyboard keys do not work',
  received_date: '2026-11-08', back_on: null, cost: 35, status: 'fixed', fixed_date: '2026-11-11',
};
const PICKED_UP: Repair = {
  ...RECEIVED, id: 3, device: 'Asus ROG Strix G16', customer_name: 'Vanna Chea', problem: 'The fan is loud', received_date: '2026-11-01',
  back_on: null, cost: 0, status: 'picked_up', fixed_date: '2026-11-03', picked_up_date: '2026-11-05',
};
const ALL = [RECEIVED, FIXED, PICKED_UP];

const REPAIR_INVOICE: Invoice = {
  id: 50, number: 46, type: 'repair', invoice_date: '2026-11-11', customer_name: 'Sok Dara', phone: '012 345 678', telegram: null,
  device: 'HP Pavilion 15', problem: 'Some keyboard keys do not work', pickup_date: null, booking_id: null, repair_id: 2, warranty: '1_week',
  deposit: 0, total: 35, balance: 35, items: [{ name: 'Keyboard', qty: 1, unit_price: 35 }],
};
const SALE: Invoice = {
  id: 44, number: 44, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: null, device: null,
  problem: null, pickup_date: null, booking_id: null, warranty: '1_week', deposit: 799, total: 799, balance: 0,
  items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }],
};

/** What the API sends for a page: the rows, where they are in the list, and how many repairs are in each step. */
const countsOf = (rows: Repair[]): RepairCounts => ({
  received: rows.filter(r => r.status === 'received').length,
  fixed: rows.filter(r => r.status === 'fixed').length,
  picked_up: rows.filter(r => r.status === 'picked_up').length,
});
const pageOf = (rows: Repair[], over: Partial<Paged<Repair, { counts: RepairCounts }>> = {}): Paged<Repair, { counts: RepairCounts }> =>
  ({ page: 1, per_page: 10, total: rows.length, total_pages: 1, results: rows, meta: { counts: countsOf(rows) }, ...over });

describe('RepairsComponent', () => {
  // Sending to Telegram is replaced by a spy here: the real one is tested in telegram-notifier.service.spec.ts.
  let telegramApi: { send: jasmine.Spy };
  beforeEach(() => { telegramApi = { send: jasmine.createSpy('send') }; });

  let fixture: ComponentFixture<RepairsComponent>;
  let component: RepairsComponent;
  let repairsApi: { [k: string]: jasmine.Spy };
  let invoicesApi: { [k: string]: jasmine.Spy };
  let productsApi: { [k: string]: jasmine.Spy };
  /** Every question the page asked the API, as it was when it was asked (page, size, step, search). */
  let asked: { page: number; perPage: number; status?: string; search?: string }[];
  /** What the API answers from now on: an answer, or a function that makes one for each question. */
  const answer = (value: Observable<Paged<Repair>> | (() => Observable<Paged<Repair>>)) =>
    repairsApi['getRepairPage'].and.callFake((state: { page: number; perPage: number }, filters: object) => {
      asked.push({ page: state.page, perPage: state.perPage, ...filters });
      return typeof value === 'function' ? value() : value;
    });

  /** `list` = every repair that exists; `onPage` = the ones the first page shows (all of them, unless a test says otherwise). */
  async function create(list: Repair[] = ALL, invoices: Invoice[] = [], catalogue: Product[] = [], onPage: Repair[] = list): Promise<void> {
    asked = [];
    repairsApi = {
      getRepairPage: jasmine.createSpy('getRepairPage'),
      createRepair: jasmine.createSpy('createRepair').and.callFake((r: any) => of({ id: 99, fixed_date: null, picked_up_date: null, ...r })),
      updateRepair: jasmine.createSpy('updateRepair').and.callFake((id: number, c: any) => of({ ...RECEIVED, ...c, id })),
      deleteRepair: jasmine.createSpy('deleteRepair').and.returnValue(of({ message: 'ok' })),
    };
    answer(of(pageOf(onPage)));
    invoicesApi = {
      getInvoices: jasmine.createSpy('getInvoices').and.returnValue(of(invoices)),
      getNextNumber: jasmine.createSpy('getNextNumber').and.returnValue(of(47)),
      createInvoice: jasmine.createSpy('createInvoice').and.callFake((b: any) => of({ id: 60, number: 47, total: 60, balance: 60, ...b })),
      updateInvoice: jasmine.createSpy('updateInvoice').and.callFake((id: number, b: any) => of({ ...REPAIR_INVOICE, ...b, id })),
    };
    productsApi = { getAllProducts: jasmine.createSpy('getAllProducts').and.returnValue(of(catalogue)) };

    await TestBed.configureTestingModule({
      imports: [RepairsComponent],
      providers: [
        { provide: RepairService, useValue: repairsApi },
        { provide: InvoiceService, useValue: invoicesApi },
        { provide: ProductService, useValue: productsApi },
        { provide: TelegramNotifier, useValue: telegramApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RepairsComponent);
    component = fixture.componentInstance;
    spyOn(component as any, 'now').and.returnValue(TODAY);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const cards = () => Array.from(dom().querySelectorAll('[data-repair]')) as HTMLElement[];
  const devices = () => cards().map(c => c.querySelector('[data-device]')!.textContent!.trim());
  const buttonIn = (root: ParentNode, label: string) => Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const mainButton = (card: HTMLElement) => card.querySelector('button.bg-primary-600') as HTMLButtonElement | null;
  const tab = (label: string) => Array.from(dom().querySelectorAll('[role="group"] button')).find(b => b.textContent!.trim().startsWith(label)) as HTMLButtonElement;
  const dialog = () => dom().querySelector('[role="alertdialog"]') as HTMLElement | null;
  const formDialog = () => dom().querySelector('app-repair-form [role="dialog"]') as HTMLElement | null;
  const repairForm = () => fixture.debugElement.query(By.directive(RepairFormComponent)).componentInstance as RepairFormComponent;
  const editor = () => dom().querySelector('app-invoice-editor [role="dialog"]') as HTMLElement | null;
  const invoiceForm = () => fixture.debugElement.query(By.directive(InvoiceFormComponent)).componentInstance as InvoiceFormComponent;
  const viewerComponent = () => fixture.debugElement.query(By.directive(InvoiceViewerComponent)).componentInstance as InvoiceViewerComponent;
  const search = (value: string) => {
    const box = dom().querySelector('input[aria-label="Search repairs"]') as HTMLInputElement;
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
    it('shows each repair as a card, in the order the API gives (what is in the shop first)', async () => {
      await create();
      expect(devices()).toEqual(['Dell Inspiron 15', 'HP Pavilion 15', 'Asus ROG Strix G16']);
    });

    it('a card shows the photos of what is wrong as small squares (click one to see it big), and nothing when there are none', async () => {
      await create([{ ...RECEIVED, images: ['/uploads/1.png', '/uploads/2.png'] }, FIXED]);
      const links = Array.from(cards()[0].querySelectorAll('ul[aria-label="Photos"] a')) as HTMLAnchorElement[];
      expect(links.map(a => a.getAttribute('href')!.replace(/^.*\/uploads/, '/uploads'))).toEqual(['/uploads/1.png', '/uploads/2.png']);
      expect(links.every(a => a.target === '_blank')).toBeTrue();
      expect(cards()[1].querySelector('ul[aria-label="Photos"]')).toBeNull();
    });

    it('a card shows the laptop, the customer with the phone, the problem, the date and the cost', async () => {
      await create();
      const first = cards()[0];
      expect(first.querySelector('[data-customer]')!.textContent!.trim()).toBe('Vanna Chea · 099 111 222');
      expect(first.querySelector('[data-problem]')!.textContent!.trim()).toBe('Screen flickers when moved');
      expect(first.textContent).toContain('14/11/2026');
      expect(first.querySelector('[data-cost]')!.textContent!.trim()).toBe('$60');
    });

    it('a repair with no customer says so, and one with only a Telegram shows it', async () => {
      await create([{ ...RECEIVED, customer_name: null, phone: null, telegram: null }, { ...FIXED, customer_name: null, phone: null, telegram: '@sok' }]);
      expect(cards()[0].querySelector('[data-customer]')!.textContent!.trim()).toBe('No customer written');
      expect(cards()[1].querySelector('[data-customer]')!.textContent!.trim()).toBe('@sok');
    });

    it('a cost that is not set yet says so; a cost of $0 is shown as $0', async () => {
      await create([{ ...RECEIVED, cost: null }, PICKED_UP]);
      expect(cards()[0].querySelector('[data-cost]')!.textContent!.trim()).toBe('Not set yet');
      expect(cards()[1].querySelector('[data-cost]')!.textContent!.trim()).toBe('$0');
    });

    it('the date under the problem fits the step: back on / fixed on / picked up on', async () => {
      await create();
      // (the words and the date sit in two tags, so the text has no space between them)
      const label = (i: number) => (cards()[i].querySelector('.grid') as HTMLElement).textContent!.replace(/\s+/g, '');
      expect(label(0)).toContain('Backon14/11/2026');
      expect(label(1)).toContain('Fixedon11/11/2026');
      expect(label(2)).toContain('Pickedupon05/11/2026');
    });

    it('a received repair with no back-on date shows a dash', async () => {
      await create([{ ...RECEIVED, back_on: null }]);
      expect((cards()[0].querySelector('.grid') as HTMLElement).textContent!.replace(/\s+/g, '')).toContain('Backon—');
    });

    it('is a grid of cards, two to a row on a wide screen', async () => {
      await create();
      expect(cards()[0].tagName.toLowerCase()).toBe('article');
      expect(cards()[0].parentElement!.classList).toContain('xl:grid-cols-2');
    });

    it('a repair that should have been ready by now says "Late" (not a finished one)', async () => {
      await create([{ ...RECEIVED, back_on: '2026-11-09' }, { ...PICKED_UP, back_on: '2026-11-01' }, { ...RECEIVED, id: 4, back_on: '2026-11-11' }]);
      expect(cards().map(c => !!c.querySelector('[data-late]'))).toEqual([true, false, false]);
    });

    it('a repair of a laptop the shop sold shows the Sale and the warranty', async () => {
      await create([{ ...RECEIVED, sale_invoice_id: 44, sale_invoice_number: 44, sale_date: '2026-11-10', sale_warranty: '1_week' }, RECEIVED]);
      expect(cards()[0].querySelector('[data-warranty]')!.textContent!.trim()).toBe('Sold by you: Sale 000044 · 1 week · 6 days left');
      expect(cards()[1].querySelector('[data-warranty]')).toBeNull();
    });

    it('shows the photo of one of the shop\'s laptops, and a grey box for the others', async () => {
      const product = { id: 7, name: 'Dell Inspiron 15', sku: 'D', category_id: 1, selling_price: 1, stock_quantity: 1, min_stock_level: 0, is_archived: false, images: ['/uploads/dell.png'], image_url: '/uploads/dell.png' } as Product;
      await create([{ ...RECEIVED, product_id: 7 }, FIXED], [], [product]);
      expect(cards()[0].querySelector('img')!.getAttribute('src')).toBe(`${apiOrigin}/uploads/dell.png`);
      expect(cards()[1].querySelector('img')).toBeNull();
      expect(cards()[1].querySelector('.bg-gray-100 svg')).not.toBeNull();
    });

    it('says so when there are no repairs yet', async () => {
      await create([]);
      expect(text()).toContain('No repairs yet.');
      expect(text()).toContain('Click New repair when a laptop comes in.');
    });

    it('asks for the first page of all the repairs, 10 on a page', async () => {
      await create();
      expect(asked).toEqual([{ page: 1, perPage: 10, search: '' }]);
    });

    it('shows the reason when the repairs cannot be loaded', async () => {
      await create();
      answer(throwError(() => ({ error: { error: 'Database is down' } })));
      component.loadRepairs();
      fixture.detectChanges();
      expect(text()).toContain('Database is down');
    });

    it('a load error with no reason says so in plain words', async () => {
      await create();
      answer(throwError(() => new Error('offline')));
      component.loadRepairs();
      fixture.detectChanges();
      expect(text()).toContain('Failed to load repairs.');
    });

    it('while loading it shows the grey shapes of the cards and of the numbers, not "No repairs yet."', async () => {
      await TestBed.configureTestingModule({
        imports: [RepairsComponent],
        providers: [
          { provide: RepairService, useValue: { getRepairPage: () => new Subject<Paged<Repair>>() } },
          { provide: InvoiceService, useValue: { getInvoices: () => of([]) } },
          { provide: ProductService, useValue: { getAllProducts: () => of([]) } },
          { provide: TelegramNotifier, useValue: telegramApi },
        ],
      }).compileComponents();
      fixture = TestBed.createComponent(RepairsComponent);
      fixture.detectChanges();
      expect(dom().querySelectorAll('[data-skeleton][data-kind="cards"] [data-skeleton-item]').length).toBe(4);
      expect(dom().querySelectorAll('[data-skeleton][data-kind="stats"] [data-skeleton-item]').length).toBe(2);
      expect(dom().querySelector('[data-summary]')).toBeNull();
      expect(dom().querySelector('[data-pagination]')).toBeNull();
      expect(text()).not.toContain('No repairs yet.');
    });

    it('the grey shapes go away when the page comes', async () => {
      await create();
      const pending = new Subject<Paged<Repair>>();
      answer(pending);
      component.loadRepairs(true);
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
      expect(cards().length).toBe(0);
      pending.next(pageOf([RECEIVED]));
      pending.complete();
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton]')).toBeNull();
      expect(cards().length).toBe(1);
    });
  });

  describe('the 3 steps on a card', () => {
    const states = (card: HTMLElement) => Array.from(card.querySelectorAll('ol li')).map(li => li.getAttribute('data-state'));
    const labels = (card: HTMLElement) => Array.from(card.querySelectorAll('ol li')).map(li => li.textContent!.trim());

    it('always show Received, Fixed, Picked up', async () => {
      await create();
      expect(labels(cards()[0])).toEqual(['Received', 'Fixed', 'Picked up']);
    });

    it('received: the first is the current step, the others wait', async () => {
      await create();
      expect(states(cards()[0])).toEqual(['now', 'todo', 'todo']);
    });

    it('fixed: the first is done, the second is current', async () => {
      await create();
      expect(states(cards()[1])).toEqual(['done', 'now', 'todo']);
    });

    it('picked up: all three are done', async () => {
      await create();
      expect(states(cards()[2])).toEqual(['done', 'done', 'done']);
    });

    it('the current step is marked for screen readers', async () => {
      await create();
      const current = cards()[1].querySelector('ol li[aria-current="step"]')!;
      expect(current.textContent!.trim()).toBe('Fixed');
    });

    it('the tag shows the step: received amber, fixed blue, picked up green', async () => {
      await create();
      const badge = (i: number) => cards()[i].querySelector('app-status-badge')!.innerHTML;
      expect(badge(0)).toContain('amber');
      expect(badge(1)).toContain('blue');
      expect(badge(2)).toContain('green');
    });
  });

  describe('the numbers on top', () => {
    it('count what is in the shop and what waits for pickup (no money number)', async () => {
      await create();
      expect(dom().querySelector('[data-in-shop]')!.textContent!.trim()).toBe('2');
      expect(dom().querySelector('[data-waiting]')!.textContent!.trim()).toBe('1');
      expect(dom().querySelectorAll('[data-summary] > div').length).toBe(2);
      expect(text()).not.toContain('Money to collect');
    });

    it('"waiting for pickup" is only the FIXED repairs (not received ones, not picked up ones)', async () => {
      await create([{ ...FIXED, cost: 35 }, { ...FIXED, id: 5, cost: 10.5 }, { ...FIXED, id: 6, cost: null }, RECEIVED, PICKED_UP]);
      expect(dom().querySelector('[data-waiting]')!.textContent!.trim()).toBe('3');
    });

    it('are zero when there are no repairs', async () => {
      await create([]);
      expect(dom().querySelector('[data-in-shop]')!.textContent!.trim()).toBe('0');
      expect(dom().querySelector('[data-waiting]')!.textContent!.trim()).toBe('0');
    });
  });

  describe('tabs and search', () => {
    const lastAsk = () => asked[asked.length - 1];

    it('has a tab per step with the number of repairs in it, counted by the API', async () => {
      await create();
      expect(['All', 'Received', 'Fixed', 'Picked up'].map(l => tab(l).textContent!.replace(/\s+/g, ''))).toEqual(['All3', 'Received1', 'Fixed1', 'Pickedup1']);
    });

    it('a tab asks the API for that step, shows what it sends, and is marked as the current one', async () => {
      await create();
      answer(of(pageOf([FIXED], { meta: { counts: countsOf(ALL) } })));
      tab('Fixed').click();
      fixture.detectChanges();
      expect(lastAsk()).toEqual({ page: 1, perPage: 10, status: 'fixed', search: '' });
      expect(devices()).toEqual(['HP Pavilion 15']);
      expect(tab('Fixed').getAttribute('aria-pressed')).toBe('true');
      expect(tab('All').getAttribute('aria-pressed')).toBe('false');

      answer(of(pageOf(ALL)));
      tab('All').click();
      fixture.detectChanges();
      expect(lastAsk()).toEqual({ page: 1, perPage: 10, search: '' });
      expect(cards().length).toBe(3);
    });

    it('pressing the tab you are on asks nothing', async () => {
      await create();
      const before = asked.length;
      tab('All').click();
      fixture.detectChanges();
      expect(asked.length).toBe(before);
    });

    it('the numbers of the tabs and of the top do not change with the tab or the search (the API counts them all)', async () => {
      await create();
      answer(of(pageOf([FIXED], { total: 1, meta: { counts: countsOf(ALL) } })));
      tab('Fixed').click();
      fixture.detectChanges();
      expect(['All', 'Received', 'Fixed', 'Picked up'].map(l => tab(l).textContent!.replace(/\s+/g, ''))).toEqual(['All3', 'Received1', 'Fixed1', 'Pickedup1']);
      expect(dom().querySelector('[data-in-shop]')!.textContent!.trim()).toBe('2');
    });

    it('typing in the search box asks the API with that text, from the first page, when the typing stops', fakeAsync(() => {
      create().then(() => {
        const before = asked.length;
        search('keyboard');
        expect(asked.length).toBe(before);                 // not yet: the person may still be typing
        tick(299);
        expect(asked.length).toBe(before);
        tick(1);
        expect(asked.length).toBe(before + 1);
        expect(lastAsk()).toEqual({ page: 1, perPage: 10, search: 'keyboard' });
      });
      tick();
    }));

    it('a word typed letter by letter is ONE question, not one for each letter', fakeAsync(() => {
      create().then(() => {
        const before = asked.length;
        for (const typed of ['f', 'fa', 'fan']) { search(typed); tick(100); }
        tick(300);
        expect(asked.length).toBe(before + 1);
        expect(lastAsk().search).toBe('fan');
      });
      tick();
    }));

    it('search and tab work together, and "No repairs found." appears when nothing matches', fakeAsync(() => {
      create().then(() => {
        answer(of(pageOf([], { meta: { counts: countsOf(ALL) } })));
        tab('Received').click();
        search('keyboard');
        tick(300);
        fixture.detectChanges();
        expect(lastAsk()).toEqual({ page: 1, perPage: 10, status: 'received', search: 'keyboard' });
        expect(cards().length).toBe(0);
        expect(text()).toContain('No repairs found.');
        expect(text()).not.toContain('No repairs yet.');
      });
      tick();
    }));

    it('while the answer to a tab is coming, the grey shapes are shown', async () => {
      await create();
      const pending = new Subject<Paged<Repair>>();
      answer(pending);
      tab('Fixed').click();
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
      expect(cards().length).toBe(0);
      pending.next(pageOf([FIXED]));
      pending.complete();
      fixture.detectChanges();
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).toBeNull();
      expect(devices()).toEqual(['HP Pavilion 15']);
    });
  });

  describe('the pages', () => {
    const lastAsk = () => asked[asked.length - 1];
    const bar = () => dom().querySelector('[data-pagination]') as HTMLElement | null;
    const barText = () => bar()!.querySelector('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim();
    const many = (rows: Repair[], over: Partial<Paged<Repair, { counts: RepairCounts }>> = {}) =>
      pageOf(rows, { page: 1, per_page: 10, total: 25, total_pages: 3, meta: { counts: { received: 12, fixed: 8, picked_up: 5 } }, ...over });

    beforeEach(() => spyOn(window, 'scrollTo'));

    it('says which repairs are on screen: "Showing 1–3 of 3", with no "Per page" box and no buttons for one page', async () => {
      await create();
      expect(barText()).toBe('Showing 1–3 of 3');
      expect(bar()!.querySelector('[data-per-page]')).toBeNull();
      expect(bar()!.querySelector('[data-next]')).toBeNull();
    });

    it('with many repairs: "Showing 1–10 of 25" and Next', async () => {
      await create();
      answer(of(many([RECEIVED])));
      component.loadRepairs();
      fixture.detectChanges();
      expect(barText()).toBe('Showing 1–10 of 25');
      expect(bar()!.querySelector('[data-page-of]')!.textContent!.trim()).toBe('Page 1 of 3');
    });

    it('Next asks the API for the next page, shows the grey shapes meanwhile, and shows the new page', async () => {
      await create();
      answer(of(many([RECEIVED])));
      component.loadRepairs();
      fixture.detectChanges();

      const pending = new Subject<Paged<Repair>>();
      answer(pending);
      (bar()!.querySelector('[data-next]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(lastAsk().page).toBe(2);
      expect(dom().querySelector('[data-skeleton][data-kind="cards"]')).not.toBeNull();
      expect(bar()).toBeNull();

      pending.next(many([{ ...RECEIVED, id: 11, device: 'Second page laptop' }], { page: 2 }));
      pending.complete();
      fixture.detectChanges();
      expect(devices()).toEqual(['Second page laptop']);
      expect(barText()).toBe('Showing 11–20 of 25');
    });

    it('"Per page" asks for that many on a page, from the first page', async () => {
      await create();
      answer(of(many([RECEIVED], { page: 2 })));
      component.loadRepairs();
      fixture.detectChanges();
      const select = bar()!.querySelector('[data-per-page]') as HTMLSelectElement;
      select.value = '20';
      select.dispatchEvent(new Event('change'));
      expect(lastAsk()).toEqual(jasmine.objectContaining({ page: 1, perPage: 20 }));
    });

    it('a tab starts from the first page', async () => {
      await create();
      answer(of(many([RECEIVED], { page: 3 })));
      component.loadRepairs();
      fixture.detectChanges();
      tab('Fixed').click();
      expect(lastAsk().page).toBe(1);
    });

    it('after the last repair of a page is deleted, the page before it is shown (not an empty page)', async () => {
      await create();
      answer(of(many([RECEIVED], { page: 3, total: 21 })));
      component.loadRepairs();
      fixture.detectChanges();
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      const answers = [many([], { page: 3, total: 20, total_pages: 2 }), many([RECEIVED], { page: 2, total: 20, total_pages: 2 })];
      answer(() => of(answers.shift()!));
      buttonIn(dialog()!, 'Delete repair').click();
      fixture.detectChanges();
      expect(lastAsk().page).toBe(2);
      expect(component.paging.page).toBe(2);
      expect(cards().length).toBe(1);
    });

    it('moving a repair to its next step reads the page you are on again (you stay where you are)', async () => {
      await create();
      answer(of(many([RECEIVED], { page: 2 })));
      component.loadRepairs();
      fixture.detectChanges();
      mainButton(cards()[0])!.click();
      await settle();
      expect(lastAsk().page).toBe(2);
    });

    it('a slow answer to an old question never replaces the answer to a newer one', async () => {
      await create();
      const slow = new Subject<Paged<Repair>>();
      const fast = new Subject<Paged<Repair>>();
      const queue = [slow, fast];
      answer(() => queue.shift()!);
      tab('Received').click();
      tab('Fixed').click();
      fixture.detectChanges();
      fast.next(pageOf([FIXED]));
      slow.next(pageOf([RECEIVED]));
      fixture.detectChanges();
      expect(devices()).toEqual(['HP Pavilion 15']);
    });

    it('no bar while there is nothing to page through', async () => {
      await create([]);
      expect(bar()).toBeNull();
    });
  });

  describe('the main button moves a repair to its next step', () => {
    it('says "Mark fixed" on a received repair and "Customer picked up" on a fixed one; a picked-up one has none', async () => {
      await create();
      expect(mainButton(cards()[0])!.textContent!.trim()).toBe('Mark fixed');
      expect(mainButton(cards()[1])!.textContent!.trim()).toBe('Customer picked up');
      expect(mainButton(cards()[2])).toBeNull();
      expect(cards()[2].querySelector('[data-done]')!.textContent!.trim()).toBe('Done · 05/11/2026');
    });

    it('"Mark fixed" sets that step on THAT repair, reloads the list and says so', async () => {
      await create();
      const loads = asked.length;
      mainButton(cards()[0])!.click();
      await settle();
      expect(repairsApi['updateRepair']).toHaveBeenCalledOnceWith(1, { status: 'fixed' });
      expect(asked.length).toBe(loads + 1);
      expect(text()).toContain('“Dell Inspiron 15” is fixed.');
    });

    it('"Customer picked up" sets the last step and says so', async () => {
      await create();
      mainButton(cards()[1])!.click();
      await settle();
      expect(repairsApi['updateRepair']).toHaveBeenCalledOnceWith(2, { status: 'picked_up' });
      expect(text()).toContain('“HP Pavilion 15” was picked up.');
    });

    it('shows the reason when it fails, and the button works again', async () => {
      await create();
      repairsApi['updateRepair'].and.returnValue(throwError(() => ({ error: { error: 'Repair not found' } })));
      mainButton(cards()[0])!.click();
      await settle();
      expect(text()).toContain('Repair not found');
      expect(mainButton(cards()[0])!.disabled).toBeFalse();
    });

    it('a failure with no reason says so in plain words', async () => {
      await create();
      repairsApi['updateRepair'].and.returnValue(throwError(() => new Error('offline')));
      mainButton(cards()[0])!.click();
      await settle();
      expect(text()).toContain('Failed to update the repair.');
    });

    it('while one is moving the buttons are off and a second press does nothing', async () => {
      await create();
      const pending = new Subject<Repair>();
      repairsApi['updateRepair'].and.returnValue(pending);
      mainButton(cards()[0])!.click();
      fixture.detectChanges();
      expect(mainButton(cards()[0])!.disabled).toBeTrue();
      expect(mainButton(cards()[1])!.disabled).toBeTrue();
      component.advance(RECEIVED);
      component.advance(FIXED);
      expect(repairsApi['updateRepair']).toHaveBeenCalledTimes(1);
      pending.next(RECEIVED);
      pending.complete();
      await settle();
      expect(mainButton(cards()[0])!.disabled).toBeFalse();
    });

    it('a repair that is already picked up cannot move on', async () => {
      await create();
      component.advance(PICKED_UP);
      expect(repairsApi['updateRepair']).not.toHaveBeenCalled();
    });
  });

  describe('new and changed repairs (the form)', () => {
    it('"New repair" opens the form', async () => {
      await create();
      buttonIn(dom(), 'New repair').click();
      await settle();
      expect(formDialog()!.getAttribute('aria-label')).toBe('New repair');
    });

    it('hands the form the shop\'s laptops, the Sales, and today', async () => {
      const laptop = { id: 7, name: 'Dell XPS 13', sku: 'D', category_id: 1, selling_price: 1, stock_quantity: 1, min_stock_level: 0, is_archived: false } as Product;
      await create(ALL, [SALE], [laptop]);
      buttonIn(dom(), 'New repair').click();
      await settle();
      expect(repairForm().products.map(p => p.name)).toEqual(['Dell XPS 13']);
      expect(repairForm().sales.map(s => s.number)).toEqual([44]);
      expect(repairForm().today).toBe('2026-11-11');
    });

    it('asks for ALL products (a sold laptop is hidden but still has its photo)', async () => {
      await create();
      expect(productsApi['getAllProducts']).toHaveBeenCalledOnceWith(true);
    });

    it('still works when the products cannot be loaded', async () => {
      await create();
      productsApi['getAllProducts'].and.returnValue(throwError(() => new Error('down')));
      component.ngOnInit();
      buttonIn(dom(), 'New repair').click();
      await settle();
      expect(component.products).toEqual([]);
      expect(formDialog()).not.toBeNull();
    });

    it('after saving: the form closes, the list is loaded again and it says "Repair saved."', async () => {
      await create();
      buttonIn(dom(), 'New repair').click();
      await settle();
      const loads = asked.length;
      Object.assign(repairForm().form, { device: 'Lenovo T14', problem: 'Does not turn on' });
      repairForm().submit();
      await settle();
      expect(repairsApi['createRepair']).toHaveBeenCalledTimes(1);
      expect(formDialog()).toBeNull();
      expect(asked.length).toBe(loads + 1);
      expect(text()).toContain('Repair saved.');
      expect(editor()).toBeNull();
    });

    it('with "Make an invoice now" on, the repair invoice opens next, filled from the repair and pointing at it', async () => {
      await create();
      buttonIn(dom(), 'New repair').click();
      await settle();
      Object.assign(repairForm().form, { device: 'Lenovo T14', problem: 'Does not turn on', cost: 60, makeInvoice: true, customer_name: 'Rotha' });
      repairForm().submit();
      await settle();
      expect(editor()!.getAttribute('aria-label')).toBe('New repair invoice');
      expect(invoiceForm().form.device).toBe('Lenovo T14');
      expect(invoiceForm().form.problem).toBe('Does not turn on');
      expect(invoiceForm().form.customer_name).toBe('Rotha');
      expect(invoiceForm().form.repair_id).toBe(99);
      expect(invoiceForm().form.items).toEqual([{ name: 'Repair', qty: 1, unit_price: 60 }]);
    });

    it('Edit opens the form with that repair, and saving says "Changes saved."', async () => {
      await create();
      buttonIn(cards()[1], 'Edit').click();
      await settle();
      expect(formDialog()!.getAttribute('aria-label')).toBe('Edit repair');
      expect(repairForm().repair!.id).toBe(2);
      repairForm().submit();
      await settle();
      expect(repairsApi['updateRepair'].calls.mostRecent().args[0]).toBe(2);
      expect(text()).toContain('Changes saved.');
    });

    it('Esc closes the form without saving', async () => {
      await create();
      buttonIn(dom(), 'New repair').click();
      await settle();
      key('Escape');
      expect(formDialog()).toBeNull();
      expect(repairsApi['createRepair']).not.toHaveBeenCalled();
    });
  });

  describe('the invoice of a repair (optional)', () => {
    const invoiceButton = (card: HTMLElement) => Array.from(card.querySelectorAll('button')).find(b => ['Make invoice', 'View invoice'].includes(b.textContent!.trim())) as HTMLButtonElement;

    it('says "Make invoice" until it exists, then "View invoice"', async () => {
      await create(ALL, [REPAIR_INVOICE]);
      expect(invoiceButton(cards()[0]).textContent!.trim()).toBe('Make invoice');
      expect(invoiceButton(cards()[1]).textContent!.trim()).toBe('View invoice');
    });

    it('only a REPAIR invoice that points at the repair counts (a booking or a sale invoice does not)', async () => {
      await create(ALL, [SALE, { ...REPAIR_INVOICE, type: 'booking', repair_id: null, booking_id: 3 }]);
      expect(invoiceButton(cards()[1]).textContent!.trim()).toBe('Make invoice');
    });

    it('the buttons still say "Make invoice" when the invoices cannot be loaded', async () => {
      await create();
      invoicesApi['getInvoices'].and.returnValue(throwError(() => new Error('offline')));
      component.ngOnInit();
      fixture.detectChanges();
      expect(invoiceButton(cards()[0]).textContent!.trim()).toBe('Make invoice');
    });

    it('"Make invoice" opens the form for a repair invoice, filled from the repair', async () => {
      await create();
      invoiceButton(cards()[0]).click();
      await settle();
      expect(editor()!.getAttribute('aria-label')).toBe('New repair invoice');
      expect(invoiceForm().form.repair_id).toBe(1);
      expect(invoiceForm().form.device).toBe('Dell Inspiron 15');
      expect(invoiceForm().form.problem).toBe('Screen flickers when moved');
      expect(invoiceForm().form.customer_name).toBe('Vanna Chea');
      expect(invoiceForm().form.phone).toBe('099 111 222');
      expect(invoiceForm().form.items).toEqual([{ name: 'Repair', qty: 1, unit_price: 60 }]);
    });

    it('after saving it the paper opens so it can be printed, and the button now says "View invoice"', async () => {
      await create();
      invoiceButton(cards()[0]).click();
      await settle();
      invoicesApi['getInvoices'].and.returnValue(of([{ ...REPAIR_INVOICE, id: 60, number: 47, repair_id: 1 }]));
      invoiceForm().form.warranty = '1_week';
      invoiceForm().submit();
      await settle();
      expect(editor()).toBeNull();
      expect(viewerComponent().invoice.number).toBe(47);
      expect(invoiceButton(cards()[0]).textContent!.trim()).toBe('View invoice');
      expect(invoicesApi['createInvoice'].calls.mostRecent().args[0].repair_id).toBe(1);
    });

    it('"View invoice" shows the paper that was already made', async () => {
      await create(ALL, [REPAIR_INVOICE]);
      invoiceButton(cards()[1]).click();
      fixture.detectChanges();
      expect(viewerComponent().invoice.number).toBe(46);
    });

    it('the paper\'s Edit button opens the writing window for it, and saving changes it (no new one)', async () => {
      await create(ALL, [REPAIR_INVOICE]);
      invoiceButton(cards()[1]).click();
      fixture.detectChanges();
      buttonIn(dom().querySelector('app-invoice-viewer') as HTMLElement, 'Edit').click();
      await settle();
      expect(invoiceForm().invoice!.number).toBe(46);
      invoiceForm().submit();
      await settle();
      expect(invoicesApi['updateInvoice']).toHaveBeenCalledTimes(1);
      expect(invoicesApi['createInvoice']).not.toHaveBeenCalled();
    });
  });

  describe('a repair takes the laptop off the shelf (counted stock -1, a single laptop is set aside as "In repair")', () => {
    const held = (over: Partial<Repair> = {}): Repair => ({ ...RECEIVED, product_id: 7, stock_held: true, product_track_stock: false, ...over });
    const reads = () => productsApi['getAllProducts'].calls.count();

    it('"Mark fixed" on a repair that holds a single laptop says it is back on the Menu, and the products are read again', async () => {
      await create([held()]);
      repairsApi['updateRepair'].and.callFake((id: number, c: any) => of({ ...held(), ...c, id, stock_held: false }));
      const before = reads();
      mainButton(cards()[0])!.click();
      await settle();
      expect(text()).toContain('“Dell Inspiron 15” is fixed. The laptop is back on the Menu.');
      expect(reads()).toBe(before + 1);
    });

    it('"Mark fixed" on a repair that holds counted stock says one is back in stock', async () => {
      await create([held({ product_track_stock: true })]);
      repairsApi['updateRepair'].and.callFake((id: number, c: any) => of({ ...held({ product_track_stock: true }), ...c, id, stock_held: false }));
      mainButton(cards()[0])!.click();
      await settle();
      expect(text()).toContain('“Dell Inspiron 15” is fixed. One laptop is back in stock.');
    });

    it('a repair of a customer\'s laptop (it held nothing) says nothing about stock', async () => {
      await create([RECEIVED]);
      mainButton(cards()[0])!.click();
      await settle();
      expect(text()).toContain('“Dell Inspiron 15” is fixed.');
      expect(text()).not.toContain('back on the Menu');
      expect(text()).not.toContain('back in stock');
    });

    it('a new repair of a single laptop says it was set aside, and the products are read again', async () => {
      await create([], [], [{ id: 7, name: 'Dell XPS 13', sku: 'D', category_id: 1, selling_price: 1, stock_quantity: 1, min_stock_level: 0, is_archived: false, track_stock: false } as Product]);
      repairsApi['createRepair'].and.callFake((r: any) => of({ id: 99, fixed_date: null, picked_up_date: null, ...r, stock_held: true, product_track_stock: false }));
      buttonIn(dom(), 'New repair').click();
      await settle();
      const before = reads();
      Object.assign(repairForm().form, { source: 'shop', product_id: 7, device: 'Dell XPS 13', problem: 'Fan is loud' });
      repairForm().submit();
      await settle();
      expect(text()).toContain('Repair saved. The laptop is set aside as In repair and left the Menu.');
      expect(reads()).toBe(before + 1);
    });

    it('changing a repair without changing its laptop only says "Changes saved."', async () => {
      await create([held()]);
      repairsApi['updateRepair'].and.callFake((id: number, c: any) => of({ ...held(), ...c, id }));
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      repairForm().form.problem = 'Fan is loud';
      repairForm().submit();
      await settle();
      expect(text()).toContain('Changes saved.');
      expect(text()).not.toContain('set aside');
      expect(text()).not.toContain('back on the Menu');
    });

    it('deleting a received repair that holds a laptop says it is given back (in the box and after)', async () => {
      await create([held()]);
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      expect(dialog()!.textContent!.replace(/\s+/g, ' ')).toContain('The laptop is back on the Menu.');
      const before = reads();
      buttonIn(dialog()!, 'Delete repair').click();
      await settle();
      expect(text()).toContain('Repair deleted. The laptop is back on the Menu.');
      expect(reads()).toBe(before + 1);
    });

    it('deleting a fixed repair gives nothing back (it was given back when it was fixed), so it says nothing', async () => {
      await create([held({ status: 'fixed', stock_held: false, fixed_date: '2026-11-11' })]);
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      expect(dialog()!.textContent).not.toContain('back');
      buttonIn(dialog()!, 'Delete repair').click();
      await settle();
      expect(text()).toContain('Repair deleted.');
      expect(text()).not.toContain('back on the Menu');
    });
  });

  describe('Telegram: what is sent, and when', () => {
    it('a NEW repair is sent as a repair', async () => {
      await create();
      buttonIn(dom(), 'New repair').click();
      await settle();
      Object.assign(repairForm().form, { device: 'Lenovo T14', problem: 'Does not turn on' });
      repairForm().submit();
      await settle();
      expect(telegramApi.send).toHaveBeenCalledOnceWith('repair', 99);
    });

    it('changing a repair, moving its step or deleting it sends nothing', async () => {
      await create();
      buttonIn(cards()[0], 'Edit').click();
      await settle();
      repairForm().form.problem = 'Fan is loud';
      repairForm().submit();
      await settle();
      mainButton(cards()[0])!.click();
      await settle();
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      buttonIn(dialog()!, 'Delete repair').click();
      await settle();
      expect(telegramApi.send).not.toHaveBeenCalled();
    });
  });

  describe('deleting a repair (our own dialog)', () => {
    const open = async (i = 0) => { await create(); buttonIn(cards()[i], 'Delete').click(); fixture.detectChanges(); };

    it('asks first: which repair, the customer and the problem, and "This can\'t be undone."', async () => {
      await open();
      const box = dialog()!.textContent!.replace(/\s+/g, ' ');
      expect(box).toContain('Delete this repair?');
      expect(box).toContain('Dell Inspiron 15');
      expect(box).toContain('Vanna Chea · Screen flickers when moved');
      expect(box).toContain("This can't be undone.");
      expect(repairsApi['deleteRepair']).not.toHaveBeenCalled();
    });

    it('uses the phone when there is no customer name, and shows only the problem when there is neither', async () => {
      await create([{ ...RECEIVED, customer_name: null }, { ...FIXED, customer_name: null, phone: null }]);
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('099 111 222 · Screen flickers when moved');
      buttonIn(dialog()!, 'Cancel').click();
      fixture.detectChanges();
      buttonIn(cards()[1], 'Delete').click();
      fixture.detectChanges();
      expect(dialog()!.textContent).toContain('Some keyboard keys do not work');
    });

    it('Cancel, Esc and the dark background close it without deleting', async () => {
      await open();
      buttonIn(dialog()!, 'Cancel').click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      key('Escape');
      expect(dialog()).toBeNull();
      buttonIn(cards()[0], 'Delete').click();
      fixture.detectChanges();
      (dom().querySelector('.confirm-backdrop') as HTMLElement).click();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
      expect(repairsApi['deleteRepair']).not.toHaveBeenCalled();
    });

    it('"Delete repair" deletes THAT repair, reloads the repairs and the invoices, and says so', async () => {
      await open(1);
      const loads = asked.length;
      const invoiceLoads = invoicesApi['getInvoices'].calls.count();
      buttonIn(dialog()!, 'Delete repair').click();
      fixture.detectChanges();
      expect(repairsApi['deleteRepair']).toHaveBeenCalledOnceWith(2);
      expect(dialog()).toBeNull();
      expect(asked.length).toBe(loads + 1);
      expect(invoicesApi['getInvoices'].calls.count()).toBe(invoiceLoads + 1);
      expect(text()).toContain('Repair deleted.');
    });

    it('stays open and says why when it fails', async () => {
      await open();
      repairsApi['deleteRepair'].and.returnValue(throwError(() => ({ error: { error: 'Repair not found' } })));
      buttonIn(dialog()!, 'Delete repair').click();
      fixture.detectChanges();
      expect(dialog()).not.toBeNull();
      expect(dialog()!.textContent).toContain('Repair not found');
    });

    it('while deleting, the buttons are off and a second click does nothing', async () => {
      await open();
      const pending = new Subject<unknown>();
      repairsApi['deleteRepair'].and.returnValue(pending);
      buttonIn(dialog()!, 'Delete repair').click();
      fixture.detectChanges();
      expect(buttonIn(dialog()!, 'Deleting...').disabled).toBeTrue();
      component.confirmDeleteNow();
      component.cancelDelete();
      expect(repairsApi['deleteRepair']).toHaveBeenCalledTimes(1);
      expect(dialog()).not.toBeNull();
      pending.next({ message: 'ok' });
      pending.complete();
      fixture.detectChanges();
      expect(dialog()).toBeNull();
    });
  });
});
