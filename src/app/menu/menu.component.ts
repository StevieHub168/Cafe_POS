import { Component, ElementRef, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { Product } from '../models/product.model';
import { Booking } from '../models/booking.model';
import { Invoice, InvoiceType } from '../models/invoice.model';
import { Category } from '../models/category.model';
import { ProductService } from '../services/product.service';
import { CategoryService } from '../services/category.service';
import { ImgSrcPipe } from '../pipes/img-src.pipe';
import { StatusBadgeComponent } from '../components/ui/status-badge/status-badge.component';
import { SkeletonComponent } from '../components/ui/skeleton/skeleton.component';
import { BrandLogoComponent } from '../components/ui/brand-logo/brand-logo.component';
import { StockInfo, stockInfo } from '../models/stock-status';
import { AskDialogComponent } from '../components/ui/ask-dialog/ask-dialog.component';
import { BookingFormComponent, BookingSaved } from '../components/bookings/booking-form.component';
import { InvoiceEditorComponent } from '../components/invoices/invoice-editor.component';
import { InvoiceViewerComponent } from '../components/invoices/invoice-viewer.component';
import { InvoiceSaved } from '../components/invoices/invoice-form.component';
import { invoicePrefillForSale, invoicePrefillFromBooking, invoicePrefillFromRepair, repairPrefillForProduct } from '../utils/invoice-prefill';
import { Repair } from '../models/repair.model';
import { tookNote } from '../utils/stock-notes';
import { TelegramNotifier } from '../services/telegram-notifier.service';
import { ScanActionService } from '../services/scan-action.service';
import { RepairFormComponent, RepairSaved } from '../components/repairs/repair-form.component';
import { formatInvoiceNumber } from '../models/invoice.model';
import { todayIso } from '../utils/dates';

/** The question after a booking: make its invoice now? */
type Asking = { booking: Booking };

/** A sale of one of the shop's laptops: the laptop is marked as sold by itself when the invoice is saved. This is what is asked again
 *  next to the invoice paper ONLY when that did not work (e.g. no internet): the person tries again, or says "Not now". */
interface SoldReview {
  product: Product;
  /** How many were sold: the quantity on the invoice line of this laptop (1 if there is none). */
  qty: number;
  invoice: Invoice;
}
@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [CommonModule, FormsModule, ImgSrcPipe, SkeletonComponent, StatusBadgeComponent, BrandLogoComponent, AskDialogComponent, BookingFormComponent, InvoiceEditorComponent, InvoiceViewerComponent, RepairFormComponent],
  templateUrl: './menu.component.html',
  styleUrl: './menu.component.css'
})
export class MenuComponent implements OnInit {
  searchQuery = '';
  selectedCategoryId: number | null = null;
  selectedBrand: string | null = null;
  products: Product[] = [];
  categories: Category[] = [];
  isLoading = false;
  errorMessage = '';

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private telegram: TelegramNotifier,
    private scanActions: ScanActionService
  ) { }

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.categoryService.getCategories().subscribe({
      next: (categories) => (this.categories = categories),
      error: () => (this.errorMessage = 'Failed to load categories')
    });

    this.productService.getAllProducts().subscribe({
      next: (products) => {
        this.products = products;
        this.isLoading = false;
        this.runScanAction();
      },
      error: () => {
        this.errorMessage = 'Failed to load products';
        this.isLoading = false;
      }
    });
  }

  get filteredProducts(): Product[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.products.filter(product => {
      const matchesSearch = !q ||
        product.name.toLowerCase().includes(q) ||
        product.sku.toLowerCase().includes(q) ||
        (product.code || '').toLowerCase().includes(q) ||
        (product.brand || '').toLowerCase().includes(q);
      const matchesCategory = this.selectedCategoryId === null || product.category_id === this.selectedCategoryId;
      const matchesBrand = this.selectedBrand === null || (product.brand || '').toLowerCase() === this.selectedBrand.toLowerCase();
      // A single laptop that is booked or in repair is not for sale now: it is not on the Menu (the API leaves it out, this is for safety).
      return matchesSearch && matchesCategory && matchesBrand && !product.is_archived && !product.hold_status;
    });
  }

  /** Brands of the selected category (only categories with several brands, e.g. Windows, show brand chips). */
  get selectedCategoryBrands(): string[] {
    const brands = this.categories.find(c => c.id === this.selectedCategoryId)?.brands ?? [];
    return brands.length > 1 ? brands : [];
  }

  // ---------- photos: a product can have several, the first one is the cover ----------

  /** Which photo of each product is showing (product id -> position). Everything starts on the cover. */
  private readonly shown = new Map<number, number>();

  photosOf(product: Product): string[] {
    if (product.images?.length) return product.images;
    return product.image_url ? [product.image_url] : [];
  }

  photoCount(product: Product): number {
    return this.photosOf(product).length;
  }

  /** 1-based position of the photo that is showing, e.g. 2 of 3. */
  photoNumber(product: Product): number {
    const count = this.photoCount(product);
    return count === 0 ? 0 : Math.min(this.shown.get(product.id ?? 0) ?? 0, count - 1) + 1;
  }

  currentPhoto(product: Product): string {
    return this.photosOf(product)[this.photoNumber(product) - 1] ?? '';
  }

  /** Next (+1) or previous (-1) photo, wrapping around at the ends. */
  step(product: Product, direction: 1 | -1): void {
    const count = this.photoCount(product);
    if (count < 2) return;
    this.goTo(product, (this.photoNumber(product) - 1 + direction + count) % count);
  }

  goTo(product: Product, index: number): void {
    this.shown.set(product.id ?? 0, index);
  }

  // ---------- the detail view: click a product to see everything about it ----------

  selectedProduct: Product | null = null;

  /** What had the focus before the detail opened (the card), so closing puts it back there. */
  private opener: HTMLElement | null = null;

  /** The close button gets the focus when the detail opens, so Esc / Enter / Tab work straight away. */
  @ViewChild('closeButton') set closeButton(button: ElementRef<HTMLButtonElement> | undefined) {
    button?.nativeElement.focus();
  }

  openProduct(product: Product): void {
    this.opener = typeof document === 'undefined' ? null : document.activeElement as HTMLElement | null;
    this.selectedProduct = product;
  }

  closeProduct(): void {
    this.selectedProduct = null;
    this.opener?.focus?.();
    this.opener = null;
  }

  /** Enter / Space on a card opens it - but not when the key was meant for the arrows or dots inside the card. */
  onCardKey(event: Event, product: Product): void {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    this.openProduct(product);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.invoicing || this.viewingInvoice || this.repairing) return;       // those windows close themselves
    if (this.bookingProduct) this.closeBooking();
    else if (this.selectedProduct) this.closeProduct();
  }

  @HostListener('document:keydown.arrowleft')
  onArrowLeft(): void {
    if (this.selectedProduct) this.step(this.selectedProduct, -1);
  }

  @HostListener('document:keydown.arrowright')
  onArrowRight(): void {
    if (this.selectedProduct) this.step(this.selectedProduct, 1);
  }

  /** Stock as one short line + a colour (shared with the Products page). */
  stockInfo(product: Product): StockInfo {
    return stockInfo(product);
  }

  // ---------- Sell / Book / Repair: from a laptop in the Menu ----------
  //
  //   Book   -> the booking form (the laptop filled in) -> "Create the invoice now?" -> the booking invoice
  //   Sell   -> a sale invoice (the laptop and its price filled in) -> the paper -> "Mark as sold?"
  //   Repair -> the repair form (the laptop's name as the device); a repair job, its invoice is optional
  //
  // The laptop window closes when one of them starts, so only one window is open at a time.

  /** A scanned laptop's Sell / Book / Repair button sent us here: its window opens by itself (once the laptops are loaded). */
  private runScanAction(): void {
    const action = this.scanActions.takeLaptop();
    if (!action) return;
    const product = this.products.find(p => p.id === action.productId);
    if (!product) {
      this.showNotice('That laptop is not on the Menu any more.');
      return;
    }
    if (action.kind === 'sell') this.startSell(product);
    else if (action.kind === 'book') this.startBook(product);
    else this.startRepair(product);
  }

  /** The laptop the Book window is open for (null = closed). */
  bookingProduct: Product | null = null;
  /** The repair form (a repair job for a laptop): null = closed. */
  repairing: { prefill: Partial<Repair> } | null = null;
  /** The invoice writing window: null = closed. `product` is the laptop being sold (asked about afterwards); `back` = it was opened from a laptop. */
  invoicing: { type: InvoiceType; prefill: Partial<Invoice> | null; invoice: Invoice | null; product: Product | null; back: boolean } | null = null;
  /** The laptop whose window comes back when Book / Sell / Repair is cancelled (a click by mistake costs nothing). */
  private returnTo: Product | null = null;
  /** The invoice shown as paper (with Print...): null = closed. */
  viewingInvoice: Invoice | null = null;
  /** The booking question on the screen, if any. */
  asking: Asking | null = null;
  /** The "Mark this laptop as sold?" review under the invoice paper, if any. Nothing is changed until it is confirmed. */
  soldReview: SoldReview | null = null;
  isAnswering = false;
  askError = '';
  /** A line of news at the top ("Booking saved.") */
  notice = '';
  private noticeTimer: ReturnType<typeof setTimeout> | undefined;
  @ViewChild(BookingFormComponent) private bookingForm?: BookingFormComponent;

  /** "YYYY-MM-DD" of today: the booking date a new booking starts with. */
  get today(): string {
    return todayIso();
  }

  /** A laptop with counted stock that has none left cannot be sold. (A booking for it is still fine.) */
  cannotSell(product: Product): boolean {
    return !!product.track_stock && product.stock_quantity <= 0;
  }

  startBook(product: Product): void {
    this.selectedProduct = null;
    this.returnTo = product;
    this.bookingProduct = product;
  }

  startSell(product: Product): void {
    if (this.cannotSell(product)) return;
    this.selectedProduct = null;
    this.returnTo = product;
    this.invoicing = { type: 'sale', prefill: invoicePrefillForSale(product), invoice: null, product, back: true };
  }

  /** Repair: a repair job for this laptop (its invoice is optional and can be made in the form or later). */
  startRepair(product: Product): void {
    this.selectedProduct = null;
    this.returnTo = product;
    this.repairing = { prefill: repairPrefillForProduct(product) };
  }

  /** Cancelled (✕, Esc, Back, Cancel, the dark background): back to the laptop window, as if nothing was clicked. */
  closeRepair(): void {
    this.repairing = null;
    this.backToLaptop();
  }

  /** The repair is saved: say where to follow it, and write its invoice now when that was asked. */
  onRepairSaved(result: RepairSaved): void {
    this.repairing = null;
    this.returnTo = null;                               // done: no going back to the laptop
    this.showNotice([`Repair started for “${result.repair.device}”. You can follow it in Repairs.`, tookNote(result.repair, 'repair')].filter(Boolean).join(' '));
    this.loadData();                                    // the laptop is off the shelf now
    this.telegram.send('repair', result.repair.id);     // the Repair group (laptop photo + the repair)
    if (result.makeInvoice) {
      this.invoicing = { type: 'repair', prefill: invoicePrefillFromRepair(result.repair), invoice: null, product: null, back: false };
    }
  }

  /** Cancelled (✕, Esc, Back, Cancel, the dark background): back to the laptop window, as if nothing was clicked. */
  private backToLaptop(): void {
    const product = this.returnTo;
    this.returnTo = null;
    if (product) this.selectedProduct = product;
  }

  closeBooking(): void {
    if (this.bookingForm?.isSubmitting) return;         // saving: wait
    this.bookingProduct = null;
    this.backToLaptop();
  }

  /** The booking is saved: ask whether to make its invoice now. */
  onBookingSaved(result: BookingSaved): void {
    this.bookingProduct = null;
    this.returnTo = null;                               // done: no going back to the laptop
    this.askError = '';
    this.asking = { booking: result.booking };
    this.loadData();                                    // the laptop is off the shelf now (one less in stock, or set aside as Booked)
    this.telegram.send('booking', result.booking.id);   // "Booking Details" with the laptop photo
  }

  closeInvoicing(): void {
    const work = this.invoicing;
    this.invoicing = null;
    // Cancelled while changing the invoice of a sale that still waits to be marked: back to that paper and its review.
    if (work?.invoice && this.soldReview) this.viewingInvoice = this.soldReview.invoice;
    else this.backToLaptop();
  }

  /** The invoice is saved: its paper opens so it can be printed. After a new SALE of one of the shop's laptops the laptop is marked as
   *  sold at once (no question) and the Sold message goes to Telegram with the invoice picture. */
  onInvoiceSaved(result: InvoiceSaved): void {
    const work = this.invoicing;
    const reviewing = this.soldReview;
    this.invoicing = null;
    this.returnTo = null;                               // done: no going back to the laptop
    this.viewingInvoice = result.invoice;
    this.showNotice(`Invoice ${formatInvoiceNumber(result.invoice.number)} ${result.created ? 'saved' : 'changed'}.`);

    if (result.created && result.invoice.type === 'sale' && work?.product) {
      this.markSoldNow({ product: work.product, qty: this.soldQty(result.invoice, work.product), invoice: result.invoice });
    } else if (!result.created && reviewing) {
      // The invoice was changed while the question was waiting (marking as sold had failed): it follows the new invoice (the quantity may have changed).
      this.soldReview = { ...reviewing, qty: this.soldQty(result.invoice, reviewing.product), invoice: result.invoice };
    }
  }

  /** From the paper's Edit button. A review that is waiting comes back when the change is saved or cancelled. */
  editViewed(): void {
    const invoice = this.viewingInvoice;
    if (!invoice) return;
    this.viewingInvoice = null;
    this.askError = '';
    this.invoicing = { type: invoice.type, prefill: null, invoice, product: null, back: false };
  }

  /** How many of this laptop are on the invoice (matched by name, capitals ignored); 1 when no line has its name. */
  private soldQty(invoice: Invoice, product: Product): number {
    const name = product.name.trim().toLowerCase();
    return invoice.items.find(item => item.name.trim().toLowerCase() === name)?.qty ?? 1;
  }

  // ---------- the booking question ----------

  get askTitle(): string {
    return 'Booking saved. Create the invoice now?';
  }

  get askMessage(): string {
    return 'The invoice is the paper for the customer. It starts with everything from the booking.';
  }

  /** What exactly will happen, in plain words. */
  get askDetail(): string {
    const booking = this.asking?.booking;
    return booking ? `${booking.product_name} · pickup ${booking.pickup_date.split('-').reverse().join('/')}` : '';
  }

  /** "Booking saved." and what it did to the laptop. */
  private bookingSavedNotice(booking: Booking): string {
    return ['Booking saved.', tookNote(booking, 'booking')].filter(Boolean).join(' ');
  }

  answerYes(): void {
    const asking = this.asking;
    if (!asking) return;
    this.asking = null;
    this.showNotice(this.bookingSavedNotice(asking.booking));
    this.invoicing = { type: 'booking', prefill: invoicePrefillFromBooking(asking.booking), invoice: null, product: null, back: false };
  }

  answerNo(): void {
    const asking = this.asking;
    if (!asking) return;
    this.asking = null;
    this.showNotice(this.bookingSavedNotice(asking.booking));
  }

  // ---------- marking the laptop as sold after a sale ----------
  // It is done by itself when the sale invoice is saved. The review bar under the paper only shows when that failed.


  /** The first photo of the laptop being reviewed (or none). */
  get soldPhoto(): string {
    return this.soldReview ? this.photosOf(this.soldReview.product)[0] ?? '' : '';
  }

  /** What will happen to the laptop, in plain words. */
  get soldResult(): string {
    const review = this.soldReview;
    if (!review) return '';
    if (review.product.track_stock) {
      const left = Math.max(0, review.product.stock_quantity - review.qty);
      return `Stock goes from ${review.product.stock_quantity} to ${left}.`;
    }
    return 'It is hidden from the Menu. You can put it back from Products.';
  }

  /** The retry button of the question (shown only when marking the laptop as sold failed). */
  markSold(): void {
    const review = this.soldReview;
    if (review) this.markSoldNow(review);
  }

  /** A single laptop is hidden from the Menu; a laptop with counted stock goes down by what was sold. Then the Sold message goes to
   *  Telegram (the laptop photo + the invoice picture). When it fails nothing is sent, and the question shows with the reason. */
  private markSoldNow(review: SoldReview): void {
    if (this.isAnswering) return;
    const { product, qty } = review;
    if (product.id === undefined) { this.soldReview = null; return; }
    const changes: Partial<Product> = product.track_stock
      ? { stock_quantity: Math.max(0, product.stock_quantity - qty) }
      : { is_archived: true };
    this.isAnswering = true;
    this.askError = '';
    this.productService.updateProduct(product.id, changes).pipe(finalize(() => (this.isAnswering = false))).subscribe({
      next: () => {
        this.soldReview = null;
        this.showNotice(`“${product.name}” marked as sold.`);
        this.loadData();
        this.telegram.send('sold', review.invoice.id, review.invoice);   // the Sold group: laptop photo + the invoice picture
      },
      // The invoice is saved but the laptop is not sold yet: ask again, with the reason, where the person is looking.
      error: (err) => {
        this.soldReview = review;
        this.askError = err?.error?.error || 'Could not update the laptop. Please try again.';
      }
    });
  }

  /** "Not now" on the question: nothing changes, the paper stays to print. */
  skipSold(): void {
    const review = this.soldReview;
    if (!review || this.isAnswering) return;
    this.soldReview = null;
    this.askError = '';
    this.showNotice(`“${review.product.name}” was not marked as sold.`);
  }

  /** Focus starts on "Not now" (the safe one: Mark as sold changes the laptop). */
  @ViewChild('notNowButton') private set notNowButton(button: ElementRef<HTMLButtonElement> | undefined) {
    button?.nativeElement.focus();
  }

  private showNotice(message: string): void {
    this.notice = message;
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = ''), 5000);
  }

  setCategory(categoryId: number | null): void {
    this.selectedCategoryId = categoryId;
    this.selectedBrand = null;
  }

  setBrand(brand: string | null): void {
    this.selectedBrand = this.selectedBrand === brand ? null : brand;
  }
}
