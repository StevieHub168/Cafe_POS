import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { RepairFormComponent, RepairSaved } from './repair-form.component';
import { RepairService } from '../../services/repair.service';
import { Repair } from '../../models/repair.model';
import { Invoice } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { todayIso } from '../../utils/dates';

const TODAY = '2026-11-11';

const laptop = (id: number, name: string, over: Partial<Product> = {}): Product => ({
  id, sku: `S-${id}`, name, category_id: 1, brand: 'Apple', selling_price: 799, stock_quantity: 1, min_stock_level: 0, is_archived: false, ...over,
});
const PRODUCTS = [laptop(2, 'MacBook Air 13" M1'), laptop(1, 'Dell XPS 13'), laptop(3, 'Old laptop', { is_archived: true })];

/** A Sale of a laptop, sold today so its warranty text does not change from day to day. */
const sale = (over: Partial<Invoice> = {}): Invoice => ({
  id: 44, number: 44, type: 'sale', invoice_date: todayIso(), customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara',
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '1_week', deposit: 799, total: 799, balance: 0,
  items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }], ...over,
});

const EXISTING: Repair = {
  id: 8, product_id: null, device: 'Dell Inspiron 15', customer_name: 'Vanna Chea', phone: '099 111 222', telegram: '@vanna',
  problem: 'Screen flickers', received_date: '2026-11-10', back_on: '2026-11-14', cost: 60, status: 'fixed', fixed_date: '2026-11-11',
  picked_up_date: null, sale_invoice_id: null,
};

