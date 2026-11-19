import { Component, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription, finalize } from 'rxjs';
import { BookingService } from '../../services/booking/booking.service';
import { ProductService } from '../../services/product/product.service';
import { InvoiceService } from '../../services/invoice/invoice.service';
import { BOOKING_STATUSES, Booking, BookingStatus, PickupResult, statusOf } from '../../models/booking/booking.model';
import { Product } from '../../models/product/product.model';
import { BookingCounts } from '../../models/paged/paged.model';
import { Invoice, formatInvoiceNumber } from '../../models/invoice/invoice.model';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { PaginationComponent } from '../ui/pagination/pagination.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { StatusBadgeComponent } from '../ui/status-badge/status-badge.component';
import { ConfirmDialogComponent } from '../ui/confirm-dialog/confirm-dialog.component';
import { AskDialogComponent } from '../ui/ask-dialog/ask-dialog.component';
import { BookingFormComponent, BookingSaved } from './booking-form.component';
import { BookingPickupComponent } from './booking-pickup.component';
import { InvoiceEditorComponent } from '../invoices/invoice-editor.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { InvoiceSaved } from '../invoices/invoice-form.component';
import { PhotoStripComponent } from '../ui/photo-strip/photo-strip.component';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { ScanActionService } from '../../services/scan-action/scan-action.service';
import { daysFromToday, formatDate, todayIso, weekdayName } from '../../utils/dates/dates';
import { PageState, pageAfterShrink } from '../../utils/page-state/page-state';
import { formatMoney } from '../../utils/money/money';
import { invoicePrefillFromBooking } from '../../utils/invoice-prefill/invoice-prefill';
import { gaveBackNote, holdChangeNote } from '../../utils/stock-notes/stock-notes';
import { TelegramNotifier } from '../../services/telegram-notifier/telegram-notifier.service';

type Filter = BookingStatus | 'all';

/** How long after the last key the search is sent (so a word being typed is one request, not one per letter). */
const SEARCH_DELAY_MS = 300;

@Component({
  selector: 'app-bookings',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, ConfirmDialogComponent, AskDialogComponent, BookingFormComponent, BookingPickupComponent, InvoiceEditorComponent, InvoiceViewerComponent, PhotoStripComponent, SkeletonComponent, PaginationComponent, ImgSrcPipe],
  templateUrl: './bookings.component.html',
  styleUrl: './bookings.component.css'
})
export class BookingsComponent implements OnInit, OnDestroy {
  /** The bookings of the page on screen (the API sends one page, already narrowed by the tab and the search). */
  bookings: Booking[] = [];
  /** Where the list is: which page, how many on a page, how many bookings match in all. */
  readonly paging = new PageState(10);
  /** How many bookings are in each status (not narrowed by the search): the numbers of the tabs. null until the first answer. */
  counts: BookingCounts | null = null;
  /** Catalogue products: only used to suggest names / prices while a booking is typed. */
  products: Product[] = [];
  /** The grey shapes are shown: the first load, and every new page, tab or search. (After an action the list is read again quietly.) */
  isLoading = true;
  errorMessage = '';
  private loading?: Subscription;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  // Notice after an action (saved, cancelled...).
  successMessage = '';
  private successTimer: ReturnType<typeof setTimeout> | undefined;

