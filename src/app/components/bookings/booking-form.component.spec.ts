import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of, throwError } from 'rxjs';
import { BookingFormComponent, BookingSaved } from './booking-form.component';
import { BookingService } from '../../services/booking/booking.service';
import { ProductService } from '../../services/product/product.service';
import { PhotoUploadComponent } from '../ui/photo-upload/photo-upload.component';
import { Booking } from '../../models/booking/booking.model';
import { Product } from '../../models/product/product.model';

// The booking from the shop's own example message.
const EXAMPLE: Booking = {
  id: 1, product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
  full_price: 1050, deposit: 500, remaining_balance: 550, booking_date: '2026-11-08', pickup_date: '2026-11-12',
  status: 'booked', images: [], product_image: '/uploads/air.png',
};

const booking = (over: Partial<Booking> = {}): Booking => ({ ...EXAMPLE, ...over });
const product = (over: Partial<Product> = {}): Product => ({
  id: 7, sku: 'MAC-901', name: 'MacBook Air M5', category_id: 1, brand: 'Apple', model: '', selling_price: 999,
  extra_prices: [], stock_quantity: 1, min_stock_level: 0, is_archived: false, image_url: '/uploads/air.png', ...over,
});

const picture = (name = 'receipt.png') => new File([new Uint8Array(100)], name, { type: 'image/png' });

interface Options {
  booking?: Booking | null;
  product?: Product | null;
  products?: Product[];
  today?: string;
}

