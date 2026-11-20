import { DOCUMENT } from '@angular/common';
import { PLATFORM_ID } from '@angular/core';
import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NavigationCancel, NavigationCancellationCode, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { SPLASH_HIDDEN_CLASS, SPLASH_MAX_MS, SplashScreenService } from './splash-screen.service';

describe('SplashScreenService (the cover while the app loads)', () => {
  let events: Subject<unknown>;
  let body: HTMLElement;
  const hidden = () => body.classList.contains(SPLASH_HIDDEN_CLASS);

  /** Makes the service the way the app does at start, in the browser or on the server. */
  function start(platform: 'browser' | 'server' = 'browser'): SplashScreenService {
    events = new Subject<unknown>();
    TestBed.configureTestingModule({
      providers: [{ provide: Router, useValue: { events } }, { provide: PLATFORM_ID, useValue: platform }],
    });
    body = TestBed.inject(DOCUMENT).body;
    return TestBed.inject(SplashScreenService);
  }
  afterEach(() => document.body.classList.remove(SPLASH_HIDDEN_CLASS));

  it('the cover stays while the first page is on its way', fakeAsync(() => {
    start();
    expect(hidden()).toBeFalse();
    events.next(new NavigationStart(1, '/products'));
    expect(hidden()).toBeFalse();
    tick(SPLASH_MAX_MS - 1);
    expect(hidden()).toBeFalse();
  }));

  it('it goes when the first page is ready', fakeAsync(() => {
    start();
    events.next(new NavigationStart(1, '/products'));
    events.next(new NavigationEnd(1, '/products', '/products'));
    expect(hidden()).toBeTrue();
    tick(SPLASH_MAX_MS);                      // the timer of the safety net is harmless
  }));

  it('it goes too when the first page fails (an error page is better than a cover for ever)', fakeAsync(() => {
    start();
    events.next(new NavigationError(1, '/products', new Error('chunk did not load')));
    expect(hidden()).toBeTrue();
    tick(SPLASH_MAX_MS);
  }));

  it('a guard that only sends you to Login is not the end: it stays until Login is ready', fakeAsync(() => {
    start();
    events.next(new NavigationStart(1, '/products'));
    events.next(new NavigationCancel(1, '/products', 'redirected to /login', NavigationCancellationCode.GuardRejected));
    expect(hidden()).toBeFalse();
    events.next(new NavigationStart(2, '/login'));
    expect(hidden()).toBeFalse();
    events.next(new NavigationEnd(2, '/login', '/login'));
    expect(hidden()).toBeTrue();
    tick(SPLASH_MAX_MS);
  }));

  it('only the FIRST page counts: after show(), a later page change does not hide it again', fakeAsync(() => {
    const splash = start();
    events.next(new NavigationEnd(1, '/menu', '/menu'));
    expect(hidden()).toBeTrue();
    splash.show();
    expect(hidden()).toBeFalse();
    events.next(new NavigationEnd(2, '/products', '/products'));
    expect(hidden()).toBeFalse();
    tick(SPLASH_MAX_MS);
  }));

  it('if no page ever ends, the cover goes after 15 seconds anyway', fakeAsync(() => {
    start();
    tick(SPLASH_MAX_MS);
    expect(hidden()).toBeTrue();
  }));

  it('show() and hide() put the class on and off the page', () => {
    const splash = start();
    splash.hide();
    expect(hidden()).toBeTrue();
    splash.show();
    expect(hidden()).toBeFalse();
  });

  it('on the server it does nothing (the HTML the server sends keeps the cover)', fakeAsync(() => {
    start('server');
    events.next(new NavigationEnd(1, '/login', '/login'));
    tick(SPLASH_MAX_MS);
    expect(hidden()).toBeFalse();
  }));
});
