import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';
import { Invoice, InvoiceInput, InvoiceType } from '../models/invoice.model';
import { Paged, SalesCounts } from '../models/paged.model';
import { PageState, pageParams } from '../utils/page-state';

@Injectable({
  providedIn: 'root'
})
export class InvoiceService {
  private readonly API_URL = `${environment.apiUrl}/invoices`;

  constructor(private http: HttpClient) { }

  /** Newest number first. */
  getInvoices(type?: InvoiceType): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(this.API_URL, {
      params: type ? { type } : {}
    });
  }

  /** One page of invoices. `period`: 'month' = made this month, 'warranty' = still under warranty. `counts` (in meta) are the numbers of the Sales tabs. */
  getInvoicePage(state: Pick<PageState, 'page' | 'perPage'>, filters: { type?: InvoiceType; period?: string; search?: string } = {}): Observable<Paged<Invoice, { counts: SalesCounts }>> {
    const params = pageParams(state, { type: filters.type, period: filters.period, search: filters.search });
    return this.http.get<Paged<Invoice, { counts: SalesCounts }>>(this.API_URL, { params });
  }

  /** The number the next invoice gets (the very first is 41). */
  getNextNumber(): Observable<number> {
    return this.http.get<{ number: number }>(`${this.API_URL}/next-number`)
      .pipe(map(response => response.number));
  }

  createInvoice(invoice: InvoiceInput): Observable<Invoice> {
    return this.http.post<Invoice>(this.API_URL, invoice);
  }

  /** Send only what changed, or everything. */
  updateInvoice(id: number, changes: Partial<InvoiceInput>): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.API_URL}/${id}`, changes);
  }

  deleteInvoice(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`);
  }
}
