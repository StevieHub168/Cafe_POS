import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** What the grey shapes look like (the shape of the real thing that is coming). */
export type SkeletonKind = 'cards' | 'users' | 'table' | 'product-cards' | 'stats' | 'rows';

/**
 * The grey shapes shown while a list or a page loads. Each kind has the shape of what it stands in for (the photo, the lines, the
 * buttons), so the page does not jump when the real content arrives. Plain blocks: no spinner, no text. A screen reader hears "Loading".
 *   <app-skeleton kind="cards" [count]="4"></app-skeleton>
 */
@Component({
  selector: 'app-skeleton',
  standalone: true,
  imports: [CommonModule],
  // A block, so the page's spacing (space-y-*) applies to it: a custom element is inline by default and ignores vertical margins.
  styles: [':host { display: block; }'],
  template: `
    <div role="status" aria-busy="true" aria-live="polite" data-skeleton [attr.data-kind]="kind" class="animate-pulse motion-reduce:animate-none">
      <span class="sr-only">Loading</span>

      <ng-container [ngSwitch]="kind">

        <!-- Sales, Bookings and Repairs: a card with the photo, the lines, four facts and the buttons (two per row on a wide screen) -->
        <div *ngSwitchCase="'cards'" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div *ngFor="let n of items" data-skeleton-item class="flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div class="flex items-start gap-3 p-4">
              <div class="h-14 w-14 flex-shrink-0 rounded-lg bg-gray-200"></div>
              <div class="min-w-0 flex-1 space-y-2 pt-0.5">
                <div class="h-4 w-3/4 rounded bg-gray-200"></div>
                <div class="h-3 w-1/2 rounded bg-gray-100"></div>
                <div class="h-3 w-2/5 rounded bg-gray-100"></div>
              </div>
              <div class="h-6 w-16 rounded-full bg-gray-200"></div>
            </div>
            <div class="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 px-4 py-3">
              <div *ngFor="let fact of [1, 2, 3, 4]" class="space-y-1.5"><div class="h-3 w-1/3 rounded bg-gray-100"></div><div class="h-4 w-2/3 rounded bg-gray-200"></div></div>
            </div>
            <div class="grid grid-cols-4 gap-1 border-t border-gray-100 px-3 py-2">
              <div *ngFor="let button of [1, 2, 3, 4]" class="mx-auto h-10 w-14 rounded-lg bg-gray-100"></div>
            </div>
          </div>
        </div>

        <!-- Users: a person (round picture, two lines) and a button -->
        <div *ngSwitchCase="'users'" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div *ngFor="let n of items" data-skeleton-item class="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
            <div class="h-11 w-11 flex-shrink-0 rounded-full bg-gray-200"></div>
            <div class="min-w-0 flex-1 space-y-2"><div class="h-4 w-2/5 rounded bg-gray-200"></div><div class="h-3 w-3/5 rounded bg-gray-100"></div></div>
            <div class="h-9 w-28 rounded-lg bg-gray-100"></div>
          </div>
        </div>

        <!-- Products as a table: the header strip, then a row each (a small photo and two lines, the SKU, the price, the stock, the buttons) -->
        <div *ngSwitchCase="'table'" class="overflow-hidden rounded-lg border border-surface-border bg-white shadow-card">
          <div class="h-10 border-b border-surface-border bg-gray-50"></div>
          <div class="divide-y divide-surface-border">
            <div *ngFor="let n of items" data-skeleton-item class="flex items-center gap-3 px-3 py-3">
              <div class="h-11 w-11 flex-shrink-0 rounded-md bg-gray-200"></div>
              <div class="min-w-0 flex-1 space-y-2"><div class="h-4 w-2/5 rounded bg-gray-200"></div><div class="h-3 w-1/4 rounded bg-gray-100"></div></div>
              <div class="hidden h-3 w-20 rounded bg-gray-100 sm:block"></div>
              <div class="hidden h-4 w-16 rounded bg-gray-200 sm:block"></div>
              <div class="hidden h-6 w-24 rounded-full bg-gray-100 md:block"></div>
              <div class="h-6 w-14 rounded bg-gray-100"></div>
            </div>
          </div>
        </div>

        <!-- Products as cards (the Menu, or the Products page when "dense"): the photo, a name, a short line -->
        <div *ngSwitchCase="'product-cards'" class="grid grid-cols-2 xl:grid-cols-5"
          [ngClass]="dense ? 'gap-2.5 sm:grid-cols-3' : 'gap-4 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'">
          <div *ngFor="let n of items" data-skeleton-item class="flex min-w-0 flex-col overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <div class="bg-gray-200" [ngClass]="dense ? 'h-28' : 'h-36'"></div>
            <div class="space-y-2 p-3">
              <div class="h-4 w-4/5 rounded bg-gray-200"></div>
              <div class="h-3 w-2/5 rounded bg-gray-100"></div>
              <div class="h-3 w-3/5 rounded bg-gray-100"></div>
            </div>
          </div>
        </div>

        <!-- The numbers on top of a page: a small line and a big number -->
        <div *ngSwitchCase="'stats'" class="grid" [ngClass]="gridClass">
          <div *ngFor="let n of items" data-skeleton-item class="rounded-xl border border-surface-border bg-white px-4 py-3.5">
            <div class="h-3 w-1/2 rounded bg-gray-100"></div>
            <div class="mt-2 h-7 w-1/3 rounded bg-gray-200"></div>
          </div>
        </div>

        <!-- A simple list: a tick box, a small photo and two lines (the laptops of the Labels page) -->
        <div *ngSwitchCase="'rows'" class="space-y-1.5">
          <div *ngFor="let n of items" data-skeleton-item class="flex items-center gap-3 rounded-lg border border-transparent p-2">
            <div class="h-5 w-5 flex-shrink-0 rounded bg-gray-200"></div>
            <div class="h-12 w-12 flex-shrink-0 rounded-md bg-gray-200"></div>
            <div class="min-w-0 flex-1 space-y-2"><div class="h-4 w-3/5 rounded bg-gray-200"></div><div class="h-3 w-2/5 rounded bg-gray-100"></div></div>
          </div>
        </div>

      </ng-container>
    </div>
  `,
})
export class SkeletonComponent {
  @Input() kind: SkeletonKind = 'cards';
  /** How many shapes. */
  @Input() count = 4;
  /** Product cards: the smaller cards of the Products page (not the Menu). */
  @Input() dense = false;
  /** The numbers on top: how they are laid out (the classes of the grid). */
  @Input() gridClass = 'grid-cols-1 gap-3 sm:grid-cols-2';

  get items(): number[] {
    return Array.from({ length: Math.max(0, this.count) }, (_, i) => i);
  }
}
