import { Injectable } from '@angular/core';
import { Invoice } from '../../models/invoice/invoice.model';
import { InvoicePictureService } from '../invoice-picture/invoice-picture.service';
import { TelegramKind, TelegramService } from '../telegram/telegram.service';

/** One line of the little box in the corner: "Sending..." then "Sent" (goes away by itself) or "Not sent" (stays, with Send again). */
export interface TelegramToast {
  id: number;
  state: 'sending' | 'sent' | 'failed';
  text: string;
}

const WHAT: Record<TelegramKind, string> = { booking: 'Booking', repair: 'Repair', sold: 'Sale' };

/**
 * Sends a booking, a repair or a sale to its Telegram group and tells the person how it went. The booking / repair / sale is
 * ALREADY saved when this is called: if Telegram is down nothing is undone, the box just says "Not sent" with a Send again button.
 */
@Injectable({ providedIn: 'root' })
export class TelegramNotifier {
  readonly toasts: TelegramToast[] = [];
  private nextId = 1;
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(private telegram: TelegramService, private pictures: InvoicePictureService) { }

  /** `invoice` = the paper of a sale: its picture goes with the laptop photo. Never throws. */
  send(kind: TelegramKind, id: number | undefined, invoice?: Invoice | null): void {
    if (id === undefined || id === null) return;
    const toast: TelegramToast = { id: this.nextId++, state: 'sending', text: `Sending the ${WHAT[kind].toLowerCase()} to Telegram...` };
    this.toasts.push(toast);
    void this.run(toast, kind, id, invoice ?? null);
  }

  /** "Send again" on a toast that failed. */
  retry(toast: TelegramToast): void {
    const again = this.again.get(toast.id);
    if (!again || toast.state === 'sending') return;
    again();
  }

  dismiss(toast: TelegramToast): void {
    clearTimeout(this.timers.get(toast.id));
    this.timers.delete(toast.id);
    this.again.delete(toast.id);
    const at = this.toasts.indexOf(toast);
    if (at >= 0) this.toasts.splice(at, 1);
  }

  private readonly again = new Map<number, () => void>();

  private async run(toast: TelegramToast, kind: TelegramKind, id: number, invoice: Invoice | null): Promise<void> {
    toast.state = 'sending';
    toast.text = `Sending the ${WHAT[kind].toLowerCase()} to Telegram...`;
    clearTimeout(this.timers.get(toast.id));
    this.again.set(toast.id, () => void this.run(toast, kind, id, invoice));

    // The invoice picture is nice to have: if it cannot be made, the words and the laptop photo still go.
    let picture: string | null = null;
    if (invoice) {
      try { picture = await this.pictures.makeDataUrl(invoice); } catch { picture = null; }
    }

    this.telegram.send(kind, id, picture).subscribe({
      next: (answer) => {
        toast.state = 'sent';
        toast.text = `${WHAT[kind]} sent to Telegram.${answer.withoutPhotos ? ' The photo could not be sent.' : ''}${answer.removedBooking ? ' The booking message was removed.' : ''}`;
        this.again.delete(toast.id);
        this.timers.set(toast.id, setTimeout(() => this.dismiss(toast), 5000));
      },
      error: (err) => {
        toast.state = 'failed';
        const reason = err?.error?.error || 'Please check the internet and try again.';
        toast.text = `The ${WHAT[kind].toLowerCase()} was saved, but not sent to Telegram. ${reason}`;
      }
    });
  }
}
