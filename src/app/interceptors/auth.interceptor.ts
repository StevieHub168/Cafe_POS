import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';

/** Signing in with a wrong password is also a 401: that is a message on the Login page, not a lost session. */
const SIGN_IN_PATHS = ['/auth/login', '/auth/telegram-login'];

/** A call to one of the API's own paths. Not just "starts with the address": "https://api.shop.com.evil.example" must not count. */
const isApiCall = (url: string): boolean =>
  url === environment.apiUrl || url.startsWith(`${environment.apiUrl}/`) || url.startsWith(`${environment.apiUrl}?`);

/**
 * Every call to our API:
 *   - carries the signed-in person's token (so no service has to add it);
 *   - when the API says 401 "this token is no longer good" (it ran out, or the person signed in on another device),
 *     the person is taken to the Login page, which brings them back to the page they were on.
 * Calls to other addresses (Telegram, other websites) are left alone: they must never get the token.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiCall(req.url)) return next(req);

  const auth = inject(AuthService);
  const token = auth.getToken();
  const signedReq = token && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(signedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      const isSignIn = SIGN_IN_PATHS.some(path => req.url.endsWith(path));
      if (error.status === 401 && token && !isSignIn) auth.sessionEnded(token);
      return throwError(() => error);
    })
  );
};
