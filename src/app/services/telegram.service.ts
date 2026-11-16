import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** What can be sent to the shop's Telegram groups. */
export type TelegramKind = 'booking' | 'repair' | 'sold';

export interface TelegramSent {
  sent: boolean;
  group: TelegramKind;
  /** true = Telegram could not use the laptop photo, so only the words went. */
  withoutPhotos: boolean;
}

@Injectable({ providedIn: 'root' })
export class TelegramService {
  private readonly API_URL = `${environment.apiUrl}/telegram`;

  constructor(private http: HttpClient, private authService: AuthService) { }

  /**
   * The API sends that booking / repair / sale to its group (the laptop photo first). `picture` = the invoice picture
   * ("data:image/png;base64,...") to send with it. An answer of an error (502 = Telegram said no, 503 = the group is not set up) has the reason in `error.error.error`.
   */
  send(kind: TelegramKind, id: number, picture?: string | null): Observable<TelegramSent> {
    return this.http.post<TelegramSent>(`${this.API_URL}/send`, { kind, id, ...(picture ? { picture } : {}) }, {
      headers: this.authService.getAuthHeaders()
    });
  }
}
