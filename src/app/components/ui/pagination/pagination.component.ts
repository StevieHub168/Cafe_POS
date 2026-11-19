import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PAGE_SIZES } from '../../../utils/page-state/page-state';

/**
 * The bar under a list that has pages: "Showing 11–20 of 134", the "Per page" box (only when there is something to choose), and Previous / page numbers / Next.
 * It only says what the person asked for; the page that owns the list loads it.
 *   <app-pagination [page]="p.page" [perPage]="p.perPage" [total]="p.total" (pageChange)="goTo($event)" (perPageChange)="resize($event)">
 */
@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [CommonModule],
  styles: [':host { display: block; }'],
  template: `
    <!-- A soft card like the list above it. Two rows: the count and "Per page", then the page buttons under them (full width on a
         phone, with the numbers on the right from a tablet up). A really wide screen (xl) has room for one row: the count on the
         left and the controls together on the right. -->
    <nav *ngIf="total > 0" aria-label="Pages" data-pagination
      class="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-3 rounded-xl border border-surface-border bg-white px-4 py-3 shadow-sm xl:flex xl:gap-x-4">
      <p class="whitespace-nowrap text-sm text-gray-500 xl:mr-auto" data-range>
        Showing <span class="font-medium text-gray-700">{{ from }}–{{ to }}</span> of <span class="font-medium text-gray-700">{{ total }}</span>
      </p>

      <!-- Nothing to choose when even the smallest page shows everything -->
      <label *ngIf="showSizes" class="flex items-center gap-2 whitespace-nowrap text-sm text-gray-500">
        Per page
        <select data-per-page (change)="changeSize($event)" aria-label="How many on a page"
          class="h-10 rounded-lg border border-surface-border bg-white px-2 text-sm text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100">
          <option *ngFor="let size of sizeChoices" [value]="size" [selected]="size === perPage">{{ size }}</option>
        </select>
      </label>

      <div *ngIf="totalPages > 1" data-pager
        class="col-span-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:flex sm:justify-end sm:gap-1 xl:col-auto">
        <button type="button" data-previous (click)="go(page - 1)" [disabled]="disabled || page <= 1"
          class="inline-flex h-11 items-center justify-center gap-1 rounded-lg border border-surface-border bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10">
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" /></svg>
          Previous
        </button>

        <!-- Page numbers on a wide screen. On a phone: "Page 2 of 7". -->
        <ng-container *ngFor="let item of numbers">
          <span *ngIf="item === null" class="hidden px-1 text-gray-400 sm:inline" aria-hidden="true">…</span>
          <button *ngIf="item !== null" type="button" data-page (click)="go(item)" [disabled]="disabled" [attr.aria-current]="item === page ? 'page' : null"
            [attr.aria-label]="'Page ' + item"
            class="hidden h-10 min-w-[2.5rem] rounded-lg border px-2.5 text-sm font-medium tabular-nums transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:inline-flex sm:items-center sm:justify-center"
            [ngClass]="item === page ? 'border-primary-600 bg-primary-600 text-white' : 'border-surface-border bg-white text-gray-700 hover:bg-gray-50'">
            {{ item }}
          </button>
        </ng-container>
        <span class="px-2 text-center text-sm tabular-nums text-gray-600 sm:hidden" data-page-of>Page {{ page }} of {{ totalPages }}</span>

        <button type="button" data-next (click)="go(page + 1)" [disabled]="disabled || page >= totalPages"
          class="inline-flex h-11 items-center justify-center gap-1 rounded-lg border border-surface-border bg-white px-3 text-sm font-medium text-gray-700 transition hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:opacity-40 sm:h-10">
          Next
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
        </button>
      </div>
    </nav>
  `,
})
export class PaginationComponent {
  @Input() page = 1;
  @Input() perPage = PAGE_SIZES[0];
  @Input() total = 0;
  /** The choices of the "Per page" box. */
  @Input() sizes: number[] = PAGE_SIZES;
  /** While the next page is loading the buttons are off. */
  @Input() disabled = false;

  /** The page the person asked for (1-based). */
  @Output() pageChange = new EventEmitter<number>();
  /** The new number of rows on a page. */
  @Output() perPageChange = new EventEmitter<number>();

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.total / this.perPage));
  }

  get from(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.perPage + 1;
  }

  get to(): number {
    return Math.min(this.total, this.page * this.perPage);
  }

  /** The "Per page" box is only worth showing when there are more rows than the smallest page holds. */
  get showSizes(): boolean {
    return this.total > Math.min(...this.sizeChoices);
  }

  /** The choices, and the size in use even when it is not one of them. */
  get sizeChoices(): number[] {
    return this.sizes.includes(this.perPage) ? this.sizes : [...this.sizes, this.perPage].sort((a, b) => a - b);
  }

  /**
   * The page numbers to show: all of them when there are few; else the first, the last and the ones around this page,
   * with a gap (null) where numbers are left out.  1 … 4 [5] 6 … 12
   */
  get numbers(): (number | null)[] {
    const last = this.totalPages;
    if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
    const shown = new Set([1, last, this.page - 1, this.page, this.page + 1].filter(n => n >= 1 && n <= last));
    const sorted = [...shown].sort((a, b) => a - b);
    const out: (number | null)[] = [];
    sorted.forEach((n, i) => {
      if (i > 0 && n - sorted[i - 1] > 1) out.push(n - sorted[i - 1] === 2 ? n - 1 : null);
      out.push(n);
    });
    return out;
  }

  go(page: number): void {
    const next = Math.min(Math.max(1, page), this.totalPages);
    if (this.disabled || next === this.page) return;
    this.pageChange.emit(next);
    // The bar is under a long list: the new page starts from the top.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  changeSize(event: Event): void {
    const size = Number((event.target as HTMLSelectElement).value);
    if (Number.isInteger(size) && size > 0 && size !== this.perPage) this.perPageChange.emit(size);
  }
}
