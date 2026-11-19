import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { TelegramNotifier } from './telegram-notifier.service';
import { TelegramService } from '../telegram/telegram.service';
import { InvoicePictureService } from '../invoice-picture/invoice-picture.service';
import { Invoice } from '../../models/invoice/invoice.model';

const SALE = { id: 9, number: 44, type: 'sale', items: [] } as unknown as Invoice;

describe('TelegramNotifier (how each message to Telegram goes)', () => {
  let notifier: TelegramNotifier;
  let api: { send: jasmine.Spy };
  let pictures: { makeDataUrl: jasmine.Spy };

  beforeEach(() => {
    api = { send: jasmine.createSpy('send').and.returnValue(of({ sent: true, group: 'booking', withoutPhotos: false })) };
    pictures = { makeDataUrl: jasmine.createSpy('makeDataUrl').and.resolveTo('data:image/png;base64,AAAA') };
    TestBed.configureTestingModule({
      providers: [{ provide: TelegramService, useValue: api }, { provide: InvoicePictureService, useValue: pictures }],
    });
    notifier = TestBed.inject(TelegramNotifier);
  });

  it('a booking or repair is sent with no picture (the API has the laptop photo)', fakeAsync(() => {
    notifier.send('booking', 5);
    flushMicrotasks();
    expect(api.send).toHaveBeenCalledOnceWith('booking', 5, null);
    expect(pictures.makeDataUrl).not.toHaveBeenCalled();
  }));

  it('a sale is sent with the picture of its paper', fakeAsync(() => {
    notifier.send('sold', 9, SALE);
    flushMicrotasks();
    expect(pictures.makeDataUrl).toHaveBeenCalledOnceWith(SALE);
    expect(api.send).toHaveBeenCalledOnceWith('sold', 9, 'data:image/png;base64,AAAA');
  }));

  it('says "Sending..." first, then "Sent", and the box goes away by itself after 5 seconds', fakeAsync(() => {
    const answer = new Subject<unknown>();
    api.send.and.returnValue(answer);
    notifier.send('repair', 3);
    expect(notifier.toasts.length).toBe(1);
    expect(notifier.toasts[0].state).toBe('sending');
    expect(notifier.toasts[0].text).toBe('Sending the repair to Telegram...');
    flushMicrotasks();
    answer.next({ sent: true, group: 'repair', withoutPhotos: false });
    expect(notifier.toasts[0].state).toBe('sent');
    expect(notifier.toasts[0].text).toBe('Repair sent to Telegram.');
    tick(4900);
    expect(notifier.toasts.length).toBe(1);
    tick(200);
    expect(notifier.toasts.length).toBe(0);
  }));

  it('says so when Telegram could not use the laptop photo', fakeAsync(() => {
    api.send.and.returnValue(of({ sent: true, group: 'sold', withoutPhotos: true }));
    notifier.send('sold', 9, SALE);
    flushMicrotasks();
    expect(notifier.toasts[0].text).toBe('Sale sent to Telegram. The photo could not be sent.');
    tick(6000);
  }));

  it('says so when the Booking message of that laptop was taken down', fakeAsync(() => {
    api.send.and.returnValue(of({ sent: true, group: 'sold', withoutPhotos: false, removedBooking: true }));
    notifier.send('sold', 9, SALE);
    flushMicrotasks();
    expect(notifier.toasts[0].text).toBe('Sale sent to Telegram. The booking message was removed.');
    tick(6000);
  }));

  it('when Telegram says no: the sale is still saved, the reason is shown, and the box stays', fakeAsync(() => {
    api.send.and.returnValue(throwError(() => ({ error: { error: 'Bad Request: chat not found' } })));
    notifier.send('sold', 9, SALE);
    flushMicrotasks();
    expect(notifier.toasts[0].state).toBe('failed');
    expect(notifier.toasts[0].text).toBe('The sale was saved, but not sent to Telegram. Bad Request: chat not found');
    tick(60000);
    expect(notifier.toasts.length).toBe(1);
  }));

  it('when the group is not set up the reason says so', fakeAsync(() => {
    api.send.and.returnValue(throwError(() => ({ status: 503, error: { error: 'Telegram is not set up for the Repair group yet', notSetUp: true } })));
    notifier.send('repair', 3);
    flushMicrotasks();
    expect(notifier.toasts[0].text).toContain('Telegram is not set up for the Repair group yet');
  }));

  it('when the internet is down (no reason from the API) it says what to check', fakeAsync(() => {
    api.send.and.returnValue(throwError(() => ({ status: 0 })));
    notifier.send('booking', 5);
    flushMicrotasks();
    expect(notifier.toasts[0].text).toBe('The booking was saved, but not sent to Telegram. Please check the internet and try again.');
  }));

  it('"Send again" sends the same thing again (with the same picture) and then says Sent', fakeAsync(() => {
    api.send.and.returnValue(throwError(() => ({ error: { error: 'down' } })));
    notifier.send('sold', 9, SALE);
    flushMicrotasks();
    const toast = notifier.toasts[0];
    expect(toast.state).toBe('failed');
    api.send.and.returnValue(of({ sent: true, group: 'sold', withoutPhotos: false }));
    notifier.retry(toast);
    flushMicrotasks();
    expect(api.send.calls.count()).toBe(2);
    expect(api.send.calls.mostRecent().args).toEqual(['sold', 9, 'data:image/png;base64,AAAA']);
    expect(toast.state).toBe('sent');
    expect(notifier.toasts.length).toBe(1);                              // the same box, not a new one
    tick(6000);
  }));

  it('"Send again" does nothing while it is still sending', fakeAsync(() => {
    api.send.and.returnValue(new Subject());
    notifier.send('repair', 3);
    flushMicrotasks();
    notifier.retry(notifier.toasts[0]);
    expect(api.send).toHaveBeenCalledTimes(1);
  }));

  it('when the invoice picture cannot be made the message still goes, without it', fakeAsync(() => {
    pictures.makeDataUrl.and.rejectWith(new Error('no'));
    notifier.send('sold', 9, SALE);
    flushMicrotasks();
    expect(api.send).toHaveBeenCalledOnceWith('sold', 9, null);
    tick(6000);
  }));

  it('close removes a box, and each message has its own box', fakeAsync(() => {
    api.send.and.returnValue(throwError(() => ({ error: { error: 'down' } })));
    notifier.send('booking', 1);
    notifier.send('repair', 2);
    flushMicrotasks();
    expect(notifier.toasts.length).toBe(2);
    notifier.dismiss(notifier.toasts[0]);
    expect(notifier.toasts.map(t => t.text)).toEqual(['The repair was saved, but not sent to Telegram. down']);
  }));

  it('without an id (a record that has none) nothing is sent', () => {
    notifier.send('booking', undefined);
    expect(api.send).not.toHaveBeenCalled();
    expect(notifier.toasts.length).toBe(0);
  });
});
