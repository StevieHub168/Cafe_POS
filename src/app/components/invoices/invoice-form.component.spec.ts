import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { InvoiceFormComponent, InvoiceSaved } from './invoice-form.component';
import { InvoiceService } from '../../services/invoice.service';
import { Invoice, InvoiceType } from '../../models/invoice.model';
import { Product } from '../../models/product.model';

const SALE: Invoice = {
  id: 7, number: 41, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara',
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '2_weeks', deposit: 800, total: 824, balance: 24,
  items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }, { name: 'Laptop bag', qty: 1, unit_price: 25 }],
};
const REPAIR: Invoice = {
  ...SALE, id: 8, number: 43, type: 'repair', customer_name: 'Vanna Chea', phone: '099 111 222', telegram: null,
  device: 'Dell Inspiron 15', problem: 'Screen flickers', warranty: '1_week', deposit: 20, total: 60, balance: 40,
  items: [{ name: 'Battery', qty: 1, unit_price: 45 }, { name: 'Service fee', qty: 1, unit_price: 15 }],
};

const product = (over: Partial<Product> = {}): Product => ({
  id: 1, sku: 'MAC-005', name: 'MacBook Air 13" M1', category_id: 1, brand: 'Apple', model: '', selling_price: 799,
  extra_prices: [], stock_quantity: 1, min_stock_level: 0, is_archived: false, image_url: null, ...over,
});

interface Options {
  type?: InvoiceType;
  invoice?: Invoice | null;
  prefill?: Partial<Invoice> | null;
  products?: Product[];
  today?: string;
}

