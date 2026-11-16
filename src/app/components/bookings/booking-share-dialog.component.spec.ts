import { environment } from '../../../environments/environment';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BookingShareDialogComponent } from './booking-share-dialog.component';
import { ShareService } from '../../services/share.service';
import { Booking } from '../../models/booking.model';
import { Invoice } from '../../models/invoice.model';

/** Where uploaded photos are served from (the API's address without /api): whatever the app is set to. */
const apiOrigin = environment.apiUrl.replace(/\/api$/, '');

const BOOKING: Booking = {
  id: 1, product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
  full_price: 1050, deposit: 500, remaining_balance: 550, booking_date: '2026-11-08', pickup_date: '2026-11-12',
  status: 'booked', product_image: '/uploads/air.png',
};

const INVOICE: Invoice = {
  id: 9, number: 41, type: 'booking', invoice_date: '2026-11-08', customer_name: null, phone: '011968240', telegram: '@Horth_Heng',
  device: null, problem: null, pickup_date: '2026-11-12', booking_id: 1, warranty: '1_week', deposit: 500, total: 1050, balance: 550,
  items: [{ name: 'MacBook Air M5', qty: 1, unit_price: 1050 }],
};

const MESSAGE = [
  'Booking Details',
  '• Product: MacBook Air M5 | RAM 16GB | SSD 512GB',
  '• Phone: 011968240',
  '• Telegram: @Horth_Heng',
  '• Full Price: $1,050',
  '• Deposit: $500',
  '• Remaining Balance: $550',
  '• Booking Date: 08/11/2026',
  '• Pickup Date: 12/11/2026 (Thursday)',
  '• Status: Booked',
].join('\n');

