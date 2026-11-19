import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { BookingService } from '../../services/booking/booking.service';
import { Booking, PickupResult } from '../../models/booking/booking.model';
import { WARRANTY_CHOICES, Warranty } from '../../models/invoice/invoice.model';
import { formatDate } from '../../utils/dates/dates';
import { formatMoney } from '../../utils/money/money';

/**
 * "Customer picked up": the customer is here for the laptop they booked. One button closes the booking, makes the Sale
 * (paid in full: the deposit already paid + what is collected now) and marks the laptop as sold. The Sale starts from the
 * booking (laptop, price, phone, Telegram); the customer's name and the warranty can be added. Esc, the ✕ and the dark
 * background close it (but not while it is saving). It exists only while it is open: put it in the page with *ngIf.
 */
@Component({
  selector: 'app-booking-pickup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './booking-pickup.component.html',
  styles: [`
    .pickup-backdrop { animation: pickup-fade 150ms ease-out; }
    .pickup-panel    { animation: pickup-slide 220ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes pickup-fade  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pickup-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .pickup-backdrop, .pickup-panel { animation: none; } }
  `]
})
export class BookingPickupComponent implements OnInit {
  @Input({ required: true }) booking!: Booking;

  /** The Sale was made: the booking, the Sale and what happened to the laptop. */
  @Output() picked = new EventEmitter<PickupResult>();
  @Output() closed = new EventEmitter<void>();

  readonly warranties = WARRANTY_CHOICES;
  readonly money = formatMoney;
  readonly date = formatDate;

  form = { customer_name: '', phone: '', telegram: '', warranty: '1_week' as Warranty };
  isSubmitting = false;
  formError = '';

  constructor(private bookingService: BookingService) { }

  ngOnInit(): void {
    this.form.phone = this.booking.phone ?? '';
    this.form.telegram = this.booking.telegram ?? '';
  }

  /** Step 3 of "What happens": what becomes of the laptop ('' = no laptop of the shop). A booking already took its laptop off the shelf. */
  get laptopStep(): string {
    const b = this.booking;
    if (b.product_id === null || b.product_id === undefined) return '';
    if (b.stock_held) return b.product_track_stock ? 'The laptop is sold. One was already taken from stock when it was booked.' : 'The laptop is marked as sold. It is already off the Menu.';
    return 'The laptop is marked as sold and leaves the Menu.';
  }

  /** What is still to pay: the full price minus the deposit that was already paid. */
  get balance(): number {
    return this.booking.remaining_balance ?? Math.round((this.booking.full_price - this.booking.deposit) * 100) / 100;
  }

  /** What the main button says. */
  get buttonLabel(): string {
    if (this.isSubmitting) return 'Making the sale...';
    return this.balance > 0 ? `Collect ${formatMoney(this.balance)} and make the sale` : 'Make the sale';
  }

  chooseWarranty(warranty: Warranty): void {
    this.form.warranty = warranty;
  }

  submit(): void {
    if (this.isSubmitting) return;
    this.formError = '';
    const f = this.form;
    const id = this.booking.id;
    if (id === undefined) return;

    this.isSubmitting = true;
    this.bookingService.pickUp(id, {
      warranty: f.warranty,
      customer_name: f.customer_name.trim(),
      phone: f.phone.trim() || null,
      telegram: f.telegram.trim() || null
    }).pipe(finalize(() => (this.isSubmitting = false))).subscribe({
      next: (result) => this.picked.emit(result),
      // Stay open and say why, so the message is where you are looking ("This booking is already picked up").
      error: (err) => (this.formError = err?.error?.error || 'Could not make the sale. Nothing was changed. Please try again.')
    });
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    if (this.isSubmitting) return;     // saving: wait
    this.closed.emit();
  }
}
