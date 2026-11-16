import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';
import { InvoiceService } from '../../services/invoice.service';
import { ProductService } from '../../services/product.service';
import { Invoice, formatInvoiceNumber } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { Repair } from '../../models/repair.model';
import { PageHeaderComponent } from '../ui/page-header.component';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { InvoiceEditorComponent } from '../invoices/invoice-editor.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { InvoiceSaved } from '../invoices/invoice-form.component';
import { RepairFormComponent, RepairSaved } from '../repairs/repair-form.component';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { buildInvoicePhotos } from '../../utils/invoice-photo';
import { repairPrefillFromSale } from '../../utils/invoice-prefill';
import { isUnderWarranty, warrantyText } from '../../utils/warranty';
import { formatDate, todayIso } from '../../utils/dates';
import { formatMoney } from '../../utils/money';
import { TelegramNotifier } from '../../services/telegram-notifier.service';

type Filter = 'all' | 'month' | 'warranty';

/**
 * The Sales page: the laptops the shop sold, each as a card with its photo and its invoice (the paper). A sale IS its
 * invoice, so "New sale" writes the invoice; "Repair" starts a repair job for a laptop that was sold (a warranty repair).
 */
@Component({
  selector: 'app-sales',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, ConfirmDialogComponent, InvoiceEditorComponent, InvoiceViewerComponent, RepairFormComponent, ImgSrcPipe],
  templateUrl: './sales.component.html'
})
export class SalesComponent implements OnInit {
  /** The sale invoices, newest first. */
  sales: Invoice[] = [];
  /** The shop's laptops still for sale: offered while an invoice is written, and in the "A laptop of my shop" list. */
  products: Product[] = [];
  /** ALL products, sold ones too: only used to find the photo of what was sold. */
  private allProducts: Product[] = [];
  private photos = new Map<number, string>();
  isLoading = true;
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
    this.loadSales();
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

  loadSales(): void {
    this.invoiceService.getInvoices('sale').subscribe({
      next: (sales) => {
        this.sales = sales;
        this.isLoading = false;
        this.findPhotos();
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Failed to load sales.';
        this.isLoading = false;
      }
    });
  }

  private findPhotos(): void {
    this.photos = buildInvoicePhotos(this.sales, this.allProducts, []);
  }

  private isThisMonth(sale: Invoice): boolean {
    return sale.invoice_date.slice(0, 7) === this.today.slice(0, 7);
  }

  private isUnderWarranty(sale: Invoice): boolean {
    return isUnderWarranty(sale.invoice_date, sale.warranty, this.now());
  }

  countFor(filter: Filter): number {
    return filter === 'all' ? this.sales.length : filter === 'month' ? this.sales.filter(s => this.isThisMonth(s)).length : this.sales.filter(s => this.isUnderWarranty(s)).length;
  }

  get visibleSales(): Invoice[] {
    const q = this.searchQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    const onlyDigits = /^\d+$/.test(q);
    return this.sales.filter(sale => {
      if (this.filter === 'month' && !this.isThisMonth(sale)) return false;
      if (this.filter === 'warranty' && !this.isUnderWarranty(sale)) return false;
      if (!q) return true;
      // "44" or "000044" finds invoice 000044 (and a phone number can be found by its digits).
      return (onlyDigits && formatInvoiceNumber(sale.number).includes(q))
        || (sale.customer_name ?? '').toLowerCase().includes(q)
        || (sale.telegram ?? '').toLowerCase().includes(q)
        || (sale.phone ?? '').toLowerCase().includes(q)
        || (digits.length >= 3 && (sale.phone ?? '').replace(/\D/g, '').includes(digits))
        || sale.items.some(item => item.name.toLowerCase().includes(q));
    });
  }

  trackById = (_: number, sale: Invoice) => sale.id;

  // ---------- the numbers on top ----------

  get soldThisMonth(): number {
    return this.countFor('month');
  }

  /** The money that came in on this month's sales (what was paid, not what is still owed). */
  get receivedThisMonth(): number {
    return Math.round(this.sales.filter(s => this.isThisMonth(s)).reduce((sum, s) => sum + s.deposit, 0) * 100) / 100;
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
