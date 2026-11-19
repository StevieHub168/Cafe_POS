import { ComponentFixture, TestBed } from '@angular/core/testing';
import { InvoiceViewerComponent } from './invoice-viewer.component';
import { Invoice } from '../../models/invoice.model';

const SALE: Invoice = {
  id: 7, number: 41, type: 'sale', invoice_date: '2026-11-10', customer_name: 'Sok Dara', phone: '012 345 678', telegram: null,
  device: null, problem: null, pickup_date: null, booking_id: null, warranty: '2_weeks', deposit: 824, total: 824, balance: 0,
  items: [{ name: 'MacBook Air 13" M1', qty: 1, unit_price: 799 }, { name: 'Laptop bag', qty: 1, unit_price: 25 }],
};

describe('InvoiceViewerComponent', () => {
  let fixture: ComponentFixture<InvoiceViewerComponent>;
  let component: InvoiceViewerComponent;
  let closed: number;
  let edited: number;
  let printed: jasmine.Spy;

  async function open(invoice: Invoice = SALE, width = 1440, height = 1000): Promise<void> {
    spyOnProperty(window, 'innerWidth', 'get').and.returnValue(width);
    spyOnProperty(window, 'innerHeight', 'get').and.returnValue(height);
    await TestBed.configureTestingModule({ imports: [InvoiceViewerComponent] }).compileComponents();
    fixture = TestBed.createComponent(InvoiceViewerComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('invoice', invoice);
    closed = 0;
    edited = 0;
    component.closed.subscribe(() => closed++);
    component.edit.subscribe(() => edited++);
    // The print dialog is replaced (no real one is opened).
    printed = spyOn(component as any, 'printPaper').and.returnValue(Promise.resolve());
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const dialog = () => dom().querySelector('[role="dialog"]') as HTMLElement;
  const button = (label: string) => Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
  const key = (name: string) => document.dispatchEvent(new KeyboardEvent('keydown', { key: name }));
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); fixture.detectChanges(); };

  it('should create', async () => {
    await open();
    expect(component).toBeTruthy();
  });

  describe('what it shows', () => {
    it('the invoice number and kind in the title', async () => {
      await open();
      expect(dialog().textContent).toContain('Invoice 000041');
      expect(dialog().textContent).toContain('Sale invoice');
      expect(dialog().getAttribute('aria-label')).toBe('Invoice 000041');
    });

    it('the paper, with the invoice on it', async () => {
      await open();
      const paper = dialog().querySelector('app-invoice-paper')!;
      expect(paper.textContent).toContain('000041');
      expect(paper.textContent).toContain('Sok Dara');
      expect(paper.textContent).toContain('$824');
    });

    it('the paper is drawn twice: a smaller one to look at, and a full-size one off to the side for printing', async () => {
      await open();
      expect(dom().querySelectorAll('app-invoice-paper').length).toBe(2);
      const hidden = dom().querySelector('.invoice-export-root')!;
      expect(hidden.getAttribute('aria-hidden')).toBe('true');
      expect(hidden.querySelector('app-invoice-paper')).not.toBeNull();
      expect(dialog().contains(hidden)).toBeFalse();               // not inside the window: it is never scaled
    });

    it('has Print / Save PDF and Edit, and nothing else to press (no Copy picture, no Download picture)', async () => {
      await open();
      expect(button('Print / Save PDF')).toBeTruthy();
      expect(button('Edit')).toBeTruthy();
      expect(button('Copy picture')).toBeUndefined();
      expect(button('Download picture')).toBeUndefined();
      const labels = Array.from(dom().querySelectorAll('button')).map(b => b.textContent!.trim() || b.getAttribute('aria-label'));
      expect(labels).toEqual(['Close', 'Print / Save PDF', 'Edit']);
    });
  });

  describe('fitting the screen', () => {
    it('shows the paper at full size when there is room', async () => {
      await open(SALE, 1440, 1100);
      expect(component.zoom).toBe(1);
    });

    it('makes it smaller on a phone so all of it fits the width', async () => {
      await open(SALE, 390, 844);
      expect(component.zoom).toBeLessThan(0.62);
      expect(component.zoom).toBeGreaterThan(0.3);
      const shown = dialog().querySelector('.invoice-preview') as HTMLElement;
      expect(parseFloat(shown.style.transform.replace('scale(', ''))).toBeCloseTo(component.zoom, 4);
    });

    it('also fits a short window (the paper is tall)', async () => {
      await open(SALE, 1440, 600);
      expect(component.zoom).toBeLessThan(0.5);
    });

    it('never gets smaller than 30%', async () => {
      await open(SALE, 200, 300);
      expect(component.zoom).toBe(0.3);
    });

    it('leaves room for a bar the page puts under the paper (reserve), also when it is set later', async () => {
      await open(SALE, 1440, 1100);
      expect(component.zoom).toBe(1);
      fixture.componentRef.setInput('reserve', 170);
      fixture.detectChanges();
      expect(component.zoom).toBeCloseTo((1100 - 24 - 170 - 170) / 840, 4);
      fixture.componentRef.setInput('reserve', 0);
      fixture.detectChanges();
      expect(component.zoom).toBe(1);
    });

    it('the frame around the shown paper has the size of the SMALLER paper (no empty space)', async () => {
      await open(SALE, 390, 844);
      const frame = dialog().querySelector('.invoice-preview')!.parentElement as HTMLElement;
      expect(parseFloat(frame.style.width)).toBeCloseTo(592 * component.zoom, 1);
      expect(parseFloat(frame.style.height)).toBeCloseTo(840 * component.zoom, 1);
    });
  });

  describe('printing', () => {
    it('Print / Save PDF opens the print dialog', async () => {
      await open();
      button('Print / Save PDF').click();
      await settle();
      expect(printed).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edit and closing', () => {
    it('Edit tells the page to open the writing window', async () => {
      await open();
      button('Edit').click();
      expect(edited).toBe(1);
      expect(closed).toBe(0);
    });

    it('the ✕, Esc and the dark background close it; a click on the paper does not', async () => {
      await open();
      (dialog().querySelector('button[aria-label="Close"]') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      key('Escape');
      expect(closed).toBe(2);
      (dom().querySelector('.viewer-backdrop') as HTMLElement).click();
      expect(closed).toBe(3);
      dialog().click();
      expect(closed).toBe(3);
    });
  });

  describe('waiting for an answer in the footer (locked)', () => {
    it('the ✕ is off, and Esc and the dark background do nothing', async () => {
      await open();
      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();
      const close = dialog().querySelector('button[aria-label="Close"]') as HTMLButtonElement;
      expect(close.disabled).toBeTrue();
      expect(close.getAttribute('title')).toBe('Choose below first');
      close.click();
      key('Escape');
      (dom().querySelector('.viewer-backdrop') as HTMLElement).click();
      expect(closed).toBe(0);
    });

    it('printing and Edit still work', async () => {
      await open();
      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();
      button('Print / Save PDF').click();
      button('Edit').click();
      expect(printed).toHaveBeenCalled();
      expect(edited).toBe(1);
    });

    it('closes again when it is unlocked', async () => {
      await open();
      fixture.componentRef.setInput('locked', true);
      fixture.detectChanges();
      fixture.componentRef.setInput('locked', false);
      fixture.detectChanges();
      key('Escape');
      expect(closed).toBe(1);
    });
  });
});