describe('BookingShareDialogComponent', () => {
  let fixture: ComponentFixture<BookingShareDialogComponent>;
  let component: BookingShareDialogComponent;
  let sharing: { [k: string]: jasmine.Spy };
  let closed: number;
  let makeInvoiceAsked: number;
  const PHOTO = new File(['photo'], 'laptop.jpg', { type: 'image/jpeg' });
  const PNG = new Blob(['png'], { type: 'image/png' });

  interface Options {
    booking?: Booking;
    invoice?: Invoice | null;
    textCopied?: boolean;
    shareable?: boolean;
    photo?: File | null | Promise<File | null>;
    /** 'fail' = making the picture breaks. */
    png?: Blob | 'fail';
  }

  async function open(options: Options = {}): Promise<void> {
    sharing = {
      canShare: jasmine.createSpy('canShare').and.returnValue(options.shareable ?? true),
      share: jasmine.createSpy('share').and.resolveTo('shared'),
      fetchImage: jasmine.createSpy('fetchImage').and.callFake(() => Promise.resolve(options.photo === undefined ? PHOTO : options.photo)),
      makePng: jasmine.createSpy('makePng').and.callFake(() => (options.png === 'fail' ? Promise.reject(new Error('no')) : Promise.resolve(options.png ?? PNG))),
      copyText: jasmine.createSpy('copyText').and.resolveTo(true),
      copyImage: jasmine.createSpy('copyImage').and.resolveTo(true),
      save: jasmine.createSpy('save'),
    };
    await TestBed.configureTestingModule({
      imports: [BookingShareDialogComponent],
      providers: [{ provide: ShareService, useValue: sharing }],
    }).compileComponents();
    fixture = TestBed.createComponent(BookingShareDialogComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('booking', options.booking ?? BOOKING);
    fixture.componentRef.setInput('invoice', options.invoice === undefined ? INVOICE : options.invoice);
    fixture.componentRef.setInput('textCopied', options.textCopied ?? true);
    closed = 0;
    makeInvoiceAsked = 0;
    component.closed.subscribe(() => closed++);
    component.makeInvoice.subscribe(() => makeInvoiceAsked++);
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const dialog = () => dom().querySelector('[role="dialog"]') as HTMLElement;
  const section = (label: string) => dom().querySelector(`section[aria-label="${label}"]`) as HTMLElement;
  const text = (root: ParentNode = dom()) => ((root as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
  const button = (label: string, root: ParentNode = dom()) =>
    Array.from(root.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement | undefined;
  const sendButton = () => Array.from(dom().querySelectorAll('button')).find(b => /^(Share|Getting ready|Check something)/.test(b.textContent!.trim())) as HTMLButtonElement | undefined;
  const checkbox = (id: string) => dom().querySelector('#' + id) as HTMLInputElement;
  const key = (name: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
  /** Lets the photo and the invoice picture finish, then redraws. */
  const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); fixture.detectChanges(); };
  const untick = (id: string) => { const box = checkbox(id); box.checked = false; box.dispatchEvent(new Event('change')); fixture.detectChanges(); };

  it('should create', async () => {
    await open();
    expect(component).toBeTruthy();
  });

  describe('the frame', () => {
    it('is a window with the booking\'s laptop in the title', async () => {
      await open();
      expect(dialog().getAttribute('aria-modal')).toBe('true');
      expect(text(dialog())).toContain('Send to customer');
      expect(text(dialog())).toContain('MacBook Air M5 | RAM 16GB | SSD 512GB');
    });

    it('takes the focus, so Esc and Tab work from the start', async () => {
      await open();
      expect(document.activeElement).toBe(dialog());
    });
  });

  describe('the message', () => {
    it('shows the message exactly as it is sent, word for word', async () => {
      await open();
      const pre = section('Message').querySelector('pre')!;
      expect(pre.textContent).toBe(MESSAGE);
    });

    it('says "Copied" when the page already put it on the clipboard', async () => {
      await open({ textCopied: true });
      expect(text(section('Message'))).toContain('Copied');
    });

    it('does not say it when copying did not work', async () => {
      await open({ textCopied: false });
      expect(text(section('Message'))).not.toContain('Copied');
    });

    it('its Copy button copies it again and says so', async () => {
      await open({ textCopied: false });
      button('Copy', section('Message'))!.click();
      await settle();
      expect(sharing['copyText']).toHaveBeenCalledOnceWith(MESSAGE);
      expect(text(section('Message'))).toContain('Copied');
      expect(text(dom())).toContain('Message copied. Paste it into Telegram.');
    });

    it('says so in red when it cannot copy', async () => {
      await open();
      sharing['copyText'].and.resolveTo(false);
      button('Copy', section('Message'))!.click();
      await settle();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('Could not copy. Please try again.');
    });
  });

  describe('the laptop photo', () => {
    it('is fetched from the API address (the "/uploads/..." name is completed) and named laptop', async () => {
      await open();
      expect(sharing['fetchImage']).toHaveBeenCalledOnceWith(`${apiOrigin}/uploads/air.png`, 'laptop');
    });

    it('says it is being fetched, and it cannot be sent until then', async () => {
      await open();
      expect(text(section('Laptop photo'))).toContain('Getting the photo...');
      expect(checkbox('send-photo').disabled).toBeTrue();
      expect(button('Copy', section('Laptop photo'))).toBeUndefined();
    });

    it('when it is ready it is ticked, and it has Copy and Save', async () => {
      await open();
      await settle();
      expect(text(section('Laptop photo'))).toContain('The photo of this laptop.');
      expect(checkbox('send-photo').checked).toBeTrue();
      expect(checkbox('send-photo').disabled).toBeFalse();
      expect(button('Copy', section('Laptop photo'))).toBeTruthy();
      expect(button('Save', section('Laptop photo'))).toBeTruthy();
      expect(section('Laptop photo').querySelector('img')!.getAttribute('src')).toBe(`${apiOrigin}/uploads/air.png`);
    });

    it('a booking with no laptop photo says so, and fetches nothing', async () => {
      await open({ booking: { ...BOOKING, product_image: null } });
      await settle();
      expect(sharing['fetchImage']).not.toHaveBeenCalled();
      expect(text(section('Laptop photo'))).toContain('This booking has no laptop photo.');
      expect(checkbox('send-photo').disabled).toBeTrue();
      expect(checkbox('send-photo').checked).toBeFalse();
    });

    it('a photo that cannot be loaded says so in red, and is not sent', async () => {
      await open({ photo: null });
      await settle();
      expect(text(section('Laptop photo'))).toContain('The photo could not be loaded, so it cannot be sent.');
      expect(section('Laptop photo').querySelector('p.text-red-600')).not.toBeNull();
      expect(checkbox('send-photo').disabled).toBeTrue();
      expect(sendButton()!.textContent!.trim()).toBe('Share 2 items');
    });

    it('Copy puts the picture on the clipboard; Save keeps it as a file', async () => {
      await open();
      await settle();
      button('Copy', section('Laptop photo'))!.click();
      await settle();
      expect(sharing['copyImage']).toHaveBeenCalledOnceWith(PHOTO);
      expect(text(dom())).toContain('Picture copied. Paste it into Telegram.');
      button('Save', section('Laptop photo'))!.click();
      fixture.detectChanges();
      expect(sharing['save']).toHaveBeenCalledOnceWith(PHOTO, 'laptop.jpg');
      expect(text(dom())).toContain('Picture saved.');
    });

    it('when the browser cannot copy a picture it says so in red and saves NOTHING (Save is a button of its own)', async () => {
      await open();
      await settle();
      sharing['copyImage'].and.resolveTo(false);
      button('Copy', section('Laptop photo'))!.click();
      await settle();
      expect(sharing['save']).not.toHaveBeenCalled();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('This browser cannot copy a picture. Press Save instead.');
    });

    it('the same for the invoice picture', async () => {
      await open();
      await settle();
      sharing['copyImage'].and.resolveTo(false);
      button('Copy', section('Invoice'))!.click();
      await settle();
      expect(sharing['save']).not.toHaveBeenCalled();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('This browser cannot copy a picture.');
    });
  });

  describe('the invoice', () => {
    it('its picture is made from the full-size paper (592 x 840), kept off the screen', async () => {
      await open();
      await settle();
      expect(sharing['makePng']).toHaveBeenCalledTimes(1);
      const paper = sharing['makePng'].calls.mostRecent().args[0] as HTMLElement;
      expect(paper.tagName.toLowerCase()).toBe('app-invoice-paper');
      const box = paper.parentElement as HTMLElement;
      expect(box.classList).toContain('share-paper');
      expect(box.getAttribute('aria-hidden')).toBe('true');
      expect(getComputedStyle(box).left).toBe('-10000px');
      expect(text(paper)).toContain('000041');
    });

    it('says it is being made, then names the invoice, and it is ticked with Copy and Save', async () => {
      await open();
      expect(text(section('Invoice'))).toContain('Making the picture...');
      expect(checkbox('send-invoice').disabled).toBeTrue();
      await settle();
      expect(text(section('Invoice'))).toContain('Invoice 000041 as a picture.');
      expect(checkbox('send-invoice').checked).toBeTrue();
      expect(button('Copy', section('Invoice'))).toBeTruthy();
      expect(button('Save', section('Invoice'))).toBeTruthy();
      expect(section('Invoice').querySelector('img')!.getAttribute('src')).toMatch(/^blob:/);
    });

    it('is saved as invoice-000041.png', async () => {
      await open();
      await settle();
      button('Save', section('Invoice'))!.click();
      const [file, name] = sharing['save'].calls.mostRecent().args;
      expect(name).toBe('invoice-000041.png');
      expect((file as File).type).toBe('image/png');
    });

    it('a booking without an invoice says so and offers "Make invoice", which tells the page', async () => {
      await open({ invoice: null });
      await settle();
      expect(sharing['makePng']).not.toHaveBeenCalled();
      expect(text(section('Invoice'))).toContain('There is no invoice for this booking yet.');
      expect(checkbox('send-invoice').disabled).toBeTrue();
      button('Make invoice', section('Invoice'))!.click();
      expect(makeInvoiceAsked).toBe(1);
    });

    it('with an invoice there is no "Make invoice" button', async () => {
      await open();
      await settle();
      expect(button('Make invoice')).toBeUndefined();
    });

    it('when the picture cannot be made it says so in red and the rest can still be sent', async () => {
      await open({ png: 'fail' });
      await settle();
      expect(text(section('Invoice'))).toContain('The picture could not be made.');
      expect(section('Invoice').querySelector('p.text-red-600')).not.toBeNull();
      expect(sendButton()!.textContent!.trim()).toBe('Share 2 items');      // message + photo
    });

    it('lets go of the small picture when the window closes', async () => {
      await open();
      await settle();
      const revoke = spyOn(URL, 'revokeObjectURL');
      fixture.destroy();
      expect(revoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('Share', () => {
    it('waits until the photo and the invoice picture are ready', async () => {
      await open();
      expect(sendButton()!.textContent!.trim()).toBe('Getting ready...');
      expect(sendButton()!.disabled).toBeTrue();
      await settle();
      expect(sendButton()!.textContent!.trim()).toBe('Share 3 items');
      expect(sendButton()!.disabled).toBeFalse();
    });

    it('hands the checked things to the share menu together: the photo, the invoice, and the message', async () => {
      await open();
      await settle();
      sendButton()!.click();
      await settle();
      expect(sharing['share']).toHaveBeenCalledTimes(1);
      const [files, message] = sharing['share'].calls.mostRecent().args;
      expect((files as File[]).map(f => f.name)).toEqual(['laptop.jpg', 'invoice-000041.png']);
      expect(message).toBe(MESSAGE);
      expect(text(dom())).toContain('Shared.');
    });

    it('a thing that is un-ticked is not sent', async () => {
      await open();
      await settle();
      untick('send-photo');
      expect(sendButton()!.textContent!.trim()).toBe('Share 2 items');
      sendButton()!.click();
      await settle();
      expect((sharing['share'].calls.mostRecent().args[0] as File[]).map(f => f.name)).toEqual(['invoice-000041.png']);
      expect(sharing['share'].calls.mostRecent().args[1]).toBe(MESSAGE);
    });

    it('the message can be left out too (then only the pictures go)', async () => {
      await open();
      await settle();
      untick('send-text');
      sendButton()!.click();
      await settle();
      expect(sharing['share'].calls.mostRecent().args[1]).toBe('');
      expect((sharing['share'].calls.mostRecent().args[0] as File[]).length).toBe(2);
    });

    it('with one thing checked it says "1 item"; with nothing checked it cannot be pressed', async () => {
      await open();
      await settle();
      untick('send-photo');
      untick('send-invoice');
      expect(sendButton()!.textContent!.trim()).toBe('Share 1 item');
      untick('send-text');
      expect(sendButton()!.textContent!.trim()).toBe('Check something to send');
      expect(sendButton()!.disabled).toBeTrue();
      component.send();
      expect(sharing['share']).not.toHaveBeenCalled();
    });

    it('closing the share menu says nothing (it is not an error)', async () => {
      await open();
      await settle();
      sharing['share'].and.resolveTo('cancelled');
      sendButton()!.click();
      await settle();
      expect(dom().querySelector('[role="alert"], [role="status"]')).toBeNull();
      expect(sendButton()!.disabled).toBeFalse();
    });

    it('when it cannot share these it says so in red and points to Copy / Save', async () => {
      await open();
      await settle();
      sharing['share'].and.resolveTo('unsupported');
      sendButton()!.click();
      await settle();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('This browser cannot share these. Use Copy or Save on each line.');
    });

    it('when the share menu fails it says so in red', async () => {
      await open();
      await settle();
      sharing['share'].and.resolveTo('failed');
      sendButton()!.click();
      await settle();
      expect(dom().querySelector('[role="alert"]')!.textContent).toContain('The share menu could not be opened.');
    });

    it('a second press while the menu is open does nothing', async () => {
      await open();
      await settle();
      let finish!: (value: string) => void;
      sharing['share'].and.returnValue(new Promise(resolve => { finish = resolve; }));
      component.send();
      component.send();
      expect(sharing['share']).toHaveBeenCalledTimes(1);
      expect(component.isSharing).toBeTrue();
      finish('shared');
      await settle();
      expect(component.isSharing).toBeFalse();
    });

    it('an old message goes away when the next try starts', async () => {
      await open();
      await settle();
      sharing['share'].and.resolveTo('failed');
      sendButton()!.click();
      await settle();
      expect(dom().querySelector('[role="alert"]')).not.toBeNull();
      sharing['share'].and.resolveTo('cancelled');
      sendButton()!.click();
      await settle();
      expect(dom().querySelector('[role="alert"]')).toBeNull();
    });
  });

  describe('a browser that cannot share files (a plain computer browser)', () => {
    it('has no Share button, and says to use Copy or Save on each line', async () => {
      await open({ shareable: false });
      await settle();
      expect(sendButton()).toBeUndefined();
      expect(text(dialog())).toContain('This browser cannot send everything at once. Use Copy or Save on each line');
    });

    it('Copy and Save on each line still work', async () => {
      await open({ shareable: false });
      await settle();
      expect(button('Copy', section('Message'))).toBeTruthy();
      expect(button('Copy', section('Laptop photo'))).toBeTruthy();
      expect(button('Save', section('Invoice'))).toBeTruthy();
    });

    it('asks the browser about files with a pretend picture before the real ones exist', async () => {
      await open();
      const [files, message] = sharing['canShare'].calls.mostRecent().args;
      expect((files as File[]).length).toBe(1);
      expect((files as File[])[0].type).toBe('image/png');
      expect(message).toBe(MESSAGE);
    });
  });

  describe('closing', () => {
    it('the ✕, Esc and the dark background close it; a click inside does not', async () => {
      await open();
      (dialog().querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      key('Escape');
      expect(closed).toBe(2);
      (dom().querySelector('.share-backdrop') as HTMLElement).click();
      expect(closed).toBe(3);
      dialog().click();
      expect(closed).toBe(3);
    });

    it('a photo that finishes after it was closed changes nothing (no error)', async () => {
      let finish!: (file: File) => void;
      await open({ photo: new Promise<File | null>(resolve => { finish = resolve as (file: File) => void; }) });
      fixture.destroy();
      finish(PHOTO);
      await Promise.resolve();
      expect(component.photoState).toBe('loading');
    });
  });
});
