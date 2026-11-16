import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InvoicePaperComponent } from './invoice-paper.component';
import { Invoice } from '../../models/invoice.model';

const SALE: Invoice = {
  id: 1, number: 41, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara',
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '2_weeks', deposit: 824, total: 824, balance: 0,
  items: [
    { name: 'MacBook Air 13" M1 · 8GB / 256GB', qty: 1, unit_price: 799 },
    { name: 'Laptop bag', qty: 1, unit_price: 15 },
    { name: 'Wireless mouse', qty: 1, unit_price: 10 },
  ],
};
const BOOKING: Invoice = {
  ...SALE, id: 2, number: 42, type: 'booking', invoice_date: '2026-11-08', customer_name: null, phone: '011 968 240', telegram: '@Horth_Heng',
  pickup_date: '2026-11-12', booking_id: 1, warranty: '1_month', deposit: 500, total: 1050, balance: 550,
  items: [{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }],
};
const REPAIR: Invoice = {
  ...SALE, id: 3, number: 43, type: 'repair', customer_name: 'Vanna Chea', phone: '099 111 222', telegram: null,
  device: 'Dell Inspiron 15 · 3520', problem: 'Screen flickers, battery does not charge', warranty: '1_week', deposit: 20, total: 60, balance: 40,
  items: [
    { name: 'Battery replacement (new)', qty: 1, unit_price: 45 },
    { name: 'Cleaning + thermal paste', qty: 1, unit_price: 10 },
    { name: 'Service fee', qty: 1, unit_price: 5 },
  ],
};

