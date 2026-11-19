import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { environment } from '../../environments/environment';

const TOKEN_KEY = 'laptop_auth_token';
const API = environment.apiUrl;

describe('authInterceptor', () => {
  let client: HttpClient;
  let http: HttpTestingController;
  let navigate: jasmine.Spy;
  let router: { navigate: jasmine.Spy; url: string };

  /** Sends a call and answers it with `status`. Gives back what the caller got. */
  function failWith(url: string, status: number, method: 'GET' | 'POST' = 'GET'): { status?: number } {
    const got: { status?: number } = {};
    client.request(method, url, { body: method === 'POST' ? {} : undefined }).subscribe({ error: e => (got.status = e.status) });
    http.expectOne(url).flush({ error: 'no' }, { status, statusText: 'x' });
    return got;
  }

  beforeEach(() => {
    navigate = jasmine.createSpy('navigate');
    router = { navigate, url: '/sales' };
    localStorage.setItem(TOKEN_KEY, 'my-token');
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: Router, useValue: router }],
    });
    client = TestBed.inject(HttpClient);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    localStorage.removeItem(TOKEN_KEY);
  });

  describe('the token', () => {
    it('is added to every call to our API', () => {
      client.get(`${API}/products`).subscribe();
      client.post(`${API}/bookings`, {}).subscribe();
      expect(http.expectOne(`${API}/products`).request.headers.get('Authorization')).toBe('Bearer my-token');
      expect(http.expectOne(`${API}/bookings`).request.headers.get('Authorization')).toBe('Bearer my-token');
    });

    it('is not added when nobody is signed in', () => {
      localStorage.removeItem(TOKEN_KEY);
      client.get(`${API}/products`).subscribe();
      expect(http.expectOne(`${API}/products`).request.headers.has('Authorization')).toBeFalse();
    });

    it('never goes to another address (Telegram, another website)', () => {
      const others = ['https://api.telegram.org/bot1/getMe', `${API}.evil.example/steal`, `${API}-old/products`];
      others.forEach(url => client.get(url).subscribe());
      for (const url of others) expect(http.expectOne(url).request.headers.has('Authorization')).withContext(url).toBeFalse();
    });

    it('a call that already has its own Authorization keeps it (logout sends its token on purpose)', () => {
      client.post(`${API}/auth/logout`, {}, { headers: { Authorization: 'Bearer another' } }).subscribe();
      expect(http.expectOne(`${API}/auth/logout`).request.headers.get('Authorization')).toBe('Bearer another');
    });
  });

  describe('when the API says 401 (the token is no longer good)', () => {
    it('signs the person out and opens the Login page, which brings them back to the page they were on', () => {
      router.url = '/sales?x=1';
      const got = failWith(`${API}/sales`, 401);
      expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
      expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: { returnUrl: '/sales?x=1' } });
      expect(got.status).toBe(401);          // the page that asked still gets the error
    });

    it('from the start page or the Login page there is no page to come back to', () => {
      for (const url of ['/', '/login', '/login?returnUrl=%2Fsales']) {
        localStorage.setItem(TOKEN_KEY, 'my-token');
        navigate.calls.reset();
        router.url = url;
        failWith(`${API}/products`, 401);
        expect(navigate).toHaveBeenCalledOnceWith(['/login'], { queryParams: {} });
      }
    });

    it('several calls failing together send the person to Login once', () => {
      client.get(`${API}/products`).subscribe({ error: () => { } });
      client.get(`${API}/bookings`).subscribe({ error: () => { } });
      client.get(`${API}/repairs`).subscribe({ error: () => { } });
      for (const path of ['products', 'bookings', 'repairs']) http.expectOne(`${API}/${path}`).flush({}, { status: 401, statusText: 'x' });
      expect(navigate).toHaveBeenCalledTimes(1);
    });

    it('a late 401 of an OLD token does not sign out the person who signed in again', () => {
      client.get(`${API}/products`).subscribe({ error: () => { } });        // sent with "my-token"
      localStorage.setItem(TOKEN_KEY, 'new-token');                         // signs in again meanwhile
      http.expectOne(`${API}/products`).flush({}, { status: 401, statusText: 'x' });
      expect(localStorage.getItem(TOKEN_KEY)).toBe('new-token');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('a wrong password at sign-in is only an error on the Login page: nobody is signed out', () => {
      const got = failWith(`${API}/auth/login`, 401, 'POST');
      failWith(`${API}/auth/telegram-login`, 401, 'POST');
      expect(got.status).toBe(401);
      expect(localStorage.getItem(TOKEN_KEY)).toBe('my-token');
      expect(navigate).not.toHaveBeenCalled();
    });

    it('with nobody signed in there is nothing to end', () => {
      localStorage.removeItem(TOKEN_KEY);
      failWith(`${API}/products`, 401);
      expect(navigate).not.toHaveBeenCalled();
    });
  });

  it('other errors (404, 409, 500) keep the person signed in and still reach the page', () => {
    for (const status of [400, 404, 409, 500]) {
      expect(failWith(`${API}/products`, status).status).toBe(status);
    }
    expect(localStorage.getItem(TOKEN_KEY)).toBe('my-token');
    expect(navigate).not.toHaveBeenCalled();
  });
});
