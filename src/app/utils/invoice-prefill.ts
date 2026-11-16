import { Booking } from '../models/booking.model';
import { Invoice, MAX_DEVICE, MAX_NAME } from '../models/invoice.model';
import { Product } from '../models/product.model';
import { MAX_REPAIR_DEVICE, Repair } from '../models/repair.model';

/** What a booking invoice starts with: everything the booking already knows. The customer's name is not known: it can be typed. */
export function invoicePrefillFromBooking(booking: Booking): Partial<Invoice> {
  return {
    type: 'booking',
    booking_id: booking.id ?? null,
    invoice_date: booking.booking_date,
    phone: booking.phone,
    telegram: booking.telegram,
    pickup_date: booking.pickup_date,
    items: [{ name: booking.product_name.slice(0, MAX_NAME), qty: 1, unit_price: booking.full_price }],
    deposit: booking.deposit
  };
}

/** A sale invoice for one laptop: its name and price are on the first line (the person can change them). */
export function invoicePrefillForSale(product: Product): Partial<Invoice> {
  return {
    type: 'sale',
    items: [{ name: product.name.slice(0, MAX_NAME), qty: 1, unit_price: Number(product.selling_price) }]
  };
}

/** The invoice of a repair job: the job's device, problem and customer, and the cost on a line when it is already set. */
export function invoicePrefillFromRepair(repair: Repair): Partial<Invoice> {
  return {
    type: 'repair',
    repair_id: repair.id ?? null,
    customer_name: repair.customer_name,
    phone: repair.phone,
    telegram: repair.telegram,
    device: repair.device.slice(0, MAX_DEVICE),
    problem: repair.problem,
    items: repair.cost !== null && repair.cost > 0 ? [{ name: 'Repair', qty: 1, unit_price: repair.cost }] : undefined
  };
}

/** A new repair for a laptop of the shop (picked in the Menu): its name is the device. */
export function repairPrefillForProduct(product: Product): Partial<Repair> {
  return { product_id: product.id ?? null, device: product.name.slice(0, MAX_REPAIR_DEVICE) };
}

/** A new repair for a laptop the shop SOLD (a warranty repair): the buyer and the Sale are filled in. */
export function repairPrefillFromSale(sale: Invoice): Partial<Repair> {
  return {
    device: (sale.items[0]?.name ?? '').slice(0, MAX_REPAIR_DEVICE),
    customer_name: sale.customer_name,
    phone: sale.phone,
    telegram: sale.telegram,
    sale_invoice_id: sale.id ?? null
  };
}
