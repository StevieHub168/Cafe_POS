import { inject } from '@angular/core';
import { Router, ViewTransitionInfo } from '@angular/router';

/**
 * The router calls this each time a change of page starts a "view transition" (the browser fades from the old page to the new one;
 * the look of it is in styles.css). It is set up in app.config.ts.
 *  - Tapping the page you are already on does not animate.
 *  - Tapping another menu item while one change is still running cancels the first one. The browser reports that as an
 *    AbortError, and it is normal: it is ignored. Any other error is still shown.
 */
export function onViewTransitionCreated({ transition }: ViewTransitionInfo): void {
  transition.ready.catch(error => {
    if (error?.name !== 'AbortError') throw error;
  });

  const router = inject(Router);
  const target = router.getCurrentNavigation()?.finalUrl;
  if (!target) return;

  const samePage = router.isActive(target, { paths: 'exact', matrixParams: 'exact', fragment: 'ignored', queryParams: 'ignored' });
  if (samePage) transition.skipTransition();
}
