import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { RepairService } from '../../services/repair.service';
import { MAX_REPAIR_DEVICE, MAX_REPAIR_PROBLEM, Repair, RepairInput } from '../../models/repair.model';
import { Invoice, Warranty, formatInvoiceNumber } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { formatDate, todayIso, weekdayName } from '../../utils/dates';
import { warrantyText } from '../../utils/warranty';

/** What the form tells its parent after a save. */
export interface RepairSaved {
  repair: Repair;
  /** true = a new repair, false = changes to an existing one. */
  created: boolean;
  /** The person switched on "Make an invoice now" (only when the repair is new). */
  makeInvoice: boolean;
}

/** Whose laptop it is: one of the shop's (picked from Products) or a customer's (typed). */
type Source = 'shop' | 'customer';

interface RepairFormValues {
  source: Source;
  product_id: number | null;
  device: string;
  customer_name: string;
  phone: string;
  telegram: string;
  problem: string;
  received_date: string;
  back_on: string;
  cost: number | null;
  sale_invoice_id: number | null;
  makeInvoice: boolean;
}

/** The Sale of the laptop (when the shop sold it): what the note under the form says. */
interface SaleNote {
  id: number;
  number: number;
  date: string;
  warranty: Warranty;
}

const sameName = (a: string, b: string) => a.trim().replace(/\s+/g, ' ').toLowerCase() === b.trim().replace(/\s+/g, ' ').toLowerCase();
const digits = (text: string | null | undefined) => (text ?? '').replace(/\D/g, '');

/**
 * "New repair" / "Edit repair": a panel from the right edge with the form inside. A repair starts at step 1 (Received).
 * Esc, the ✕ and the dark background close it (but not while it is saving). It exists only while it is open: put it in
 * the page with *ngIf.
 */
@Component({
  selector: 'app-repair-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './repair-form.component.html',
  styles: [`
    .repair-backdrop { animation: repair-fade 150ms ease-out; }
    .repair-panel    { animation: repair-slide 220ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes repair-fade  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes repair-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .repair-backdrop, .repair-panel { animation: none; } }
  `]
})
export class RepairFormComponent implements OnInit {
  /** Set = change this repair. */
  @Input() repair: Repair | null = null;
  /** For a new repair: start with these values (a laptop picked in the Menu, or a laptop the shop sold). */
  @Input() prefill: Partial<Repair> | null = null;
  /** The shop's laptops (the "A laptop of my shop" list). */
  @Input() products: Product[] = [];
  /** The shop's Sales: used to say "sold by you, warranty ..." when the device is one of them. */
  @Input() sales: Invoice[] = [];
  /** A short "Back to ..." button above the title ('' = none). It does the same as the ✕. */
  @Input() backLabel = '';
  /** "YYYY-MM-DD" of today: the received date of a new repair. */
  @Input() today = todayIso();

  @Output() saved = new EventEmitter<RepairSaved>();
  @Output() closed = new EventEmitter<void>();

  readonly maxDevice = MAX_REPAIR_DEVICE;
  readonly maxProblem = MAX_REPAIR_PROBLEM;

  form: RepairFormValues = this.emptyValues();
  isSubmitting = false;
  formError = '';
  /** The laptops of the shop, A-Z (kept in a field, not worked out on every refresh). */
  shopLaptops: Product[] = [];

  constructor(private repairService: RepairService) { }

  ngOnInit(): void {
    this.shopLaptops = this.products.filter(p => !p.is_archived).sort((a, b) => a.name.localeCompare(b.name));
    if (this.repair) {
      this.fillFrom(this.repair);
    } else {
      this.form = this.emptyValues();
      if (this.prefill) this.applyPrefill(this.prefill);
    }
  }

  private emptyValues(): RepairFormValues {
    return {
      source: 'customer', product_id: null, device: '', customer_name: '', phone: '', telegram: '', problem: '',
      received_date: this.today, back_on: '', cost: null, sale_invoice_id: null, makeInvoice: false
    };
  }

