import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { Product } from '../../models/product.model';
import { Booking } from '../../models/booking.model';
import { Repair } from '../../models/repair.model';
import { Invoice, formatInvoiceNumber, warrantyInfo } from '../../models/invoice.model';
import { ProductService } from '../../services/product.service';
import { BookingService } from '../../services/booking.service';
import { RepairService } from '../../services/repair.service';
import { InvoiceService } from '../../services/invoice.service';
import { ScanActionService } from '../../services/scan-action.service';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { daysFromToday, formatDate, weekdayName } from '../../utils/dates';
import { productCover } from '../../utils/invoice-photo';
import { formatMoney } from '../../utils/money';

/** Where the laptop is: on the shelf, set aside for a customer, in repair, or sold. */
export type ScanState = 'available' | 'booked' | 'repair' | 'sold';

interface Row { label: string; value: string; }

/** A name for comparing: no capitals, one space between words. */
const key = (text: string | null | undefined): string => (text ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
/** The names a laptop can be written as: the whole line, and the part before a "|" ("MacBook Air M5 | RAM 16GB" is "MacBook Air M5"). */
const namesOf = (text: string | null | undefined): string[] => [key(text), key((text ?? '').split('|')[0])].filter(Boolean);

/**
 * The screen a QR label opens (/l/LP-0042): the laptop, where it is now (Available / Booked / In repair / Sold) and what can be
 * done with it. Sell, Book and Repair open the same windows as the Menu; a booked, repaired or sold laptop shows its details and
 * a button to the page that handles it.
 */
@Component({
  selector: 'app-laptop-scan',
  standalone: true,
  imports: [CommonModule, ImgSrcPipe],
  template: `
    <div class="mx-auto w-full max-w-lg space-y-4 pb-6">
      <button type="button" (click)="toMenu()" data-action="back"
        class="inline-flex h-10 items-center gap-1 rounded-lg pr-3 text-sm font-medium text-gray-700 hover:bg-gray-100">
        <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15 5l-7 7 7 7" /></svg>
        Menu
      </button>

      <!-- loading -->
      <div *ngIf="isLoading" aria-busy="true" class="space-y-3" data-loading>
        <div class="h-48 animate-pulse rounded-xl bg-gray-200"></div>
        <div class="h-6 w-2/3 animate-pulse rounded bg-gray-200"></div>
        <div class="h-28 animate-pulse rounded-xl bg-gray-200"></div>
      </div>

      <!-- no laptop has this code -->
      <div *ngIf="!isLoading && notFound" data-not-found class="space-y-4 rounded-xl border border-surface-border bg-white p-5 text-center">
        <p class="text-base font-semibold text-gray-900">No laptop has the code {{ code }}.</p>
        <p class="text-sm text-gray-500">The label may be old, or the laptop was deleted.</p>
        <button type="button" (click)="toMenu()" class="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700">Go to the Menu</button>
      </div>

      <!-- the laptop could not be loaded -->
      <div *ngIf="!isLoading && problem" role="alert" data-problem class="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        <p>{{ problem }}</p>
        <button type="button" (click)="load()" data-action="retry" class="inline-flex h-10 items-center rounded-lg border border-red-200 bg-white px-4 font-medium text-red-700 hover:bg-red-50">Try again</button>
      </div>

      <ng-container *ngIf="product as laptop">
        <!-- the laptop -->
        <article class="overflow-hidden rounded-xl border border-surface-border bg-white">
          <div class="flex h-48 items-center justify-center bg-gray-100" data-photo>
            <img *ngIf="cover" [src]="cover | imgSrc" alt="" class="h-full w-full object-cover" />
            <svg *ngIf="!cover" class="h-16 w-16 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="11" rx="1.5" /><path d="M2 19h20" /></svg>
          </div>
          <div class="space-y-1 p-4">
            <h1 class="break-words text-xl font-semibold leading-tight text-gray-900" data-name>{{ laptop.name }}</h1>
            <p class="text-sm text-gray-500">
              <ng-container *ngIf="laptop.brand">{{ laptop.brand }} · </ng-container><span class="font-mono font-semibold text-gray-900" data-code>{{ laptop.code }}</span> · <span data-price>{{ price }}</span>
            </p>
          </div>
        </article>

        <!-- where it is now (not shown for a plain available laptop: the Sell button already says it) -->
        <section *ngIf="showStatus" class="space-y-3 rounded-xl border bg-white p-4" [ngClass]="style.border" data-status [attr.data-state]="state">
          <div class="flex items-center justify-between gap-3">
            <span class="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-bold" [ngClass]="style.pill" data-badge>
              <span class="h-2 w-2 rounded-full" [ngClass]="style.dot"></span>{{ label }}
            </span>
            <span *ngIf="hint as h" class="text-right text-sm font-semibold" [ngClass]="h.late ? 'text-red-600' : 'text-gray-600'" data-hint>{{ h.text }}</span>
          </div>
          <p class="text-sm text-gray-600" data-sentence>{{ sentence }}</p>
          <p *ngIf="detailsProblem" role="alert" class="text-sm text-red-600" data-details-problem>{{ detailsProblem }}</p>
          <dl *ngIf="rows.length" class="space-y-1.5 border-t border-surface-border pt-3 text-sm" data-rows>
            <div *ngFor="let row of rows" class="flex justify-between gap-4">
              <dt class="flex-shrink-0 text-gray-500">{{ row.label }}</dt>
              <dd class="break-words text-right font-medium text-gray-900">{{ row.value }}</dd>
            </div>
          </dl>
        </section>

        <!-- the specs -->
        <section *ngIf="specLines.length" class="space-y-1 rounded-xl border border-surface-border bg-white p-4 text-sm leading-relaxed text-gray-700" data-specs>
          <p *ngFor="let line of specLines" class="break-words">{{ line }}</p>
        </section>

        <!-- what can be done -->
        <section class="space-y-2.5" aria-label="Actions">
          <ng-container *ngIf="state === 'available'">
            <button type="button" (click)="start('sell')" [disabled]="outOfStock" data-action="sell"
              class="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">Sell</button>
            <div class="grid grid-cols-2 gap-2.5">
              <button type="button" (click)="start('book')" data-action="book"
                class="inline-flex h-12 items-center justify-center rounded-xl border border-surface-border bg-white px-4 text-base font-semibold text-gray-900 hover:bg-gray-50">Book</button>
              <button type="button" (click)="start('repair')" data-action="repair"
                class="inline-flex h-12 items-center justify-center rounded-xl border border-surface-border bg-white px-4 text-base font-semibold text-gray-900 hover:bg-gray-50">Repair</button>
            </div>
          </ng-container>

          <ng-container *ngIf="state === 'booked'">
            <button *ngIf="booking" type="button" (click)="pickup()" data-action="pickup"
              class="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700">Customer is here: Sell</button>
            <button type="button" (click)="go('/bookings')" data-action="bookings"
              class="inline-flex h-12 w-full items-center justify-center rounded-xl border border-surface-border bg-white px-4 text-base font-semibold text-gray-900 hover:bg-gray-50">Open Bookings</button>
          </ng-container>

          <ng-container *ngIf="state === 'repair'">
            <button type="button" (click)="go('/repairs')" data-action="repairs"
              class="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700">Open Repairs</button>
          </ng-container>

          <ng-container *ngIf="state === 'sold'">
            <button type="button" (click)="go('/sales')" data-action="sales"
              class="inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-base font-semibold text-white hover:bg-primary-700">Open Sales</button>
          </ng-container>

          <p *ngIf="state !== 'available'" class="text-xs leading-relaxed text-gray-500" data-locked>{{ lockedNote }}</p>
        </section>
      </ng-container>
    </div>
  `,
})
export class LaptopScanComponent implements OnInit, OnDestroy {
  /** The code on the label, e.g. "LP-0042". */
  code = '';
  product: Product | null = null;
  /** The booking that holds this laptop (when it is booked), the repair it is in, the sale it was sold in. */
  booking: Booking | null = null;
  repair: Repair | null = null;
  sale: Invoice | null = null;

  isLoading = true;
  notFound = false;
  /** The laptop itself could not be loaded. */
  problem = '';
  /** The laptop is there but its booking / repair / sale could not be loaded. */
  detailsProblem = '';

  private paramWatch?: Subscription;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private products: ProductService,
    private bookings: BookingService,
    private repairs: RepairService,
    private invoices: InvoiceService,
    private scan: ScanActionService
  ) { }

  ngOnInit(): void {
    // The address can change while the page stays (a second label scanned): load again.
    this.paramWatch = this.route.paramMap.subscribe(params => {
      this.code = (params.get('code') ?? '').trim().toUpperCase();
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.paramWatch?.unsubscribe();
  }

  load(): void {
    this.product = null;
    this.booking = null;
    this.repair = null;
    this.sale = null;
    this.notFound = false;
    this.problem = '';
    this.detailsProblem = '';
    this.isLoading = true;

    this.products.getProductByCode(this.code).subscribe({
      next: (product) => {
        this.product = product;
        this.loadDetails(product);
      },
      error: (err) => {
        this.isLoading = false;
        if (err?.status === 404 || err?.status === 400) this.notFound = true;
        else this.problem = 'Could not open the laptop. Check the internet and try again.';
      },
    });
  }

  /** Where the laptop is decides what else is needed: the booking, the repair or the sale. */
  private loadDetails(product: Product): void {
    const done = () => (this.isLoading = false);
    const failed = () => (this.detailsProblem = 'Could not load the details.');
    switch (this.stateOf(product)) {
      case 'booked':
        this.bookings.getBookings().pipe(finalize(done)).subscribe({
          next: (list) => (this.booking = this.newest(list.filter(b => b.product_id === product.id && b.status === 'booked'))),
          error: failed,
        });
        break;
      case 'repair':
        this.repairs.getRepairs().pipe(finalize(done)).subscribe({
          next: (list) => (this.repair = this.newest(list.filter(r => r.product_id === product.id && r.status === 'received'))),
          error: failed,
        });
        break;
      case 'sold':
        this.invoices.getInvoices('sale').pipe(finalize(done)).subscribe({
          next: (list) => (this.sale = this.saleOf(product, list)),
          error: failed,
        });
        break;
      default:
        done();
    }
  }

  /** The one that was made last. */
  private newest<T extends { id?: number }>(list: T[]): T | null {
    return list.reduce<T | null>((best, item) => (!best || (item.id ?? 0) > (best.id ?? 0) ? item : best), null);
  }

  /** The sale this laptop was sold in: the last Sale paper that has a line with its name. */
  private saleOf(product: Product, invoices: Invoice[]): Invoice | null {
    const names = namesOf(product.name);
    const hits = invoices.filter(i => i.items.some(item => namesOf(item.name).some(n => names.includes(n))));
    return hits.reduce<Invoice | null>((best, i) => (!best || i.number > best.number ? i : best), null);
  }

  // ---------- what the screen says ----------

  private stateOf(product: Product): ScanState {
    if (product.is_archived) return 'sold';
    if (product.hold_status === 'booked') return 'booked';
    if (product.hold_status === 'repair') return 'repair';
    return 'available';
  }

  get state(): ScanState {
    return this.product ? this.stateOf(this.product) : 'available';
  }

  /** A laptop with counted stock that has none left cannot be sold (it can still be booked). */
  get outOfStock(): boolean {
    const p = this.product;
    return !!p && this.state === 'available' && !!p.track_stock && p.stock_quantity <= 0;
  }

  /** The status card: always for a booked, repaired or sold laptop. For an available one only when its stock is counted (how many are left matters). */
  get showStatus(): boolean {
    const p = this.product;
    return !!p && (this.state !== 'available' || !!p.track_stock);
  }

  get label(): string {
    if (this.outOfStock) return 'Out of stock';
    return { available: 'Available', booked: 'Booked', repair: 'In repair', sold: 'Sold' }[this.state];
  }

  /** Colours of the status card. */
  get style(): { border: string; pill: string; dot: string } {
    if (this.outOfStock) return { border: 'border-red-200', pill: 'bg-red-100 text-red-800', dot: 'bg-red-700' };
    return {
      available: { border: 'border-green-200', pill: 'bg-green-100 text-green-800', dot: 'bg-green-700' },
      booked: { border: 'border-blue-200', pill: 'bg-blue-100 text-blue-800', dot: 'bg-blue-700' },
      repair: { border: 'border-amber-200', pill: 'bg-amber-100 text-amber-800', dot: 'bg-amber-700' },
      sold: { border: 'border-gray-300', pill: 'bg-gray-200 text-gray-700', dot: 'bg-gray-600' },
    }[this.state];
  }

  get sentence(): string {
    const p = this.product;
    if (!p) return '';
    switch (this.state) {
      case 'booked': return 'A customer booked this laptop. It is set aside for them.';
      case 'repair': return 'This laptop is in repair.';
      case 'sold': return 'This laptop was sold.';
      default:
        if (!p.track_stock) return 'Ready to sell. Nobody has booked it.';
        if (p.stock_quantity <= 0) return 'None left in stock. You can still book it.';
        if (p.stock_quantity <= p.min_stock_level) return `Only ${p.stock_quantity} left in stock.`;
        return `${p.stock_quantity} in stock and ready.`;
    }
  }

  /** The short line beside the status ("Pickup in 2 days"). */
  get hint(): { text: string; late: boolean } | null {
    if (this.state === 'booked' && this.booking) {
      const days = daysFromToday(this.booking.pickup_date);
      if (days === null) return null;
      if (days === 0) return { text: 'Pickup today', late: false };
      if (days === 1) return { text: 'Pickup tomorrow', late: false };
      if (days > 1) return { text: `Pickup in ${days} days`, late: false };
      return { text: `${-days} ${-days === 1 ? 'day' : 'days'} late`, late: true };
    }
    if (this.state === 'repair' && this.repair) {
      const days = daysFromToday(this.repair.received_date);
      if (days === null) return null;
      const spent = Math.max(0, -days);
      return { text: spent === 0 ? 'Received today' : `${spent} ${spent === 1 ? 'day' : 'days'} in repair`, late: false };
    }
    if (this.state === 'sold' && this.sale) return { text: formatDate(this.sale.invoice_date), late: false };
    return null;
  }

  /** The details of the booking / repair / sale. */
  get rows(): Row[] {
    const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(' · ');
    const b = this.booking;
    const r = this.repair;
    const s = this.sale;
    if (this.state === 'booked' && b) {
      const left = b.remaining_balance ?? Math.max(0, b.full_price - b.deposit);
      return [
        { label: 'Customer', value: join(b.telegram, b.phone) || 'Not written' },
        { label: 'Full price', value: formatMoney(b.full_price) },
        { label: 'Deposit', value: formatMoney(b.deposit) },
        { label: 'Balance to pay', value: formatMoney(left) },
        { label: 'Booked on', value: formatDate(b.booking_date) },
        { label: 'Pickup', value: `${formatDate(b.pickup_date)} (${weekdayName(b.pickup_date)})` },
      ];
    }
    if (this.state === 'repair' && r) {
      const rows: Row[] = [
        { label: 'Problem', value: r.problem },
        { label: 'Received', value: formatDate(r.received_date) },
        { label: 'Customer', value: join(r.customer_name, r.telegram, r.phone) || 'The shop' },
        { label: 'Back on', value: r.back_on ? formatDate(r.back_on) : 'Not set' },
      ];
      if (r.cost !== null && r.cost !== undefined) rows.push({ label: 'Repair cost', value: formatMoney(r.cost) });
      return rows;
    }
    if (this.state === 'sold' && s) {
      return [
        { label: 'Customer', value: join(s.customer_name, s.telegram, s.phone) || 'Not written' },
        { label: 'Price', value: formatMoney(s.total) },
        { label: 'Invoice', value: formatInvoiceNumber(s.number) },
        { label: 'Date', value: formatDate(s.invoice_date) },
        { label: 'Warranty', value: warrantyInfo(s.warranty).label },
      ];
    }
    return [];
  }

  /** Why Sell / Book / Repair are not here. */
  get lockedNote(): string {
    switch (this.state) {
      case 'booked': return 'It is booked, so Sell, Book and Repair are off for this laptop.';
      case 'repair': return 'Finish the repair first. Then the laptop is available again.';
      default: return 'It is sold, so Sell, Book and Repair are off for this laptop.';
    }
  }

  get cover(): string {
    return this.product ? productCover(this.product) ?? '' : '';
  }

  get price(): string {
    return this.product ? formatMoney(this.product.selling_price) : '';
  }

  /** All the spec lines, as they were written. */
  get specLines(): string[] {
    return (this.product?.description ?? '').split('\n').map(l => l.trim()).filter(l => l !== '');
  }

  // ---------- the buttons ----------

  /** Sell / Book / Repair: the Menu opens that window for this laptop. */
  start(kind: 'sell' | 'book' | 'repair'): void {
    const id = this.product?.id;
    if (id === undefined || this.state !== 'available') return;
    if (kind === 'sell' && this.outOfStock) return;
    this.scan.ask({ kind, productId: id });
    this.router.navigate(['/menu']);
  }

  /** "Customer is here": the Bookings page opens the pickup window of this booking. */
  pickup(): void {
    const id = this.booking?.id;
    if (id === undefined) return;
    this.scan.ask({ kind: 'pickup', bookingId: id });
    this.router.navigate(['/bookings']);
  }

  go(path: string): void {
    this.router.navigate([path]);
  }

  toMenu(): void {
    this.router.navigate(['/menu']);
  }
}