describe('InvoiceFormComponent', () => {
  let fixture: ComponentFixture<InvoiceFormComponent>;
  let component: InvoiceFormComponent;
  let api: { [k: string]: jasmine.Spy };
  let saved: InvoiceSaved[];
  let cancelled: number;

  async function create(options: Options = {}): Promise<void> {
    api = {
      getNextNumber: jasmine.createSpy('getNextNumber').and.returnValue(of(44)),
      createInvoice: jasmine.createSpy('createInvoice').and.callFake((b: any) => of({ id: 99, number: b.number ?? 44, total: 0, ...b })),
      updateInvoice: jasmine.createSpy('updateInvoice').and.callFake((id: number, b: any) => of({ id, total: 0, ...b })),
    };
    await TestBed.configureTestingModule({
      imports: [InvoiceFormComponent],
      providers: [{ provide: InvoiceService, useValue: api }],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', options.type ?? 'sale');
    fixture.componentRef.setInput('today', options.today ?? '2026-11-10');
    if (options.invoice) fixture.componentRef.setInput('invoice', options.invoice);
    if (options.prefill) fixture.componentRef.setInput('prefill', options.prefill);
    if (options.products) fixture.componentRef.setInput('products', options.products);
    saved = [];
    cancelled = 0;
    component.saved.subscribe(result => saved.push(result));
    component.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
    await settle();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const input = (selector: string) => dom().querySelector(selector) as HTMLInputElement;
  const items = () => Array.from(dom().querySelectorAll('[data-item]')) as HTMLElement[];
  const field = (row: number, what: 'name' | 'quantity' | 'price') => input(`[aria-label="Item ${row} ${what}"]`);
  const buttonIn = (label: string) => Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const type = (selector: string, value: string) => {
    const el = input(selector);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const chooseName = (row: number, name: string) => {
    const el = field(row, 'name');
    el.value = name;
    el.dispatchEvent(new Event('input'));
    el.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const balanceLine = () => (dom().querySelector('[aria-live="polite"]')!.textContent ?? '').replace(/\s+/g, ' ').trim();
  // Lets the promises that are already waiting finish (Angular wires a form box a moment after it appears), then redraws.
  const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };

  /** Fills a valid sale (through the boxes, so the totals follow). */
  const fillSale = async () => {
    type('[aria-label="Item 1 name"]', 'MacBook Air 13" M1');
    type('[aria-label="Item 1 price"]', '799');
    component.form.warranty = '2_weeks';
    fixture.detectChanges();
  };

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  // ---------------------------------------------------------------------------------------------
  describe('a new sale invoice', () => {
    it('starts with one empty item row, today\'s date and no warranty chosen', async () => {
      await create();
      expect(items().length).toBe(1);
      expect(component.form.invoice_date).toBe('2026-11-10');
      expect(text()).toContain('10/11/2026 · Tuesday');
      expect(component.form.warranty).toBe('');
      expect((input('#i-warranty') as unknown as HTMLSelectElement).value).toBe('');
      expect(buttonIn('Save invoice')).toBeTruthy();
    });

    it('offers the next free number, and says how it will be printed', async () => {
      await create();
      expect(api['getNextNumber']).toHaveBeenCalledTimes(1);
      expect(input('#i-number').value).toBe('44');
      expect(text()).toContain('Printed as 000044');
    });

    it('a number typed before the answer arrives is not replaced', async () => {
      const pending = new Subject<number>();
      await TestBed.configureTestingModule({ imports: [InvoiceFormComponent], providers: [{ provide: InvoiceService, useValue: { getNextNumber: () => pending } }] }).compileComponents();
      fixture = TestBed.createComponent(InvoiceFormComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      component.form.number = 500;
      pending.next(44);
      expect(component.form.number).toBe(500);
    });

    it('if the next number cannot be asked, the box stays empty and the form still works', async () => {
      await TestBed.configureTestingModule({
        imports: [InvoiceFormComponent],
        providers: [{ provide: InvoiceService, useValue: { getNextNumber: () => throwError(() => new Error('offline')), createInvoice: jasmine.createSpy().and.returnValue(of({ id: 1 })) } }],
      }).compileComponents();
      fixture = TestBed.createComponent(InvoiceFormComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      await settle();
      expect(component.form.number).toBeNull();
      expect(text()).not.toContain('Printed as');
    });

    it('has customer, phone and Telegram, but no device, problem or pickup date', async () => {
      await create();
      for (const id of ['#i-customer', '#i-phone', '#i-telegram', '#i-deposit', '#i-warranty']) expect(dom().querySelector(id)).not.toBeNull();
      for (const id of ['#i-device', '#i-problem', '#i-pickup']) expect(dom().querySelector(id)).toBeNull();
      expect(text()).toContain('Goods');
    });

    it('the warranty list has exactly: 1 week, 2 weeks, 1 month, No warranty', async () => {
      await create();
      const options = Array.from(dom().querySelectorAll('#i-warranty option')).map(o => o.textContent!.trim());
      expect(options).toEqual(['Choose...', '1 week', '2 weeks', '1 month', 'No warranty']);
    });

    it('the spelled-out date follows the date box', async () => {
      await create();
      type('#i-date', '2026-11-12');
      expect(text()).toContain('12/11/2026 · Thursday');
    });
  });

  describe('a new repair invoice', () => {
    it('asks for the device and the problem, and calls the items "Work and parts"', async () => {
      await create({ type: 'repair' });
      expect(dom().querySelector('#i-device')).not.toBeNull();
      expect(dom().querySelector('#i-problem')).not.toBeNull();
      expect(dom().querySelector('#i-pickup')).toBeNull();
      expect(text()).toContain('Work and parts');
      expect(field(1, 'name').placeholder).toBe('e.g. Battery replacement');
    });

    it('has room for 7 items', async () => {
      await create({ type: 'repair' });
      expect(text()).toContain('1 / 7');
    });

    it('does not offer your products in the item names (a repair is work and parts)', async () => {
      await create({ type: 'repair', products: [product()] });
      expect(field(1, 'name').getAttribute('list')).toBeNull();
    });

    it('the device and problem boxes hold what fits on the paper (80 and 140 characters)', async () => {
      await create({ type: 'repair' });
      expect(input('#i-device').maxLength).toBe(80);
      expect(input('#i-problem').maxLength).toBe(140);
    });

    it('the deposit does NOT follow the total (it starts empty)', async () => {
      await create({ type: 'repair' });
      type('[aria-label="Item 1 price"]', '45');
      expect(component.form.deposit).toBeNull();
    });
  });

  describe('a new booking invoice', () => {
    it('asks for the pickup date (not before the invoice date) and has room for 5 items', async () => {
      await create({ type: 'booking' });
      expect(dom().querySelector('#i-pickup')).not.toBeNull();
      expect(dom().querySelector('#i-device')).toBeNull();
      expect(input('#i-pickup').getAttribute('min')).toBe('2026-11-10');
      expect(text()).toContain('1 / 5');
    });

    it('spells out the pickup date with the weekday', async () => {
      await create({ type: 'booking' });
      type('#i-pickup', '2026-11-12');
      expect(text()).toContain('12/11/2026 · Thursday');
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('starting from values (a booking becomes an invoice)', () => {
    const FROM_BOOKING: Partial<Invoice> = {
      type: 'booking', booking_id: 5, invoice_date: '2026-11-08', phone: '011968240', telegram: '@Horth_Heng', pickup_date: '2026-11-12',
      items: [{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }], deposit: 500,
    };

    it('fills in everything the booking knows', async () => {
      await create({ type: 'booking', prefill: FROM_BOOKING });
      expect(input('#i-date').value).toBe('2026-11-08');
      expect(input('#i-phone').value).toBe('011968240');
      expect(input('#i-telegram').value).toBe('@Horth_Heng');
      expect(input('#i-pickup').value).toBe('2026-11-12');
      expect(field(1, 'name').value).toBe('MacBook Air M5 | RAM 16GB | SSD 512GB');
      expect(field(1, 'price').value).toBe('1050');
      expect(input('#i-deposit').value).toBe('500');
      expect(text()).toContain('$1,050');
      expect(text()).toContain('$550');                          // balance
    });

    it('leaves the customer name empty (it is not known) and the warranty to be chosen', async () => {
      await create({ type: 'booking', prefill: FROM_BOOKING });
      expect(input('#i-customer').value).toBe('');
      expect(component.form.warranty).toBe('');
    });

    it('sends the booking link along', async () => {
      await create({ type: 'booking', prefill: FROM_BOOKING });
      component.form.warranty = '1_month';
      component.submit();
      const sent = api['createInvoice'].calls.mostRecent().args[0];
      expect(sent.booking_id).toBe(5);
      expect(sent.pickup_date).toBe('2026-11-12');
      expect(sent.deposit).toBe(500);
    });

    // A repair invoice made from a repair job points back at the job.
    const FROM_REPAIR: Partial<Invoice> = {
      type: 'repair', repair_id: 8, customer_name: 'Vanna Chea', phone: '099 111 222', device: 'Dell Inspiron 15', problem: 'Screen flickers',
      items: [{ name: 'Repair', qty: 1, unit_price: 60 }],
    };

    it('a repair invoice starts with the job\'s device, problem, customer and cost line', async () => {
      await create({ type: 'repair', prefill: FROM_REPAIR });
      expect(input('#i-customer').value).toBe('Vanna Chea');
      expect(input('#i-phone').value).toBe('099 111 222');
      expect(component.form.device).toBe('Dell Inspiron 15');
      expect(component.form.problem).toBe('Screen flickers');
      expect(field(1, 'name').value).toBe('Repair');
      expect(field(1, 'price').value).toBe('60');
    });

    it('sends the repair link along (and no booking link)', async () => {
      await create({ type: 'repair', prefill: FROM_REPAIR });
      component.form.warranty = '1_week';
      component.submit();
      const sent = api['createInvoice'].calls.mostRecent().args[0];
      expect(sent.repair_id).toBe(8);
      expect(sent.booking_id).toBeNull();
      expect(sent.type).toBe('repair');
    });

    it('a sale or a booking never sends a repair link, even if one was handed over', async () => {
      await create({ type: 'sale', prefill: { repair_id: 8, items: [{ name: 'X', qty: 1, unit_price: 5 }] } });
      component.form.warranty = 'none';
      component.submit();
      expect(api['createInvoice'].calls.mostRecent().args[0].repair_id).toBeNull();
    });

    it('changing an invoice that belongs to a repair keeps the link', async () => {
      await create({ invoice: { ...SALE, type: 'repair', device: 'Dell', problem: 'Screen', repair_id: 8 } as Invoice });
      component.submit();
      expect(api['updateInvoice'].calls.mostRecent().args[1].repair_id).toBe(8);
    });

    it('a prefilled warranty is used', async () => {
      await create({ prefill: { warranty: '1_week', items: [{ name: 'X', qty: 1, unit_price: 5 }] } });
      expect(component.form.warranty).toBe('1_week');
    });

    it('a prefilled deposit of 0 is kept (not replaced by "paid in full")', async () => {
      await create({ prefill: { items: [{ name: 'X', qty: 1, unit_price: 50 }], deposit: 0 } });
      expect(component.form.deposit).toBe(0);
      type('[aria-label="Item 1 price"]', '60');
      expect(component.form.deposit).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the items', () => {
    it('each row has a name, a quantity (1), a price and the amount; the total follows', async () => {
      await create();
      expect(field(1, 'quantity').value).toBe('1');
      type('[aria-label="Item 1 price"]', '12.5');
      type('[aria-label="Item 1 quantity"]', '3');
      expect(dom().querySelector('[aria-label="Item 1 amount"]')!.textContent!.trim()).toBe('$37.50');
      expect(dom().querySelector('[aria-label="Total"]')!.textContent!.trim()).toBe('$37.50');
    });

    it('"Add item" adds a row, up to what the paper holds (9 for a sale), then it is switched off', async () => {
      await create();
      for (let i = 1; i < 9; i++) { buttonIn('Add item').click(); fixture.detectChanges(); }
      expect(items().length).toBe(9);
      expect(buttonIn('Add item').disabled).toBeTrue();
      expect(text()).toContain('The paper has room for 9 items.');
      buttonIn('Add item').click();
      expect(items().length).toBe(9);
    });

    it('a repair stops at 7 and a booking at 5', async () => {
      await create({ type: 'repair' });
      for (let i = 0; i < 10; i++) component.addRow();
      expect(component.form.items.length).toBe(7);
      TestBed.resetTestingModule();
      await create({ type: 'booking' });
      for (let i = 0; i < 10; i++) component.addRow();
      expect(component.form.items.length).toBe(5);
    });

    it('the ✕ removes that row, and the total follows', async () => {
      await create();
      buttonIn('Add item').click();
      await settle();
      type('[aria-label="Item 1 price"]', '10');
      type('[aria-label="Item 2 price"]', '20');
      (dom().querySelector('[aria-label="Remove item 1"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(items().length).toBe(1);
      expect(component.total).toBe(20);
    });

    it('removing the last row leaves one empty row (the form is never without a row)', async () => {
      await create();
      (dom().querySelector('[aria-label="Remove item 1"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(items().length).toBe(1);
    });

    it('item names hold what fits on the paper (90 characters)', async () => {
      await create();
      expect(field(1, 'name').maxLength).toBe(90);
    });

    describe('your products', () => {
      const catalogue = () => [
        product({ id: 1, name: 'MacBook Air 13" M1', selling_price: 799 }),
        product({ id: 2, name: 'Dell XPS 13', selling_price: 1199 }),
        product({ id: 3, name: 'Dell XPS 13', selling_price: 1199 }),
        product({ id: 4, name: 'Old laptop (archived)', selling_price: 100, is_archived: true }),
      ];

      it('their names are offered in the item boxes (each once, never archived ones)', async () => {
        await create({ products: catalogue() });
        expect(field(1, 'name').getAttribute('list')).toBe('invoice-products');
        const names = Array.from(dom().querySelectorAll('#invoice-products option')).map(o => (o as HTMLOptionElement).value);
        expect(names).toEqual(['MacBook Air 13" M1', 'Dell XPS 13']);
      });

      it('choosing one fills in its price', async () => {
        await create({ products: catalogue() });
        chooseName(1, 'Dell XPS 13');
        await settle();
        expect(component.form.items[0].unit_price).toBe(1199);
        expect(field(1, 'price').value).toBe('1199');
        expect(component.total).toBe(1199);
      });

      it('finds the product however the capitals are typed', async () => {
        await create({ products: catalogue() });
        chooseName(1, 'dell xps 13');
        expect(component.form.items[0].unit_price).toBe(1199);
      });

      it('does not replace a price that is already there', async () => {
        await create({ products: catalogue() });
        type('[aria-label="Item 1 price"]', '1100');
        chooseName(1, 'Dell XPS 13');
        expect(component.form.items[0].unit_price).toBe(1100);
      });

      it('a name that is not one of your products fills in nothing', async () => {
        await create({ products: catalogue() });
        chooseName(1, 'Something else');
        expect(component.form.items[0].unit_price).toBeNull();
      });

      it('never fills in the price of an archived product', async () => {
        await create({ products: catalogue() });
        chooseName(1, 'Old laptop (archived)');
        expect(component.form.items[0].unit_price).toBeNull();
      });

      it('on a new sale the deposit follows the new price', async () => {
        await create({ products: catalogue() });
        chooseName(1, 'MacBook Air 13" M1');
        expect(component.form.deposit).toBe(799);
      });

      it('works with no products at all', async () => {
        await create({ products: [] });
        chooseName(1, 'Dell XPS 13');
        expect(component.form.items[0].unit_price).toBeNull();
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('deposit and balance', () => {
    it('on a new sale the deposit follows the total ("paid in full") while items change', async () => {
      await create();
      type('[aria-label="Item 1 price"]', '799');
      expect(component.form.deposit).toBe(799);
      buttonIn('Add item').click();
      await settle();
      type('[aria-label="Item 2 price"]', '25');
      expect(component.form.deposit).toBe(824);
      expect(balanceLine()).toBe('Balance$0');   // (the label and the amount are two boxes: the gap between them is CSS)
    });

    it('typing a deposit stops it from following', async () => {
      await create();
      type('[aria-label="Item 1 price"]', '800');
      type('#i-deposit', '300');
      type('[aria-label="Item 1 price"]', '900');
      expect(component.form.deposit).toBe(300);
      expect(balanceLine()).toBe('Balance$600');
    });

    it('"Paid in full" sets the deposit to the total (and a sale follows again)', async () => {
      await create();
      type('[aria-label="Item 1 price"]', '800');
      type('#i-deposit', '300');
      buttonIn('Paid in full').click();
      fixture.detectChanges();
      expect(component.form.deposit).toBe(800);
      type('[aria-label="Item 1 price"]', '850');
      expect(component.form.deposit).toBe(850);
    });

    it('on a repair "Paid in full" sets the deposit once, without following', async () => {
      await create({ type: 'repair' });
      type('[aria-label="Item 1 price"]', '60');
      buttonIn('Paid in full').click();
      type('[aria-label="Item 1 price"]', '90');
      expect(component.form.deposit).toBe(60);
    });

    it('goes red and says so when the deposit is more than the total', async () => {
      await create();
      type('[aria-label="Item 1 price"]', '100');
      type('#i-deposit', '150');
      const line = dom().querySelector('[aria-live="polite"]') as HTMLElement;
      expect(line.textContent).toContain('Deposit is more than the total');
      expect(line.className).toContain('bg-red-50');
    });

    it('the balance copes with cents', async () => {
      await create();
      type('[aria-label="Item 1 price"]', '999.99');
      type('#i-deposit', '100.1');
      expect(component.balance).toBe(899.89);
    });

    it('rows with nothing in them are not counted', async () => {
      await create();
      buttonIn('Add item').click();
      await settle();
      type('[aria-label="Item 1 price"]', '50');
      expect(component.total).toBe(50);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('checks before saving (nothing is sent until it is right)', () => {
    const tryToSave = async (message: string, setup: () => void | Promise<void>, options: Options = {}) => {
      await create(options);
      await setup();
      fixture.detectChanges();
      component.submit();
      fixture.detectChanges();
      expect(component.formError).toBe(message);
      expect(text()).toContain(message);
      expect(api['createInvoice']).not.toHaveBeenCalled();
    };
    const valid = (kind: InvoiceType = 'sale') => {
      Object.assign(component.form, { warranty: '1_month', pickup_date: '2026-11-12', device: 'Dell', problem: 'Does not start' });
      component.form.items = [{ name: 'Thing', qty: 1, unit_price: 50 }];
      component.form.deposit = 10;
      return kind;
    };

    it('needs at least one item', () => tryToSave('Add at least one item.', () => { component.form.warranty = '1_week'; }));
    it('an item with a price needs a name', () => tryToSave('Item 1: please write the name.', () => {
      component.form.warranty = '1_week';
      component.form.items = [{ name: ' ', qty: 1, unit_price: 10 }];
    }));
    it('an item with a name needs a price', () => tryToSave('Item 1: please write the price.', () => {
      component.form.warranty = '1_week';
      component.form.items = [{ name: 'Mouse', qty: 1, unit_price: null }];
    }));
    it('a price cannot be negative', () => tryToSave('Item 1: please write the price.', () => {
      component.form.warranty = '1_week';
      component.form.items = [{ name: 'Mouse', qty: 1, unit_price: -1 }];
    }));
    for (const qty of [0, 1.5, 1000, -2]) {
      it(`quantity ${qty} is refused`, () => tryToSave('Item 2: quantity must be a whole number from 1 to 999.', () => {
        component.form.warranty = '1_week';
        component.form.items = [{ name: 'A', qty: 1, unit_price: 5 }, { name: 'B', qty: qty, unit_price: 5 }];
      }));
    }
    it('says which item is wrong', () => tryToSave('Item 3: please write the price.', () => {
      component.form.warranty = '1_week';
      component.form.items = [{ name: 'A', qty: 1, unit_price: 5 }, { name: 'B', qty: 1, unit_price: 5 }, { name: 'C', qty: 1, unit_price: null }];
    }));
    it('the total must be more than 0', () => tryToSave('The total must be more than 0.', () => {
      component.form.warranty = '1_week';
      component.form.items = [{ name: 'Free', qty: 1, unit_price: 0 }];
    }));
    it('the deposit cannot be more than the total', () => tryToSave('Deposit cannot be more than the total.', () => {
      valid();
      component.form.deposit = 500;
    }));
    it('the warranty must be chosen (even "No warranty")', () => tryToSave('Choose the warranty (or "No warranty").', () => {
      valid();
      component.form.warranty = '';
    }));
    it('"No warranty" counts as chosen', async () => {
      await create();
      valid();
      component.form.warranty = 'none';
      component.submit();
      expect(api['createInvoice']).toHaveBeenCalled();
    });
    it('the date is required', () => tryToSave('Date is required.', () => { valid(); component.form.invoice_date = ''; }));
    for (const number of [0, -3, 1000000, 4.5]) {
      it(`the number ${number} is refused`, () => tryToSave('The invoice number must be a whole number from 1 to 999999.', () => { valid(); component.form.number = number; }));
    }
    it('a repair needs the device', () => tryToSave('Device is required.', () => { valid(); component.form.device = ' '; }, { type: 'repair' }));
    it('a repair needs the problem', () => tryToSave('Problem is required.', () => { valid(); component.form.problem = ''; }, { type: 'repair' }));
    it('a booking needs the pickup date', () => tryToSave('Pickup date is required.', () => { valid(); component.form.pickup_date = ''; }, { type: 'booking' }));
    it('pickup cannot be before the invoice date', () => tryToSave('Pickup date cannot be before the invoice date.', () => {
      valid();
      component.form.pickup_date = '2026-11-01';
    }, { type: 'booking' }));
    it('the first problem is the one shown (device before items)', () => tryToSave('Device is required.', () => {
      component.form.items = [];
      component.form.device = '';
    }, { type: 'repair' }));
    it('a sale does not ask for a device or a pickup date', async () => {
      await create();
      valid();
      component.form.device = '';
      component.form.pickup_date = '';
      component.submit();
      expect(api['createInvoice']).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('saving a new invoice', () => {
    it('sends a sale: the items, the money, the contact and the next number', async () => {
      await create();
      type('#i-customer', '  Sok Dara ');
      type('#i-phone', '012 345 678');
      type('#i-telegram', 'sok_dara');
      await fillSale();
      component.submit();
      expect(api['createInvoice']).toHaveBeenCalledOnceWith({
        type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: 'sok_dara',
        device: null, problem: null, pickup_date: null, booking_id: null, repair_id: null, warranty: '2_weeks',
        items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }], deposit: 799, number: 44,
      });
    });

    it('empty rows are left out, names are trimmed, and numbers are numbers', async () => {
      await create();
      buttonIn('Add item').click();
      buttonIn('Add item').click();
      await settle();
      type('[aria-label="Item 1 name"]', '  Charger  ');
      type('[aria-label="Item 1 quantity"]', '2');
      type('[aria-label="Item 1 price"]', '12.5');
      component.form.warranty = 'none';
      component.submit();
      const sent = api['createInvoice'].calls.mostRecent().args[0];
      expect(sent.items).toEqual([{ name: 'Charger', qty: 2, unit_price: 12.5 }]);
      expect(sent.deposit).toBe(25);
    });

    it('blank customer, phone and Telegram are sent as null, and an empty deposit as 0', async () => {
      await create({ type: 'repair' });
      Object.assign(component.form, { device: 'Dell', problem: 'Dead', warranty: '1_week', deposit: null });
      component.form.items = [{ name: 'Fix', qty: 1, unit_price: 30 }];
      component.submit();
      const sent = api['createInvoice'].calls.mostRecent().args[0];
      expect([sent.customer_name, sent.phone, sent.telegram]).toEqual([null, null, null]);
      expect(sent.deposit).toBe(0);
    });

    it('sends a repair with the device and the problem (and no pickup date)', async () => {
      await create({ type: 'repair' });
      Object.assign(component.form, { device: ' Dell Inspiron 15 ', problem: ' Screen flickers ', warranty: '1_week', deposit: 20, pickup_date: '2026-11-12' });
      component.form.items = [{ name: 'Battery', qty: 1, unit_price: 45 }];
      component.submit();
      const sent = api['createInvoice'].calls.mostRecent().args[0];
      expect(sent.type).toBe('repair');
      expect(sent.device).toBe('Dell Inspiron 15');
      expect(sent.problem).toBe('Screen flickers');
      expect(sent.pickup_date).toBeNull();
      expect(sent.booking_id).toBeNull();
    });

    it('sends a booking with the pickup date (and no device or problem)', async () => {
      await create({ type: 'booking' });
      Object.assign(component.form, { pickup_date: '2026-11-12', warranty: '1_month', device: 'x', problem: 'y' });
      component.form.items = [{ name: 'MacBook', qty: 1, unit_price: 1050 }];
      component.form.deposit = 500;
      component.submit();
      const sent = api['createInvoice'].calls.mostRecent().args[0];
      expect(sent.type).toBe('booking');
      expect(sent.pickup_date).toBe('2026-11-12');
      expect(sent.device).toBeNull();
      expect(sent.problem).toBeNull();
    });

    it('with no number (it could not be asked, or it was cleared) no number is sent: the API picks one', async () => {
      await create();
      component.form.number = null;
      await fillSale();
      component.submit();
      expect('number' in api['createInvoice'].calls.mostRecent().args[0]).toBeFalse();
    });

    it('a number written by hand is sent', async () => {
      await create();
      type('#i-number', '500');
      await fillSale();
      component.submit();
      expect(api['createInvoice'].calls.mostRecent().args[0].number).toBe(500);
    });

    it('tells its parent what was saved (a new one)', async () => {
      await create();
      await fillSale();
      component.submit();
      expect(saved.length).toBe(1);
      expect(saved[0].created).toBeTrue();
      expect(saved[0].invoice.id).toBe(99);
    });

    it('shows the reason when the API refuses and lets you try again', async () => {
      await create();
      api['createInvoice'].and.returnValue(throwError(() => ({ error: { error: 'Invoice number 000044 is already used' } })));
      await fillSale();
      component.submit();
      fixture.detectChanges();
      expect(text()).toContain('Invoice number 000044 is already used');
      expect(saved.length).toBe(0);
      expect(component.isSubmitting).toBeFalse();
      expect(buttonIn('Save invoice').disabled).toBeFalse();
    });

    it('a failure with no reason says so in plain words', async () => {
      await create();
      api['createInvoice'].and.returnValue(throwError(() => new Error('offline')));
      await fillSale();
      component.submit();
      expect(component.formError).toBe('Failed to save the invoice.');
    });

    it('a second click while it is saving does nothing', async () => {
      await create();
      const pending = new Subject<Invoice>();
      api['createInvoice'].and.returnValue(pending);
      await fillSale();
      component.submit();
      component.submit();
      fixture.detectChanges();
      expect(api['createInvoice']).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Saving...');
      pending.next(SALE);
      pending.complete();
      expect(saved.length).toBe(1);
    });

    it('Ctrl+Enter saves', async () => {
      await create();
      await fillSale();
      dom().querySelector('form')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
      expect(api['createInvoice']).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('changing an invoice', () => {
    it('is filled in with that invoice (and its own kind, whatever "type" says)', async () => {
      await create({ type: 'sale', invoice: REPAIR });
      expect(component.kind).toBe('repair');
      expect(input('#i-number').value).toBe('43');
      expect(input('#i-date').value).toBe('2026-11-10');
      expect(input('#i-customer').value).toBe('Vanna Chea');
      expect(input('#i-phone').value).toBe('099 111 222');
      expect(input('#i-device').value).toBe('Dell Inspiron 15');
      expect(input('#i-problem').value).toBe('Screen flickers');
      expect((input('#i-warranty') as unknown as HTMLSelectElement).value).toBe('1_week');
      expect(items().length).toBe(2);
      expect(field(2, 'name').value).toBe('Service fee');
      expect(input('#i-deposit').value).toBe('20');
      expect(buttonIn('Save changes')).toBeTruthy();
    });

    it('does not ask the API for a new number', async () => {
      await create({ invoice: SALE });
      expect(api['getNextNumber']).not.toHaveBeenCalled();
    });

    it('the deposit does not follow the total (a sale that is changed keeps its deposit)', async () => {
      await create({ invoice: SALE });
      type('[aria-label="Item 1 price"]', '900');
      expect(component.form.deposit).toBe(800);
    });

    it('saves the changes to THAT invoice and says it was not a new one', async () => {
      await create({ invoice: SALE });
      type('#i-customer', 'Sok Dara Jr.');
      component.submit();
      expect(api['createInvoice']).not.toHaveBeenCalled();
      expect(api['updateInvoice']).toHaveBeenCalledTimes(1);
      const [id, payload] = api['updateInvoice'].calls.mostRecent().args;
      expect(id).toBe(7);
      expect(payload.customer_name).toBe('Sok Dara Jr.');
      expect(payload.number).toBe(41);
      expect(payload.items.length).toBe(2);
      expect(saved[0].created).toBeFalse();
    });

    it('the number can be changed', async () => {
      await create({ invoice: SALE });
      type('#i-number', '777');
      component.submit();
      expect(api['updateInvoice'].calls.mostRecent().args[1].number).toBe(777);
    });

    it('an invoice with no items still opens with one empty row', async () => {
      await create({ invoice: { ...SALE, items: [] } });
      expect(items().length).toBe(1);
    });

    it('is checked the same way (a repair still needs its device)', async () => {
      await create({ invoice: REPAIR });
      type('#i-device', '');
      component.submit();
      expect(component.formError).toBe('Device is required.');
      expect(api['updateInvoice']).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('cancel', () => {
    it('the Cancel button tells the parent', async () => {
      await create();
      buttonIn('Cancel').click();
      expect(cancelled).toBe(1);
    });

    it('does nothing while it is saving', async () => {
      await create();
      api['createInvoice'].and.returnValue(new Subject<Invoice>());
      await fillSale();
      component.submit();
      fixture.detectChanges();
      expect(buttonIn('Cancel').disabled).toBeTrue();
      component.cancel();
      expect(cancelled).toBe(0);
    });
  });
});