  private fillFrom(repair: Repair): void {
    this.form = {
      source: repair.product_id !== null ? 'shop' : 'customer',
      product_id: repair.product_id,
      device: repair.device,
      customer_name: repair.customer_name ?? '',
      phone: repair.phone ?? '',
      telegram: repair.telegram ?? '',
      problem: repair.problem,
      received_date: repair.received_date,
      back_on: repair.back_on ?? '',
      cost: repair.cost,
      sale_invoice_id: repair.sale_invoice_id,
      makeInvoice: false
    };
  }

  private applyPrefill(prefill: Partial<Repair>): void {
    const f = this.form;
    f.product_id = prefill.product_id ?? null;
    f.source = f.product_id !== null ? 'shop' : 'customer';
    f.device = prefill.device ?? '';
    f.customer_name = prefill.customer_name ?? '';
    f.phone = prefill.phone ?? '';
    f.telegram = prefill.telegram ?? '';
    f.problem = prefill.problem ?? '';
    f.sale_invoice_id = prefill.sale_invoice_id ?? null;
    if (prefill.received_date) f.received_date = prefill.received_date;
  }

  // ---------- whose laptop ----------

  chooseSource(source: Source): void {
    if (this.form.source === source) return;
    this.form.source = source;
    if (source === 'customer') {
      this.form.product_id = null;
    } else {
      // back to the shop's laptops: the device is the laptop that is picked (or nothing until one is)
      const picked = this.shopLaptops.find(p => p.id === this.form.product_id);
      this.form.device = picked ? picked.name.slice(0, this.maxDevice) : '';
      if (!picked) this.form.product_id = null;
    }
  }

  /** A laptop that is booked or in repair says so in the list. */
  laptopLabel(laptop: Product): string {
    return laptop.hold_status === 'booked' ? `${laptop.name} (booked)` : laptop.hold_status === 'repair' ? `${laptop.name} (in repair)` : laptop.name;
  }

  /** The laptop of the shop that is picked (null = none, or a customer's laptop). */
  private get pickedLaptop(): Product | null {
    return this.form.source === 'shop' && this.form.product_id !== null ? this.shopLaptops.find(p => p.id === this.form.product_id) ?? null : null;
  }

  /**
   * What saving will do to the laptop of the shop ('' = nothing): a repair that is 'received' takes it off the shelf.
   * Counted stock goes down by one; a single laptop is set aside as "In repair" until it is fixed.
   */
  get holdNote(): string {
    const laptop = this.pickedLaptop;
    if (!laptop || (this.repair && this.repair.status !== 'received')) return '';
    const own = !!this.repair?.stock_held && this.repair.product_id === laptop.id;
    if (laptop.track_stock) {
      if (own) return 'One laptop is taken from stock while it is in repair.';
      return laptop.stock_quantity > 0 ? `One will be taken from stock (${laptop.stock_quantity} now).` : 'None left in stock, so nothing is taken.';
    }
    if (own) return 'This laptop is set aside while it is in repair.';
    if (laptop.hold_status === 'booked') return 'This laptop is booked: it stays set aside for the booking.';
    if (laptop.hold_status === 'repair') return 'This laptop is already in repair.';
    return 'This laptop will be set aside (off the Menu) until it is fixed.';
  }

  /** A laptop picked from the list: its name is the device. */
  pickLaptop(): void {
    const picked = this.shopLaptops.find(p => p.id === Number(this.form.product_id));
    this.form.product_id = picked?.id ?? null;
    this.form.device = picked ? picked.name.slice(0, this.maxDevice) : '';
  }

  // ---------- the Sale of this laptop (warranty) ----------

