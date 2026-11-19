import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { User } from '../models/user.model';

/** The people who can sign in (admin only). */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly API_URL = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) { }

  getUsers(): Observable<User[]> {
    return this.http.get<User[]>(this.API_URL);
  }

  /** Sets a new password. That person is signed out (unless it is the admin's own). */
  resetPassword(id: number, password: string): Observable<{ message: string }> {
    return this.http.put<{ message: string }>(`${this.API_URL}/${id}/password`, { password });
  }
}