describe('BookingFormComponent', () => {
  let fixture: ComponentFixture<BookingFormComponent>;
  let component: BookingFormComponent;
  let bookingsApi: { [k: string]: jasmine.Spy };
  let productsApi: { [k: string]: jasmine.Spy };
  let saved: BookingSaved[];
  let cancelled: number;

  async function create(options: Options = {}): Promise<void> {
    let uploads = 0;
    bookingsApi = {
      createBooking: jasmine.createSpy('createBooking').and.callFake((b: any) => of({ id: 99, remaining_balance: b.full_price - b.deposit, ...b })),
      updateBooking: jasmine.createSpy('updateBooking').and.callFake((id: number, b: any) => of({ id, remaining_balance: b.full_price - b.deposit, ...b })),
    };
    productsApi = {
      uploadImage: jasmine.createSpy('uploadImage').and.callFake(() => of({ url: `/uploads/receipt-${++uploads}.png` })),
      discardImage: jasmine.createSpy('discardImage').and.returnValue(of({ message: 'Photo removed' })),
    };
    await TestBed.configureTestingModule({
      imports: [BookingFormComponent],
      providers: [
        { provide: BookingService, useValue: bookingsApi },
        { provide: ProductService, useValue: productsApi },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(BookingFormComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('today', options.today ?? '2026-11-09');
    if (options.booking) fixture.componentRef.setInput('booking', options.booking);
    if (options.product) fixture.componentRef.setInput('product', options.product);
    fixture.componentRef.setInput('products', options.products ?? [product()]);
    saved = [];
    cancelled = 0;
    component.saved.subscribe(result => saved.push(result));
    component.cancelled.subscribe(() => cancelled++);
    fixture.detectChanges();
    await settle();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => dom().textContent ?? '';
  const buttonIn = (label: string) => Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const input = (selector: string) => dom().querySelector(selector) as HTMLInputElement;
  const type = (selector: string, value: string) => {
    const el = input(selector);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  // Lets the promises that are already waiting finish (Angular wires a form box a moment after it appears), then redraws.
  const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };

  const photoBox = () => fixture.debugElement.query(By.directive(PhotoUploadComponent)).componentInstance as PhotoUploadComponent;
  const addPhotos = (...files: File[]) => {
    photoBox().onFilesSelected({ target: { files, value: 'x' } } as unknown as Event);
    fixture.detectChanges();
  };
  const laptopPhotoShown = () => dom().querySelector('app-photo-upload img[alt="Photo preview"]') as HTMLImageElement | null;

  /** Fills a valid booking in (through the form the boxes are bound to). */
  const fillValid = () => {
    Object.assign(component.form, {
      product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
      full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12',
    });
  };

  it('should create', async () => {
    await create();
    expect(component).toBeTruthy();
  });

  // ---------------------------------------------------------------------------------------------
  describe('a new booking', () => {
    it('starts empty, with today as the booking date and the status Booked', async () => {
      await create();
      expect(component.form.product_name).toBe('');
      expect(component.form.booking_date).toBe('2026-11-09');
      expect(component.form.pickup_date).toBe('');
      expect(component.form.status).toBe('booked');
      expect(component.form.images).toEqual([]);
      expect(buttonIn('Save booking')).toBeTruthy();
      expect(text()).not.toContain('From your products');
    });

    it('spells the dates out under the boxes: 09/11/2026 · Monday', async () => {
      await create();
      expect(text()).toContain('09/11/2026 · Monday');
      type('#b-pickup', '2026-11-12');
      expect(text()).toContain('12/11/2026 · Thursday');
    });

    it('marks Phone and Telegram with the red * like the other needed boxes', async () => {
      await create();
      for (const id of ['b-product', 'b-phone', 'b-telegram', 'b-price', 'b-booked', 'b-pickup']) {
        expect(dom().querySelector(`label[for="${id}"] .text-red-500`)?.textContent).withContext(id).toBe('*');
      }
      expect(dom().querySelector('label[for="b-deposit"] .text-red-500')).toBeNull();      // the deposit is optional
      expect(text()).not.toContain('at least one');                                         // and no extra line to explain it
    });

    it('a short Telegram username like "li" or "aa" is accepted (the form only needs one of phone / Telegram)', async () => {
      await create();
      fillValid();
      component.form.phone = '';
      for (const name of ['li', 'aa', '@li']) {
        component.form.telegram = name;
        component.submit();
        expect(component.formError).withContext(name).toBe('');
      }
    });

    describe('started from a product (the Book button on the Products page)', () => {
      const air = () => product({ id: 7, name: 'MacBook Air M5', selling_price: 999, extra_prices: [{ label: '16GB / 512GB', price: 1050 }] });

      it('fills in the product name, the link and its price', async () => {
        await create({ product: air(), products: [air()] });
        expect(component.form.product_name).toBe('MacBook Air M5');
        expect(component.form.product_id).toBe(7);
        expect(component.form.full_price).toBe(999);
        expect(text()).not.toContain('From your products');
      });

      it('offers the product\'s other prices as buttons, and choosing one sets the name and the price', async () => {
        await create({ product: air(), products: [air()] });
        const options = () => Array.from(dom().querySelectorAll('[aria-label="Prices of this product"] button')) as HTMLButtonElement[];
        expect(options().map(b => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Normal price · $999', '16GB / 512GB · $1,050']);
        options()[1].click();
        fixture.detectChanges();
        expect(component.form.product_name).toBe('MacBook Air M5 | 16GB / 512GB');
        expect(component.form.full_price).toBe(1050);
      });

      it('still works when the product is not in the list given (it is linked anyway)', async () => {
        await create({ product: air(), products: [] });
        expect(component.linkedProduct?.name).toBe('MacBook Air M5');
        expect(dom().querySelectorAll('[aria-label="Prices of this product"] button').length).toBe(2);
      });

      it('saves the booking with that product', async () => {
        await create({ product: air(), products: [air()] });
        component.form.phone = '011968240';
        component.form.pickup_date = '2026-11-12';
        component.submit();
        const sent = bookingsApi['createBooking'].calls.mostRecent().args[0];
        expect(sent.product_id).toBe(7);
        expect(sent.product_name).toBe('MacBook Air M5');
        expect(sent.full_price).toBe(999);
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('remaining balance', () => {
    it('is worked out as you type: price minus deposit', async () => {
      await create();
      type('#b-price', '1050');
      expect(dom().querySelector('[aria-live="polite"]')!.textContent).toContain('$1,050');      // no deposit yet: all of it
      type('#b-deposit', '500');
      expect(dom().querySelector('[aria-live="polite"]')!.textContent).toContain('$550');
    });

    it('goes red and says so when the deposit is more than the price', async () => {
      await create();
      type('#b-price', '100');
      type('#b-deposit', '150');
      const line = dom().querySelector('[aria-live="polite"]') as HTMLElement;
      expect(line.textContent).toContain('Deposit is more than the price');
      expect(line.className).toContain('bg-red-50');
    });

    it('copes with cents', async () => {
      await create();
      component.form.full_price = 999.99;
      component.form.deposit = 100.1;
      expect(component.remaining).toBe(899.89);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('checks before saving (nothing is sent until it is right)', () => {
    const tryToSave = async (changes: object, message: string) => {
      await create();
      fillValid();
      Object.assign(component.form, changes);
      fixture.detectChanges();
      component.submit();
      fixture.detectChanges();
      expect(component.formError).toBe(message);
      expect(text()).toContain(message);
      expect(bookingsApi['createBooking']).not.toHaveBeenCalled();
    };

    it('needs a product', () => tryToSave({ product_name: '   ' }, 'Product is required.'));
    it('needs a phone or a Telegram', () => tryToSave({ phone: '', telegram: '  ' }, 'Add a phone number or a Telegram username so the customer can be reached.'));
    it('needs a price above 0', () => tryToSave({ full_price: 0 }, 'Full price must be more than 0.'));
    it('needs a price', () => tryToSave({ full_price: null }, 'Full price must be more than 0.'));
    it('the deposit cannot be more than the price', () => tryToSave({ deposit: 2000 }, 'Deposit cannot be more than the full price.'));
    it('needs a pickup date', () => tryToSave({ pickup_date: '' }, 'Pickup date is required.'));
    it('needs a booking date', () => tryToSave({ booking_date: '' }, 'Booking date is required.'));
    it('pickup cannot be before the booking date', () => tryToSave({ booking_date: '2026-11-12', pickup_date: '2026-11-08' }, 'Pickup date cannot be before the booking date.'));

    it('one of phone / Telegram is enough', async () => {
      await create();
      fillValid();
      component.form.phone = '';
      component.submit();
      expect(bookingsApi['createBooking']).toHaveBeenCalled();
    });

    it('pickup on the same day is fine', async () => {
      await create();
      fillValid();
      component.form.pickup_date = component.form.booking_date;
      component.submit();
      expect(bookingsApi['createBooking']).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('saving a new booking', () => {
    it('sends the booking exactly as the example, with blanks tidied', async () => {
      await create();
      fillValid();
      component.form.product_name = '  MacBook Air M5 | RAM 16GB | SSD 512GB  ';
      component.form.phone = ' 011968240 ';
      component.submit();
      expect(bookingsApi['createBooking']).toHaveBeenCalledOnceWith({
        product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
        full_price: 1050, deposit: 500, booking_date: '2026-11-08', pickup_date: '2026-11-12', status: 'booked', images: [],
      });
    });

    it('an empty phone / Telegram is sent as null, and an empty deposit as 0', async () => {
      await create();
      fillValid();
      component.form.phone = '';
      component.form.deposit = null;
      component.submit();
      const sent = bookingsApi['createBooking'].calls.mostRecent().args[0];
      expect(sent.phone).toBeNull();
      expect(sent.deposit).toBe(0);
    });

    it('tells its parent what was saved (a new one)', async () => {
      await create();
      fillValid();
      component.submit();
      expect(saved.length).toBe(1);
      expect(saved[0].created).toBeTrue();
      expect(saved[0].booking.id).toBe(99);
      expect(saved[0].booking.product_name).toBe('MacBook Air M5 | RAM 16GB | SSD 512GB');
    });

    it('shows the reason when the API refuses and lets you try again', async () => {
      await create();
      bookingsApi['createBooking'].and.returnValue(throwError(() => ({ error: { error: 'Telegram username looks wrong. Example: @Horth_Heng (2-32 letters, numbers or _)' } })));
      fillValid();
      component.submit();
      fixture.detectChanges();
      expect(text()).toContain('Telegram username looks wrong');
      expect(saved.length).toBe(0);
      expect(component.isSubmitting).toBeFalse();
      expect(buttonIn('Save booking').disabled).toBeFalse();
    });

    it('a failed save without a reason from the server says so in plain words', async () => {
      await create();
      bookingsApi['createBooking'].and.returnValue(throwError(() => new Error('offline')));
      fillValid();
      component.submit();
      expect(component.formError).toBe('Failed to save the booking.');
    });

    it('a second click while it is saving does nothing', async () => {
      await create();
      const pending = new Subject<Booking>();
      bookingsApi['createBooking'].and.returnValue(pending);
      fillValid();
      component.submit();
      component.submit();
      fixture.detectChanges();
      expect(bookingsApi['createBooking']).toHaveBeenCalledTimes(1);
      expect(text()).toContain('Saving...');
      pending.next(booking());
      pending.complete();
      expect(saved.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('editing a booking', () => {
    it('is filled in with that booking', async () => {
      await create({ booking: booking({ images: ['/uploads/receipt.png'] }), products: [product({ id: 7 })] });
      expect(input('#b-product').value).toBe('MacBook Air M5 | RAM 16GB | SSD 512GB');
      expect(input('#b-phone').value).toBe('011968240');
      expect(input('#b-telegram').value).toBe('@Horth_Heng');
      expect(input('#b-price').value).toBe('1050');
      expect(input('#b-deposit').value).toBe('500');
      expect(input('#b-booked').value).toBe('2026-11-08');
      expect(input('#b-pickup').value).toBe('2026-11-12');
      expect(component.form.images).toEqual(['/uploads/receipt.png']);
      expect(buttonIn('Save changes')).toBeTruthy();
    });

    it('saves the changes to THAT booking and says it was not a new one', async () => {
      await create({ booking: booking({ id: 2 }) });
      component.form.deposit = 800;
      component.form.status = 'cancelled';
      component.submit();
      expect(bookingsApi['updateBooking']).toHaveBeenCalledTimes(1);
      const [id, payload] = bookingsApi['updateBooking'].calls.mostRecent().args;
      expect(id).toBe(2);
      expect(payload.deposit).toBe(800);
      expect(payload.status).toBe('cancelled');
      expect(bookingsApi['createBooking']).not.toHaveBeenCalled();
      expect(saved[0].created).toBeFalse();
    });

    it('keeps the agreed price when another product is picked while editing', async () => {
      await create({ booking: EXAMPLE, products: [product({ id: 1, name: 'MacBook Air M5', selling_price: 999 })] });
      component.onProductText('macbook');
      component.pickProduct(component.products[0]);
      expect(component.form.full_price).toBe(1050);
    });

    it('shows the price buttons right away for a booking linked to a product that has them', async () => {
      await create({ booking: EXAMPLE, products: [product({ id: 7, extra_prices: [{ label: '16GB / 512GB', price: 1050 }] })] });
      expect(dom().querySelectorAll('[aria-label="Prices of this product"] button').length).toBe(2);
    });

    it('a booking whose product was deleted later still opens (no link, text kept)', async () => {
      await create({ booking: booking({ product_id: null }) });
      expect(component.linkedProduct).toBeNull();
      expect(component.form.product_name).toBe('MacBook Air M5 | RAM 16GB | SSD 512GB');
    });

    it('shows the price buttons once the products arrive (they can load after the form opened)', async () => {
      await create({ booking: EXAMPLE, products: [] });
      expect(dom().querySelectorAll('[aria-label="Prices of this product"] button').length).toBe(0);
      fixture.componentRef.setInput('products', [product({ id: 7, extra_prices: [{ label: '16GB / 512GB', price: 1050 }] })]);
      fixture.detectChanges();
      expect(dom().querySelectorAll('[aria-label="Prices of this product"] button').length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('the Product box suggests your own products', () => {
    const catalogue = () => [
      product({ id: 1, name: 'MacBook Air M5', sku: 'MAC-901', brand: 'Apple', selling_price: 999, extra_prices: [{ label: '16GB / 512GB', price: 1050 }, { label: '24GB / 1TB', price: 1299 }] }),
      product({ id: 2, name: 'MacBook Pro 14 M5', sku: 'MAC-902', brand: 'Apple', selling_price: 1999, image_url: '/uploads/pro.png' }),
      product({ id: 3, name: 'Asus TUF A15', sku: 'WIN-ASU-004', brand: 'Asus', model: 'TUF Gaming A15', selling_price: 749 }),
      product({ id: 4, name: 'Old MacBook (archived)', sku: 'MAC-009', is_archived: true }),
    ];
    const suggestions = () => Array.from(dom().querySelectorAll('ul[aria-label="Your products that match"] li')) as HTMLElement[];
    const pick = (index: number) => {
      suggestions()[index].querySelector('button')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    it('lists the products that match every word typed (name, brand, model or SKU), never archived ones', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'macbook');
      expect(suggestions().map(li => li.querySelector('.truncate')!.textContent!.trim())).toEqual(['MacBook Air M5', 'MacBook Pro 14 M5']);
      type('#b-product', 'air m5');
      expect(suggestions().length).toBe(1);
      type('#b-product', 'tuf gaming');
      expect(suggestions().length).toBe(1);
      type('#b-product', 'win-asu');
      expect(suggestions().length).toBe(1);
      type('#b-product', 'xyz');
      expect(suggestions().length).toBe(0);
      type('#b-product', 'archived');
      expect(suggestions().length).toBe(0);
    });

    it('shows each one with its price and photo', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'macbook');
      expect(suggestions()[0].textContent).toContain('$999');
      expect(suggestions()[1].textContent).toContain('$1,999');
      expect(suggestions()[1].querySelector('img')!.getAttribute('src')).toContain('/uploads/pro.png');
    });

    it('lists at most 6, and nothing before anything is typed', async () => {
      await create({ products: Array.from({ length: 10 }, (_, i) => product({ id: i + 1, name: `Laptop ${i}`, sku: `L-${i}` })) });
      expect(suggestions().length).toBe(0);
      type('#b-product', 'laptop');
      expect(suggestions().length).toBe(6);
    });

    it('clicking one fills the name and the price, and remembers the link', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'air m5');
      pick(0);
      expect(component.form.product_name).toBe('MacBook Air M5');
      expect(component.form.product_id).toBe(1);
      expect(component.form.full_price).toBe(999);
      expect(suggestions().length).toBe(0);
      expect(text()).not.toContain('From your products');
    });

    it('does not overwrite a price that was already typed by hand', async () => {
      await create({ products: catalogue() });
      type('#b-price', '1200');
      type('#b-product', 'air m5');
      pick(0);
      expect(component.form.full_price).toBe(1200);
    });

    it('a product with other prices offers them as buttons: choosing one sets the name and the price', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'air m5');
      pick(0);
      const options = () => Array.from(dom().querySelectorAll('[aria-label="Prices of this product"] button')) as HTMLButtonElement[];
      expect(options().map(b => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Normal price · $999', '16GB / 512GB · $1,050', '24GB / 1TB · $1,299']);
      options()[1].click();
      fixture.detectChanges();
      expect(component.form.product_name).toBe('MacBook Air M5 | 16GB / 512GB');
      expect(component.form.full_price).toBe(1050);
      expect(options()[1].className).toContain('bg-primary-50');          // marked as the chosen one
      options()[0].click();
      fixture.detectChanges();
      expect(component.form.product_name).toBe('MacBook Air M5');
      expect(component.form.full_price).toBe(999);
    });

    it('a product with no other prices shows no buttons', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'tuf');
      pick(0);
      expect(dom().querySelector('[aria-label="Prices of this product"]')).toBeNull();
    });

    it('emptying the box unlinks it too', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'air m5');
      pick(0);
      type('#b-product', '');
      expect(component.form.product_id).toBeNull();
      expect(suggestions().length).toBe(0);
    });

    it('Enter picks the first match instead of submitting; with no match Enter is left alone', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'macbook');
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input('#b-product').dispatchEvent(enter);
      fixture.detectChanges();
      expect(enter.defaultPrevented).toBeTrue();
      expect(component.form.product_name).toBe('MacBook Air M5');

      type('#b-product', 'nothing like this');
      const second = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      input('#b-product').dispatchEvent(second);
      expect(second.defaultPrevented).toBeFalse();
    });

    it('a linked product is sent with the booking (product_id), a typed-in one is not', async () => {
      await create({ products: catalogue() });
      type('#b-product', 'air m5');
      pick(0);
      component.form.phone = '011968240';
      component.form.pickup_date = '2026-11-12';
      component.submit();
      expect(bookingsApi['createBooking'].calls.mostRecent().args[0].product_id).toBe(1);
    });

    it('still works as a plain box when there are no products', async () => {
      await create({ products: [] });
      type('#b-product', 'macbook');
      expect(suggestions().length).toBe(0);
      expect(component.form.product_name).toBe('macbook');
    });
  });

  describe('under the Product box: a line only when the laptop cannot be booked', () => {
    const note = () => dom().querySelector('[data-hold-note]') as HTMLElement | null;

    it('says nothing for a free single laptop, or for counted stock (with or without any left)', async () => {
      await create({ product: product({ id: 7, track_stock: false }), products: [product({ id: 7, track_stock: false })] });
      expect(note()).toBeNull();
      TestBed.resetTestingModule();
      const counted = product({ id: 7, track_stock: true, stock_quantity: 3 });
      await create({ product: counted, products: [counted] });
      expect(note()).toBeNull();
      TestBed.resetTestingModule();
      const none = product({ id: 7, track_stock: true, stock_quantity: 0 });
      await create({ product: none, products: [none] });
      expect(note()).toBeNull();
    });

    it('a single laptop that someone else has set aside says so, in red', async () => {
      const booked = product({ id: 7, track_stock: false, hold_status: 'booked' });
      await create({ product: booked, products: [booked] });
      expect(note()!.textContent).toContain('This laptop is already booked.');
      expect(note()!.classList).toContain('text-red-600');
      const repairing = product({ id: 8, track_stock: false, hold_status: 'repair' });
      component.pickProduct(repairing);
      fixture.componentRef.setInput('products', [repairing]);
      fixture.detectChanges();
      expect(note()!.textContent).toContain('This laptop is in repair.');
    });

    it('editing the booking that holds the laptop: it is its own laptop, so nothing is said', async () => {
      const own = product({ id: 7, track_stock: false, hold_status: 'booked' });
      await create({ booking: booking({ stock_held: true, product_track_stock: false }), products: [own] });
      expect(note()).toBeNull();
    });

    it('says nothing for a cancelled booking, or when no laptop of the shop is linked', async () => {
      const blocked = product({ id: 7, track_stock: false, hold_status: 'booked' });
      await create({ booking: booking({ status: 'cancelled' }), products: [blocked] });
      expect(note()).toBeNull();
      component.form.status = 'booked';
      fixture.detectChanges();
      expect(note()).not.toBeNull();
      component.unlinkProduct();
      fixture.detectChanges();
      expect(note()).toBeNull();
    });

    it('never suggests a single laptop that is booked or in repair (a counted one is always offered)', async () => {
      const list = [
        product({ id: 1, name: 'Mac free', track_stock: false }),
        product({ id: 2, name: 'Mac booked', track_stock: false, hold_status: 'booked' }),
        product({ id: 3, name: 'Mac repair', track_stock: false, hold_status: 'repair' }),
        product({ id: 4, name: 'Mac counted', track_stock: true, stock_quantity: 4 }),
      ];
      await create({ products: list });
      type('#b-product', 'mac');
      const names = Array.from(dom().querySelectorAll('ul[aria-label="Your products that match"] li .truncate.text-sm')).map(e => e.textContent!.trim());
      expect(names).toEqual(['Mac free', 'Mac counted']);
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('photos: the laptop\'s own photo, and more of them', () => {
    it('the photo of the laptop that was picked is the first photo in the box, marked "Laptop"', async () => {
      await create();
      expect(laptopPhotoShown()).toBeNull();
      component.pickProduct(product({ id: 7, image_url: '/uploads/air.png' }));
      fixture.detectChanges();
      expect(laptopPhotoShown()!.getAttribute('src')).toContain('/uploads/air.png');
      expect(photoBox().all[0]).toBe('/uploads/air.png');
      expect(text()).toContain('Laptop');
      expect(component.form.images).toEqual([]);                // it is shown, not copied into the booking
    });

    it('a picture added in the box comes after the laptop\'s photo, and the laptop\'s photo cannot be removed', async () => {
      await create();
      component.pickProduct(product({ id: 7, image_url: '/uploads/air.png' }));
      addPhotos(picture());
      expect(photoBox().all).toEqual(['/uploads/air.png', '/uploads/receipt-1.png']);
      expect(dom().querySelectorAll('ul[aria-label="All photos"] li').length).toBe(2);
      expect(dom().querySelectorAll('button[aria-label^="Remove photo"]').length).toBe(1);
    });

    it('a name typed by hand that is the name of a product shows that product\'s photo (not linked)', async () => {
      await create({ products: [product({ id: 7, name: 'MacBook Air 13" M2', image_url: '/uploads/air.png' })] });
      type('#b-product', '  macbook AIR 13" m2 ');
      expect(laptopPhotoShown()!.getAttribute('src')).toContain('/uploads/air.png');
      expect(component.form.product_id).toBeNull();
    });

    it('shows nothing when the laptop has no photo, or no laptop is picked', async () => {
      await create({ products: [product({ id: 7, image_url: null, images: [] })] });
      expect(laptopPhotoShown()).toBeNull();
      component.pickProduct(product({ id: 7, image_url: null, images: [] }));
      fixture.detectChanges();
      expect(laptopPhotoShown()).toBeNull();
    });

    it('saves without asking anything, with or without a photo', async () => {
      await create({ products: [] });
      fillValid();
      component.form.product_id = null;
      component.submit();
      fixture.detectChanges();
      expect(dom().querySelector('app-ask-dialog')).toBeNull();
      expect(bookingsApi['createBooking']).toHaveBeenCalledTimes(1);
    });

    it('has a photo box for more pictures, up to 4', async () => {
      await create();
      expect(photoBox()).toBeTruthy();
      expect(text()).toContain('Photos (e.g. deposit receipt)');
      expect(photoBox().max).toBe(4);
    });

    it('a picture added in the box goes into the booking that is saved', async () => {
      await create();
      fillValid();
      addPhotos(picture());
      component.submit();
      expect(bookingsApi['createBooking'].calls.mostRecent().args[0].images).toEqual(['/uploads/receipt-1.png']);
    });

    it('the photos of an existing booking are shown, and removing one is saved', async () => {
      await create({ booking: booking({ images: ['/uploads/1.png', '/uploads/2.png'] }) });
      expect(dom().querySelectorAll('ul[aria-label="All photos"] li').length).toBe(3);       // the laptop's own photo + the 2 of the booking
      (dom().querySelector('button[aria-label="Remove photo 1"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      component.submit();
      expect(bookingsApi['updateBooking'].calls.mostRecent().args[1].images).toEqual(['/uploads/2.png']);
      expect(productsApi['discardImage']).not.toHaveBeenCalled();           // the API cleans up the saved file when it saves
    });

    it('Save waits while a picture is on its way (the button says so), then works', async () => {
      await create();
      fillValid();
      const pending = new Subject<{ url: string }>();
      productsApi['uploadImage'].and.returnValue(pending);
      addPhotos(picture());
      expect(component.uploading).toBeTrue();
      expect(text()).toContain('Uploading...');
      component.submit();
      expect(bookingsApi['createBooking']).not.toHaveBeenCalled();
      pending.next({ url: '/uploads/late.png' });
      pending.complete();
      fixture.detectChanges();
      expect(component.uploading).toBeFalse();
      component.submit();
      expect(bookingsApi['createBooking'].calls.mostRecent().args[0].images).toEqual(['/uploads/late.png']);
    });

    it('after saving, the photos are kept (nothing is discarded when the form goes away)', async () => {
      await create();
      fillValid();
      addPhotos(picture());
      component.submit();
      fixture.destroy();
      expect(productsApi['discardImage']).not.toHaveBeenCalled();
    });

    it('closing without saving deletes the pictures uploaded in this form', async () => {
      await create();
      addPhotos(picture('a.png'), picture('b.png'));
      fixture.destroy();
      expect(productsApi['discardImage'].calls.allArgs().map(a => a[0]).sort()).toEqual(['/uploads/receipt-1.png', '/uploads/receipt-2.png']);
    });

    it('a booking can have up to 4 photos', async () => {
      await create({ booking: booking({ images: ['/uploads/1.png', '/uploads/2.png', '/uploads/3.png', '/uploads/4.png'] }) });
      expect(photoBox().canAdd).toBeFalse();
    });
  });

  // ---------------------------------------------------------------------------------------------
  describe('cancel', () => {
    it('the Cancel button tells the parent', async () => {
      await create();
      buttonIn('Cancel').click();
      expect(cancelled).toBe(1);
    });

    it('does nothing while it is saving', async () => {
      await create();
      bookingsApi['createBooking'].and.returnValue(new Subject<Booking>());
      fillValid();
      component.submit();
      fixture.detectChanges();
      expect(buttonIn('Cancel').disabled).toBeTrue();
      component.cancel();
      expect(cancelled).toBe(0);
    });
  });
});