  /** The Sale of this laptop, when the shop sold it: the one this repair was started from, or the one with this device
   *  that was sold to this phone / Telegram. null = not ours (or we cannot tell). */
  get sale(): SaleNote | null {
    const f = this.form;
    if (f.sale_invoice_id !== null) {
      const sale = this.sales.find(s => s.id === f.sale_invoice_id);
      if (sale) return { id: sale.id as number, number: sale.number, date: sale.invoice_date, warranty: sale.warranty };
      const r = this.repair;
      if (r && r.sale_invoice_id === f.sale_invoice_id && r.sale_invoice_number && r.sale_date && r.sale_warranty) {
        return { id: f.sale_invoice_id, number: r.sale_invoice_number, date: r.sale_date, warranty: r.sale_warranty };
      }
      return null;
    }
    const device = f.device.trim();
    if (!device || (!digits(f.phone) && !f.telegram.trim())) return null;
    const match = this.sales.find(s =>
      s.items.some(item => sameName(item.name, device))
      && ((digits(f.phone) !== '' && digits(s.phone) === digits(f.phone))
        || (f.telegram.trim() !== '' && (s.telegram ?? '').toLowerCase() === f.telegram.trim().toLowerCase())));
    return match ? { id: match.id as number, number: match.number, date: match.invoice_date, warranty: match.warranty } : null;
  }

  get saleNote(): string {
    const sale = this.sale;
    if (!sale) return '';
    return `Sold by you: Sale ${formatInvoiceNumber(sale.number)}. Warranty: ${warrantyText(sale.date, sale.warranty)}.`;
  }

  // ---------- dates ----------

  dateLabel(iso: string): string {
    const text = formatDate(iso);
    return text ? `${text} · ${weekdayName(iso)}` : '';
  }

  get title(): string {
    return this.repair ? 'Edit repair' : 'New repair';
  }

  // ---------- save ----------

  /** The first thing wrong with the form, in plain words ('' = fine). The API checks everything again. */
  private problem(): string {
    const f = this.form;
    if (f.source === 'shop' && f.product_id === null) return 'Pick the laptop from your products.';
    if (!f.device.trim()) return 'Write the laptop or device.';
    if (f.device.trim().length > this.maxDevice) return `The laptop or device is too long (max ${this.maxDevice} characters).`;
    if (!f.problem.trim()) return 'Write what is wrong.';
    if (f.problem.trim().length > this.maxProblem) return `The problem is too long (max ${this.maxProblem} characters).`;
    if (!f.received_date) return 'The received date is required.';
    if (f.back_on && f.back_on < f.received_date) return 'The back-on date cannot be before the received date.';
    if (f.cost !== null && String(f.cost) !== '' && !(Number(f.cost) >= 0)) return 'The cost must be a number of 0 or more.';
    return '';
  }

  submit(): void {
    if (this.isSubmitting) return;
    this.formError = this.problem();
    if (this.formError) return;

    const f = this.form;
    const payload: RepairInput = {
      product_id: f.source === 'shop' ? f.product_id : null,
      device: f.device.trim(),
      customer_name: f.customer_name.trim() || null,
      phone: f.phone.trim() || null,
      telegram: f.telegram.trim() || null,
      problem: f.problem.trim(),
      received_date: f.received_date,
      back_on: f.back_on || null,
      cost: f.cost === null || String(f.cost) === '' ? null : Number(f.cost),
      status: this.repair?.status ?? 'received',
      sale_invoice_id: this.sale?.id ?? null
    };

    const editing = this.repair?.id;
    const request = this.repair && editing !== undefined
      ? this.repairService.updateRepair(editing, payload)
      : this.repairService.createRepair(payload);

    this.isSubmitting = true;
    request.pipe(finalize(() => (this.isSubmitting = false))).subscribe({
      next: (repair) => this.saved.emit({ repair, created: !this.repair, makeInvoice: !this.repair && f.makeInvoice }),
      error: (err) => (this.formError = err?.error?.error || 'Failed to save the repair.')
    });
  }

  // ---------- closing ----------

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    if (this.isSubmitting) return;     // saving: wait
    this.closed.emit();
  }
}
