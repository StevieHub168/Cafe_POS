import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { Repair, RepairInput } from '../models/repair.model';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root'
})
export class RepairService {
  private readonly API_URL = `${environment.apiUrl}/repairs`;

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) { }

  /** Every repair: what is still in the shop first (waiting longest on top), then the picked-up ones. */
  getRepairs(): Observable<Repair[]> {
    return this.http.get<Repair[]>(this.API_URL, { headers: this.authService.getAuthHeaders() });
  }

  createRepair(repair: RepairInput): Observable<Repair> {
    return this.http.post<Repair>(this.API_URL, repair, { headers: this.authService.getAuthHeaders() });
  }

  /** Send only what changed, e.g. { status: 'fixed' }. */
  updateRepair(id: number, changes: Partial<RepairInput>): Observable<Repair> {
    return this.http.put<Repair>(`${this.API_URL}/${id}`, changes, { headers: this.authService.getAuthHeaders() });
  }

  deleteRepair(id: number): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`, { headers: this.authService.getAuthHeaders() });
  }
}
