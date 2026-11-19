import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Subject, of } from 'rxjs';
import { InvoiceEditorComponent } from './invoice-editor.component';
import { InvoiceFormComponent, InvoiceSaved } from './invoice-form.component';
import { InvoiceService } from '../../services/invoice/invoice.service';
import { Invoice, InvoiceType } from '../../models/invoice/invoice.model';
import { Product } from '../../models/product/product.model';

const SALE: Invoice = {
  id: 7, number: 41, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: null, telegram: null,
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '2_weeks', deposit: 50, total: 50, balance: 0,
  items: [{ name: 'Mouse', qty: 1, unit_price: 50 }],
};

describe('InvoiceEditorComponent', () => {
  let fixture: ComponentFixture<InvoiceEditorComponent>;
  let component: InvoiceEditorComponent;
  let api: { [k: string]: jasmine.Spy };
  let saved: InvoiceSaved[];
  let closed: number;

  async function open(options: { type?: InvoiceType; invoice?: Invoice | null; prefill?: Partial<Invoice> | null; products?: Product[] } = {}): Promise<void> {
    api = {
      getNextNumber: jasmine.createSpy('getNextNumber').and.returnValue(of(44)),
      createInvoice: jasmine.createSpy('createInvoice').and.callFake((b: any) => of({ id: 99, total: 0, ...b })),
      updateInvoice: jasmine.createSpy('updateInvoice').and.callFake((id: number, b: any) => of({ id, total: 0, ...b })),
    };
    await TestBed.configureTestingModule({
      imports: [InvoiceEditorComponent],
      providers: [{ provide: InvoiceService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(InvoiceEditorComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('type', options.type ?? 'sale');
    if (options.invoice) fixture.componentRef.setInput('invoice', options.invoice);
    if (options.prefill) fixture.componentRef.setInput('prefill', options.prefill);
    if (options.products) fixture.componentRef.setInput('products', options.products);
    saved = [];
    closed = 0;
    component.saved.subscribe(result => saved.push(result));
    component.closed.subscribe(() => closed++);
    fixture.detectChanges();
    await settle();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const dialog = () => dom().querySelector('[role="dialog"]') as HTMLElement;
  const form = () => fixture.debugElement.query(By.directive(InvoiceFormComponent)).componentInstance as InvoiceFormComponent;
  const key = (name: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
  const settle = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };

  it('should create', async () => {
    await open();
    expect(component).toBeTruthy();
  });

  describe('the frame', () => {
    it('is a panel from the right edge, like the product and booking forms', async () => {
      await open();
      expect(dom().querySelector('.editor-backdrop')!.classList).toContain('justify-end');
      expect(dialog().getAttribute('aria-modal')).toBe('true');
      expect(dialog().classList).toContain('h-full');
    });

    it('says what is being written: a new sale / booking / repair invoice', async () => {
      await open({ type: 'sale' });
      expect(dialog().getAttribute('aria-label')).toBe('New sale invoice');
      expect(text()).toContain('The paper for a sale.');
      TestBed.resetTestingModule();
      await open({ type: 'booking' });
      expect(dialog().getAttribute('aria-label')).toBe('New booking invoice');
      expect(text()).toContain('The paper for a customer who booked a laptop.');
      TestBed.resetTestingModule();
      await open({ type: 'repair' });
      expect(dialog().getAttribute('aria-label')).toBe('New repair invoice');
      expect(text()).toContain('The paper for a repair.');
    });

    it('says which invoice is being changed', async () => {
      await open({ invoice: SALE });
      expect(dialog().getAttribute('aria-label')).toBe('Edit invoice 000041');
    });

    it('hands what it was given to the form', async () => {
      const prefill = { phone: '011968240' };
      const products = [{ id: 1, name: 'X' } as Product];
      await open({ type: 'booking', prefill, products });
      expect(form().type).toBe('booking');
      expect(form().prefill).toBe(prefill);
      expect(form().products).toBe(products);
      expect(form().invoice).toBeNull();
      expect(form().today).toBe(component.today);
    });

    it('tells its parent when the invoice is saved', async () => {
      await open();
      form().form.items = [{ name: 'Mouse', qty: 1, unit_price: 10 }];
      form().form.warranty = '1_week';
      form().submit();
      expect(saved.length).toBe(1);
      expect(saved[0].created).toBeTrue();
    });
  });

  describe('the Back button (when it was opened from somewhere)', () => {
    const backButton = () => Array.from(dialog().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Back to laptop') as HTMLButtonElement | undefined;

    it('is not there unless the page asks for it', async () => {
      await open();
      expect(backButton()).toBeUndefined();
    });

    it('shows the words the page gives, above the title', async () => {
      await open();
      fixture.componentRef.setInput('backLabel', 'Back to laptop');
      fixture.detectChanges();
      expect(backButton()).toBeTruthy();
      const heading = dialog().querySelector('h2')!;
      expect(backButton()!.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('closes the window, like the ✕', async () => {
      await open();
      fixture.componentRef.setInput('backLabel', 'Back to laptop');
      fixture.detectChanges();
      backButton()!.click();
      expect(closed).toBe(1);
    });

    it('does nothing while a save is running', async () => {
      await open();
      fixture.componentRef.setInput('backLabel', 'Back to laptop');
      fixture.detectChanges();
      api['createInvoice'].and.returnValue(new Subject<Invoice>());
      form().form.items = [{ name: 'Mouse', qty: 1, unit_price: 10 }];
      form().form.warranty = '1_week';
      form().submit();
      backButton()!.click();
      expect(closed).toBe(0);
    });
  });

  describe('closing', () => {
    it('the ✕, the form\'s Cancel, Esc and the dark background all close it', async () => {
      await open();
      (dialog().querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      Array.from(dialog().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Cancel')!.click();
      expect(closed).toBe(2);
      key('Escape');
      expect(closed).toBe(3);
      (dom().querySelector('.editor-backdrop') as HTMLElement).click();
      expect(closed).toBe(4);
    });

    it('a click inside the panel does not close it', async () => {
      await open();
      dialog().click();
      expect(closed).toBe(0);
    });

    it('cannot be closed while a save is running', async () => {
      await open();
      api['createInvoice'].and.returnValue(new Subject<Invoice>());
      form().form.items = [{ name: 'Mouse', qty: 1, unit_price: 10 }];
      form().form.warranty = '1_week';
      form().submit();
      key('Escape');
      (dom().querySelector('.editor-backdrop') as HTMLElement).click();
      component.close();
      expect(closed).toBe(0);
    });
  });
});
