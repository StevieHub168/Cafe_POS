import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TelegramService } from './telegram.service';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

describe('TelegramService', () => {
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/telegram/send`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { getAuthHeaders: () => new HttpHeaders({ Authorization: 'Bearer test-token' }) } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('send posts the kind and the id, with the login, and gives back the answer', () => {
    let got: unknown;
    TestBed.inject(TelegramService).send('booking', 5).subscribe(answer => (got = answer));
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ kind: 'booking', id: 5 });
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush({ sent: true, group: 'booking', withoutPhotos: false });
    expect(got).toEqual({ sent: true, group: 'booking', withoutPhotos: false });
  });

  it('send adds the invoice picture only when there is one', () => {
    const service = TestBed.inject(TelegramService);
    service.send('sold', 9, 'data:image/png;base64,AAAA').subscribe();
    expect(http.expectOne(url).request.body).toEqual({ kind: 'sold', id: 9, picture: 'data:image/png;base64,AAAA' });
    service.send('sold', 9, null).subscribe();
    expect(http.expectOne(url).request.body).toEqual({ kind: 'sold', id: 9 });
  });

  it('an error of Telegram (502) reaches the caller with the reason', () => {
    let reason = '';
    TestBed.inject(TelegramService).send('repair', 3).subscribe({ error: (err) => (reason = err.error.error) });
    http.expectOne(url).flush({ error: 'Bad Request: chat not found' }, { status: 502, statusText: 'Bad Gateway' });
    expect(reason).toBe('Bad Request: chat not found');
  });
});
