import { ApplicationConfig, inject, provideEnvironmentInitializer, provideZoneChangeDetection } from '@angular/core';
import { PreloadAllModules, provideRouter, withInMemoryScrolling, withPreloading, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';
import { onViewTransitionCreated } from './utils/view-transition/view-transition';
import { SplashScreenService } from './services/splash-screen/splash-screen.service';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    // Changing page feels smooth (like the CDC app):
    //  - view transitions: the browser fades from the old page to the new one (the look is in styles.css; no fade on the first load),
    //  - preloading: after the app is up, the code of the other pages is downloaded in the background, so a tap on the menu never waits,
    //  - scrolling: a new page starts at the top, and "Back" returns to where you were.
    provideRouter(
      routes,
      withViewTransitions({ skipInitialTransition: true, onViewTransitionCreated }),
      withPreloading(PreloadAllModules),
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })
    ),
    // The cover with our logo, until the first page is ready (see index.html and public/styles/splash-screen.css).
    provideEnvironmentInitializer(() => { inject(SplashScreenService); }),
    provideClientHydration(withEventReplay()),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    provideAnimationsAsync()
  ]
};
