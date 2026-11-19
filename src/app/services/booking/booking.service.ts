import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Booking, BookingInput, PickupInput, PickupResult } from '../../models/booking/booking.model';
import { BookingCounts, Paged } from '../../models/paged/paged.model';
import { PageState, pageParams } from '../../utils/page-state/page-state';

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private readonly API_URL = `${environment.apiUrl}/bookings`;

  constructor(private http: HttpClient) { }

  /** Every booking: the ones still to pick up first (soonest on top), then the finished and cancelled ones. */
  getBookings(): Observable<Booking[]> {
    return this.http.get<Booking[]>(this.API_URL);
  }

  /** One page. `status` shows one status, `excludeStatus` leaves one out (the Bookings page leaves out the picked-up ones: they became Sales). */
  getBookingPage(state: Pick<PageState, 'page' | 'perPage'>, filters: { status?: string; excludeStatus?: string; search?: string } = {}): Observable<Paged<Booking, { counts: BookingCounts }>> {
    const params = pageParams(state, { status: filters.status, exclude_status: filters.excludeStatus, search: filters.search });
    return this.http.get<Paged<Booking, { counts: BookingCounts }>>(this.API_URL, { params });
  }

  getBooking(id: number): Observable<Booking> {
    return this.http.get<Booking>(`${this.API_URL}/${id}`);
  }

  createBooking(booking: BookingInput): Observable<Booking> {
    return this.http.post<Booking>(this.API_URL, booking);
  }

  /** Send only what changed, e.g. { status: 'picked_up' }. */
  updateBooking(id: number, changes: Partial<BookingInput>): Observable<Booking> {
    return this.http.put<Booking>(`${this.API_URL}/${id}`, changes);
  }

  /** "The customer picked it up": closes the booking and makes the Sale (paid in full), in one step. */
  pickUp(id: number, input: PickupInput): Observable<PickupResult> {
    return this.http.post<PickupResult>(`${this.API_URL}/${id}/pickup`, input);
  }

  deleteBooking(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`);
  }
}
