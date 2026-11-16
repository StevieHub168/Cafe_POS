import { StatusTone } from '../components/ui/status-badge.component';
import { Invoice, Warranty } from './invoice.model';

export type BookingStatus = 'booked' | 'picked_up' | 'cancelled';

/** A customer reserves a laptop with a deposit and picks it up on a set date. */
export interface Booking {
  id?: number;
  /** The catalogue product that was picked, if any (null for a laptop that is not in Products, or a product deleted later). */
  product_id: number | null;
  /** As booked, e.g. "MacBook Air M5 | RAM 16GB | SSD 512GB". */
  product_name: string;
  phone: string | null;
  /** Always "@username". */
  telegram: string | null;
  full_price: number;
  deposit: number;
  /** full_price - deposit (worked out by the API). */
  remaining_balance?: number;
  /** "YYYY-MM-DD". */
  booking_date: string;
  /** "YYYY-MM-DD". */
  pickup_date: string;
  status: BookingStatus;
  /** Photos attached to the booking, e.g. the deposit receipt (up to 4, uploaded through this app). */
  images?: string[];
  /** Photo of the linked product, if there is one. */
  product_image?: string | null;
  /** The Sale that was made when the customer picked the laptop up. */
  sale_invoice_id?: number | null;
  sale_invoice_number?: number | null;
  /** This booking took one laptop off the shelf (counted stock: one less, a single laptop: set aside). It is given back when the booking is cancelled or deleted. */
  stock_held?: boolean;
  /** Of the laptop of the shop: true = counted stock, false = a single laptop, null = no laptop of the shop. */
  product_track_stock?: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/** What the customer's pickup needs: the warranty is asked, the rest starts from the booking. */
export interface PickupInput {
  warranty: Warranty;
  customer_name?: string;
  phone?: string | null;
  telegram?: string | null;
}

/** What the API answers: the closed booking, the Sale (paper) and what happened to the laptop. */
export interface PickupResult {
  booking: Booking;
  invoice: Invoice;
  /** hidden = left the Menu, stock_kept = its unit was already taken when it was booked, stock_lowered = one less in stock (an old booking),
   *  none = no laptop of the shop, failed = could not update it. */
  laptop: 'hidden' | 'stock_kept' | 'stock_lowered' | 'none' | 'failed';
}

/** What is sent to the API when saving (the API fills in the rest). */
export type BookingInput = Omit<Booking, 'id' | 'remaining_balance' | 'product_image' | 'stock_held' | 'product_track_stock' | 'created_at' | 'updated_at'>;

export const BOOKING_STATUSES: { value: BookingStatus; label: string; tone: StatusTone }[] = [
  { value: 'booked', label: 'Booked', tone: 'info' },
  { value: 'picked_up', label: 'Picked up', tone: 'success' },
  { value: 'cancelled', label: 'Cancelled', tone: 'neutral' },
];

export function statusOf(status: BookingStatus): { value: BookingStatus; label: string; tone: StatusTone } {
  return BOOKING_STATUSES.find(s => s.value === status) ?? BOOKING_STATUSES[0];
}
