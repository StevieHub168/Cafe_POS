import { DOCUMENT, isPlatformBrowser } from '@angular/common';
import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { NavigationEnd, NavigationError, Router } from '@angular/router';
import { filter, take } from 'rxjs';

/** The class on <body> that makes the cover fade away (the look is in public/styles/splash-screen.css). */
export const SPLASH_HIDDEN_CLASS = 'splash-hidden';

/** The first page should always end, but if it never does, the cover goes anyway after this long. */
export const SPLASH_MAX_MS = 15_000;

/**
 * The cover shown while the app loads (its markup is in index.html). It goes away when the first page is ready:
 * the first navigation that ends, or fails. A navigation that is only a redirect (the guard sending you to Login) is not the end:
 * the page it sends you to is.
 *
 * It only works in the browser. The server must not hide it: the HTML the server sends is what the browser shows first.
 */
@Injectable({ providedIn: 'root' })
export class SplashScreenService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    if (!this.isBrowser) return;
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd || event instanceof NavigationError), take(1))
      .subscribe(() => this.hide());
    setTimeout(() => this.hide(), SPLASH_MAX_MS);
  }

  show(): void {
    this.document.body.classList.remove(SPLASH_HIDDEN_CLASS);
  }

  hide(): void {
    this.document.body.classList.add(SPLASH_HIDDEN_CLASS);
  }
}
