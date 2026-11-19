import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UserService } from './user.service';
import { environment } from '../../environments/environment';


describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('getUsers asks for GET /users', () => {
    let got: unknown;
    service.getUsers().subscribe(users => (got = users));
    const req = http.expectOne(`${environment.apiUrl}/users`);
    expect(req.request.method).toBe('GET');
    req.flush([{ id: 1, username: 'sok' }]);
    expect(got).toEqual([{ id: 1, username: 'sok' }]);
  });

  it('resetPassword sends the new password to PUT /users/:id/password', () => {
    let got: unknown;
    service.resetPassword(7, 'My new pass 2026').subscribe(r => (got = r));
    const req = http.expectOne(`${environment.apiUrl}/users/7/password`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ password: 'My new pass 2026' });
    req.flush({ message: 'Password changed' });
    expect(got).toEqual({ message: 'Password changed' });
  });
});
