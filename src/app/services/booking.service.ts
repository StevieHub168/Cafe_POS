import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Booking, BookingInput, PickupInput, PickupResult } from '../models/booking.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class BookingService {
  private readonly API_URL = `${environment.apiUrl}/bookings`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  /** Every booking: the ones still to pick up first (soonest on top), then the finished and cancelled ones. */
  getBookings(): Observable<Booking[]> {
    return this.http.get<Booking[]>(this.API_URL, { headers: this.authService.getAuthHeaders() });
  }

  createBooking(booking: BookingInput): Observable<Booking> {
    return this.http.post<Booking>(this.API_URL, booking, { headers: this.authService.getAuthHeaders() });
  }

  /** Send only what changed, e.g. { status: 'picked_up' }. */
  updateBooking(id: number, changes: Partial<BookingInput>): Observable<Booking> {
    return this.http.put<Booking>(`${this.API_URL}/${id}`, changes, { headers: this.authService.getAuthHeaders() });
  }

  /** "The customer picked it up": closes the booking and makes the Sale (paid in full), in one step. */
  pickUp(id: number, input: PickupInput): Observable<PickupResult> {
    return this.http.post<PickupResult>(`${this.API_URL}/${id}/pickup`, input, { headers: this.authService.getAuthHeaders() });
  }

  deleteBooking(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`, { headers: this.authService.getAuthHeaders() });
  }
}
