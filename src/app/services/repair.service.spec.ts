import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RepairService } from './repair.service';
import { BookingService } from './booking.service';
import { environment } from '../../environments/environment';
import { RepairInput } from '../models/repair.model';

const INPUT: RepairInput = {
  product_id: null, device: 'Dell Inspiron 15', customer_name: null, phone: null, telegram: null, problem: 'Screen flickers',
  received_date: '2026-11-10', back_on: null, cost: null, status: 'received', sale_invoice_id: null,
};

describe('RepairService and the booking pickup call', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  describe('repairs', () => {
    const url = `${environment.apiUrl}/repairs`;

    it('getRepairs asks for the list', () => {
      let got: unknown;
      TestBed.inject(RepairService).getRepairs().subscribe(list => (got = list));
      const request = http.expectOne(url);
      expect(request.request.method).toBe('GET');
      request.flush([{ id: 1 }]);
      expect(got).toEqual([{ id: 1 }]);
    });

    it('createRepair posts what was typed', () => {
      TestBed.inject(RepairService).createRepair(INPUT).subscribe();
      const request = http.expectOne(url);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual(INPUT);
      request.flush({ id: 1 });
    });

    it('updateRepair puts only what changed, on that repair', () => {
      TestBed.inject(RepairService).updateRepair(5, { status: 'fixed' }).subscribe();
      const request = http.expectOne(`${url}/5`);
      expect(request.request.method).toBe('PUT');
      expect(request.request.body).toEqual({ status: 'fixed' });
      request.flush({ id: 5 });
    });

    it('deleteRepair deletes that repair', () => {
      TestBed.inject(RepairService).deleteRepair(5).subscribe();
      const request = http.expectOne(`${url}/5`);
      expect(request.request.method).toBe('DELETE');
      request.flush({ message: 'ok' });
    });

    it('a failure from the API reaches the caller (so the screen can say why)', () => {
      let error: any;
      TestBed.inject(RepairService).createRepair(INPUT).subscribe({ error: (e) => (error = e) });
      http.expectOne(url).flush({ error: 'Please write what is wrong' }, { status: 400, statusText: 'Bad Request' });
      expect(error.error.error).toBe('Please write what is wrong');
    });
  });

  describe('booking pickup', () => {
    it('posts the warranty and the contact to /bookings/:id/pickup and returns the booking, the Sale and the laptop', () => {
      let result: any;
      TestBed.inject(BookingService).pickUp(3, { warranty: '1_week', customer_name: 'Sok', phone: '011', telegram: null }).subscribe(r => (result = r));
      const request = http.expectOne(`${environment.apiUrl}/bookings/3/pickup`);
      expect(request.request.method).toBe('POST');
      expect(request.request.body).toEqual({ warranty: '1_week', customer_name: 'Sok', phone: '011', telegram: null });
      request.flush({ booking: { id: 3 }, invoice: { id: 9 }, laptop: 'hidden' });
      expect(result.laptop).toBe('hidden');
    });

    it('a 409 (someone was faster) reaches the caller with its message', () => {
      let error: any;
      TestBed.inject(BookingService).pickUp(3, { warranty: 'none' }).subscribe({ error: (e) => (error = e) });
      http.expectOne(`${environment.apiUrl}/bookings/3/pickup`).flush({ error: 'This booking is already picked up' }, { status: 409, statusText: 'Conflict' });
      expect(error.status).toBe(409);
      expect(error.error.error).toBe('This booking is already picked up');
    });
  });
});
