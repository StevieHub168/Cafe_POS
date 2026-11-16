import { Injectable } from '@angular/core';

/** Sell, Book or Repair this laptop (the Menu opens its window). */
export interface LaptopAction {
  kind: 'sell' | 'book' | 'repair';
  productId: number;
}

/** "Customer is here": the customer of this booking picks the laptop up (the Bookings page opens its pickup window). */
export interface PickupAction {
  kind: 'pickup';
  bookingId: number;
}

/** What the scan screen asks of the next page. It only counts for a short time: a forgotten request must never open a window later. */
const MAX_WAIT_MS = 60_000;

/**
 * The scan screen shows a laptop and its buttons, but selling, booking, repairing and picking up already have their windows
 * (in the Menu and in Bookings). The scan screen asks here, then sends the person to that page, which takes the request
 * and opens the window by itself. Nothing is stored: a reload forgets it.
 */
@Injectable({ providedIn: 'root' })
export class ScanActionService {
  private waiting: { action: LaptopAction | PickupAction; at: number } | null = null;

  ask(action: LaptopAction | PickupAction): void {
    this.waiting = { action, at: Date.now() };
  }

  /** The Menu takes a Sell / Book / Repair request (once). */
  takeLaptop(): LaptopAction | null {
    return this.take<LaptopAction>(a => a.kind !== 'pickup');
  }

  /** The Bookings page takes a pickup request (once). */
  takePickup(): PickupAction | null {
    return this.take<PickupAction>(a => a.kind === 'pickup');
  }

  private take<T extends LaptopAction | PickupAction>(wanted: (action: LaptopAction | PickupAction) => boolean): T | null {
    const waiting = this.waiting;
    if (!waiting || !wanted(waiting.action)) return null;
    this.waiting = null;
    return Date.now() - waiting.at <= MAX_WAIT_MS ? (waiting.action as T) : null;
  }
}
