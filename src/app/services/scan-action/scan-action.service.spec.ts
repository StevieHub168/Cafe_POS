import { TestBed } from '@angular/core/testing';
import { ScanActionService } from './scan-action.service';

describe('ScanActionService', () => {
  let service: ScanActionService;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(2026, 10, 13, 10, 0, 0));
    service = TestBed.inject(ScanActionService);
  });

  afterEach(() => jasmine.clock().uninstall());

  it('gives a Sell / Book / Repair request to the Menu, once', () => {
    service.ask({ kind: 'sell', productId: 7 });
    expect(service.takeLaptop()).toEqual({ kind: 'sell', productId: 7 });
    expect(service.takeLaptop()).toBeNull();
  });

  it('gives a pickup request to the Bookings page, once', () => {
    service.ask({ kind: 'pickup', bookingId: 3 });
    expect(service.takePickup()).toEqual({ kind: 'pickup', bookingId: 3 });
    expect(service.takePickup()).toBeNull();
  });

  it('a page only gets the request meant for it (and it keeps waiting for the right page)', () => {
    service.ask({ kind: 'book', productId: 7 });
    expect(service.takePickup()).toBeNull();
    expect(service.takeLaptop()).toEqual({ kind: 'book', productId: 7 });

    service.ask({ kind: 'pickup', bookingId: 3 });
    expect(service.takeLaptop()).toBeNull();
    expect(service.takePickup()).not.toBeNull();
  });

  it('nothing is waiting at the start', () => {
    expect(service.takeLaptop()).toBeNull();
    expect(service.takePickup()).toBeNull();
  });

  it('the newest request wins', () => {
    service.ask({ kind: 'sell', productId: 1 });
    service.ask({ kind: 'repair', productId: 2 });
    expect(service.takeLaptop()).toEqual({ kind: 'repair', productId: 2 });
  });

  it('a request that waited too long is forgotten (a window must never open by surprise later)', () => {
    service.ask({ kind: 'sell', productId: 7 });
    jasmine.clock().mockDate(new Date(2026, 10, 13, 10, 5, 0));      // 5 minutes later
    expect(service.takeLaptop()).toBeNull();
  });
});
