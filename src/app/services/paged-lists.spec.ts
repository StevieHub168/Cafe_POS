import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BookingService } from './booking.service';
import { InvoiceService } from './invoice.service';
import { RepairService } from './repair.service';
import { environment } from '../../environments/environment';

const PAGE = { page: 2, per_page: 10, total: 25, total_pages: 3, results: [] };

describe('the pages of the lists', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const params = (url: string) => {
    const request = http.expectOne(r => r.url === url);
    return { request, get: (name: string) => request.request.params.get(name), names: request.request.params.keys().sort() };
  };

  describe('invoices', () => {
    const url = `${environment.apiUrl}/invoices`;

    it('asks for one page of one kind, with the tab and the search, and gives back the page with its numbers', () => {
      let got: unknown;
      TestBed.inject(InvoiceService).getInvoicePage({ page: 2, perPage: 10 }, { type: 'sale', period: 'warranty', search: 'dell' }).subscribe(r => (got = r));
      const sent = params(url);
      expect(sent.request.request.method).toBe('GET');
      expect(sent.names).toEqual(['page', 'per_page', 'period', 'search', 'type']);
      expect([sent.get('page'), sent.get('per_page'), sent.get('type'), sent.get('period'), sent.get('search')]).toEqual(['2', '10', 'sale', 'warranty', 'dell']);
      sent.request.flush({ ...PAGE, meta: { counts: { all: 25, month: 4, warranty: 9 } } });
      expect((got as { meta: { counts: { warranty: number } } }).meta.counts.warranty).toBe(9);
    });

    it('a tab that shows everything and no search send only the page', () => {
      TestBed.inject(InvoiceService).getInvoicePage({ page: 1, perPage: 20 }, { type: 'sale', period: undefined, search: '' }).subscribe();
      expect(params(url).names).toEqual(['page', 'per_page', 'type']);
    });

    it('the plain list (every invoice) is still there, without a page', () => {
      TestBed.inject(InvoiceService).getInvoices('sale').subscribe();
      const sent = params(url);
      expect(sent.names).toEqual(['type']);
    });
  });

  describe('bookings', () => {
    const url = `${environment.apiUrl}/bookings`;

    it('asks for one page, leaving out one status, with the search', () => {
      TestBed.inject(BookingService).getBookingPage({ page: 1, perPage: 10 }, { excludeStatus: 'picked_up', search: 'heng' }).subscribe();
      const sent = params(url);
      expect(sent.names).toEqual(['exclude_status', 'page', 'per_page', 'search']);
      expect([sent.get('exclude_status'), sent.get('search')]).toEqual(['picked_up', 'heng']);
    });

    it('asks for one status', () => {
      TestBed.inject(BookingService).getBookingPage({ page: 3, perPage: 20 }, { status: 'cancelled' }).subscribe();
      const sent = params(url);
      expect(sent.names).toEqual(['page', 'per_page', 'status']);
      expect(sent.get('status')).toBe('cancelled');
    });

    it('getBooking reads ONE booking by its number (a scanned laptop sends us to a booking that may be on another page)', () => {
      let got: unknown;
      TestBed.inject(BookingService).getBooking(7).subscribe(b => (got = b));
      const request = http.expectOne(`${url}/7`);
      expect(request.request.method).toBe('GET');
      request.flush({ id: 7 });
      expect(got).toEqual({ id: 7 } as never);
    });
  });

  describe('repairs', () => {
    const url = `${environment.apiUrl}/repairs`;

    it('asks for one page of one step, with the search', () => {
      TestBed.inject(RepairService).getRepairPage({ page: 1, perPage: 10 }, { status: 'fixed', search: 'vanna' }).subscribe();
      const sent = params(url);
      expect(sent.names).toEqual(['page', 'per_page', 'search', 'status']);
      expect([sent.get('status'), sent.get('search')]).toEqual(['fixed', 'vanna']);
    });
  });
});
