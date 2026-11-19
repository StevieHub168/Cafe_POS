import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subscription, finalize } from 'rxjs';
import { InvoiceService } from '../../services/invoice/invoice.service';
import { ProductService } from '../../services/product/product.service';
import { Invoice, formatInvoiceNumber } from '../../models/invoice/invoice.model';
import { Product } from '../../models/product/product.model';
import { SalesCounts } from '../../models/paged/paged.model';
import { Repair } from '../../models/repair/repair.model';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { PaginationComponent } from '../ui/pagination/pagination.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { StatusBadgeComponent } from '../ui/status-badge/status-badge.component';
import { ConfirmDialogComponent } from '../ui/confirm-dialog/confirm-dialog.component';
import { InvoiceEditorComponent } from '../invoices/invoice-editor.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { InvoiceSaved } from '../invoices/invoice-form.component';
import { RepairFormComponent, RepairSaved } from '../repairs/repair-form.component';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { buildInvoicePhotos } from '../../utils/invoice-photo/invoice-photo';
import { PageState, pageAfterShrink } from '../../utils/page-state/page-state';
import { repairPrefillFromSale } from '../../utils/invoice-prefill/invoice-prefill';
import { warrantyText } from '../../utils/warranty/warranty';
import { formatDate, todayIso } from '../../utils/dates/dates';
import { formatMoney } from '../../utils/money/money';
import { TelegramNotifier } from '../../services/telegram-notifier/telegram-notifier.service';

type Filter = 'all' | 'month' | 'warranty';

/** How long after the last key the search is sent (so a word being typed is one request, not one per letter). */
const SEARCH_DELAY_MS = 300;

/**
 * The Sales page: the laptops the shop sold, each as a card with its photo and its invoice (the paper). A sale IS its
 * invoice, so "New sale" writes the invoice; "Repair" starts a repair job for a laptop that was sold (a warranty repair).
 * The list comes in PAGES from the API, already narrowed by the tab and the search (so it stays fast with thousands of sales).
 */
@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, ConfirmDialogComponent, InvoiceEditorComponent, InvoiceViewerComponent, RepairFormComponent, SkeletonComponent, PaginationComponent, ImgSrcPipe],
  templateUrl: './sales.component.html'
})
export class SalesComponent implements OnInit, OnDestroy {
  /** The sales of the page on screen, newest first. */
  sales: Invoice[] = [];
  /** Where the list is: which page, how many on a page, how many sales match in all. */
  readonly paging = new PageState(10);
  /** The numbers of the tabs and of the boxes on top (not narrowed by the search). null until the first answer. */
  counts: SalesCounts | null = null;
  /** The shop's laptops still for sale: offered while an invoice is written, and in the "A laptop of my shop" list. */
  products: Product[] = [];
  /** ALL products, sold ones too: only used to find the photo of what was sold. */
  private allProducts: Product[] = [];
  private photos = new Map<number, string>();
  /** The grey shapes are shown: the first load, and every new page, tab or search. (After a save the list is read again quietly.) */
  isLoading = true;
  private loading?: Subscription;
  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  errorMessage = '';

  successMessage = '';
  private successTimer: ReturnType<typeof setTimeout> | undefined;

  readonly tabs: { value: Filter; label: string }[] = [
    { value: 'all', label: 'All' }, { value: 'month', label: 'This month' }, { value: 'warranty', label: 'Under warranty' }
  ];
  filter: Filter = 'all';
  searchQuery = '';

  /** The writing window (new or change): null = closed. */
  editing: { invoice: Invoice | null } | null = null;
  /** The invoice shown as paper (with Print...): null = closed. */
  viewing: Invoice | null = null;
  /** The repair form (a warranty repair started from a sale): null = closed. */
  repairing: { prefill: Partial<Repair> } | null = null;

  deleteTarget: Invoice | null = null;
  isDeleting = false;
  deleteError = '';

  constructor(
    private invoiceService: InvoiceService,
    private productService: ProductService,
    private router: Router,
    private telegram: TelegramNotifier
  ) { }

