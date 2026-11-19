import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

const AUTH = new HttpHeaders({ Authorization: 'Bearer test-token' });

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: { getAuthHeaders: () => AUTH } }],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getUsers asks for GET /users, signed in', () => {
    let got: unknown;
    service.getUsers().subscribe(users => (got = users));
    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush([{ id: 1, username: 'sok' }]);
    expect(got).toEqual([{ id: 1, username: 'sok' }]);
  });

  it('resetPassword sends the new password to PUT /users/:id/password, signed in', () => {
    let got: unknown;
    service.resetPassword(7, 'My new pass 2026').subscribe(r => (got = r));
    const req = http.expectOne(`${environment.apiUrl}/users/7/password`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ password: 'My new pass 2026' });
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-token');
    req.flush({ message: 'Password changed' });
    expect(got).toEqual({ message: 'Password changed' });
  });
});
