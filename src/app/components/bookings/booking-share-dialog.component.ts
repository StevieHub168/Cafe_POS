import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Booking } from '../../models/booking.model';
import { Invoice, formatInvoiceNumber } from '../../models/invoice.model';
import { ShareService } from '../../services/share.service';
import { InvoicePaperComponent } from '../invoices/invoice-paper.component';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { bookingDetailsText } from '../../utils/booking-text';
import { invoiceFileName } from '../../utils/invoice-export';

/** One of the things that can be sent: nothing to send / being made / ready / could not be made. */
type Part = 'none' | 'loading' | 'ready' | 'failed';

/**
 * "Send to customer": the three things the shop sends for a booking, shown before they go - the message, the photo of the
 * laptop and the picture of the invoice - with ONE Share button that hands all the checked ones to the phone's share menu
 * (Telegram...) together. Each line also has its own Copy / Save, for a browser that cannot share files.
 *
 * It exists only while it is open: put it in the page with *ngIf. Esc, the ✕ and the dark background close it.
 * The invoice picture is made from a full-size paper that is kept off to the side of the screen.
 */
@Component({
  selector: 'app-booking-share-dialog',
  standalone: true,
  imports: [CommonModule, InvoicePaperComponent, ImgSrcPipe],
  styles: [`
    .share-backdrop { animation: share-fade 150ms ease-out; }
    .share-panel    { animation: share-pop 180ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes share-fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes share-pop  { from { opacity: 0; transform: translateY(8px) scale(0.97); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .share-backdrop, .share-panel { animation: none; } }
    /* the full-size paper the picture is made from (never shown) */
    .share-paper { position: fixed; left: -10000px; top: 0; width: 592px; height: 840px; pointer-events: none; }
  `],
  template: `
    <div class="share-backdrop fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4" (click)="close()">
      <div #panel tabindex="-1" class="share-panel flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl focus:outline-none"
           role="dialog" aria-modal="true" aria-labelledby="share-title" (click)="$event.stopPropagation()">

        <div class="flex flex-shrink-0 items-start justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div class="min-w-0">
            <h2 id="share-title" class="text-base font-semibold text-gray-900">Send to customer</h2>
            <p class="truncate text-sm text-gray-500" [title]="booking.product_name">{{ booking.product_name }}</p>
          </div>
          <button type="button" (click)="close()" class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">

          <!-- 1. The message -->
          <section class="rounded-lg border border-surface-border p-3" aria-label="Message">
            <div class="flex items-center gap-2">
              <input id="send-text" type="checkbox" [checked]="sendText" (change)="sendText = $any($event.target).checked"
                class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
              <label for="send-text" class="text-sm font-medium text-gray-900">Message</label>
              <span *ngIf="textCopied" class="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">Copied</span>
              <button type="button" (click)="copyText()" class="ml-auto rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Copy</button>
            </div>
            <pre class="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-md bg-gray-50 px-3 py-2 font-sans text-xs leading-5 text-gray-700">{{ text }}</pre>
          </section>

          <!-- 2. The photo of the laptop -->
          <section class="rounded-lg border border-surface-border p-3" aria-label="Laptop photo">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <input id="send-photo" type="checkbox" [checked]="sendPhoto && photoState === 'ready'" [disabled]="photoState !== 'ready'"
                (change)="sendPhoto = $any($event.target).checked"
                class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40" />
              <div class="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md bg-gray-100">
                <img *ngIf="booking.product_image" [src]="booking.product_image | imgSrc" alt="" class="h-full w-full object-cover" />
              </div>
              <div class="min-w-0 flex-1 basis-32">
                <label for="send-photo" class="block text-sm font-medium text-gray-900">Laptop photo</label>
                <p class="text-xs" [ngClass]="photoState === 'failed' ? 'text-red-600' : 'text-gray-500'">{{ photoNote }}</p>
              </div>
              <div *ngIf="photoState === 'ready'" class="ml-auto flex flex-shrink-0 gap-1">
                <button type="button" (click)="copyPicture(photoFile)" class="rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Copy</button>
                <button type="button" (click)="savePicture(photoFile)" class="rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Save</button>
              </div>
            </div>
          </section>

          <!-- 3. The invoice -->
          <section class="rounded-lg border border-surface-border p-3" aria-label="Invoice">
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
              <input id="send-invoice" type="checkbox" [checked]="sendInvoice && invoiceState === 'ready'" [disabled]="invoiceState !== 'ready'"
                (change)="sendInvoice = $any($event.target).checked"
                class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-40" />
              <div class="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100">
                <img *ngIf="invoiceUrl; else noPaper" [src]="invoiceUrl" alt="" class="h-full w-full object-cover object-top" />
                <ng-template #noPaper>
                  <svg class="h-5 w-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                </ng-template>
              </div>
              <div class="min-w-0 flex-1 basis-32">
                <label for="send-invoice" class="block text-sm font-medium text-gray-900">Invoice</label>
                <p class="text-xs" [ngClass]="invoiceState === 'failed' ? 'text-red-600' : 'text-gray-500'">{{ invoiceNote }}</p>
              </div>
              <div *ngIf="invoiceState === 'ready'" class="ml-auto flex flex-shrink-0 gap-1">
                <button type="button" (click)="copyPicture(invoiceFile)" class="rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Copy</button>
                <button type="button" (click)="savePicture(invoiceFile)" class="rounded-md border border-surface-border bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">Save</button>
              </div>
              <button *ngIf="!invoice" type="button" (click)="makeInvoice.emit()"
                class="ml-auto flex-shrink-0 rounded-md border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">Make invoice</button>
            </div>
          </section>
        </div>

        <!-- Send -->
        <div class="flex-shrink-0 border-t border-surface-border px-5 py-4">
          <p *ngIf="status" [attr.role]="statusIsError ? 'alert' : 'status'" class="mb-3 text-sm" [ngClass]="statusIsError ? 'text-red-600' : 'text-green-700'">{{ status }}</p>

          <ng-container *ngIf="shareable; else cannotShare">
            <button type="button" (click)="send()" [disabled]="!canSend"
              class="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50">
              {{ sendLabel }}
            </button>
            <p class="mt-2 text-center text-xs text-gray-400">Opens the share menu. Pick Telegram, then the customer.</p>
          </ng-container>
          <ng-template #cannotShare>
            <p class="text-sm text-gray-500">This browser cannot send everything at once. Use Copy or Save on each line, then send them one by one.</p>
          </ng-template>
        </div>
      </div>
    </div>

    <!-- The full-size invoice paper the picture is made from (kept off the screen) -->
    <div *ngIf="invoice" #paperBox class="share-paper" aria-hidden="true">
      <app-invoice-paper [invoice]="invoice"></app-invoice-paper>
    </div>
  `,
})
export class BookingShareDialogComponent implements OnInit, AfterViewInit, OnDestroy {
  @Input({ required: true }) booking!: Booking;
  /** The invoice of this booking, if it has one. */
  @Input() invoice: Invoice | null = null;
  /** The page already copied the message to the clipboard when it opened this window. */
  @Input() textCopied = false;

