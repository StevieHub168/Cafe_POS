import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConfigService } from './config.service';
import { environment } from '../../../environments/environment';

describe('ConfigService (the address the QR codes open)', () => {
  let http: HttpTestingController;
  let service: ConfigService;
  const url = `${environment.apiUrl}/config`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    service = TestBed.inject(ConfigService);
  });

  afterEach(() => http.verify());

  it('asks the API for the shop address', () => {
    let got = '';
    service.publicUrl().subscribe(v => (got = v));
    const request = http.expectOne(url);
    request.flush({ publicUrl: 'https://thastore.example' });
    expect(got).toBe('https://thastore.example');
  });

  it('asks only once, however many times it is used', () => {
    service.publicUrl().subscribe();
    http.expectOne(url).flush({ publicUrl: 'https://thastore.example' });
    let again = '';
    service.publicUrl().subscribe(v => (again = v));
    service.baseUrl().subscribe();
    http.expectNone(url);
    expect(again).toBe('https://thastore.example');
  });

  it('baseUrl: the shop address when it is set', () => {
    let got: unknown;
    service.baseUrl().subscribe(v => (got = v));
    http.expectOne(url).flush({ publicUrl: 'https://thastore.example' });
    expect(got).toEqual({ url: 'https://thastore.example', fromSettings: true });
  });

  it('baseUrl: not set -> the address this page is open on, and it says it is not from the settings', () => {
    let got: unknown;
    service.baseUrl().subscribe(v => (got = v));
    http.expectOne(url).flush({ publicUrl: '' });
    expect(got).toEqual({ url: window.location.origin, fromSettings: false });
  });

  it('when the API cannot answer, a QR can still be made (the address of this page)', () => {
    let got: unknown;
    service.baseUrl().subscribe(v => (got = v));
    http.expectOne(url).flush({ error: 'down' }, { status: 500, statusText: 'Server Error' });
    expect(got).toEqual({ url: window.location.origin, fromSettings: false });
  });
});
