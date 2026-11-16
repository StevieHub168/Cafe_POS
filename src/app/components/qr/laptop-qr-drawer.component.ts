import { Component, EventEmitter, HostListener, Input, OnInit, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Product } from '../../models/product.model';
import { ConfigService } from '../../services/config.service';
import { QrDrawing, QR_BORDER, qrDrawing, qrPng } from '../../utils/qr';
import { isThisComputerOnly, laptopLink } from '../../utils/laptop-link';
import { downloadBlob } from '../../utils/invoice-export';
import { productCover } from '../../utils/invoice-photo';
import { formatMoney } from '../../utils/money';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';

/**
 * The QR code of a laptop, in a side drawer: the code to scan, "Print labels" (laptop + charger) and "Download the QR picture".
 * `justSaved` = it opens right after a new laptop was saved ("Laptop saved: the QR is ready").
 */
@Component({
  selector: 'app-laptop-qr-drawer',
  standalone: true,
  imports: [CommonModule, ImgSrcPipe],
  styles: [`
    .qr-backdrop { animation: qr-fade 150ms ease-out; }
    .qr-panel    { animation: qr-slide 220ms cubic-bezier(0.22, 1, 0.36, 1); }
    @keyframes qr-fade  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes qr-slide { from { transform: translateX(100%); } to { transform: translateX(0); } }
    @media (prefers-reduced-motion: reduce) { .qr-backdrop, .qr-panel { animation: none; } }
  `],
  template: `
    <div class="qr-backdrop fixed inset-0 z-[55] flex justify-end bg-gray-900/50" (click)="close()">
      <div class="qr-panel flex h-full w-full max-w-lg flex-col bg-white shadow-2xl" role="dialog" aria-modal="true"
           [attr.aria-label]="justSaved ? 'Laptop saved' : 'QR code'" (click)="$event.stopPropagation()">

        <div class="flex flex-shrink-0 items-center justify-between gap-3 border-b border-surface-border px-5 py-4">
          <div class="min-w-0">
            <h2 class="text-base font-semibold text-gray-900">{{ justSaved ? 'Laptop saved' : 'QR code' }}</h2>
            <p class="text-xs text-gray-500">{{ justSaved ? 'The QR code was made for you.' : 'Scan it with the phone camera to open this laptop.' }}</p>
          </div>
          <button type="button" (click)="close()" class="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Close">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div class="flex-1 space-y-5 overflow-y-auto p-5">
          <!-- the laptop -->
          <div class="flex items-center gap-3">
            <div class="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100">
              <img *ngIf="cover" [src]="cover | imgSrc" alt="" class="h-full w-full object-cover" />
            </div>
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold text-gray-900" data-name>{{ product.name }}</p>
              <p class="truncate text-xs text-gray-500">{{ details }}</p>
            </div>
          </div>

          <!-- the QR -->
          <div class="flex flex-col items-center gap-3 rounded-xl border border-surface-border p-5">
            <svg *ngIf="drawing" class="h-52 w-52" [attr.viewBox]="viewBox" role="img" [attr.aria-label]="'QR code of laptop ' + product.code" data-qr>
              <rect [attr.x]="-border" [attr.y]="-border" [attr.width]="drawing.size + border * 2" [attr.height]="drawing.size + border * 2" fill="#ffffff" />
              <path [attr.d]="drawing.path" fill="#111827" />
            </svg>
            <p class="font-mono text-xl font-bold tracking-wide text-gray-900" data-code>{{ product.code }}</p>
            <p class="break-all text-center text-[11px] text-gray-400" data-link>{{ link }}</p>
          </div>

          <!-- the address is printed inside the QR: say so when a phone could not open it -->
          <!-- <div *ngIf="ready && !fromSettings" role="alert" data-address-warning
            class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <ng-container *ngIf="thisComputerOnly; else noSetting">
              This QR opens <b>{{ base }}</b>, which only works on this computer. A phone cannot open it.
            </ng-container>
            <ng-template #noSetting>This QR opens <b>{{ base }}</b>, the address this page is open on.</ng-template>
            Set the shop address (<b>PUBLIC_APP_URL</b> in the API .env) <b>before you print labels</b>, because the address is inside the QR.
          </div> -->

          <div class="flex flex-col gap-2.5">
            <button type="button" (click)="printLabels()" data-action="print"
              class="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500">
              Print 2 labels (laptop + charger)
            </button>
            <button type="button" (click)="download()" [disabled]="busy" data-action="download"
              class="inline-flex h-11 items-center justify-center rounded-lg border border-surface-border bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
              {{ busy ? 'Please wait...' : 'Download the QR picture' }}
            </button>
            <p *ngIf="message" role="status" class="text-center text-xs" [ngClass]="messageIsError ? 'text-red-600' : 'text-gray-500'">{{ message }}</p>
          </div>

          <!-- <div class="rounded-lg bg-blue-50 px-3 py-2.5 text-sm text-blue-900">Stick one label on the laptop and one on its charger, so they never get mixed up.</div> -->
        </div>

        <div class="flex flex-shrink-0 justify-end border-t border-surface-border px-5 py-4">
          <button type="button" (click)="close()" class="rounded-lg border border-surface-border bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Done</button>
        </div>
      </div>
    </div>
  `,
})
export class LaptopQrDrawerComponent implements OnInit {
  @Input({ required: true }) product!: Product;
  /** true = just saved, so the title says "Laptop saved". */
  @Input() justSaved = false;
  @Output() closed = new EventEmitter<void>();

  readonly border = QR_BORDER;
  readonly money = formatMoney;

  base = '';
  fromSettings = true;
  ready = false;
  link = '';
  drawing: QrDrawing | null = null;
  busy = false;
  message = '';
  messageIsError = false;

  constructor(private config: ConfigService, private router: Router) { }

  ngOnInit(): void {
    this.config.baseUrl().subscribe(({ url, fromSettings }) => {
      this.base = url;
      this.fromSettings = fromSettings;
      this.link = laptopLink(url, this.product.code ?? '');
      this.drawing = this.product.code ? qrDrawing(this.link) : null;
      this.ready = true;
    });
  }

  get viewBox(): string {
    const total = (this.drawing?.size ?? 0) + QR_BORDER * 2;
    return `${-QR_BORDER} ${-QR_BORDER} ${total} ${total}`;
  }

  /** "Apple · Mac · $799" */
  get details(): string {
    return [this.product.brand, this.product.category_name, this.money(this.product.selling_price)].filter(Boolean).join(' · ');
  }

  get thisComputerOnly(): boolean {
    return isThisComputerOnly(this.base);
  }

  get cover(): string | null {
    return productCover(this.product);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.closed.emit();
  }

  /** The labels page, with this laptop picked and 2 labels (laptop + charger). */
  printLabels(): void {
    void this.router.navigate(['/labels'], { queryParams: { ids: this.product.id, per: 2 } });
    this.close();
  }

  async download(): Promise<void> {
    if (!this.drawing || this.busy) return;
    this.busy = true;
    this.message = '';
    try {
      downloadBlob(await qrPng(this.drawing), `${this.product.code}-qr.png`);
      this.message = 'Picture saved.';
      this.messageIsError = false;
    } catch {
      this.message = 'The picture could not be made. Please try again.';
      this.messageIsError = true;
    } finally {
      this.busy = false;
    }
  }
}
