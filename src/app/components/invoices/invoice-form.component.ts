import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { InvoiceService } from '../../services/invoice/invoice.service';
import {
  Invoice, InvoiceInput, InvoiceItem, InvoiceType, MAX_DEVICE, MAX_LINES, MAX_NAME, MAX_PROBLEM, WARRANTY_CHOICES, Warranty,
  formatInvoiceNumber, itemAmount, itemsTotal
} from '../../models/invoice/invoice.model';
import { Product } from '../../models/product/product.model';
import { formatDate, todayIso, weekdayName } from '../../utils/dates/dates';
import { formatMoney } from '../../utils/money/money';

/** What the form tells its parent after a save. */
export interface InvoiceSaved {
  invoice: Invoice;
  /** true = a new invoice, false = changes to an existing one. */
  created: boolean;
}

interface ItemRow {
  name: string;
  qty: number | null;
  unit_price: number | null;
}

interface InvoiceFormValues {
  number: number | null;
  invoice_date: string;
  customer_name: string;
  phone: string;
  telegram: string;
  device: string;
  problem: string;
  pickup_date: string;
  booking_id: number | null;
  /** The repair job this invoice is for (repair invoices made from the Repairs page). */
  repair_id: number | null;
  /** '' = not chosen yet: the person has to choose (even "No warranty"). */
  warranty: Warranty | '';
  items: ItemRow[];
  deposit: number | null;
}

const blankRow = (): ItemRow => ({ name: '', qty: 1, unit_price: null });

/**
 * The invoice form: customer, what was sold / reserved / repaired (up to what the paper holds), the money, the
 * warranty. One form for all three kinds (`type`); a repair also asks for the device and the problem, a booking for the
 * pickup date. The parent only provides the frame and reacts to (saved) and (cancelled).
 */
@Component({
  selector: 'app-invoice-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './invoice-form.component.html',
  styles: [`:host { display: flex; flex-direction: column; flex: 1 1 0%; min-height: 0; }`]
})
export class InvoiceFormComponent implements OnInit, OnChanges {
  /** The kind of a NEW invoice (an invoice being edited keeps its own). */
  @Input() type: InvoiceType = 'sale';
  /** Set = edit this invoice. */
  @Input() invoice: Invoice | null = null;
  /** For a new invoice: start with these values (e.g. from a booking). */
  @Input() prefill: Partial<Invoice> | null = null;
  /** Your products: their names are offered in the item boxes, and fill in the price. */
  @Input() products: Product[] = [];
  /** "YYYY-MM-DD" of today: the date of a new invoice. */
  @Input() today = todayIso();

  @Output() saved = new EventEmitter<InvoiceSaved>();
  @Output() cancelled = new EventEmitter<void>();

  readonly warranties = WARRANTY_CHOICES;
  readonly maxName = MAX_NAME;
  readonly maxDevice = MAX_DEVICE;
  readonly maxProblem = MAX_PROBLEM;
  readonly money = formatMoney;
  readonly amountOf = itemAmount;

  form: InvoiceFormValues = this.emptyValues();
  isSubmitting = false;
  formError = '';
  /** The names offered in the item boxes (kept in a field, not worked out on every refresh). */
  productNames: string[] = [];

  /** On a new sale the deposit follows the total ("paid in full") until the person types another deposit. */
  private depositFollowsTotal = false;

  constructor(private invoiceService: InvoiceService) { }

  /** The kind this form is for: the invoice's own when editing. */
  get kind(): InvoiceType {
    return this.invoice?.type ?? this.type;
  }

  get maxLines(): number {
    return MAX_LINES[this.kind];
  }