  @Output() closed = new EventEmitter<void>();
  /** "Make invoice": the page closes this window and opens the invoice form. */
  @Output() makeInvoice = new EventEmitter<void>();

  @ViewChild('panel', { static: true }) private panel!: ElementRef<HTMLElement>;
  @ViewChild('paperBox') private paperBox?: ElementRef<HTMLElement>;

  text = '';
  sendText = true;
  sendPhoto = true;
  sendInvoice = true;

  photoState: Part = 'none';
  photoFile: File | null = null;
  invoiceState: Part = 'none';
  invoiceFile: File | null = null;
  /** A small picture of the invoice for the list (a link to the made PNG). */
  invoiceUrl = '';

  /** Can this browser hand files to another app? (false: only Copy and Save are offered) */
  shareable = false;
  isSharing = false;
  status = '';
  statusIsError = false;

  private destroyed = false;

  constructor(private sharing: ShareService) { }

  ngOnInit(): void {
    this.text = bookingDetailsText(this.booking);
    // Asked with a pretend picture: the real files are not made yet.
    this.shareable = this.sharing.canShare([new File([''], 'x.png', { type: 'image/png' })], this.text);

    if (this.booking.product_image) {
      this.photoState = 'loading';
      void this.loadPhoto();
    }
    if (this.invoice) this.invoiceState = 'loading';
  }

