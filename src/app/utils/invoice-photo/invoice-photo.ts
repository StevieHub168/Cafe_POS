import { Invoice } from '../../models/invoice/invoice.model';
import { Product } from '../../models/product/product.model';
import { Booking } from '../../models/booking/booking.model';

/** A name for comparing: no capitals, one space between words. */
const nameKey = (name: string | null | undefined): string => (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();

/** The cover photo of a product (the first one), or null. */
export function productCover(product: Pick<Product, 'images' | 'image_url'>): string | null {
  return product.images?.[0] || product.image_url || null;
}

/**
 * The names an invoice line could be known by in the catalogue: the whole line, and the part before a "|"
 * ("MacBook Air M5 | RAM 16GB | SSD 512GB" is the laptop "MacBook Air M5" with the specs written after it).
 */
function namesOf(text: string | null | undefined): string[] {
  const whole = nameKey(text);
  const first = nameKey((text ?? '').split('|')[0]);
  return whole ? (first && first !== whole ? [whole, first] : [whole]) : [];
}

/**
 * Which photo goes with which invoice, so the list can show WHAT was sold. The invoice itself only keeps names and prices,
 * so the photo is found again:
 *  1. a booking invoice: the photo of the laptop that was booked (the booking knows it);
 *  2. otherwise the first line (or, for a repair, the device) whose name is a product in the catalogue - sold laptops
 *     included, so give it ALL products, hidden ones too.
 * An invoice with no match has no entry (the page shows a grey box).
 */
export function buildInvoicePhotos(invoices: Invoice[], products: Product[], bookings: Booking[]): Map<number, string> {
  const byName = new Map<string, string>();
  for (const product of products) {
    const cover = productCover(product);
    const key = nameKey(product.name);
    if (cover && key && !byName.has(key)) byName.set(key, cover);
  }

  const byBooking = new Map<number, string>();
  for (const booking of bookings) {
    if (booking.id !== undefined && booking.product_image) byBooking.set(booking.id, booking.product_image);
  }

  const photos = new Map<number, string>();
  for (const invoice of invoices) {
    if (invoice.id === undefined) continue;
    const fromBooking = invoice.booking_id !== null ? byBooking.get(invoice.booking_id) : undefined;
    const photo = fromBooking
      ?? [invoice.device, ...invoice.items.map(item => item.name)]
        .flatMap(namesOf)
        .map(key => byName.get(key))
        .find(Boolean);
    if (photo) photos.set(invoice.id, photo);
  }
  return photos;
}