  // Filter
  // (No "Picked up" tab: a booking that was picked up became a Sale, and leaves this page.)
  readonly tabs: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, ...BOOKING_STATUSES.filter(s => s.value !== 'picked_up')];
  statusFilter: Filter = 'all';
  searchQuery = '';

  // Drawer (new / edit): the form itself is <app-booking-form>
  showDrawer = false;
  /** The booking being edited (null = a new one). */
  editingBooking: Booking | null = null;
  @ViewChild(BookingFormComponent) private bookingForm?: BookingFormComponent;

  // Delete
  deleteTarget: Booking | null = null;
  isDeleting = false;
  deleteError = '';

  // Invoices: a booking can have ONE invoice (the paper). The button says "Invoice" until it exists, then "View invoice".
  private invoiceByBooking = new Map<number, Invoice>();
  /** The invoice writing window: null = closed. `prefill` starts a new one from a booking; `invoice` changes an existing one. */
  invoicing: { prefill: Partial<Invoice> | null; invoice: Invoice | null } | null = null;
  /** The invoice shown as paper (with Print...): null = closed. */
  viewingInvoice: Invoice | null = null;

  /** "Customer picked up" (the Sale is made there): the booking it is open for, null = closed. */
  pickingUp: Booking | null = null;

  /** "Cancel this booking?": the booking being asked about, null = closed. */
  cancelTarget: Booking | null = null;
  isCancelling = false;
  cancelError = '';

  constructor(
    private bookingService: BookingService,
    private productService: ProductService,
    private invoiceService: InvoiceService,
    private telegram: TelegramNotifier,
    private scanActions: ScanActionService
  ) { }

  ngOnInit(): void {
    this.loadBookings(true);
    this.loadInvoices();
    this.loadProducts();
  }

  /**
   * For suggestions and the laptop of a booking: if this fails, bookings still work (the Product box is just plain text).
   * A laptop that is booked or in repair is kept in the list (a booking holds its own laptop); the form does not suggest those.
   * Booking, cancelling and picking up change stock, so this is read again after them.
   */
  private loadProducts(): void {
    this.productService.getAllProducts(true).subscribe({
      next: (products) => (this.products = products.filter(p => !p.is_archived)),
      error: () => (this.products = [])
    });
  }

  /** Today. A method of its own so a test can pretend it is another day. */
  protected now(): Date {
    return new Date();
  }

  /** "YYYY-MM-DD" of today: a new booking starts with this booking date. */
  get today(): string {
    return todayIso(this.now());
  }

  /** Esc closes the top-most thing: the delete box, then the drawer. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.invoicing || this.viewingInvoice || this.pickingUp || this.cancelTarget) return;      // those windows close themselves (or must be answered)
    if (this.deleteTarget) this.cancelDelete();
    else if (this.showDrawer) this.closeDrawer();
  }

  // ---------- list ----------

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    clearTimeout(this.successTimer);
    this.loading?.unsubscribe();
  }

  /**
   * Reads the page on screen again. `withShapes`: show the grey shapes meanwhile (a new page, tab or search).
   * Once the customer picked the laptop up, it is a Sale: "All" leaves the picked-up ones out. (The record stays behind
   * the scenes, so the Sale and the Telegram clean-up can still find it.)
   */
  loadBookings(withShapes = false): void {
    if (withShapes) this.isLoading = true;
    this.loading?.unsubscribe();       // a slow answer to an older question must never replace a newer one
    const tab = this.statusFilter === 'all' ? { excludeStatus: 'picked_up' } : { status: this.statusFilter };
    this.loading = this.bookingService.getBookingPage(this.paging, { ...tab, search: this.searchQuery }).subscribe({
      next: (answer) => {
        // The last booking of this page is gone: go back to the last page that has bookings.
        const back = pageAfterShrink(this.paging.page, answer);
        if (back !== null) {
          this.paging.page = back;
          this.loadBookings(withShapes);
          return;
        }
        this.bookings = answer.results;
        this.paging.take(answer);
        this.counts = answer.meta?.counts ?? this.counts;
        this.isLoading = false;
        this.runScanAction();
      },
      error: (err) => {
        this.errorMessage = this.messageFrom(err, 'Failed to load bookings.');
        this.isLoading = false;
      }
    });
  }

  /** A tab: the first page of that tab. */
  setFilter(filter: Filter): void {
    if (this.statusFilter === filter) return;
    this.statusFilter = filter;
    this.paging.first();
    this.loadBookings(true);
  }

  /** Something was typed in the search box: it is sent when the typing stops. */
  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.paging.first();
      this.loadBookings(true);
    }, SEARCH_DELAY_MS);
  }

  goToPage(page: number): void {
    this.paging.page = page;
    this.loadBookings(true);
  }

  changePageSize(size: number): void {
    this.paging.perPage = size;
    this.paging.first();
    this.loadBookings(true);
  }

  /**
   * "Customer is here" on a scanned laptop sent us here: the pickup window of that booking opens by itself.
   * The booking is asked for by its number: it may be on another page (or in another tab) than the one on screen.
   */
  private runScanAction(): void {
    const action = this.scanActions.takePickup();
    if (!action) return;
    const notWaiting = () => (this.errorMessage = 'That booking is not waiting for pickup any more.');
    this.bookingService.getBooking(action.bookingId).subscribe({
      next: (booking) => (booking.status === 'booked' ? this.startPickup(booking) : notWaiting()),
      error: notWaiting
    });
  }

  /** How many bookings are in a tab (the API counts them: it knows them all, the page only has a few). "All" leaves out the picked-up ones. */
  countFor(filter: Filter): number {
    if (!this.counts) return 0;
    return filter === 'all' ? this.counts.booked + this.counts.cancelled : this.counts[filter];
  }

  trackById = (_: number, booking: Booking) => booking.id;

  // ---------- how a booking is shown ----------

  readonly money = formatMoney;
  readonly date = formatDate;
  readonly weekday = weekdayName;
  readonly statusOf = statusOf;

  /** "tel:" link: the number without spaces and brackets (a leading + is kept). */
  telHref(booking: Booking): string {
    return `tel:${(booking.phone ?? '').replace(/[^\d+]/g, '')}`;
  }

  telegramHref(booking: Booking): string {
    return `https://t.me/${(booking.telegram ?? '').replace(/^@/, '')}`;
  }

  /** A short reminder for bookings still waiting to be picked up: today, tomorrow, soon, or late. */
  pickupHint(booking: Booking): { text: string; late: boolean; soon: boolean } | null {
    if (booking.status !== 'booked') return null;
    const days = daysFromToday(booking.pickup_date, this.now());
    if (days === null) return null;
    if (days < 0) return { text: `Overdue by ${-days} ${days === -1 ? 'day' : 'days'}`, late: true, soon: false };
    if (days === 0) return { text: 'Pickup today', late: false, soon: true };
    if (days === 1) return { text: 'Pickup tomorrow', late: false, soon: true };
    if (days <= 7) return { text: `In ${days} days`, late: false, soon: false };
    return null;
  }

  remainingOf(booking: Booking): number {
    return booking.remaining_balance ?? Math.round((booking.full_price - booking.deposit) * 100) / 100;
  }

  // ---------- new / edit (the form lives in <app-booking-form>) ----------

  openAdd(): void {
    this.editingBooking = null;
    this.showDrawer = true;
  }

  openEdit(booking: Booking): void {
    this.editingBooking = booking;
    this.showDrawer = true;
  }

  /** Closes the drawer. The form throws away photos that were uploaded but not saved. */
  closeDrawer(): void {
    if (this.bookingForm?.isSubmitting) return;       // saving: wait
    this.showDrawer = false;
  }

  onSaved(result: BookingSaved): void {
    this.showDrawer = false;
    this.loadBookings();
    this.loadProducts();
    if (result.created && result.booking.status === 'booked') this.telegram.send('booking', result.booking.id);   // "Booking Details" with the laptop photo
    const note = holdChangeNote(result.created ? null : this.editingBooking, result.booking, 'booking');
    this.showSuccess([result.created ? 'Booking saved.' : 'Changes saved.', note].filter(Boolean).join(' '));
  }

  // ---------- invoices (made from a booking) ----------

  /** Which bookings already have an invoice. If this fails the buttons just say "Invoice". */
  private loadInvoices(): void {
    this.invoiceService.getInvoices().subscribe({
      next: (invoices) => {
        this.invoiceByBooking = new Map(invoices.filter(i => i.type === 'booking' && i.booking_id !== null).map(i => [i.booking_id as number, i]));
      },
      error: () => { /* the buttons still work */ }
    });
  }

  invoiceFor(booking: Booking): Invoice | undefined {
    return booking.id === undefined ? undefined : this.invoiceByBooking.get(booking.id);
  }

  /** What the invoice starts with: everything the booking already knows. */
  invoicePrefill(booking: Booking): Partial<Invoice> {
    return invoicePrefillFromBooking(booking);
  }

  /** "Invoice": opens the form filled from the booking. "View invoice": shows the paper that was already made. */
  openInvoice(booking: Booking): void {
    const existing = this.invoiceFor(booking);
    if (existing) this.viewingInvoice = existing;
    else this.invoicing = { prefill: this.invoicePrefill(booking), invoice: null };
  }

  /** After a save the paper opens straight away, so it can be printed. */
  onInvoiceSaved(result: InvoiceSaved): void {
    this.invoicing = null;
    this.viewingInvoice = result.invoice;
    this.loadInvoices();
  }

  /** From the paper's Edit button. */
  editViewedInvoice(): void {
    const invoice = this.viewingInvoice;
    if (!invoice) return;
    this.viewingInvoice = null;
    this.invoicing = { prefill: null, invoice };
  }

  // ---------- quick actions ----------

  // ---------- the numbers on top ----------

  /** Bookings still waiting for the customer. */
  get waitingForPickup(): number {
    return this.counts?.booked ?? 0;
  }

  // ---------- the customer picks the laptop up (the booking becomes a Sale) ----------

  /** The main button of a booked card: "Customer picked up · collect $550". */
  pickupLabel(booking: Booking): string {
    const left = this.remainingOf(booking);
    return left > 0 ? `Customer picked up · collect ${formatMoney(left)}` : 'Customer picked up';
  }

  startPickup(booking: Booking): void {
    this.errorMessage = '';
    this.pickingUp = booking;
  }

  /** The Sale was made: its paper opens so it can be printed, and the lists are loaded again. */
  onPickedUp(result: PickupResult): void {
    this.pickingUp = null;
    this.loadBookings();
    this.loadInvoices();
    this.viewingInvoice = result.invoice;
    this.loadProducts();
    this.telegram.send('sold', result.invoice.id, result.invoice);     // the Sold group: laptop photo + the invoice picture
    // hidden = a single laptop is sold now; stock_kept = its unit was taken when it was booked; stock_lowered = an old booking (no unit taken yet).
    const laptop = result.laptop === 'hidden' ? ' The laptop is marked as sold.'
      : result.laptop === 'stock_lowered' ? ' One less laptop in stock.'
      : result.laptop === 'stock_kept' ? ' Its stock was already taken when it was booked.' : '';
    this.showSuccess(`Sale ${formatInvoiceNumber(result.invoice.number)} made.${laptop}`);
    if (result.laptop === 'failed') {
      this.errorMessage = 'The sale was made, but the laptop could not be updated. Hide it from the Menu in Products.';
    }
  }

  /** The customer changed their mind or someone was faster: the list is loaded again so it tells the truth. */
  closePickup(): void {
    this.pickingUp = null;
    this.loadBookings();
  }

  // ---------- cancel a booking (it stays in the list as "Cancelled") ----------

  askToCancel(booking: Booking): void {
    this.cancelError = '';
    this.cancelTarget = booking;
  }

  get cancelDetail(): string {
    const booking = this.cancelTarget;
    if (!booking) return '';
    return [`It stays in the list as Cancelled. The deposit of ${formatMoney(booking.deposit)} was taken on ${formatDate(booking.booking_date)}.`,
      gaveBackNote(booking)].filter(Boolean).join(' ');
  }

  keepBooking(): void {
    if (this.isCancelling) return;
    this.cancelTarget = null;
    this.cancelError = '';
  }

  confirmCancel(): void {
    const booking = this.cancelTarget;
    if (!booking?.id || this.isCancelling) return;
    this.isCancelling = true;
    this.cancelError = '';
    this.bookingService.updateBooking(booking.id, { status: 'cancelled' }).pipe(finalize(() => (this.isCancelling = false))).subscribe({
      next: () => {
        this.cancelTarget = null;
        this.loadBookings();
        this.loadProducts();
        this.showSuccess(['Booking cancelled.', gaveBackNote(booking)].filter(Boolean).join(' '));
      },
      error: (err) => (this.cancelError = this.messageFrom(err, 'Failed to cancel the booking.'))
    });
  }

  // ---------- delete ----------

  askToDelete(booking: Booking): void {
    this.deleteError = '';
    this.deleteTarget = booking;
  }

  /** Extra line for the box: a deposit is money the shop is holding, so say it before the record goes. */
  get deleteWarning(): string {
    const booking = this.deleteTarget;
    if (!booking || booking.status !== 'booked') return '';
    return [booking.deposit > 0 ? `A deposit of ${formatMoney(booking.deposit)} is recorded on this booking.` : '', gaveBackNote(booking)].filter(Boolean).join(' ');
  }

  get deleteDetail(): string {
    const booking = this.deleteTarget;
    if (!booking) return '';
    const contact = booking.phone || booking.telegram || '';
    return [contact, `Pickup ${formatDate(booking.pickup_date)}`].filter(Boolean).join(' · ');
  }

  cancelDelete(): void {
    if (this.isDeleting) return;
    this.deleteTarget = null;
    this.deleteError = '';
  }

  confirmDeleteNow(): void {
    const booking = this.deleteTarget;
    if (!booking?.id || this.isDeleting) return;
    this.isDeleting = true;
    this.deleteError = '';
    this.bookingService.deleteBooking(booking.id).pipe(finalize(() => (this.isDeleting = false))).subscribe({
      next: () => {
        this.deleteTarget = null;
        this.loadBookings();
        this.loadProducts();
        this.showSuccess(['Booking deleted.', booking.status === 'booked' ? gaveBackNote(booking) : ''].filter(Boolean).join(' '));
      },
      // Stay open and say why, so the message is where you are looking.
      error: (err) => (this.deleteError = this.messageFrom(err, 'Failed to delete the booking.'))
    });
  }

  // ---------- small helpers ----------

  private showSuccess(message: string): void {
    this.successMessage = message;
    clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => (this.successMessage = ''), 4000);
  }

  private messageFrom(err: any, fallback: string): string {
    return err?.error?.error || fallback;
  }
}
