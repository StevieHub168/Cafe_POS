import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Settings the API holds (in its .env). */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private publicUrl$?: Observable<string>;

  constructor(private http: HttpClient) { }

  /**
   * The address the QR codes open ("" = the shop did not set it yet: the address this page is open on is used then). It is read once.
   * If the API cannot answer, "" too: a QR can still be made.
   */
  publicUrl(): Observable<string> {
    this.publicUrl$ ??= this.http.get<{ publicUrl: string }>(`${environment.apiUrl}/config`).pipe(
      map(config => config.publicUrl || ''),
      catchError(() => of('')),
      shareReplay(1)
    );
    return this.publicUrl$;
  }

  /** The address to put in a QR code: the shop's, or else the one this page is open on. */
  baseUrl(): Observable<{ url: string; fromSettings: boolean }> {
    return this.publicUrl().pipe(map(url => url
      ? { url, fromSettings: true }
      : { url: typeof window === 'undefined' ? '' : window.location.origin, fromSettings: false }));
  }
}