  ngOnInit(): void {
    this.loadSales(true);
    // For suggestions and for the photos: if this fails, sales still work (plain boxes, grey photo boxes).
    this.productService.getAllProducts(true).subscribe({
      next: (products) => {
        this.allProducts = products;
        this.products = products.filter(p => !p.is_archived);
        this.findPhotos();
      },
      error: () => {
        this.allProducts = [];
        this.products = [];
        this.findPhotos();
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.searchTimer);
    clearTimeout(this.successTimer);
    this.loading?.unsubscribe();
  }

  /** Today. A method of its own so a test can pretend it is another day. */
  protected now(): Date {
    return new Date();
  }

  get today(): string {
    return todayIso(this.now());
  }

  /** Esc closes the delete box (the writing window, the paper and the repair form close themselves). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.deleteTarget) this.cancelDelete();
  }

  // ---------- list ----------

  /** Reads the page on screen again. `withShapes`: show the grey shapes meanwhile (a new page, tab or search). */
  loadSales(withShapes = false): void {
    if (withShapes) this.isLoading = true;
    this.loading?.unsubscribe();       // a slow answer to an older question must never replace a newer one
    this.loading = this.invoiceService.getInvoicePage(this.paging, { type: 'sale', period: this.filter === 'all' ? undefined : this.filter, search: this.searchQuery }).subscribe({
      next: (answer) => {
        // The last sale of this page was deleted: go back to the last page that has sales.
        const back = pageAfterShrink(this.paging.page, answer);
        if (back !== null) {
          this.paging.page = back;
          this.loadSales(withShapes);
          return;
        }
        this.sales = answer.results;
        this.paging.take(answer);
        this.counts = answer.meta?.counts ?? this.counts;
        this.isLoading = false;
        this.findPhotos();
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Failed to load sales.';
        this.isLoading = false;
      }
    });
  }

  /** A tab: the first page of that tab. */
  setFilter(filter: Filter): void {
    if (this.filter === filter) return;
    this.filter = filter;
    this.paging.first();
    this.loadSales(true);
  }

  /** Something was typed in the search box: it is sent when the typing stops. */
  onSearch(): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.paging.first();
      this.loadSales(true);
    }, SEARCH_DELAY_MS);
  }

  goToPage(page: number): void {
    this.paging.page = page;
    this.loadSales(true);
  }

  changePageSize(size: number): void {
    this.paging.perPage = size;
    this.paging.first();
    this.loadSales(true);
  }

  private findPhotos(): void {
    this.photos = buildInvoicePhotos(this.sales, this.allProducts, []);
  }

  /** How many sales are in a tab (the API counts them: it knows them all, the page only has a few). */
  countFor(filter: Filter): number {
    return this.counts ? this.counts[filter === 'all' ? 'all' : filter] : 0;
  }

  trackById = (_: number, sale: Invoice) => sale.id;

  // ---------- the numbers on top ----------

  get soldThisMonth(): number {
    return this.countFor('month');
  }

  get underWarranty(): number {
    return this.countFor('warranty');
  }

  // ---------- how a sale is shown ----------

  readonly money = formatMoney;
  readonly date = formatDate;
  readonly numberText = formatInvoiceNumber;

  /** WHAT was sold: the first line of the paper. */
  titleOf(sale: Invoice): string {
    return sale.items[0]?.name || '—';
  }

  /** The other lines ("Laptop bag, Wireless mouse"). */
  othersOf(sale: Invoice): string {
    return sale.items.slice(1).map(item => item.name).join(', ');
  }

  contactOf(sale: Invoice): string {
    return [sale.phone, sale.telegram].filter(Boolean).join(' · ') || '—';
  }

  balanceOf(sale: Invoice): number {
    return sale.balance ?? Math.round((sale.total - sale.deposit) * 100) / 100;
  }

  warrantyOf(sale: Invoice): string {
    return warrantyText(sale.invoice_date, sale.warranty, this.now());
  }

  photoOf(sale: Invoice): string {
    return (sale.id !== undefined && this.photos.get(sale.id)) || '';
  }

  // ---------- write / look ----------

  openNew(): void {
    this.editing = { invoice: null };
  }

  openEdit(sale: Invoice): void {
    this.viewing = null;
    this.editing = { invoice: sale };
  }

  view(sale: Invoice): void {
    this.viewing = sale;
  }

  closeEditor(): void {
    this.editing = null;
  }

  /** After a save the paper opens straight away, so it can be printed. */
  onSaved(result: InvoiceSaved): void {
    this.editing = null;
    this.viewing = result.invoice;
    if (result.created) this.paging.first();      // the newest sale is the first one of the first page
    this.loadSales();
    this.showSuccess(`Sale ${formatInvoiceNumber(result.invoice.number)} ${result.created ? 'saved' : 'changed'}.`);
    if (result.created) this.telegram.send('sold', result.invoice.id, result.invoice);   // a NEW sale goes to the Sold group (a change does not)
  }

  /** From the paper's Edit button. */
  editViewed(): void {
    if (this.viewing) this.openEdit(this.viewing);
  }

  // ---------- a repair of a laptop we sold (warranty) ----------

  startRepair(sale: Invoice): void {
    this.repairing = { prefill: repairPrefillFromSale(sale) };
  }

  /** The repair is saved: its page opens, where its steps are. */
  onRepairSaved(result: RepairSaved): void {
    this.repairing = null;
    this.telegram.send('repair', result.repair.id);       // the Repair group (laptop photo + the repair)
    void this.router.navigate(['/repairs']);
  }

  // ---------- delete ----------

  askToDelete(sale: Invoice): void {
    this.deleteError = '';
    this.deleteTarget = sale;
  }

  get deleteName(): string {
    return this.deleteTarget ? `Sale ${formatInvoiceNumber(this.deleteTarget.number)}` : '';
  }

  get deleteDetail(): string {
    const sale = this.deleteTarget;
    if (!sale) return '';
    return [this.titleOf(sale), sale.customer_name ?? '', formatMoney(sale.total)].filter(Boolean).join(' · ');
  }

  cancelDelete(): void {
    if (this.isDeleting) return;
    this.deleteTarget = null;
    this.deleteError = '';
  }

  confirmDeleteNow(): void {
    const sale = this.deleteTarget;
    if (!sale?.id || this.isDeleting) return;
    this.isDeleting = true;
    this.deleteError = '';
    this.invoiceService.deleteInvoice(sale.id).pipe(finalize(() => (this.isDeleting = false))).subscribe({
      next: () => {
        this.deleteTarget = null;
        this.loadSales();
        this.showSuccess(`Sale ${formatInvoiceNumber(sale.number)} deleted.`);
      },
      // Stay open and say why, so the message is where you are looking.
      error: (err) => (this.deleteError = err?.error?.error || 'Failed to delete the sale.')
    });
  }

  // ---------- small helpers ----------

  private showSuccess(message: string): void {
    this.successMessage = message;
    clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => (this.successMessage = ''), 4000);
  }
}
