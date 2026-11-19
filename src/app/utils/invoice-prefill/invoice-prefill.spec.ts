import { Booking } from '../../models/booking/booking.model';
import { Product } from '../../models/product/product.model';
import { Repair } from '../../models/repair/repair.model';
import { Invoice } from '../../models/invoice/invoice.model';
import { invoicePrefillForSale, invoicePrefillFromBooking, invoicePrefillFromRepair, repairPrefillForProduct, repairPrefillFromSale } from './invoice-prefill';

const BOOKING: Booking = {
  id: 5, product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
  full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12', status: 'booked',
};
const PRODUCT: Product = {
  id: 1, sku: 'MAC-005', name: 'MacBook Air 13" M1', category_id: 1, brand: 'Apple', model: 'Air 13', selling_price: 799,
  stock_quantity: 1, min_stock_level: 0, is_archived: false,
};

const REPAIR: Repair = {
  id: 8, product_id: null, device: 'Dell Inspiron 15', customer_name: 'Vanna Chea', phone: '099 111 222', telegram: '@vanna',
  problem: 'Screen flickers', received_date: '2026-11-10', back_on: null, cost: 60, status: 'received', fixed_date: null, picked_up_date: null,
  sale_invoice_id: null,
};
const SALE: Invoice = {
  id: 44, number: 44, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara',
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '1_week', deposit: 799, total: 799, balance: 0,
  items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }, { name: 'Bag', qty: 1, unit_price: 10 }],
};

describe('invoice pre-fill helpers', () => {
  describe('from a booking', () => {
    it('starts a booking invoice with everything the booking knows', () => {
      expect(invoicePrefillFromBooking(BOOKING)).toEqual({
        type: 'booking', booking_id: 5, invoice_date: '2026-11-08', phone: '011968240', telegram: '@Horth_Heng', pickup_date: '2026-11-12',
        items: [{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1050 }], deposit: 500,
      });
    });

    it('cuts a product name that is longer than the paper holds (90 characters)', () => {
      expect(invoicePrefillFromBooking({ ...BOOKING, product_name: 'M'.repeat(120) }).items![0].name).toBe('M'.repeat(90));
    });

    it('a booking with no phone or Telegram keeps them empty', () => {
      const prefill = invoicePrefillFromBooking({ ...BOOKING, phone: null, telegram: null });
      expect(prefill.phone).toBeNull();
      expect(prefill.telegram).toBeNull();
    });
  });

  describe('for a sale of a laptop', () => {
    it('has one line: the laptop, 1 piece, its price', () => {
      expect(invoicePrefillForSale(PRODUCT)).toEqual({ type: 'sale', items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }] });
    });

    it('turns a price that arrives as text (MySQL) into a number', () => {
      expect(invoicePrefillForSale({ ...PRODUCT, selling_price: '799.00' as unknown as number }).items![0].unit_price).toBe(799);
    });

    it('cuts a long name to what the paper holds', () => {
      expect(invoicePrefillForSale({ ...PRODUCT, name: 'N'.repeat(120) }).items![0].name.length).toBe(90);
    });
  });

  describe('the invoice of a repair job', () => {
    it('starts with the job\'s device, problem and customer, points back at the job, and puts the cost on a line', () => {
      expect(invoicePrefillFromRepair(REPAIR)).toEqual({
        type: 'repair', repair_id: 8, customer_name: 'Vanna Chea', phone: '099 111 222', telegram: '@vanna',
        device: 'Dell Inspiron 15', problem: 'Screen flickers', items: [{ name: 'Repair', qty: 1, unit_price: 60 }],
      });
    });

    it('has no item line when the cost is not set (or 0): the lines are written by hand', () => {
      expect(invoicePrefillFromRepair({ ...REPAIR, cost: null }).items).toBeUndefined();
      expect(invoicePrefillFromRepair({ ...REPAIR, cost: 0 }).items).toBeUndefined();
    });

    it('cuts a long device to what fits on one line (80 characters)', () => {
      expect(invoicePrefillFromRepair({ ...REPAIR, device: 'D'.repeat(120) }).device!.length).toBe(80);
    });

    it('a job that has no id yet gives no link', () => {
      expect(invoicePrefillFromRepair({ ...REPAIR, id: undefined }).repair_id).toBeNull();
    });
  });

  describe('a new repair for a laptop of the shop', () => {
    it('knows the laptop and uses its name as the device', () => {
      expect(repairPrefillForProduct(PRODUCT)).toEqual({ product_id: 1, device: 'MacBook Air 13" M1' });
    });

    it('cuts a long name to what fits (80 characters)', () => {
      expect(repairPrefillForProduct({ ...PRODUCT, name: 'D'.repeat(120) }).device!.length).toBe(80);
    });
  });

  describe('a new repair for a laptop the shop SOLD (warranty)', () => {
    it('knows the buyer and the Sale, and uses the first line of the Sale as the device', () => {
      expect(repairPrefillFromSale(SALE)).toEqual({
        device: 'MacBook Air 13" M1', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@sok_dara', sale_invoice_id: 44,
      });
    });

    it('a Sale with no lines gives an empty device (nothing breaks)', () => {
      expect(repairPrefillFromSale({ ...SALE, items: [] }).device).toBe('');
    });
  });
});