  ngAfterViewInit(): void {
    this.panel.nativeElement.focus();
    // The paper is drawn by now: make its picture.
    if (this.invoice) void Promise.resolve().then(() => this.makeInvoiceFile());
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.invoiceUrl) URL.revokeObjectURL(this.invoiceUrl);
  }

  @HostListener('document:keydown.escape')
  close(): void {
    this.closed.emit();
  }

  // ---------- getting the pictures ready ----------

  private async loadPhoto(): Promise<void> {
    // "/uploads/..." is on our own API; the pipe knows its address.
    const url = new ImgSrcPipe().transform(this.booking.product_image);
    const file = await this.sharing.fetchImage(url, 'laptop');
    if (this.destroyed) return;
    this.photoFile = file;
    this.photoState = file ? 'ready' : 'failed';
  }

  private async makeInvoiceFile(): Promise<void> {
    const invoice = this.invoice;
    const paper = this.paperBox?.nativeElement.querySelector('app-invoice-paper') as HTMLElement | null;
    if (!invoice || !paper) { this.invoiceState = 'failed'; return; }
    try {
      const blob = await this.sharing.makePng(paper);
      if (this.destroyed) return;
      this.invoiceFile = new File([blob], invoiceFileName(invoice), { type: 'image/png' });
      this.invoiceUrl = URL.createObjectURL(blob);
      this.invoiceState = 'ready';
    } catch {
      if (!this.destroyed) this.invoiceState = 'failed';
    }
  }

  // ---------- what each line says ----------

  get photoNote(): string {
    if (!this.booking.product_image) return 'This booking has no laptop photo.';
    if (this.photoState === 'loading') return 'Getting the photo...';
    if (this.photoState === 'failed') return 'The photo could not be loaded, so it cannot be sent.';
    return 'The photo of this laptop.';
  }

  get invoiceNote(): string {
    if (!this.invoice) return 'There is no invoice for this booking yet.';
    if (this.invoiceState === 'loading') return 'Making the picture...';
    if (this.invoiceState === 'failed') return 'The picture could not be made.';
    return `Invoice ${formatInvoiceNumber(this.invoice.number)} as a picture.`;
  }

  // ---------- Share ----------

  /** The checked things that are ready, as files (the photo, then the invoice). */
  private selectedFiles(): File[] {
    const files: File[] = [];
    if (this.sendPhoto && this.photoState === 'ready' && this.photoFile) files.push(this.photoFile);
    if (this.sendInvoice && this.invoiceState === 'ready' && this.invoiceFile) files.push(this.invoiceFile);
    return files;
  }

  /** How many things will be sent. */
  get itemCount(): number {
    return this.selectedFiles().length + (this.sendText ? 1 : 0);
  }

  get preparing(): boolean {
    return this.photoState === 'loading' || this.invoiceState === 'loading';
  }

  get canSend(): boolean {
    return this.shareable && !this.preparing && !this.isSharing && this.itemCount > 0;
  }

  get sendLabel(): string {
    if (this.preparing) return 'Getting ready...';
    if (this.itemCount === 0) return 'Check something to send';
    return `Share ${this.itemCount} ${this.itemCount === 1 ? 'item' : 'items'}`;
  }

  async send(): Promise<void> {
    if (!this.canSend) return;
    this.isSharing = true;
    this.say('');
    try {
      const result = await this.sharing.share(this.selectedFiles(), this.sendText ? this.text : '');
      if (result === 'shared') this.say('Shared.');
      else if (result === 'unsupported') this.say('This browser cannot share these. Use Copy or Save on each line.', true);
      else if (result === 'failed') this.say('The share menu could not be opened. Use Copy or Save on each line.', true);
      // 'cancelled': the person closed the menu - nothing to say
    } finally {
      this.isSharing = false;
    }
  }

  // ---------- Copy / Save on one line ----------

  async copyText(): Promise<void> {
    if (await this.sharing.copyText(this.text)) {
      this.textCopied = true;
      this.say('Message copied. Paste it into Telegram.');
    } else {
      this.say('Could not copy. Please try again.', true);
    }
  }

  /** Copies a picture. Where the browser cannot (plain http, an old browser) it says so and does NOT save anything: Save is there for that. */
  async copyPicture(file: File | null): Promise<void> {
    if (!file) return;
    if (await this.sharing.copyImage(file)) this.say('Picture copied. Paste it into Telegram.');
    else this.say('This browser cannot copy a picture. Press Save instead.', true);
  }

  savePicture(file: File | null): void {
    if (!file) return;
    this.sharing.save(file, file.name);
    this.say('Picture saved.');
  }

  private say(message: string, isError = false): void {
    this.status = message;
    this.statusIsError = isError;
  }
}
