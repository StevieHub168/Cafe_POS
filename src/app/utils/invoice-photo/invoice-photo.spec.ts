import { buildInvoicePhotos, productCover } from './invoice-photo';
import { Invoice } from '../../models/invoice/invoice.model';
import { Product } from '../../models/product/product.model';
import { Booking } from '../../models/booking/booking.model';

const invoice = (over: Partial<Invoice>): Invoice => ({
  id: 1, number: 41, type: 'sale', invoice_date: '2026-11-10', customer_name: null, phone: null, telegram: null, device: null, problem: null,
  pickup_date: null, booking_id: null, warranty: '1_week', deposit: 0, total: 0, items: [{ name: 'Nothing', qty: 1, unit_price: 0 }], ...over,
});
const product = (name: string, over: Partial<Product> = {}): Product => ({
  id: 1, sku: 'S', name, category_id: 1, selling_price: 1, stock_quantity: 1, min_stock_level: 0, is_archived: false,
  image_url: `/uploads/${name}.png`, images: [`/uploads/${name}.png`], ...over,
});
const booking = (over: Partial<Booking>): Booking => ({
  id: 5, product_id: null, product_name: 'x', phone: null, telegram: null, full_price: 1, deposit: 0, booking_date: '2026-11-10',
  pickup_date: '2026-11-12', status: 'booked', product_image: null, ...over,
});

describe('productCover', () => {
  it('is the first photo', () => {
    expect(productCover({ images: ['/a.png', '/b.png'], image_url: '/z.png' })).toBe('/a.png');
  });
  it('falls back to image_url, then to nothing', () => {
    expect(productCover({ images: [], image_url: '/z.png' })).toBe('/z.png');
    expect(productCover({ image_url: '/z.png' })).toBe('/z.png');
    expect(productCover({ images: [], image_url: null })).toBeNull();
    expect(productCover({})).toBeNull();
  });
});

describe('buildInvoicePhotos', () => {
  it('finds the photo by the name of a line, ignoring capitals and extra spaces', () => {
    const photos = buildInvoicePhotos([invoice({ items: [{ name: ' DELL   xps 13', qty: 1, unit_price: 1 }] })], [product('Dell XPS 13')], []);
    expect(photos.get(1)).toBe('/uploads/Dell XPS 13.png');
  });

  it('uses the first line that is a product (a bag on line 1 does not hide the laptop on line 2)', () => {
    const photos = buildInvoicePhotos([invoice({ items: [{ name: 'Bag', qty: 1, unit_price: 1 }, { name: 'Dell XPS 13', qty: 1, unit_price: 1 }] })], [product('Dell XPS 13')], []);
    expect(photos.get(1)).toBe('/uploads/Dell XPS 13.png');
  });

  it('finds a laptop written with specs after a "|" by the part before it', () => {
    const photos = buildInvoicePhotos([invoice({ items: [{ name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', qty: 1, unit_price: 1 }] })], [product('MacBook Air M5')], []);
    expect(photos.get(1)).toBe('/uploads/MacBook Air M5.png');
  });

  it('prefers the whole name to the part before "|"', () => {
    const photos = buildInvoicePhotos(
      [invoice({ items: [{ name: 'Air | 16GB', qty: 1, unit_price: 1 }] })],
      [product('Air', { image_url: '/short.png', images: ['/short.png'] }), product('Air | 16GB', { image_url: '/long.png', images: ['/long.png'] })], []);
    expect(photos.get(1)).toBe('/long.png');
  });

  it('a booking invoice takes the photo the booking knows, before any name match', () => {
    const photos = buildInvoicePhotos(
      [invoice({ type: 'booking', booking_id: 5, items: [{ name: 'Dell XPS 13', qty: 1, unit_price: 1 }] })],
      [product('Dell XPS 13')], [booking({ id: 5, product_image: '/uploads/booked.png' })]);
    expect(photos.get(1)).toBe('/uploads/booked.png');
  });

  it('a booking with no photo falls back to the names', () => {
    const photos = buildInvoicePhotos(
      [invoice({ type: 'booking', booking_id: 5, items: [{ name: 'Dell XPS 13', qty: 1, unit_price: 1 }] })],
      [product('Dell XPS 13')], [booking({ id: 5, product_image: null })]);
    expect(photos.get(1)).toBe('/uploads/Dell XPS 13.png');
  });

  it('a repair uses the device name', () => {
    const photos = buildInvoicePhotos([invoice({ type: 'repair', device: 'Dell XPS 13', items: [{ name: 'Battery', qty: 1, unit_price: 1 }] })], [product('Dell XPS 13')], []);
    expect(photos.get(1)).toBe('/uploads/Dell XPS 13.png');
  });

  it('has no entry when nothing matches, or the product has no photo', () => {
    expect(buildInvoicePhotos([invoice({})], [product('Other')], []).has(1)).toBeFalse();
    expect(buildInvoicePhotos([invoice({ items: [{ name: 'Dell XPS 13', qty: 1, unit_price: 1 }] })], [product('Dell XPS 13', { images: [], image_url: null })], []).has(1)).toBeFalse();
  });

  it('each invoice gets its own photo', () => {
    const photos = buildInvoicePhotos(
      [invoice({ id: 1, items: [{ name: 'A', qty: 1, unit_price: 1 }] }), invoice({ id: 2, items: [{ name: 'B', qty: 1, unit_price: 1 }] })],
      [product('A'), product('B')], []);
    expect([photos.get(1), photos.get(2)]).toEqual(['/uploads/A.png', '/uploads/B.png']);
  });

  it('skips an invoice with no id, and an empty name never matches a product with an empty name', () => {
    expect(buildInvoicePhotos([invoice({ id: undefined, items: [{ name: 'A', qty: 1, unit_price: 1 }] })], [product('A')], []).size).toBe(0);
    expect(buildInvoicePhotos([invoice({ items: [{ name: '  ', qty: 1, unit_price: 1 }] })], [product('  ')], []).size).toBe(0);
  });

  it('nothing at all gives an empty answer', () => {
    expect(buildInvoicePhotos([], [], []).size).toBe(0);
  });
});
