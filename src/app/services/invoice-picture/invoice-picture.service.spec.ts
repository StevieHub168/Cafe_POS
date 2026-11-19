import { TestBed } from '@angular/core/testing';
import { InvoicePictureService } from './invoice-picture.service';
import { Invoice } from '../../models/invoice/invoice.model';

const SALE: Invoice = {
  id: 7, number: 44, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: '@soklea',
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '1_week', deposit: 1299, total: 1299, balance: 0,
  items: [{ name: 'MacBook Air 15" M3', qty: 1, unit_price: 1299 }],
};

describe('InvoicePictureService (the picture of an invoice, made without showing it)', () => {
  let service: InvoicePictureService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(InvoicePictureService);
  });

  it('gives a real PNG picture as a data address', async () => {
    const url = await service.makeDataUrl(SALE);
    expect(url.startsWith('data:image/png;base64,')).toBeTrue();
    const bytes = Uint8Array.from(atob(url.split(',')[1]), c => c.charCodeAt(0));
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);       // the PNG signature
    expect(bytes.length).toBeGreaterThan(5000);                                      // a whole page, not an empty box
  }, 20000);

  it('leaves nothing behind on the page (the paper is drawn off to the side and thrown away)', async () => {
    const before = document.querySelectorAll('app-invoice-paper').length;
    await service.makeDataUrl(SALE);
    expect(document.querySelectorAll('app-invoice-paper').length).toBe(before);
  }, 20000);

  it('can be used again and again', async () => {
    const one = await service.makeDataUrl(SALE);
    const two = await service.makeDataUrl({ ...SALE, number: 45 });
    expect(one).not.toBe(two);                                                       // the number is on the paper
  }, 30000);
});
