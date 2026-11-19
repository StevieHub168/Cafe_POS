import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Paged, RepairCounts } from '../../models/paged/paged.model';
import { Repair, RepairInput } from '../../models/repair/repair.model';
import { PageState, pageParams } from '../../utils/page-state/page-state';

@Injectable({
  providedIn: 'root'
})
export class RepairService {
  private readonly API_URL = `${environment.apiUrl}/repairs`;

  constructor(private http: HttpClient) { }

  /** Every repair: what is still in the shop first (waiting longest on top), then the picked-up ones. */
  getRepairs(): Observable<Repair[]> {
    return this.http.get<Repair[]>(this.API_URL);
  }

  /** One page. `status` shows one step; `search` looks in the laptop, the problem, the customer and the contact. */
  getRepairPage(state: Pick<PageState, 'page' | 'perPage'>, filters: { status?: string; search?: string } = {}): Observable<Paged<Repair, { counts: RepairCounts }>> {
    const params = pageParams(state, { status: filters.status, search: filters.search });
    return this.http.get<Paged<Repair, { counts: RepairCounts }>>(this.API_URL, { params });
  }

  createRepair(repair: RepairInput): Observable<Repair> {
    return this.http.post<Repair>(this.API_URL, repair);
  }

  /** Send only what changed, e.g. { status: 'fixed' }. */
  updateRepair(id: number, changes: Partial<RepairInput>): Observable<Repair> {
    return this.http.put<Repair>(`${this.API_URL}/${id}`, changes);
  }

  deleteRepair(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`);
  }
}
