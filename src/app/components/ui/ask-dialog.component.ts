import { AfterViewInit, Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * A plain Yes / No question (not a warning: for deleting use app-confirm-dialog). The person has to PICK: Esc and a click
 * on the dark background do nothing, so a question is never answered by accident. The page owns the logic and reacts to
 * (yes) and (no).
 */
@Component({
  selector: 'app-ask-dialog',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    .ask-backdrop { animation: ask-fade 150ms ease-out; }
    .ask-panel    { animation: ask-pop 180ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes ask-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ask-pop  { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .ask-backdrop, .ask-panel { animation: none; } }
  `],
  template: `
    <div class="ask-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 p-4">
      <div class="ask-panel w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl" role="alertdialog" aria-modal="true"
           aria-labelledby="ask-title" aria-describedby="ask-text">

        <div class="flex items-start gap-3">
          <div class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" /></svg>
          </div>
          <div class="min-w-0">
            <h2 id="ask-title" class="text-base font-semibold text-gray-900">{{ title }}</h2>
            <p id="ask-text" class="mt-0.5 text-sm text-gray-500">{{ message }}</p>
          </div>
        </div>

        <p *ngIf="detail" class="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{{ detail }}</p>
        <p *ngIf="error" role="alert" class="mt-3 text-sm text-red-600">{{ error }}</p>

        <div class="mt-5 flex justify-end gap-2">
          <button #noButton type="button" (click)="no.emit()" [disabled]="busy"
            class="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50">{{ noLabel }}</button>
          <button #yesButton type="button" (click)="yes.emit()" [disabled]="busy"
            class="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:opacity-60">
            {{ busy ? 'Please wait...' : yesLabel }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class AskDialogComponent implements AfterViewInit {
  @Input() title = 'Are you sure?';
  @Input() message = '';
  /** A grey line with what exactly will happen. */
  @Input() detail = '';
  @Input() yesLabel = 'Yes';
  @Input() noLabel = 'No';
  /** Which button has the focus when the question opens. The safe one is "no" when yes changes something. */
  @Input() focus: 'yes' | 'no' = 'yes';
  /** True while the answer is being carried out: both buttons are off. */
  @Input() busy = false;
  /** Shown in red when carrying out the answer failed (the question stays open). */
  @Input() error = '';

  @Output() yes = new EventEmitter<void>();
  @Output() no = new EventEmitter<void>();

  @ViewChild('yesButton') private yesButton?: ElementRef<HTMLButtonElement>;
  @ViewChild('noButton') private noButton?: ElementRef<HTMLButtonElement>;

  ngAfterViewInit(): void {
    (this.focus === 'no' ? this.noButton : this.yesButton)?.nativeElement.focus();
  }
}
