import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { BookingService } from '../../services/booking.service';
import { BOOKING_STATUSES, Booking, BookingInput, BookingStatus } from '../../models/booking.model';
import { Product } from '../../models/product.model';
import { PhotoUploadComponent } from '../ui/photo-upload/photo-upload.component';
import { ProductSearchComponent } from '../ui/product-search/product-search.component';
import { formatDate, todayIso, weekdayName } from '../../utils/dates';
import { formatMoney } from '../../utils/money';

/** What the form tells its parent after a save. */
export interface BookingSaved {
  booking: Booking;
  /** true = a new booking, false = changes to an existing one. */
  created: boolean;
}

interface BookingFormValues {
  product_id: number | null;
  product_name: string;
  phone: string;
  telegram: string;
  full_price: number | null;
  deposit: number | null;
  booking_date: string;
  pickup_date: string;
  status: BookingStatus;
  images: string[];
}

function emptyValues(bookingDate: string): BookingFormValues {
  return {
    product_id: null, product_name: '', phone: '', telegram: '',
    full_price: null, deposit: null,
    booking_date: bookingDate, pickup_date: '', status: 'booked', images: []
  };
}

/** One price a customer can choose for a catalogue product: its normal price, or one of its "other prices". */
interface PriceOption {
  label: string;
  price: number;
  /** What the Product box says when this one is chosen, e.g. "MacBook Air M5 | 16GB / 512GB". */
  name: string;
}

const MAX_PHOTOS = 4;

/**
 * The booking form: what a customer reserves, how to reach them, the money, the dates and the photos.
 * Used in two places - the Bookings page (a drawer) and the "Book" dialog on the Products page.
 * The parent only provides the frame (title, close button) and reacts to (saved) and (cancelled).
 */
@Component({
  selector: 'app-booking-form',
  standalone: true,
  imports: [CommonModule, FormsModule, PhotoUploadComponent, ProductSearchComponent],
  templateUrl: './booking-form.component.html',
  styles: [`:host { display: flex; flex-direction: column; flex: 1 1 0%; min-height: 0; }`]
})
export class BookingFormComponent implements OnInit, OnChanges {
  /** Set = edit this booking. Empty = a new one. */
  @Input() booking: Booking | null = null;
  /** For a new booking: start from this product (name, link and price are filled in). */
  @Input() product: Product | null = null;
  /** Your products, offered while the Product box is typed in. */
  @Input() products: Product[] = [];
  /** "YYYY-MM-DD" of today: the booking date of a new booking. */
  @Input() today = todayIso();

  @Output() saved = new EventEmitter<BookingSaved>();
  @Output() cancelled = new EventEmitter<void>();

  @ViewChild(PhotoUploadComponent) private photoBox?: PhotoUploadComponent;

  readonly maxPhotos = MAX_PHOTOS;
  readonly statuses = BOOKING_STATUSES;
  readonly money = formatMoney;

  form: BookingFormValues = emptyValues(todayIso());
  isSubmitting = false;
  /** Pictures are still being sent: Save waits. */
  uploading = false;
  formError = '';

  /** Once the price was typed or chosen by hand, picking a product no longer overwrites it. */
  private priceTouched = false;
  /** The prices of the chosen catalogue product (kept in a field, not worked out on every refresh). */
  priceOptions: PriceOption[] = [];

  constructor(private bookingService: BookingService) { }

