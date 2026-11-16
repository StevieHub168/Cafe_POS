import {
  INVOICE_TYPES, MAX_DEVICE, MAX_LINES, MAX_NAME, MAX_PROBLEM, WARRANTY_CHOICES,
  formatInvoiceNumber, itemAmount, itemsTotal, typeInfo, warrantyInfo
} from './invoice.model';

describe('invoice model helpers', () => {
  describe('formatInvoiceNumber (6 digits, like the pad)', () => {
    it('pads with zeros', () => {
      expect(formatInvoiceNumber(41)).toBe('000041');
      expect(formatInvoiceNumber(1)).toBe('000001');
      expect(formatInvoiceNumber(500)).toBe('000500');
      expect(formatInvoiceNumber(123456)).toBe('123456');
    });

    it('never fails on rubbish', () => {
      expect(formatInvoiceNumber(null)).toBe('000000');
      expect(formatInvoiceNumber(undefined)).toBe('000000');
      expect(formatInvoiceNumber(NaN)).toBe('000000');
      expect(formatInvoiceNumber(-5)).toBe('000000');
      expect(formatInvoiceNumber(41.9)).toBe('000041');
    });
  });

  describe('money', () => {
    it('an item is quantity times price', () => {
      expect(itemAmount({ qty: 3, unit_price: 12.5 })).toBe(37.5);
      expect(itemAmount({ qty: 1, unit_price: 799 })).toBe(799);
    });

    it('is exact with cents', () => {
      expect(itemAmount({ qty: 2, unit_price: 0.99 })).toBe(1.98);
      expect(itemAmount({ qty: 3, unit_price: 0.1 })).toBe(0.3);
    });

    it('empty or odd values count as 0', () => {
      expect(itemAmount({ qty: NaN, unit_price: 5 })).toBe(0);
      expect(itemAmount({ qty: 2, unit_price: null as unknown as number })).toBe(0);
    });

    it('the total adds the items up (the same way the API does)', () => {
      expect(itemsTotal([{ qty: 1, unit_price: 799 }, { qty: 1, unit_price: 15 }, { qty: 1, unit_price: 10 }])).toBe(824);
      expect(itemsTotal([{ qty: 3, unit_price: 12.5 }, { qty: 2, unit_price: 0.99 }])).toBe(39.48);
      expect(itemsTotal([])).toBe(0);
    });
  });

  describe('what fits on the paper', () => {
    it('9 lines for a sale, 5 for a booking, 7 for a repair (the same numbers as the API)', () => {
      expect(MAX_LINES).toEqual({ sale: 9, booking: 5, repair: 7 });
    });

    it('text limits so nothing is cut off when printed (the same as the API)', () => {
      expect([MAX_NAME, MAX_DEVICE, MAX_PROBLEM]).toEqual([90, 80, 140]);
    });
  });

  describe('kinds and warranty', () => {
    it('three kinds, with their Khmer words', () => {
      expect(INVOICE_TYPES.map(t => t.value)).toEqual(['sale', 'booking', 'repair']);
      expect(typeInfo('booking')).toEqual({ value: 'booking', label: 'Booking', khmer: 'វិក្កយបត្រកក់' });
      expect(typeInfo('repair').label).toBe('Repair');
    });

    it('the warranty is 1 week, 2 weeks or 1 month (or none) - nothing else', () => {
      expect(WARRANTY_CHOICES.map(w => w.value)).toEqual(['1_week', '2_weeks', '1_month', 'none']);
      expect(warrantyInfo('2_weeks')).toEqual({ value: '2_weeks', label: '2 weeks', khmer: '2 សប្តាហ៍' });
      expect(warrantyInfo('1_month').khmer).toBe('1 ខែ');
      expect(warrantyInfo('1_week').label).toBe('1 week');
      expect(warrantyInfo('none').label).toBe('No warranty');
    });
  });
});
