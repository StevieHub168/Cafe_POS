import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Invoice, InvoiceInput, InvoiceType } from '../models/invoice.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private readonly API_URL = `${environment.apiUrl}/invoices`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  /** Newest number first. */
  getInvoices(type?: InvoiceType): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(this.API_URL, {
      headers: this.authService.getAuthHeaders(),
      params: type ? { type } : {}
    });
  }

  /** The number the next invoice gets (the very first is 41). */
  getNextNumber(): Observable<number> {
    return this.http.get<{ number: number }>(`${this.API_URL}/next-number`, { headers: this.authService.getAuthHeaders() })
      .pipe(map(response => response.number));
  }

  createInvoice(invoice: InvoiceInput): Observable<Invoice> {
    return this.http.post<Invoice>(this.API_URL, invoice, { headers: this.authService.getAuthHeaders() });
  }

  /** Send only what changed, or everything. */
  updateInvoice(id: number, changes: Partial<InvoiceInput>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.API_URL}/${id}`, changes, { headers: this.authService.getAuthHeaders() });
  }

  deleteInvoice(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`, { headers: this.authService.getAuthHeaders() });
  }
}
