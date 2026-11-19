import { Component, EventEmitter, HostListener, Input, OnChanges, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InvoicePaperComponent } from './invoice-paper.component';
import { Invoice, formatInvoiceNumber, typeInfo } from '../../models/invoice/invoice.model';
import { printPage, PAPER_HEIGHT, PAPER_WIDTH } from '../../utils/invoice-export/invoice-export';

/**
 * Shows the invoice as the paper it prints on, with one button: Print / Save PDF (and Edit). It exists only while it is
 * open: put it in the page with *ngIf. Esc and the ✕ close it.
 *
 * The paper is drawn twice: a smaller one to look at (made to fit the screen) and a full-size one hidden off to the side
 * (.invoice-export-root). The hidden one is what is printed, so the print never depends on how small the screen is.
 */
@Component({
  selector: 'app-invoice-viewer',
  standalone: true,
  imports: [CommonModule, InvoicePaperComponent],
  styles: [`
    .viewer-backdrop { animation: viewer-fade 150ms ease-out; }
    .viewer-panel    { animation: viewer-pop 180ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes viewer-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes viewer-pop  { from { opacity: 0; transform: translateY(8px) scale(0.98); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .viewer-backdrop, .viewer-panel { animation: none; } }
  `],
  template: `
    <div class="viewer-backdrop fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 p-3" (click)="close()">
      <div class="viewer-panel flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
           role="dialog" aria-modal="true" [attr.aria-label]="title" (click)="$event.stopPropagation()">

        <div class="flex flex-shrink-0 items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
          <div class="min-w-0">
            <h2 class="truncate text-base font-semibold text-gray-900">{{ title }}</h2>
            <p class="truncate text-xs text-gray-400">{{ kind.label }} invoice</p>
          </div>
          <button type="button" (click)="close()" [disabled]="locked" [attr.title]="locked ? 'Choose below first' : null"
            class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40 disabled:hover:bg-transparent" aria-label="Close">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <!-- What can be done with it -->
        <div class="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-surface-border bg-gray-50 px-4 py-2.5">
          <button type="button" (click)="print()"
            class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" /></svg>
            Print / Save PDF
          </button>
          <button type="button" (click)="edit.emit()"
            class="ml-auto rounded-lg px-3 py-1.5 text-sm font-medium text-primary-600 hover:bg-primary-50">Edit</button>
        </div>

        <!-- The paper, made to fit the screen -->
        <div class="min-h-0 flex-1 overflow-auto bg-gray-100 p-3">
          <div class="mx-auto shadow-md ring-1 ring-black/5" [style.width.px]="paperWidth * zoom" [style.height.px]="paperHeight * zoom">
            <div class="invoice-preview" [style.width.px]="paperWidth" [style.height.px]="paperHeight"
              style="transform-origin: top left" [style.transform]="'scale(' + zoom + ')'">
              <app-invoice-paper [invoice]="invoice"></app-invoice-paper>
            </div>
          </div>
        </div>

        <!-- The page can put its own bar here (e.g. "Mark this laptop as sold?"): it stays in view under the paper -->
        <ng-content select="[viewerFooter]"></ng-content>
      </div>
    </div>

    <!-- The full-size paper that is printed (hidden off to the side on screen; see styles.css) -->
    <div class="invoice-export-root" aria-hidden="true">
      <app-invoice-paper [invoice]="invoice"></app-invoice-paper>
    </div>
  `,
})
export class InvoiceViewerComponent implements OnInit, OnChanges {
  @Input({ required: true }) invoice!: Invoice;
  /** True while the page waits for an answer shown in the footer bar: the ✕, Esc and the dark background do nothing. */
  @Input() locked = false;
  /** Height (px) of the bar the page puts in the footer, so the paper is made smaller to leave room for it. */
  @Input() reserve = 0;

  @Output() closed = new EventEmitter<void>();
  /** The person wants to change this invoice. */
  @Output() edit = new EventEmitter<void>();

  readonly paperWidth = PAPER_WIDTH;
  readonly paperHeight = PAPER_HEIGHT;

  /** How much smaller than full size the paper is shown, so all of it fits the window. */
  zoom = 1;

  ngOnInit(): void {
    this.fit();
  }

  ngOnChanges(): void {
    this.fit();
  }

  get kind() {
    return typeInfo(this.invoice.type);
  }

  get title(): string {
    return `Invoice ${formatInvoiceNumber(this.invoice.number)}`;
  }

  @HostListener('window:resize')
  fit(): void {
    if (typeof window === 'undefined') return;
    // Room beside the paper: the panel is at most 42rem wide with 12 + 12 px of padding; the buttons and the title take about 150 px.
    const room = Math.min(window.innerWidth - 24, 672) - 24;
    const roomHigh = window.innerHeight - 24 - 170 - this.reserve;
    this.zoom = Math.max(0.3, Math.min(1, room / this.paperWidth, roomHigh / this.paperHeight));
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  /** The ✕, Esc and the dark background (not while the page waits for an answer). */
  close(): void {
    if (this.locked) return;
    this.closed.emit();
  }

  // The one thing that touches the browser, in its own small method (a test replaces it).
  protected printPaper(): Promise<void> {
    return printPage();
  }

  async print(): Promise<void> {
    await this.printPaper();
  }
}
