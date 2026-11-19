import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { User } from '../models/user.model';
import { AuthService } from './auth.service';

/** The people who can sign in (admin only). */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly API_URL = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient, private authService: AuthService) { }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.API_URL, { headers: this.authService.getAuthHeaders() });
  }

  /** Sets a new password. That person is signed out (unless it is the admin's own). */
  resetPassword(id: number, password: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.API_URL}/${id}/password`, { password }, { headers: this.authService.getAuthHeaders() });
  }
}
