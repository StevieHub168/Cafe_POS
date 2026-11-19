import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Product } from '../../../models/product.model';
import { ImgSrcPipe } from '../../../pipes/img-src.pipe';
import { formatMoney } from '../../../utils/money';

/**
 * "Type to find one of your products": a text box, and under it the products that match what is typed (photo, name, price).
 * Used wherever a form needs one of the shop's laptops (Booking, Repair), so they all look and work the same.
 *
 *   <app-product-search inputId="b-product" [products]="products" [text]="form.name"
 *     (textChange)="form.name = $event" (picked)="pick($event)"></app-product-search>
 *
 * Nothing is listed until something is typed. Click one (or press Enter for the first one) to pick it. Without a match,
 * Enter is left alone, so a form still submits as usual.
 */
@Component({
  selector: 'app-product-search',
  standalone: true,
  imports: [CommonModule, ImgSrcPipe],
  styles: [`:host { display: block; }`],
  template: `
    <input [id]="inputId" type="text" [attr.name]="name" [value]="text" (input)="onInput($event)"
      (blur)="hide()" (keydown.enter)="onEnter($event)" autocomplete="off" [attr.maxlength]="maxlength" [placeholder]="placeholder"
      class="w-full rounded-lg border border-surface-border px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100" />

    <ul *ngIf="suggestions.length > 0" aria-label="Your products that match"
      class="mt-1 divide-y divide-surface-border overflow-hidden rounded-lg border border-surface-border bg-white shadow-sm">
      <li *ngFor="let suggestion of suggestions">
        <button type="button" (mousedown)="choose($event, suggestion)"
          class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50">
          <span class="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-gray-100">
            <img *ngIf="suggestion.image_url" [src]="suggestion.image_url | imgSrc" alt="" class="h-full w-full object-cover" />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-gray-900">{{ suggestion.name }}</span>
            <span class="block truncate text-xs text-gray-400">{{ suggestion.brand }} {{ suggestion.model }}</span>
          </span>
          <span *ngIf="suggestion.hold_status" class="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">{{ suggestion.hold_status === 'repair' ? 'In repair' : 'Booked' }}</span>
          <span class="text-sm font-medium tabular-nums text-gray-700">{{ money(suggestion.selling_price) }}</span>
        </button>
      </li>
    </ul>
  `,
})
export class ProductSearchComponent {
  /** The id of the text box (so a <label for="..."> can point at it). */
  @Input() inputId = 'product-search';
  @Input() name = 'product';
  @Input() placeholder = '';
  @Input() maxlength: number | null = 255;
  /** What is in the box. The parent keeps it (see textChange) and may change it, e.g. when a product is picked. */
  @Input() text = '';
  /** The products that can be found. Archived ones never are. */
  @Input() products: Product[] = [];
  /** true = a laptop that is booked or in repair is not offered. false = it is offered, with a small tag saying so. */
  @Input() hideHeld = false;
  /** How many matches are listed at most. */
  @Input() limit = 6;

  /** Every change of the text typed in the box. */
  @Output() textChange = new EventEmitter<string>();
  /** A product was chosen from the list. */
  @Output() picked = new EventEmitter<Product>();

  readonly money = formatMoney;
  suggestions: Product[] = [];

  onInput(event: Event): void {
    this.text = (event.target as HTMLInputElement).value;
    this.textChange.emit(this.text);
    this.suggestions = this.matches(this.text);
  }

  private matches(typed: string): Product[] {
    const q = typed.trim().toLowerCase();
    if (!q) return [];
    const words = q.split(/\s+/);
    return this.products
      .filter(p => !p.is_archived && !(this.hideHeld && p.hold_status))
      .filter(p => {
        const haystack = `${p.name} ${p.brand ?? ''} ${p.model ?? ''} ${p.sku}`.toLowerCase();
        return words.every(w => haystack.includes(w));
      })
      .slice(0, this.limit);
  }

  hide(): void {
    this.suggestions = [];
  }

  /** Enter picks the first match; with none, Enter is left alone. */
  onEnter(event: Event): void {
    if (this.suggestions.length === 0) return;
    event.preventDefault();
    this.pick(this.suggestions[0]);
  }

  /** mousedown, not click: the box must not lose the focus (and hide the list) before the click lands. */
  choose(event: Event, product: Product): void {
    event.preventDefault();
    this.pick(product);
  }

  private pick(product: Product): void {
    this.suggestions = [];
    this.picked.emit(product);
  }
}
