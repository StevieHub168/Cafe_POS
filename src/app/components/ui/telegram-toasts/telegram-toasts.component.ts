import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TelegramNotifier, TelegramToast } from '../../../services/telegram-notifier/telegram-notifier.service';

/**
 * The little box in the bottom corner that says how each message to Telegram went. It is in the app once, so it stays
 * whichever page is open. "Sent" goes away by itself; "Not sent" stays until it is sent again or closed.
 */
@Component({
  selector: 'app-telegram-toasts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div *ngIf="notifier.toasts.length" class="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2" aria-label="Telegram">
      <div *ngFor="let toast of notifier.toasts; trackBy: track" class="pointer-events-auto rounded-lg border bg-white px-4 py-3 text-sm shadow-lg"
        [ngClass]="toast.state === 'failed' ? 'border-red-200' : 'border-surface-border'"
        [attr.role]="toast.state === 'failed' ? 'alert' : 'status'" data-telegram-toast [attr.data-state]="toast.state">
        <div class="flex items-start gap-2.5">
          <svg class="mt-0.5 h-4 w-4 flex-shrink-0" [ngClass]="toast.state === 'failed' ? 'text-red-600' : toast.state === 'sent' ? 'text-green-600' : 'text-gray-400'"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          <p class="min-w-0 flex-1" [ngClass]="toast.state === 'failed' ? 'text-red-700' : 'text-gray-700'">{{ toast.text }}</p>
          <button *ngIf="toast.state !== 'sending'" type="button" (click)="notifier.dismiss(toast)" aria-label="Close"
            class="flex-shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div *ngIf="toast.state === 'failed'" class="mt-2 pl-6">
          <button type="button" (click)="notifier.retry(toast)"
            class="rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Send again</button>
        </div>
      </div>
    </div>
  `,
})
export class TelegramToastsComponent {
  constructor(public notifier: TelegramNotifier) { }

  track = (_: number, toast: TelegramToast) => toast.id;
}
