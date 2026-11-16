import { Component, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvoiceFormComponent, InvoiceSaved } from './invoice-form.component';
import { Invoice, InvoiceType, formatInvoiceNumber, typeInfo } from '../../models/invoice.model';
import { Product } from '../../models/product.model';
import { todayIso } from '../../utils/dates';

/**
 * The window to write a new invoice or change one: a panel from the right edge (like the product and booking forms) with
 * the invoice form inside. Esc, the ✕ and the dark background close it (but not while it is saving).
 * It exists only while it is open: put it in the page with *ngIf.
 */
@Component({
  selector: 'app-invoice-editor',
  standalone: true,
  imports: [CommonModule, InvoiceFormComponent],
  styles: [`
    .editor-backdrop { animation: editor-fade 150ms ease-out; }
    .editor-panel    { animation: editor-slide 220ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes editor-fade  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes editor-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .editor-backdrop, .editor-panel { animation: none; } }
  `],
  template: `
    <div class="editor-backdrop fixed inset-0 z-50 flex justify-end bg-gray-900/50" (click)="close()">
      <div class="editor-panel flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" role="dialog" aria-modal="true"
           [attr.aria-label]="title" (click)="$event.stopPropagation()">

        <div class="flex flex-shrink-0 items-center justify-between border-b border-surface-border px-5 py-4">
          <div class="min-w-0">
            <!-- When this window was opened from somewhere (a laptop), a way to go straight back there -->
            <button *ngIf="backLabel" type="button" (click)="close()"
              class="mb-1 inline-flex items-center gap-1 rounded text-xs font-medium text-primary-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
              {{ backLabel }}
            </button>
            <h2 class="text-base font-semibold text-gray-900">{{ title }}</h2>
            <p class="text-xs text-gray-400">{{ subtitle }}</p>
          </div>
          <button type="button" (click)="close()" class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <app-invoice-form [type]="type" [invoice]="invoice" [prefill]="prefill" [products]="products" [today]="today"
          (saved)="saved.emit($event)" (cancelled)="close()"></app-invoice-form>
      </div>
    </div>
  `,
})
export class InvoiceEditorComponent {
  /** The kind of a NEW invoice. */
  @Input() type: InvoiceType = 'sale';
  /** Set = change this invoice. */
  @Input() invoice: Invoice | null = null;
  /** For a new invoice: start with these values (e.g. from a booking). */
  @Input() prefill: Partial<Invoice> | null = null;
  @Input() products: Product[] = [];
  /** A short "Back to ..." button above the title ('' = none). It does the same as the ✕. */
  @Input() backLabel = '';

  @Output() saved = new EventEmitter<InvoiceSaved>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild(InvoiceFormComponent) private form?: InvoiceFormComponent;

  readonly today = todayIso();

  get title(): string {
    if (this.invoice) return `Edit invoice ${formatInvoiceNumber(this.invoice.number)}`;
    return `New ${typeInfo(this.type).label.toLowerCase()} invoice`;
  }

  get subtitle(): string {
    const kind = this.invoice?.type ?? this.type;
    if (kind === 'booking') return 'The paper for a customer who booked a laptop.';
    if (kind === 'repair') return 'The paper for a repair.';
    return 'The paper for a sale.';
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    if (this.form?.isSubmitting) return;      // saving: wait
    this.closed.emit();
  }
}
