import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, ViewTransitionInfo } from '@angular/router';
import { onViewTransitionCreated } from './view-transition';

describe('onViewTransitionCreated (the soft change from one page to the next)', () => {
  const target = { toString: () => '/bookings' } as unknown as UrlTree;
  let router: { getCurrentNavigation: jasmine.Spy; isActive: jasmine.Spy };

  /** Runs it the way the router does: inside the app, with a change of page going on. */
  const run = (ready: Promise<void> = Promise.resolve()) => {
    const transition = { ready, skipTransition: jasmine.createSpy('skipTransition') };
    TestBed.runInInjectionContext(() => onViewTransitionCreated({ transition } as unknown as ViewTransitionInfo));
    return transition;
  };

  beforeEach(() => {
    router = {
      getCurrentNavigation: jasmine.createSpy('getCurrentNavigation').and.returnValue({ finalUrl: target }),
      isActive: jasmine.createSpy('isActive').and.returnValue(false),
    };
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });

  it('a change to another page is animated', () => {
    const transition = run();
    expect(transition.skipTransition).not.toHaveBeenCalled();
  });

  it('tapping the page you are already on is not animated', () => {
    router.isActive.and.returnValue(true);
    const transition = run();
    expect(transition.skipTransition).toHaveBeenCalledTimes(1);
  });

  it('only the path counts: a different search part or # part is still the same page', () => {
    run();
    expect(router.isActive).toHaveBeenCalledWith(target, { paths: 'exact', matrixParams: 'exact', fragment: 'ignored', queryParams: 'ignored' });
  });

  it('does nothing more when the router has no target page', () => {
    router.getCurrentNavigation.and.returnValue(null);
    const transition = run();
    expect(router.isActive).not.toHaveBeenCalled();
    expect(transition.skipTransition).not.toHaveBeenCalled();
  });

  it('a change cancelled by the next tap (AbortError) is not an error', async () => {
    run(Promise.reject(new DOMException('Skipped', 'AbortError')));
    await new Promise(resolve => setTimeout(resolve));          // an unhandled rejection would fail this test
    expect().nothing();
  });
});
