import { RenderMode, ServerRoute } from '@angular/ssr';

// Only the public pages are rendered on the server / at build time.
// The login token lives in the browser (localStorage), which the server cannot see - so a page that sits behind
// the login guard (menu, products, dashboard, register) rendered on the server would always be "not logged in"
// and come out as the login page. That is what made a reload throw you back to Login.
// They are rendered in the browser instead, where the token is available.
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'login', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client }
];