describe('InvoicePaperComponent', () => {
  let fixture: ComponentFixture<InvoicePaperComponent>;

  async function show(invoice: Invoice): Promise<HTMLElement> {
    await TestBed.configureTestingModule({ imports: [InvoicePaperComponent] }).compileComponents();
    fixture = TestBed.createComponent(InvoicePaperComponent);
    fixture.componentRef.setInput('invoice', invoice);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }
  const refresh = (invoice: Invoice) => { fixture.componentRef.setInput('invoice', invoice); fixture.detectChanges(); };
  const one = (root: HTMLElement, selector: string) => root.querySelector(selector) as HTMLElement | null;
  const text = (root: HTMLElement, selector: string) => (one(root, selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const rows = (root: HTMLElement) => Array.from(root.querySelectorAll('.invoice-row')) as HTMLElement[];
  const cells = (row: HTMLElement) => Array.from(row.children).map(c => (c.textContent ?? '').trim());

  describe('the paper of a sale', () => {
    let paper: HTMLElement;
    beforeEach(async () => { paper = await show(SALE); });

    it('is the A5 shape, 592 x 840', () => {
      const root = one(paper, '.invoice-paper')!;
      expect(root.style.width).toBe('592px');
      expect(root.style.height).toBe('840px');
    });

    it('has the shop logo, the Khmer + English title and the kind', () => {
      expect(one(paper, 'img')!.getAttribute('src')).toBe('/logo.png');
      expect(paper.textContent).toContain('វិក្កយបត្រ');
      expect(paper.textContent).toContain('Invoices');
      expect(text(paper, '.invoice-chip')).toBe('វិក្កយបត្រលក់ · SALE');
    });

    it('prints the number with 6 digits and the date as day / month / year', () => {
      expect(text(paper, '.invoice-number')).toBe('000041');
      expect(text(paper, '.invoice-date')).toBe('ថ្ងៃទី 10 ខែ 11 ឆ្នាំ 2026');
    });

    it('has the customer and how to reach them', () => {
      expect(text(paper, '.invoice-customer')).toBe('Sok Dara');
      expect(text(paper, '.invoice-contact')).toBe('012 345 678 · @sok_dara');
    });

    it('has the table headers in Khmer and English', () => {
      for (const word of ['ល.រ', 'No', 'ឈ្មោះទំនិញ', 'Name of Goods', 'ចំនួន', 'Quantity', 'តម្លៃរាយ', 'Unit Price', 'តម្លៃសរុប', 'Amount']) {
        expect(paper.textContent).toContain(word);
      }
    });

    it('has 9 numbered rows, the items first, then empty ones', () => {
      expect(rows(paper).length).toBe(9);
      expect(cells(rows(paper)[0])).toEqual(['1', 'MacBook Air 13" M1 · 8GB / 256GB', '1', '$799', '$799']);
      expect(cells(rows(paper)[1])).toEqual(['2', 'Laptop bag', '1', '$15', '$15']);
      expect(cells(rows(paper)[2])).toEqual(['3', 'Wireless mouse', '1', '$10', '$10']);
      expect(cells(rows(paper)[3])).toEqual(['4', '', '', '', '']);
      expect(cells(rows(paper)[8])).toEqual(['9', '', '', '', '']);
    });

    it('shows Total, Deposit and Balance', () => {
      expect(text(paper, '.invoice-total')).toBe('$824');
      expect(text(paper, '.invoice-deposit')).toBe('$824');
      expect(text(paper, '.invoice-balance')).toBe('$0');
      for (const word of ['សរុប / Total', 'កក់ប្រាក់ / Deposit', 'នៅខ្វះ / Balance']) expect(paper.textContent).toContain(word);
    });

    it('has the Seller signature line (not the Technician)', () => {
      expect(paper.textContent).toContain('អ្នកលក់ / The Seller');
      expect(paper.textContent).not.toContain('Technician');
    });

    it('has the shop\'s four rules, in order, with the warranty chosen', () => {
      expect(text(paper, '.invoice-warranty')).toBe('1. ធានារយៈពេល 2 សប្តាហ៍ (2 weeks) for Hardware');
      const rules = text(paper, '.invoice-rules');
      expect(rules).toContain('គោលការណ៍របស់យើងខ្ញុំ៖');
      expect(rules).toContain('2. រាល់ទំនិញដែលបានទិញរួច មិនអាចដូរយកប្រាក់វិញបានទេ។');
      expect(rules).toContain('(Goods sold are not returnable)');
      expect(rules).toContain('3. រាល់ផលិតផលមិនធានាលើដុំសាក និងអេក្រង់។');
      expect(rules).toContain('(No warranty on Adapter and screen)');
      expect(rules).toContain('4. មិនមានការធានាក្នុងករណី បែកបាក់ ប្រេះ ចូលទឹក ឬបាត់បង់គ្រឿងបន្លាស់។');
      expect(rules).toContain('(No warranty physical damage, crack, water damage)');
    });

    it('has no pickup box, booking policy, device or problem', () => {
      expect(one(paper, '.invoice-pickup')).toBeNull();
      expect(one(paper, '.invoice-policy')).toBeNull();
      expect(one(paper, '.invoice-device')).toBeNull();
      expect(one(paper, '.invoice-problem')).toBeNull();
    });
  });

  describe('the warranty rule', () => {
    it('says each of the three choices in Khmer and English', async () => {
      const paper = await show(SALE);
      for (const [warranty, line] of [
        ['1_week', '1. ធានារយៈពេល 1 សប្តាហ៍ (1 week) for Hardware'],
        ['2_weeks', '1. ធានារយៈពេល 2 សប្តាហ៍ (2 weeks) for Hardware'],
        ['1_month', '1. ធានារយៈពេល 1 ខែ (1 month) for Hardware'],
      ] as const) {
        refresh({ ...SALE, warranty });
        expect(text(paper, '.invoice-warranty')).toBe(line);
      }
    });

    it('says "No warranty" when there is none', async () => {
      const paper = await show({ ...SALE, warranty: 'none' });
      expect(text(paper, '.invoice-warranty')).toBe('1. គ្មានការធានា (No warranty)');
    });
  });

  describe('the paper of a booking', () => {
    let paper: HTMLElement;
    beforeEach(async () => { paper = await show(BOOKING); });

    it('says BOOKING and has the booking date', () => {
      expect(text(paper, '.invoice-chip')).toBe('វិក្កយបត្រកក់ · BOOKING');
      expect(text(paper, '.invoice-number')).toBe('000042');
      expect(text(paper, '.invoice-date')).toBe('ថ្ងៃទី 08 ខែ 11 ឆ្នាំ 2026');
    });

    it('has 5 rows (the policy box takes the rest of the room)', () => {
      expect(rows(paper).length).toBe(5);
      expect(cells(rows(paper)[0])).toEqual(['1', 'MacBook Air M5 | RAM 16GB | SSD 512GB', '1', '$1,050', '$1,050']);
    });

    it('shows the pickup date with the weekday', () => {
      expect(text(paper, '.invoice-pickup')).toContain('ថ្ងៃមកយក / Pickup date');
      expect(text(paper, '.invoice-pickup')).toContain('12/11/2026 (Thursday)');
    });

    it('shows the money: $1,050 total, $500 deposit, $550 still to pay', () => {
      expect(text(paper, '.invoice-total')).toBe('$1,050');
      expect(text(paper, '.invoice-deposit')).toBe('$500');
      expect(text(paper, '.invoice-balance')).toBe('$550');
    });

    it('has the Booking Policy: No Refunds, No Cancellations', () => {
      const policy = text(paper, '.invoice-policy');
      expect(policy).toContain('គោលការណ៍កក់ / Booking Policy');
      expect(policy).toContain('មិនសងប្រាក់វិញទេ · No Refunds');
      expect(policy).toContain('មិនអាចលុបចោលការកក់បានទេ · No Cancellations');
    });

    it('keeps the four hardware rules, with 1 month', () => {
      expect(text(paper, '.invoice-warranty')).toBe('1. ធានារយៈពេល 1 ខែ (1 month) for Hardware');
      expect(text(paper, '.invoice-rules')).toContain('4. មិនមានការធានា');
    });

    it('the customer line is empty when no name was given (it can be written by hand), the contact line is filled', () => {
      expect(text(paper, '.invoice-customer')).toBe('');
      expect(text(paper, '.invoice-contact')).toBe('011 968 240 · @Horth_Heng');
    });
  });

  describe('the paper of a repair', () => {
    let paper: HTMLElement;
    beforeEach(async () => { paper = await show(REPAIR); });

    it('says REPAIR', () => {
      expect(text(paper, '.invoice-chip')).toBe('វិក្កយបត្រជួសជុល · REPAIR');
    });

    it('has the device and the problem', () => {
      expect(text(paper, '.invoice-device')).toBe('Dell Inspiron 15 · 3520');
      expect(text(paper, '.invoice-problem')).toBe('Screen flickers, battery does not charge');
      expect(paper.textContent).toContain('ឧបករណ៍ / Device');
      expect(paper.textContent).toContain('បញ្ហា / Problem');
    });

    it('calls the table "Work and Parts" and has 7 rows', () => {
      expect(paper.textContent).toContain('ការងារ និងគ្រឿងបន្លាស់');
      expect(paper.textContent).toContain('Work and Parts');
      expect(paper.textContent).not.toContain('Name of Goods');
      expect(rows(paper).length).toBe(7);
      expect(cells(rows(paper)[2])).toEqual(['3', 'Service fee', '1', '$5', '$5']);
    });

    it('has the Technician signature line', () => {
      expect(paper.textContent).toContain('អ្នកជួសជុល / The Technician');
      expect(paper.textContent).not.toContain('The Seller');
    });

    it('has only the 3 rules that fit a repair, numbered 1 2 3, and the warranty is for repair work', () => {
      expect(text(paper, '.invoice-warranty')).toBe('1. ធានារយៈពេល 1 សប្តាហ៍ (1 week) for Repair work');
      const rules = text(paper, '.invoice-rules');
      expect(rules).not.toContain('not returnable');
      expect(rules).toContain('2. រាល់ផលិតផលមិនធានាលើដុំសាក និងអេក្រង់។');
      expect(rules).toContain('3. មិនមានការធានាក្នុងករណី');
      expect(rules).not.toContain('4. ');
    });

    it('shows the money: $60 total, $20 deposit, $40 balance', () => {
      expect(text(paper, '.invoice-total')).toBe('$60');
      expect(text(paper, '.invoice-deposit')).toBe('$20');
      expect(text(paper, '.invoice-balance')).toBe('$40');
    });

    it('has no pickup box and no booking policy', () => {
      expect(one(paper, '.invoice-pickup')).toBeNull();
      expect(one(paper, '.invoice-policy')).toBeNull();
    });
  });

  describe('details', () => {
    it('quantities multiply into the amount, and cents show with two digits', async () => {
      const paper = await show({ ...SALE, items: [{ name: 'Charger', qty: 3, unit_price: 12.5 }], total: 37.5, deposit: 0, balance: 37.5 });
      expect(cells(rows(paper)[0])).toEqual(['1', 'Charger', '3', '$12.50', '$37.50']);
      expect(text(paper, '.invoice-balance')).toBe('$37.50');
    });

    it('works out the balance when the API did not send it', async () => {
      const paper = await show({ ...SALE, balance: undefined, total: 1000, deposit: 250.5 });
      expect(text(paper, '.invoice-balance')).toBe('$749.50');
    });

    it('more items than the paper has rows still all show (nothing is lost)', async () => {
      const items = Array.from({ length: 11 }, (_, i) => ({ name: `Item ${i + 1}`, qty: 1, unit_price: 1 }));
      const paper = await show({ ...SALE, items, total: 11, deposit: 0 });
      expect(rows(paper).length).toBe(11);
      expect(cells(rows(paper)[10])[1]).toBe('Item 11');
    });

    it('a contact with only a phone, or only a Telegram, has no stray separator', async () => {
      const paper = await show({ ...SALE, telegram: null });
      expect(text(paper, '.invoice-contact')).toBe('012 345 678');
      refresh({ ...SALE, phone: null });
      expect(text(paper, '.invoice-contact')).toBe('@sok_dara');
      refresh({ ...SALE, phone: null, telegram: null });
      expect(text(paper, '.invoice-contact')).toBe('');
    });

    it('long item names can use two lines in their row (they are not cut to one)', async () => {
      const paper = await show({ ...SALE, items: [{ name: 'M'.repeat(90), qty: 1, unit_price: 1 }], total: 1, deposit: 0 });
      const name = one(paper, '.invoice-row-name')!;
      expect(getComputedStyle(name).whiteSpace).not.toBe('nowrap');
      expect(name.textContent).toContain('M'.repeat(90));
    });

    it('draws again when the invoice changes (same items kept, new items shown)', async () => {
      const paper = await show(SALE);
      refresh({ ...SALE, items: [{ name: 'Only one', qty: 2, unit_price: 5 }], total: 10 });
      expect(cells(rows(paper)[0])).toEqual(['1', 'Only one', '2', '$5', '$10']);
      expect(cells(rows(paper)[1])).toEqual(['2', '', '', '', '']);
    });

    it('a date that is not a date shows blanks instead of breaking', async () => {
      const paper = await show({ ...SALE, invoice_date: 'nonsense' });
      expect(text(paper, '.invoice-date')).toBe('ថ្ងៃទី ខែ ឆ្នាំ');
    });
  });
});
