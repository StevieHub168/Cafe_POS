import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TelegramService } from './telegram.service';
import { environment } from '../../../environments/environment';

describe('TelegramService', () => {
  let http: HttpTestingController;
  const url = `${environment.apiUrl}/telegram/send`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('send posts the kind and the id, and gives back the answer', () => {
    let got: unknown;
    TestBed.inject(TelegramService).send('booking', 5).subscribe(answer => (got = answer));
    const request = http.expectOne(url);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ kind: 'booking', id: 5 });
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