describe('RepairFormComponent', () => {
  let fixture: ComponentFixture<RepairFormComponent>;
  let component: RepairFormComponent;
  let api: { [k: string]: jasmine.Spy };
  let saved: RepairSaved[];
  let closed: number;

  interface Options { repair?: Repair | null; prefill?: Partial<Repair> | null; products?: Product[]; sales?: Invoice[]; backLabel?: string }

  async function open(options: Options = {}): Promise<void> {
    api = {
      createRepair: jasmine.createSpy('createRepair').and.callFake((r: any) => of({ id: 9, fixed_date: null, picked_up_date: null, ...r })),
      updateRepair: jasmine.createSpy('updateRepair').and.callFake((id: number, r: any) => of({ id, fixed_date: null, picked_up_date: null, ...r })),
    };
    await TestBed.configureTestingModule({
      imports: [RepairFormComponent],
      providers: [{ provide: RepairService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(RepairFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('today', TODAY);
    if (options.repair) fixture.componentRef.setInput('repair', options.repair);
    if (options.prefill) fixture.componentRef.setInput('prefill', options.prefill);
    fixture.componentRef.setInput('products', options.products ?? PRODUCTS);
    if (options.sales) fixture.componentRef.setInput('sales', options.sales);
    if (options.backLabel) fixture.componentRef.setInput('backLabel', options.backLabel);
    saved = [];
    closed = 0;
    component.saved.subscribe(r => saved.push(r));
    component.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await settle();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const dialog = () => dom().querySelector('[role="dialog"]') as HTMLElement;
  const input = (selector: string) => dom().querySelector(selector) as HTMLInputElement;
  const button = (label: string, root: ParentNode = dom()) => Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement | undefined;
  const radio = (name: string) => Array.from(dom().querySelectorAll('[role="radio"]')).find(b => b.textContent!.includes(name)) as HTMLButtonElement;
  const key = (name: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
  const settle = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); fixture.detectChanges(); };
  /** Types into a box the way a person does (Angular wires the form boxes a moment after they appear). */
  const type = async (selector: string, value: string) => {
    const box = input(selector);
    box.value = value;
    box.dispatchEvent(new Event('input'));
    await settle();
  };
  const filled = async () => { await type('#r-device', 'Lenovo ThinkPad T14'); await type('#r-problem', 'Does not turn on'); };

  it('should create', async () => {
    await open();
    expect(component).toBeTruthy();
  });

  describe('the frame', () => {
    it('is a panel from the right edge, like the other forms', async () => {
      await open();
      expect(dom().querySelector('.repair-backdrop')!.classList).toContain('justify-end');
      expect(dialog().getAttribute('aria-modal')).toBe('true');
      expect(dialog().classList).toContain('h-full');
    });

    it('a new repair says it is step 1 of 3: Received', async () => {
      await open();
      expect(dialog().getAttribute('aria-label')).toBe('New repair');
      expect(text()).toContain('New repair');
      expect(text()).toContain('Step 1 of 3: Received');
    });

    it('changing a repair says which laptop it is', async () => {
      await open({ repair: EXISTING });
      expect(dialog().getAttribute('aria-label')).toBe('Edit repair');
      expect(text()).toContain('Dell Inspiron 15');
      expect(text()).not.toContain('Step 1 of 3');
      expect(button('Save changes')).toBeTruthy();
    });

    it('has no Back button unless the page asks for it, and then it does the same as the ✕', async () => {
      await open();
      expect(button('Back to laptop')).toBeUndefined();
      TestBed.resetTestingModule();
      await open({ backLabel: 'Back to laptop' });
      expect(button('Back to laptop')).toBeTruthy();
      button('Back to laptop')!.click();
      expect(closed).toBe(1);
    });

    it('the ✕, Cancel, Esc and the dark background all close it; a click inside does not', async () => {
      await open();
      (dialog().querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      button('Cancel')!.click();
      expect(closed).toBe(2);
      key('Escape');
      expect(closed).toBe(3);
      (dom().querySelector('.repair-backdrop') as HTMLElement).click();
      expect(closed).toBe(4);
      dialog().click();
      expect(closed).toBe(4);
    });

    it('cannot be closed while it is saving', async () => {
      await open();
      api['createRepair'].and.returnValue(new Subject<Repair>());
      await filled();
      component.submit();
      key('Escape');
      (dom().querySelector('.repair-backdrop') as HTMLElement).click();
      component.close();
      expect(closed).toBe(0);
    });
  });

  describe('whose laptop', () => {
    it('starts as "A customer\'s laptop" with a box to type the name', async () => {
      await open();
      expect(radio("A customer's laptop").getAttribute('aria-checked')).toBe('true');
      expect(radio('A laptop of my shop').getAttribute('aria-checked')).toBe('false');
      expect(input('#r-device')).not.toBeNull();
      expect(dom().querySelector('#r-laptop')).toBeNull();
    });

    it('"A laptop of my shop" swaps the box for the shop\'s laptops, A-Z, without the sold (hidden) ones', async () => {
      await open();
      radio('A laptop of my shop').click();
      await settle();
      const options = Array.from(dom().querySelectorAll('#r-laptop option')).map(o => o.textContent!.trim());
      expect(options).toEqual(['Pick a laptop...', 'Dell XPS 13', 'MacBook Air 13" M1']);
      expect(input('#r-device')).toBeNull();
    });

    it('picking a laptop makes its name the device and remembers which laptop it is', async () => {
      await open();
      radio('A laptop of my shop').click();
      await settle();
      const select = dom().querySelector('#r-laptop') as HTMLSelectElement;
      select.value = select.options[2].value;
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(component.form.product_id).toBe(2);
      expect(component.form.device).toBe('MacBook Air 13" M1');
    });

    it('with no laptops in Products it says so, and points to the other choice', async () => {
      await open({ products: [] });
      radio('A laptop of my shop').click();
      await settle();
      expect(text()).toContain('There are no laptops in Products yet.');
    });

    it('going back to "A customer\'s laptop" forgets the picked laptop (the name stays to be changed)', async () => {
      await open({ prefill: { product_id: 2, device: 'MacBook Air 13" M1' } });
      expect(component.form.source).toBe('shop');
      radio("A customer's laptop").click();
      await settle();
      expect(component.form.product_id).toBeNull();
      expect(input('#r-device').value).toBe('MacBook Air 13" M1');
    });

    it('going back to the shop\'s laptops with one already picked keeps it', async () => {
      await open({ prefill: { product_id: 2, device: 'MacBook Air 13" M1' } });
      radio("A customer's laptop").click();
      radio('A laptop of my shop').click();
      await settle();
      expect(component.form.product_id).toBeNull();                 // it was forgotten when the choice changed
      expect(component.form.device).toBe('');                       // nothing is picked until the person picks
    });

    it('a laptop started from the Menu (prefill with a product) is already picked', async () => {
      await open({ prefill: { product_id: 2, device: 'MacBook Air 13" M1' } });
      expect(radio('A laptop of my shop').getAttribute('aria-checked')).toBe('true');
      expect(component.form.product_id).toBe(2);
      expect((dom().querySelector('#r-laptop') as HTMLSelectElement).selectedOptions[0].textContent!.trim()).toBe('MacBook Air 13" M1');
    });
  });

  describe('a repair takes the laptop off the shelf: the line under the list says how', () => {
    const note = () => dom().querySelector('[data-hold-note]') as HTMLElement | null;
    const pickShop = async (id: number) => {
      radio('A laptop of my shop').click();
      await settle();
      const select = dom().querySelector('#r-laptop') as HTMLSelectElement;
      select.value = Array.from(select.options).find(o => o.text.trim().startsWith(component.shopLaptops.find(p => p.id === id)!.name))!.value;
      select.dispatchEvent(new Event('change'));
      await settle();
    };

    it('no line until a laptop is picked, and none for a customer\'s laptop', async () => {
      await open({ products: [laptop(1, 'Dell XPS 13', { track_stock: false })] });
      expect(note()).toBeNull();
      radio('A laptop of my shop').click();
      await settle();
      expect(note()).toBeNull();
    });

    it('a free single laptop: set aside until it is fixed', async () => {
      await open({ products: [laptop(1, 'Dell XPS 13', { track_stock: false })] });
      await pickShop(1);
      expect(note()!.textContent).toContain('This laptop will be set aside (off the Menu) until it is fixed.');
    });

    it('counted stock: one will be taken, and how many there are; none left = nothing taken', async () => {
      await open({ products: [laptop(1, 'Dell XPS 13', { track_stock: true, stock_quantity: 3 }), laptop(2, 'HP 15', { track_stock: true, stock_quantity: 0 })] });
      await pickShop(1);
      expect(note()!.textContent).toContain('One will be taken from stock (3 now).');
      await pickShop(2);
      expect(note()!.textContent).toContain('None left in stock, so nothing is taken.');
    });

    it('a laptop that is booked or in repair is still in the list, with its state in the name, and the line explains', async () => {
      await open({ products: [laptop(1, 'Dell XPS 13', { track_stock: false, hold_status: 'booked' }), laptop(2, 'HP 15', { track_stock: false, hold_status: 'repair' })] });
      radio('A laptop of my shop').click();
      await settle();
      const options = Array.from(dom().querySelectorAll('#r-laptop option')).map(o => o.textContent!.trim());
      expect(options).toEqual(['Pick a laptop...', 'Dell XPS 13 (booked)', 'HP 15 (in repair)']);
      await pickShop(1);
      expect(note()!.textContent).toContain('This laptop is booked: it stays set aside for the booking.');
      await pickShop(2);
      expect(note()!.textContent).toContain('This laptop is already in repair.');
    });

    it('changing the repair that holds the laptop: it is its own laptop', async () => {
      await open({
        repair: { ...EXISTING, product_id: 1, status: 'received', fixed_date: null, stock_held: true, product_track_stock: false },
        products: [laptop(1, 'Dell XPS 13', { track_stock: false, hold_status: 'repair' })],
      });
      expect(note()!.textContent).toContain('This laptop is set aside while it is in repair.');
    });

    it('a repair that is already fixed does not take the laptop again, so no line', async () => {
      await open({
        repair: { ...EXISTING, product_id: 1, status: 'fixed' },
        products: [laptop(1, 'Dell XPS 13', { track_stock: false })],
      });
      expect(note()).toBeNull();
    });
  });

  describe('the boxes', () => {
    it('start empty, with today as the received date', async () => {
      await open();
      expect(input('#r-customer').value).toBe('');
      expect(input('#r-phone').value).toBe('');
      expect(input('#r-problem').value).toBe('');
      expect(input('#r-received').value).toBe(TODAY);
      expect(input('#r-backon').value).toBe('');
      expect(input('#r-cost').value).toBe('');
    });

    it('spell out the received date with the weekday (11/11/2026 is a Wednesday)', async () => {
      await open();
      expect(text()).toContain('11/11/2026 · Wednesday');
    });

    it('the problem counts its characters (max 140)', async () => {
      await open();
      await type('#r-problem', 'Does not turn on');
      expect(text()).toContain('16 / 140');
      expect(input('#r-problem').getAttribute('maxlength')).toBe('140');
    });

    it('a changed repair starts with its own values', async () => {
      await open({ repair: EXISTING });
      expect(input('#r-device').value).toBe('Dell Inspiron 15');
      expect(input('#r-customer').value).toBe('Vanna Chea');
      expect(input('#r-phone').value).toBe('099 111 222');
      expect(input('#r-telegram').value).toBe('@vanna');
      expect(input('#r-problem').value).toBe('Screen flickers');
      expect(input('#r-received').value).toBe('2026-11-10');
      expect(input('#r-backon').value).toBe('2026-11-14');
      expect(input('#r-cost').value).toBe('60');
    });

    it('prefilled values are used (a laptop the shop sold: the buyer is filled in)', async () => {
      await open({ prefill: { device: 'MacBook Air 13" M1', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara', sale_invoice_id: 44 }, sales: [sale()] });
      expect(input('#r-device').value).toBe('MacBook Air 13" M1');
      expect(input('#r-customer').value).toBe('Sok Dara');
      expect(input('#r-phone').value).toBe('012 345 678');
      expect(input('#r-telegram').value).toBe('@sok_dara');
    });
  });

  describe('the sale of this laptop (warranty)', () => {
    it('says "Sold by you" with the Sale number and the warranty when the form started from a Sale', async () => {
      await open({ prefill: { device: 'MacBook Air 13" M1', sale_invoice_id: 44 }, sales: [sale()] });
      expect(dom().querySelector('[data-sale-note]')!.textContent!.replace(/\s+/g, ' ')).toContain('Sold by you: Sale 000044. Warranty: 1 week · 7 days left.');
      expect(text()).toContain('The cost can be $0 if the warranty covers it.');
    });

    it('finds the Sale when the device and the phone match what was typed', async () => {
      await open({ sales: [sale()] });
      await type('#r-device', 'macbook  AIR 13" m1');
      await type('#r-phone', '012345678');
      expect(dom().querySelector('[data-sale-note]')).not.toBeNull();
    });

    it('or the device and the Telegram', async () => {
      await open({ sales: [sale({ phone: null })] });
      await type('#r-device', 'MacBook Air 13" M1');
      await type('#r-telegram', '@SOK_DARA');
      expect(dom().querySelector('[data-sale-note]')).not.toBeNull();
    });

    it('does not guess from the device alone (another customer may own the same model)', async () => {
      await open({ sales: [sale()] });
      await type('#r-device', 'MacBook Air 13" M1');
      expect(dom().querySelector('[data-sale-note]')).toBeNull();
      await type('#r-phone', '099 000 000');
      expect(dom().querySelector('[data-sale-note]')).toBeNull();
    });

    it('says nothing for a laptop the shop never sold', async () => {
      await open({ sales: [sale()] });
      await type('#r-device', 'Lenovo ThinkPad T14');
      await type('#r-phone', '012345678');
      expect(dom().querySelector('[data-sale-note]')).toBeNull();
    });

    it('says "ended" when the warranty is over', async () => {
      await open({ prefill: { device: 'MacBook Air 13" M1', sale_invoice_id: 44 }, sales: [sale({ invoice_date: '2020-01-01' })] });
      expect(text()).toContain('Warranty: 1 week · ended.');
    });

    it('a repair that already knows its Sale shows it even when the list of Sales is not there', async () => {
      await open({ repair: { ...EXISTING, sale_invoice_id: 44, sale_invoice_number: 44, sale_date: todayIso(), sale_warranty: '2_weeks' }, sales: [] });
      expect(text()).toContain('Sold by you: Sale 000044. Warranty: 2 weeks · 14 days left.');
    });

    it('the link is saved with the repair', async () => {
      await open({ prefill: { device: 'MacBook Air 13" M1', problem: 'Fan', sale_invoice_id: 44 }, sales: [sale()] });
      component.submit();
      expect(api['createRepair'].calls.mostRecent().args[0].sale_invoice_id).toBe(44);
    });

    it('no Sale, no link', async () => {
      await open();
      await filled();
      component.submit();
      expect(api['createRepair'].calls.mostRecent().args[0].sale_invoice_id).toBeNull();
    });
  });

  describe('saving a new repair', () => {
    it('sends a customer\'s laptop: tidied text, empty boxes as null, status "received"', async () => {
      await open();
      await type('#r-device', '  Lenovo ThinkPad T14 ');
      await type('#r-customer', ' Rotha Kim ');
      await type('#r-phone', '017 222 333');
      await type('#r-problem', ' Does not turn on ');
      await type('#r-backon', '2026-11-13');
      component.submit();
      expect(api['createRepair']).toHaveBeenCalledOnceWith({
        product_id: null, device: 'Lenovo ThinkPad T14', customer_name: 'Rotha Kim', phone: '017 222 333', telegram: null,
        problem: 'Does not turn on', received_date: TODAY, back_on: '2026-11-13', cost: null, status: 'received', sale_invoice_id: null,
      });
    });

    it('sends a laptop of the shop with its product id', async () => {
      await open({ prefill: { product_id: 2, device: 'MacBook Air 13" M1' } });
      await type('#r-problem', 'Fan is loud');
      await type('#r-cost', '35');
      component.submit();
      const sent = api['createRepair'].calls.mostRecent().args[0];
      expect(sent.product_id).toBe(2);
      expect(sent.device).toBe('MacBook Air 13" M1');
      expect(sent.cost).toBe(35);
    });

    it('a cost of 0 is kept (a warranty repair), an empty one is "not set"', async () => {
      await open();
      await filled();
      await type('#r-cost', '0');
      component.submit();
      expect(api['createRepair'].calls.mostRecent().args[0].cost).toBe(0);
      api['createRepair'].calls.reset();
      await type('#r-cost', '');
      component.submit();
      expect(api['createRepair'].calls.mostRecent().args[0].cost).toBeNull();
    });

    it('tells the parent: the repair, that it is new, and whether an invoice was asked for', async () => {
      await open();
      await filled();
      component.submit();
      await settle();
      expect(saved.length).toBe(1);
      expect(saved[0].created).toBeTrue();
      expect(saved[0].makeInvoice).toBeFalse();
      expect(saved[0].repair.id).toBe(9);
    });

    it('"Make an invoice now" is off, can be switched on, and is passed on', async () => {
      await open();
      const toggle = dom().querySelector('[role="switch"]') as HTMLButtonElement;
      expect(toggle.getAttribute('aria-checked')).toBe('false');
      expect(text()).toContain('Optional. You can make it later, when the customer picks up.');
      toggle.click();
      await settle();
      expect(toggle.getAttribute('aria-checked')).toBe('true');
      await filled();
      component.submit();
      await settle();
      expect(saved[0].makeInvoice).toBeTrue();
    });

    it('while it saves the buttons say so and a second press does nothing', async () => {
      await open();
      const pending = new Subject<Repair>();
      api['createRepair'].and.returnValue(pending);
      await filled();
      component.submit();
      fixture.detectChanges();
      expect(button('Saving...')!.disabled).toBeTrue();
      expect(button('Cancel')!.disabled).toBeTrue();
      component.submit();
      expect(api['createRepair']).toHaveBeenCalledTimes(1);
      pending.next({ ...EXISTING, id: 12 });
      pending.complete();
      await settle();
      expect(saved.length).toBe(1);
    });

    it('shows the reason in red when the API refuses, and the form stays', async () => {
      await open();
      api['createRepair'].and.returnValue(throwError(() => ({ error: { error: 'Telegram username looks wrong.' } })));
      await filled();
      component.submit();
      await settle();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('Telegram username looks wrong.');
      expect(saved.length).toBe(0);
      expect(button('Save repair')!.disabled).toBeFalse();
    });

    it('a failure with no reason says so in plain words', async () => {
      await open();
      api['createRepair'].and.returnValue(throwError(() => new Error('offline')));
      await filled();
      component.submit();
      await settle();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('Failed to save the repair.');
    });
  });

  describe('what is checked before it is sent', () => {
    const refused = async (message: string) => {
      component.submit();
      await settle();
      expect(api['createRepair']).not.toHaveBeenCalled();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain(message);
    };

    it('the laptop of the shop must be picked', async () => {
      await open();
      radio('A laptop of my shop').click();
      await settle();
      await type('#r-problem', 'Fan');
      await refused('Pick the laptop from your products.');
    });

    it('the device must be written', async () => {
      await open();
      await type('#r-problem', 'Fan');
      await refused('Write the laptop or device.');
    });

    it('the problem must be written', async () => {
      await open();
      await type('#r-device', 'Dell');
      await refused('Write what is wrong.');
      await type('#r-problem', '   ');
      await refused('Write what is wrong.');
    });

    it('the device cannot be longer than the paper holds (80)', async () => {
      await open();
      component.form.device = 'D'.repeat(81);
      await type('#r-problem', 'Fan');
      await refused('The laptop or device is too long (max 80 characters).');
    });

    it('the problem cannot be longer than the paper holds (140)', async () => {
      await open();
      await type('#r-device', 'Dell');
      component.form.problem = 'P'.repeat(141);
      await refused('The problem is too long (max 140 characters).');
    });

    it('the received date is required, and "back on" cannot be before it', async () => {
      await open();
      await filled();
      component.form.received_date = '';
      await refused('The received date is required.');
      component.form.received_date = '2026-11-11';
      component.form.back_on = '2026-11-10';
      await refused('The back-on date cannot be before the received date.');
    });

    it('the cost cannot be negative', async () => {
      await open();
      await filled();
      component.form.cost = -5;
      await refused('The cost must be a number of 0 or more.');
    });
  });

  describe('changing a repair', () => {
    it('saves with updateRepair on that repair and keeps its status', async () => {
      await open({ repair: EXISTING });
      await type('#r-problem', 'Screen flickers + battery');
      component.submit();
      await settle();
      expect(api['createRepair']).not.toHaveBeenCalled();
      expect(api['updateRepair'].calls.mostRecent().args[0]).toBe(8);
      const sent = api['updateRepair'].calls.mostRecent().args[1];
      expect(sent.problem).toBe('Screen flickers + battery');
      expect(sent.status).toBe('fixed');
      expect(sent.device).toBe('Dell Inspiron 15');
    });

    it('tells the parent it is not new, and never asks for an invoice', async () => {
      await open({ repair: EXISTING });
      expect(dom().querySelector('[role="switch"]')).toBeNull();
      component.submit();
      await settle();
      expect(saved[0].created).toBeFalse();
      expect(saved[0].makeInvoice).toBeFalse();
    });

    it('a repair of one of the shop\'s laptops shows that laptop picked', async () => {
      await open({ repair: { ...EXISTING, product_id: 2, device: 'MacBook Air 13" M1' } });
      expect(component.form.source).toBe('shop');
      expect((dom().querySelector('#r-laptop') as HTMLSelectElement).selectedOptions[0].textContent!.trim()).toBe('MacBook Air 13" M1');
    });
  });
});
