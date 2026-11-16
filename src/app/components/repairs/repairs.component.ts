import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { RepairService } from '../../services/repair.service';
import { InvoiceService } from '../../services/invoice.service';
import { ProductService } from '../../services/product.service';
import { REPAIR_STEPS, Repair, RepairStatus, nextRepairStatus, repairStep, repairStepIndex } from '../../models/repair.model';
import { Invoice, formatInvoiceNumber } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { PageHeaderComponent } from '../ui/page-header.component';
import { StatusBadgeComponent } from '../ui/status-badge.component';
import { ConfirmDialogComponent } from '../ui/confirm-dialog.component';
import { InvoiceEditorComponent } from '../invoices/invoice-editor.component';
import { InvoiceViewerComponent } from '../invoices/invoice-viewer.component';
import { InvoiceSaved } from '../invoices/invoice-form.component';
import { RepairFormComponent, RepairSaved } from './repair-form.component';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { invoicePrefillFromRepair } from '../../utils/invoice-prefill';
import { productCover } from '../../utils/invoice-photo';
import { warrantyText } from '../../utils/warranty';
import { daysFromToday, formatDate, todayIso } from '../../utils/dates';
import { formatMoney } from '../../utils/money';
import { gaveBackNote, holdChangeNote } from '../../utils/stock-notes';
import { TelegramNotifier } from '../../services/telegram-notifier.service';

type Filter = RepairStatus | 'all';

/**
 * The Repairs page: every repair job as a card with its 3 steps (Received -> Fixed -> Picked up). The main button moves
 * the job to its next step. The invoice of a repair is optional: "Make invoice" until it exists, then "View invoice".
 */
@Component({
  selector: 'app-repairs',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, StatusBadgeComponent, ConfirmDialogComponent, RepairFormComponent, InvoiceEditorComponent, InvoiceViewerComponent, ImgSrcPipe],
  templateUrl: './repairs.component.html'
})
export class RepairsComponent implements OnInit {
  repairs: Repair[] = [];
  /** The shop's laptops (to pick one for a new repair, and for the photo of a repair). */
  products: Product[] = [];
  /** The shop's Sales: a repair of a laptop we sold says "warranty ...". */
  sales: Invoice[] = [];
  isLoading = true;
  errorMessage = '';

  successMessage = '';
  private successTimer: ReturnType<typeof setTimeout> | undefined;

  readonly tabs: { value: Filter; label: string }[] = [{ value: 'all', label: 'All' }, ...REPAIR_STEPS.map(s => ({ value: s.value, label: s.label }))];
  statusFilter: Filter = 'all';
  searchQuery = '';

  /** The form (new or change): null = closed. */
  editing: { repair: Repair | null } | null = null;
  /** The invoice writing window: null = closed. `prefill` starts a new one from a repair; `invoice` changes an existing one. */
  invoicing: { prefill: Partial<Invoice> | null; invoice: Invoice | null } | null = null;
  /** The invoice shown as paper (with Print...): null = closed. */
  viewingInvoice: Invoice | null = null;

  /** Which repair is moving to its next step right now (its button is off meanwhile). */
  movingId: number | null = null;

  deleteTarget: Repair | null = null;
  isDeleting = false;
  deleteError = '';

  // Invoices: a repair has ONE invoice (optional).
  private invoiceByRepair = new Map<number, Invoice>();

  constructor(
    private repairService: RepairService,
    private invoiceService: InvoiceService,
    private productService: ProductService,
    private telegram: TelegramNotifier
  ) { }

  ngOnInit(): void {
    this.loadRepairs();
    this.loadInvoices();
    this.loadProducts();
  }

  /** Only for the form and the photos: if this fails, repairs still work. Read again after a repair changes stock. */
  private loadProducts(): void {
    this.productService.getAllProducts(true).subscribe({
      next: (products) => (this.products = products),
      error: () => (this.products = [])
    });
  }

  /** Today. A method of its own so a test can pretend it is another day. */
  protected now(): Date {
    return new Date();
  }

  get today(): string {
    return todayIso(this.now());
  }