  ngOnInit(): void {
    if (this.booking) {
      const b = this.booking;
      this.form = {
        product_id: b.product_id,
        product_name: b.product_name,
        phone: b.phone ?? '',
        telegram: b.telegram ?? '',
        full_price: b.full_price,
        deposit: b.deposit,
        booking_date: b.booking_date,
        pickup_date: b.pickup_date,
        status: b.status,
        images: [...(b.images ?? [])]
      };
      this.priceTouched = true;                    // keep the agreed price, whatever product is picked
      this.refreshPriceOptions();
    } else {
      this.form = emptyValues(this.today);
      if (this.product) this.pickProduct(this.product);
      this.focusSoon(this.product ? 'b-phone' : 'b-product');
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // The products can arrive after the form opened.
    if ((changes['products'] && !changes['products'].firstChange) || (changes['product'] && !changes['product'].firstChange)) {
      this.refreshPriceOptions();
    }
  }

  // ---------- money and dates ----------

  get remaining(): number {
    return Math.round(((Number(this.form.full_price) || 0) - (Number(this.form.deposit) || 0)) * 100) / 100;
  }

  get depositTooBig(): boolean {
    return (Number(this.form.deposit) || 0) > (Number(this.form.full_price) || 0);
  }

  /** "12/11/2026 · Thursday": shown under a date box, so a date is never misread (the box itself follows the phone's language). */
  dateLabel(iso: string): string {
    const text = formatDate(iso);
    return text ? `${text} · ${weekdayName(iso)}` : '';
  }

  onPriceInput(): void {
    this.priceTouched = true;
  }

  // ---------- the Product box: suggestions from the products already made ----------

  get linkedProduct(): Product | null {
    const id = this.form.product_id;
    if (id === null) return null;
    return this.products.find(p => p.id === id) ?? (this.product?.id === id ? this.product : null);
  }

  /**
   * The photo of the laptop: the one picked, or the product with exactly the name that was typed (the API does the same).
   * It goes to Telegram first; the Photos box below is for more.
   */
  get laptopPhoto(): string | null {
    const laptop = this.linkedProduct ?? this.productNamedLikeTheBox();
    return laptop ? (laptop.image_url || (laptop.images ?? []).find(Boolean) || null) : null;
  }

  private productNamedLikeTheBox(): Product | null {
    const key = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
    const typed = [key(this.form.product_name), key(this.form.product_name.split('|')[0])].filter(Boolean);
    for (const name of typed) {
      const found = this.products.find(p => key(p.name) === name && (p.image_url || (p.images ?? []).some(Boolean)));
      if (found) return found;
    }
    return null;
  }

  /**
   * Said under the Product box only when the laptop cannot be booked now ('' = fine): a single laptop that someone else
   * has set aside (booked or in repair). Its own booking does not count, and counted stock can always be booked.
   */
  get holdBlockedNote(): string {
    const linked = this.linkedProduct;
    if (!linked || linked.track_stock || this.form.status !== 'booked' || !linked.hold_status) return '';
    if (this.booking?.stock_held && this.booking.product_id === linked.id) return '';
    return linked.hold_status === 'repair' ? 'This laptop is in repair.' : 'This laptop is already booked.';
  }

  /** The Product box was typed in: emptying it also unlinks the laptop. */
  onProductText(text: string): void {
    this.form.product_name = text;
    if (!text.trim()) this.unlinkProduct();
  }

  /** Fills the box with the product and, unless a price was already set by hand, its price. */
  pickProduct(product: Product): void {
    this.form.product_id = product.id ?? null;
    this.form.product_name = product.name;
    if (!this.priceTouched) this.form.full_price = Number(product.selling_price);
    this.refreshPriceOptions();
  }

  chooseOption(option: PriceOption): void {
    this.form.product_name = option.name;
    this.form.full_price = option.price;
    this.priceTouched = true;
  }

  unlinkProduct(): void {
    this.form.product_id = null;
    this.priceOptions = [];
  }

  private refreshPriceOptions(): void {
    const product = this.linkedProduct;
    if (!product || (product.extra_prices ?? []).length === 0) {
      this.priceOptions = [];
      return;
    }
    this.priceOptions = [
      { label: 'Normal price', price: Number(product.selling_price), name: product.name },
      ...(product.extra_prices ?? []).map(extra => ({ label: extra.label, price: Number(extra.price), name: `${product.name} | ${extra.label}` }))
    ];
  }

  // ---------- save ----------

  /** The first thing wrong with the form, in plain words ('' = fine). The API checks everything again. */
  private problem(): string {
    const f = this.form;
    if (!f.product_name.trim()) return 'Product is required.';
    if (!f.phone.trim() && !f.telegram.trim()) return 'Add a phone number or a Telegram username so the customer can be reached.';
    if (!(Number(f.full_price) > 0)) return 'Full price must be more than 0.';
    if (this.depositTooBig) return 'Deposit cannot be more than the full price.';
    if (!f.booking_date) return 'Booking date is required.';
    if (!f.pickup_date) return 'Pickup date is required.';
    if (f.pickup_date < f.booking_date) return 'Pickup date cannot be before the booking date.';
    return '';
  }

  submit(): void {
    if (this.isSubmitting || this.uploading) return;
    this.formError = this.problem();
    if (this.formError) return;

    const f = this.form;
    const payload: BookingInput = {
      product_id: f.product_id,
      product_name: f.product_name.trim(),
      phone: f.phone.trim() || null,
      telegram: f.telegram.trim() || null,
      full_price: Number(f.full_price),
      deposit: Number(f.deposit) || 0,
      booking_date: f.booking_date,
      pickup_date: f.pickup_date,
      status: f.status,
      images: [...f.images]
    };

    const editingId = this.booking?.id;
    const request = this.booking && editingId !== undefined
      ? this.bookingService.updateBooking(editingId, payload)
      : this.bookingService.createBooking(payload);

    this.isSubmitting = true;
    request.pipe(finalize(() => (this.isSubmitting = false))).subscribe({
      next: (saved) => {
        this.photoBox?.markSaved();                // the photos now belong to the booking
        this.saved.emit({ booking: saved, created: !this.booking });
      },
      error: (err) => (this.formError = err?.error?.error || 'Failed to save the booking.')
    });
  }

  cancel(): void {
    if (this.isSubmitting) return;
    this.cancelled.emit();
  }

  private focusSoon(id: string): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => document.getElementById(id)?.focus(), 60);
  }
}
