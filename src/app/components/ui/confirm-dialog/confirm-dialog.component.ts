import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImgSrcPipe } from '../../../pipes/img-src.pipe';

/**
 * "Are you sure?" box for deleting something. Same look as the one on the Products page.
 * The page owns the logic: it shows this box, and reacts to (confirm) and (cancel). Esc is handled by the page.
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, ImgSrcPipe],
  styles: [`
    .confirm-backdrop { animation: confirm-fade 150ms ease-out; }
    .confirm-panel    { animation: confirm-pop 180ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes confirm-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes confirm-pop  { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .confirm-backdrop, .confirm-panel { animation: none; } }
  `],
  template: `
    <div class="confirm-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4" (click)="cancel.emit()">
      <div class="confirm-panel w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true"
           aria-labelledby="confirm-title" aria-describedby="confirm-text" (click)="$event.stopPropagation()">

        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
          </div>
          <div class="min-w-0">
            <h2 id="confirm-title" class="text-base font-semibold text-gray-900">{{ title }}</h2>
            <p id="confirm-text" class="mt-0.5 text-sm text-gray-500">This can't be undone.</p>
          </div>
        </div>

        <!-- What is going to be deleted -->
        <div class="mt-4 flex items-center gap-3 rounded-lg border border-surface-border bg-gray-50 p-3">
          <img *ngIf="image" [src]="image | imgSrc" alt="" class="h-11 w-11 flex-shrink-0 rounded-md object-cover" />
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-gray-900" [title]="name">{{ name }}</p>
            <p *ngIf="detail" class="truncate text-xs text-gray-500">{{ detail }}</p>
          </div>
        </div>

        <p *ngIf="warning" class="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{{ warning }}</p>
        <p *ngIf="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <!-- Cancel has the focus when this opens, so a stray Enter never deletes anything -->
          <button #cancelButton type="button" (click)="cancel.emit()" [disabled]="busy"
            class="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50">Cancel</button>
          <button type="button" (click)="confirm.emit()" [disabled]="busy"
            class="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:opacity-60">
            {{ busy ? 'Deleting...' : confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class ConfirmDialogComponent implements AfterViewInit {
  @Input() title = 'Delete this?';
  /** The thing being deleted. */
  @Input() name = '';
  /** A small grey line under the name. */
  @Input() detail = '';
  @Input() image: string | null | undefined = null;
  /** A red notice, e.g. what else will be lost. */
  @Input() warning = '';
  @Input() confirmLabel = 'Delete';
  /** True while the delete is running: both buttons are off. */
  @Input() busy = false;
  /** Shown in red when the delete failed (the box stays open). */
  @Input() error = '';

  @Output() confirm = new EventEmitter<void>();
  @Output() cancel = new EventEmitter<void>();

  @ViewChild('cancelButton') private cancelButton?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    this.cancelButton?.nativeElement.focus();
  }
}
