import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Location } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

const TOKEN_KEY = 'laptop_auth_token';

describe('AuthService logout', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  let router: { navigate: jasmine.Spy; url: string };
  let addressBar = '';

  beforeEach(() => {
    navigate = jasmine.createSpy('navigate');
    router = { navigate, url: '/sales' };
    addressBar = '';
    localStorage.setItem(TOKEN_KEY, 'my-token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: Router, useValue: router }, { provide: Location, useValue: { path: () => addressBar } }],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(TOKEN_KEY);
  });

  it('tells the server (with the token), so the token stops working there too', () => {
    service.logout();
    const req = http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    expect(req.request.headers.get('Authorization')).toBe('Bearer my-token');
    req.flush({ message: 'Logged out successfully' });
  });

  it('signs out here at once: the token is gone, nobody is signed in, and the login page opens', () => {
    service.logout();
    http.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.currentUserValue).toBeNull();
    expect(navigate).toHaveBeenCalledOnceWith(['/login']);
  });

  it('still signs out when the server cannot be reached or the token was already out of date', () => {
    service.logout();
    http.expectOne(`${environment.apiUrl}/auth/logout`).flush({ error: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledOnceWith(['/login']);
  });

  it('with nobody signed in there is nothing to tell the server', () => {
    localStorage.removeItem(TOKEN_KEY);
    service.logout();
    http.expectNone(`${environment.apiUrl}/auth/logout`);
    expect(navigate).toHaveBeenCalledOnceWith(['/login']);
  });

  describe('sessionEnded (the API no longer accepts the token)', () => {
    it('signs out here only (the server already knows) and opens Login with the page to come back to', () => {
      router.url = '/bookings?status=booked';
      service.sessionEnded('my-token');
      http.expectNone(`${environment.apiUrl}/auth/logout`);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(service.currentUserValue).toBeNull();
      expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/bookings?status=booked' } });
    });

    it('while the app is starting (the router url is still "/") the page in the address bar is the one to come back to', () => {
      router.url = '/';
      addressBar = '/l/LP-0042';
      service.sessionEnded('my-token');
      expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/l/LP-0042' } });
    });

    it('with no page to come back to (the start page, or Login itself) Login opens plain', () => {
      for (const [url, bar] of [['/', ''], ['/', '/'], ['/login', ''], ['/login?returnUrl=%2Fsales', '']]) {
        localStorage.setItem(TOKEN_KEY, 'my-token');
        navigate.calls.reset();
        router.url = url;
        addressBar = bar;
        service.sessionEnded('my-token');
        expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: {} });
      }
    });

    it('does nothing when that is not the current token (the person already signed in again)', () => {
      service.sessionEnded('an-older-token');
      expect(localStorage.getItem(TOKEN_KEY)).toBe('my-token');
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  describe('loadCurrentUser at start-up', () => {
    const meUrl = `${environment.apiUrl}/auth/me`;

    it('a token the API cannot be asked about (it is unreachable) signs the person out, as before', () => {
      service.loadCurrentUser().subscribe();
      http.expectOne(meUrl).error(new ProgressEvent('error'));
      http.expectOne(`${environment.apiUrl}/auth/logout`);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledOnceWith(['/login']);
    });

    it('when a 401 already ended the session (the interceptor), it does not sign out a second time and lose the page to come back to', () => {
      service.loadCurrentUser().subscribe();
      localStorage.removeItem(TOKEN_KEY);              // what sessionEnded did
      http.expectOne(meUrl).flush({ error: 'Token expired' }, { status: 401, statusText: 'Unauthorized' });
      http.expectNone(`${environment.apiUrl}/auth/logout`);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a good token gives the user', () => {
      let got: unknown;
      service.loadCurrentUser().subscribe(user => (got = user));
      http.expectOne(meUrl).flush({ user: { id: 1, username: 'owner' } });
      expect(got).toEqual({ id: 1, username: 'owner' });
      expect(service.currentUserValue).toEqual({ id: 1, username: 'owner' } as never);
    });
  });
});
