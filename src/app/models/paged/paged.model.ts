/**
 * One page of a list, as the API answers it when the address has `page` / `per_page`:
 *   GET /api/invoices?type=sale&page=2&per_page=10
 * `meta` carries the extra numbers of that list (e.g. how many sales there are in each tab).
 */
export interface Paged<T, M = unknown> {
  page: number;
  per_page: number;
  total: number;
  /** At least 1, also for an empty list. */
  total_pages: number;
  results: T[];
  meta?: M;
}

/** The numbers of the tabs of the Sales page (not narrowed by the search). */
export interface SalesCounts { all: number; month: number; warranty: number }
/** How many bookings are in each status. */
export type BookingCounts = Record<'booked' | 'picked_up' | 'cancelled', number>;
/** How many repairs are in each step. */
export type RepairCounts = Record<'received' | 'fixed' | 'picked_up', number>;