  ngOnInit(): void {
    this.refreshProductNames();
    if (this.invoice) {
      this.fillFrom(this.invoice);
      return;
    }

    this.form = this.emptyValues();
    this.form.items = [blankRow()];
    this.depositFollowsTotal = this.kind === 'sale';
    if (this.prefill) this.applyPrefill(this.prefill);

    // The next free number is offered; the person can change it (or leave it empty: the API picks one).
    this.invoiceService.getNextNumber().subscribe({
      next: (number) => { if (this.form.number === null) this.form.number = number; },
      error: () => { /* the number box stays empty: the API picks one when saving */ }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['products']) this.refreshProductNames();
  }

  private emptyValues(): InvoiceFormValues {
    return {
      number: null, invoice_date: this.today, customer_name: '', phone: '', telegram: '',
      device: '', problem: '', pickup_date: '', booking_id: null, repair_id: null, warranty: '', items: [], deposit: null
    };
  }

  private fillFrom(invoice: Invoice): void {
    this.form = {
      number: invoice.number,
      invoice_date: invoice.invoice_date,
      customer_name: invoice.customer_name ?? '',
      phone: invoice.phone ?? '',
      telegram: invoice.telegram ?? '',
      device: invoice.device ?? '',
      problem: invoice.problem ?? '',
      pickup_date: invoice.pickup_date ?? '',
      booking_id: invoice.booking_id,
      repair_id: invoice.repair_id ?? null,
      warranty: invoice.warranty,
      items: invoice.items.map(item => ({ name: item.name, qty: item.qty, unit_price: item.unit_price })),
      deposit: invoice.deposit
    };
    if (this.form.items.length === 0) this.form.items = [blankRow()];
    this.depositFollowsTotal = false;
  }

  private applyPrefill(prefill: Partial<Invoice>): void {
    const f = this.form;
    if (prefill.invoice_date) f.invoice_date = prefill.invoice_date;
    f.customer_name = prefill.customer_name ?? '';
    f.phone = prefill.phone ?? '';
    f.telegram = prefill.telegram ?? '';
    f.device = prefill.device ?? '';
    f.problem = prefill.problem ?? '';
    f.pickup_date = prefill.pickup_date ?? '';
    f.booking_id = prefill.booking_id ?? null;
    f.repair_id = prefill.repair_id ?? null;
    if (prefill.warranty) f.warranty = prefill.warranty;
    if (prefill.items?.length) f.items = prefill.items.map(item => ({ name: item.name, qty: item.qty, unit_price: item.unit_price }));
    if (prefill.deposit !== undefined && prefill.deposit !== null) {
      f.deposit = prefill.deposit;
      this.depositFollowsTotal = false;
    } else if (this.depositFollowsTotal) {
      f.deposit = this.total;
    }
  }

  private refreshProductNames(): void {
    this.productNames = [...new Set(this.products.filter(p => !p.is_archived).map(p => p.name))];
  }

  // ---------- the items ----------

  private get usedRows(): ItemRow[] {
    return this.form.items.filter(row => row.name.trim() !== '' || (row.unit_price !== null && row.unit_price !== undefined));
  }

  get total(): number {
    return itemsTotal(this.usedRows.map(row => ({ qty: Number(row.qty) || 0, unit_price: Number(row.unit_price) || 0 })));
  }

  get balance(): number {
    return Math.round((this.total - (Number(this.form.deposit) || 0)) * 100) / 100;
  }

  get depositTooBig(): boolean {
    return (Number(this.form.deposit) || 0) > this.total;
  }

  rowAmount(row: ItemRow): number {
    return itemAmount({ qty: Number(row.qty) || 0, unit_price: Number(row.unit_price) || 0 });
  }

  trackByIndex = (index: number) => index;

  addRow(): void {
    if (this.form.items.length >= this.maxLines) return;
    this.form.items.push(blankRow());
  }

  removeRow(index: number): void {
    this.form.items.splice(index, 1);
    if (this.form.items.length === 0) this.form.items.push(blankRow());
    this.recalc();
  }

  /** A name picked from your products fills in its price (unless a price is already there). */
  onNameChanged(index: number): void {
    const row = this.form.items[index];
    const name = row.name.trim().toLowerCase();
    const product = this.products.find(p => !p.is_archived && p.name.toLowerCase() === name);
    if (product && (row.unit_price === null || row.unit_price === undefined || Number(row.unit_price) === 0)) {
      row.unit_price = Number(product.selling_price);
    }
    this.recalc();
  }

  /** Keeps the deposit equal to the total on a new sale, until the person types a deposit. */
  recalc(): void {
    if (this.depositFollowsTotal) this.form.deposit = this.total;
  }

  onDepositInput(): void {
    this.depositFollowsTotal = false;
  }

  payInFull(): void {
    this.form.deposit = this.total;
    this.depositFollowsTotal = this.kind === 'sale';
  }

  // ---------- dates ----------

  /** "12/11/2026 · Thursday": shown under a date box, so a date is never misread. */
  dateLabel(iso: string): string {
    const text = formatDate(iso);
    return text ? `${text} · ${weekdayName(iso)}` : '';
  }

  numberText(): string {
    return this.form.number ? formatInvoiceNumber(this.form.number) : '';
  }

  // ---------- save ----------

  /** The first thing wrong with the form, in plain words ('' = fine). The API checks everything again. */
  private problem(): string {
    const f = this.form;
    if (f.number !== null && f.number !== undefined && String(f.number) !== '') {
      const n = Number(f.number);
      if (!Number.isInteger(n) || n < 1 || n > 999999) return 'The invoice number must be a whole number from 1 to 999999.';
    }
    if (!f.invoice_date) return 'Date is required.';

    if (this.kind === 'repair') {
      if (!f.device.trim()) return 'Device is required.';
      if (!f.problem.trim()) return 'Problem is required.';
    }
    if (this.kind === 'booking') {
      if (!f.pickup_date) return 'Pickup date is required.';
      if (f.pickup_date < f.invoice_date) return 'Pickup date cannot be before the invoice date.';
    }

    const rows = this.usedRows;
    if (rows.length === 0) return 'Add at least one item.';
    for (const [i, row] of rows.entries()) {
      if (!row.name.trim()) return `Item ${i + 1}: please write the name.`;
      if (row.unit_price === null || row.unit_price === undefined || String(row.unit_price) === '' || Number(row.unit_price) < 0) {
        return `Item ${i + 1}: please write the price.`;
      }
      const qty = Number(row.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 999) return `Item ${i + 1}: quantity must be a whole number from 1 to 999.`;
    }
    if (!(this.total > 0)) return 'The total must be more than 0.';
    if (this.depositTooBig) return 'Deposit cannot be more than the total.';
    if (!f.warranty) return 'Choose the warranty (or "No warranty").';
    return '';
  }

  submit(): void {
    if (this.isSubmitting) return;
    this.formError = this.problem();
    if (this.formError) return;

    const f = this.form;
    const items: InvoiceItem[] = this.usedRows.map(row => ({
      name: row.name.trim(),
      qty: Number(row.qty),
      unit_price: Number(row.unit_price)
    }));
    const payload: InvoiceInput = {
      type: this.kind,
      invoice_date: f.invoice_date,
      customer_name: f.customer_name.trim() || null,
      phone: f.phone.trim() || null,
      telegram: f.telegram.trim() || null,
      device: this.kind === 'repair' ? f.device.trim() : null,
      problem: this.kind === 'repair' ? f.problem.trim() : null,
      pickup_date: this.kind === 'booking' ? f.pickup_date : null,
      booking_id: this.kind === 'booking' ? f.booking_id : null,
      repair_id: this.kind === 'repair' ? f.repair_id : null,
      warranty: f.warranty as Warranty,
      items,
      deposit: Number(f.deposit) || 0
    };
    if (f.number !== null && String(f.number) !== '') payload.number = Number(f.number);

    const editing = this.invoice?.id;
    const request = this.invoice && editing !== undefined
      ? this.invoiceService.updateInvoice(editing, payload)
      : this.invoiceService.createInvoice(payload);

    this.isSubmitting = true;
    request.pipe(finalize(() => (this.isSubmitting = false))).subscribe({
      next: (invoice) => this.saved.emit({ invoice, created: !this.invoice }),
      error: (err) => (this.formError = err?.error?.error || 'Failed to save the invoice.')
    });
  }

  cancel(): void {
    if (this.isSubmitting) return;
    this.cancelled.emit();
  }
}