  /** Esc closes the delete box (the form, the invoice windows close themselves). */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.deleteTarget) this.cancelDelete();
  }

  // ---------- list ----------

  loadRepairs(): void {
    this.repairService.getRepairs().subscribe({
      next: (repairs) => {
        this.repairs = repairs;
        this.isLoading = false;
      },
      error: (err) => {
        this.errorMessage = err?.error?.error || 'Failed to load repairs.';
        this.isLoading = false;
      }
    });
  }

  private loadInvoices(): void {
    this.invoiceService.getInvoices().subscribe({
      next: (invoices) => {
        this.sales = invoices.filter(i => i.type === 'sale');
        this.invoiceByRepair = new Map(
          invoices.filter(i => i.type === 'repair' && i.repair_id !== null && i.repair_id !== undefined).map(i => [i.repair_id as number, i]));
      },
      error: () => { /* the buttons still work: they say "Make invoice" (a second one is refused anyway) */ }
    });
  }

  countFor(filter: Filter): number {
    return filter === 'all' ? this.repairs.length : this.repairs.filter(r => r.status === filter).length;
  }

  get visibleRepairs(): Repair[] {
    const q = this.searchQuery.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return this.repairs.filter(r => {
      if (this.statusFilter !== 'all' && r.status !== this.statusFilter) return false;
      if (!q) return true;
      return r.device.toLowerCase().includes(q)
        || r.problem.toLowerCase().includes(q)
        || (r.customer_name ?? '').toLowerCase().includes(q)
        || (r.telegram ?? '').toLowerCase().includes(q)
        || (r.phone ?? '').toLowerCase().includes(q)
        || (digits.length >= 3 && (r.phone ?? '').replace(/\D/g, '').includes(digits));
    });
  }

  trackById = (_: number, repair: Repair) => repair.id;

  // ---------- the numbers on top ----------

  /** Repairs still in the shop (received or fixed). */
  get inShop(): number {
    return this.repairs.filter(r => r.status !== 'picked_up').length;
  }

  get waitingForPickup(): number {
    return this.repairs.filter(r => r.status === 'fixed').length;
  }

  /** What the fixed repairs will bring when they are picked up. */
  get moneyToCollect(): number {
    return Math.round(this.repairs.filter(r => r.status === 'fixed').reduce((sum, r) => sum + (r.cost ?? 0), 0) * 100) / 100;
  }

  // ---------- how a repair is shown ----------

  readonly money = formatMoney;
  readonly date = formatDate;
  readonly stepOf = repairStep;
  readonly steps = REPAIR_STEPS;

  /** The 3 bars under the title: done = green, the current step = blue, the rest grey. */
  stepBars(repair: Repair): { label: string; state: 'done' | 'now' | 'todo' }[] {
    const now = repairStepIndex(repair.status);
    // The last step is finished as soon as it is reached.
    return REPAIR_STEPS.map((step, i) => ({ label: step.label, state: i < now || (i === now && repair.status === 'picked_up') ? 'done' : i === now ? 'now' : 'todo' }));
  }

  customerOf(repair: Repair): string {
    return [repair.customer_name, repair.phone || repair.telegram].filter(Boolean).join(' · ') || 'No customer written';
  }

  costOf(repair: Repair): string {
    return repair.cost === null ? 'Not set yet' : formatMoney(repair.cost);
  }

  /** The date under the problem: when it should be back / when it was fixed / when it was picked up. */
  dateLabelOf(repair: Repair): string {
    return repair.status === 'received' ? 'Back on' : repair.status === 'fixed' ? 'Fixed on' : 'Picked up on';
  }

  dateOf(repair: Repair): string {
    const iso = repair.status === 'received' ? repair.back_on : repair.status === 'fixed' ? repair.fixed_date : repair.picked_up_date;
    return formatDate(iso) || '—';
  }

  /** A repair that should have been ready by now. */
  isLate(repair: Repair): boolean {
    if (repair.status === 'picked_up' || !repair.back_on) return false;
    const days = daysFromToday(repair.back_on, this.now());
    return days !== null && days < 0;
  }

  /** "Sold by you: Sale 000044 · 1 week · 4 days left" for a repair of a laptop the shop sold. */
  warrantyLine(repair: Repair): string {
    if (!repair.sale_invoice_number || !repair.sale_date || !repair.sale_warranty) return '';
    return `Sold by you: Sale ${formatInvoiceNumber(repair.sale_invoice_number)} · ${warrantyText(repair.sale_date, repair.sale_warranty, this.now())}`;
  }

  /** What the main button says ('' = nothing left to do). */
  actionLabel(repair: Repair): string {
    return repair.status === 'received' ? 'Mark fixed' : repair.status === 'fixed' ? 'Customer picked up' : '';
  }

  photoOf(repair: Repair): string {
    const product = repair.product_id === null ? undefined : this.products.find(p => p.id === repair.product_id);
    return product ? productCover(product) ?? '' : '';
  }

  // ---------- moving to the next step ----------

  advance(repair: Repair): void {
    const next = nextRepairStatus(repair.status);
    if (repair.id === undefined || next === null || this.movingId !== null) return;
    this.movingId = repair.id;
    this.errorMessage = '';
    this.repairService.updateRepair(repair.id, { status: next }).pipe(finalize(() => (this.movingId = null))).subscribe({
      next: (updated) => {
        this.loadRepairs();
        this.loadProducts();
        this.showSuccess([next === 'fixed' ? `“${repair.device}” is fixed.` : `“${repair.device}” was picked up.`, holdChangeNote(repair, updated, 'repair')].filter(Boolean).join(' '));
      },
      error: (err) => (this.errorMessage = err?.error?.error || 'Failed to update the repair.')
    });
  }

  // ---------- new / change (the form is <app-repair-form>) ----------

  openAdd(): void {
    this.editing = { repair: null };
  }

  openEdit(repair: Repair): void {
    this.editing = { repair };
  }

  closeForm(): void {
    this.editing = null;
  }

  onSaved(result: RepairSaved): void {
    const before = this.editing?.repair ?? null;
    this.editing = null;
    if (result.created) this.telegram.send('repair', result.repair.id);          // the Repair group (laptop photo + the repair)
    this.loadRepairs();
    this.loadProducts();
    this.showSuccess([result.created ? 'Repair saved.' : 'Changes saved.', holdChangeNote(result.created ? null : before, result.repair, 'repair')].filter(Boolean).join(' '));
    if (result.makeInvoice) this.invoicing = { prefill: invoicePrefillFromRepair(result.repair), invoice: null };
  }

  // ---------- invoices (made from a repair) ----------

  invoiceFor(repair: Repair): Invoice | undefined {
    return repair.id === undefined ? undefined : this.invoiceByRepair.get(repair.id);
  }

  /** "Make invoice": opens the form filled from the repair. "View invoice": shows the paper that was already made. */
  openInvoice(repair: Repair): void {
    const existing = this.invoiceFor(repair);
    if (existing) this.viewingInvoice = existing;
    else this.invoicing = { prefill: invoicePrefillFromRepair(repair), invoice: null };
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

  // ---------- delete ----------

  askToDelete(repair: Repair): void {
    this.deleteError = '';
    this.deleteTarget = repair;
  }

  get deleteDetail(): string {
    const repair = this.deleteTarget;
    if (!repair) return '';
    return [repair.customer_name || repair.phone || '', repair.problem].filter(Boolean).join(' · ');
  }

  /** A repair that still holds its laptop gives it back when it is deleted. */
  get deleteWarning(): string {
    const repair = this.deleteTarget;
    return repair && repair.status === 'received' ? gaveBackNote(repair) : '';
  }

  cancelDelete(): void {
    if (this.isDeleting) return;
    this.deleteTarget = null;
    this.deleteError = '';
  }

  confirmDeleteNow(): void {
    const repair = this.deleteTarget;
    if (!repair?.id || this.isDeleting) return;
    this.isDeleting = true;
    this.deleteError = '';
    this.repairService.deleteRepair(repair.id).pipe(finalize(() => (this.isDeleting = false))).subscribe({
      next: () => {
        this.deleteTarget = null;
        this.loadRepairs();
        this.loadInvoices();
        this.loadProducts();
        this.showSuccess(['Repair deleted.', repair.status === 'received' ? gaveBackNote(repair) : ''].filter(Boolean).join(' '));
      },
      // Stay open and say why, so the message is where you are looking.
      error: (err) => (this.deleteError = err?.error?.error || 'Failed to delete the repair.')
    });
  }

  // ---------- small helpers ----------

  private showSuccess(message: string): void {
    this.successMessage = message;
    clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => (this.successMessage = ''), 4000);
  }
}
