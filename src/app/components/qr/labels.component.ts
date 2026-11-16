import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { PageHeaderComponent } from '../ui/page-header.component';
import { Product } from '../../models/product.model';
import { ProductService } from '../../services/product.service';
import { ConfigService } from '../../services/config.service';
import { LABEL_SIZES, LabelSize, buildLabels, labelSheetHtml, labelsPerPage } from '../../utils/label-sheet';
import { isThisComputerOnly, laptopLink } from '../../utils/laptop-link';
import { productCover } from '../../utils/invoice-photo';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';

const A4_WIDTH_PX = 794;      // A4 at 96 dpi: the page inside the preview frame
const PREVIEW_WIDTH = 497;    // widest the preview gets (desktop)

/**
 * "Print labels": pick the laptops, 1 or 2 labels each (laptop + charger) and the label size. The sheet on the right is the
 * page that is printed (A4 sticker paper); every label has a real QR code. It opens from the QR drawer with the laptop picked.
 */
@Component({
  selector: 'app-labels',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, ImgSrcPipe],
  template: `
    <div class="space-y-5">
      <app-page-header title="Print labels" description="Pick the laptops. Every label has the QR of its laptop."></app-page-header>

      <div *ngIf="errorMessage" role="alert" class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{{ errorMessage }}</div>

      <!-- the address is inside the QR: a label printed with an address a phone cannot open is useless -->
      <!-- <div *ngIf="ready && !fromSettings" role="alert" data-address-warning class="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <ng-container *ngIf="thisComputerOnly; else noSetting">These labels open <b>{{ base }}</b>, which only works on this computer. A phone cannot open it.</ng-container>
        <ng-template #noSetting>These labels open <b>{{ base }}</b>, the address this page is open on.</ng-template>
        Set the shop address (<b>PUBLIC_APP_URL</b> in the API .env) <b>before you print</b>, because the address is inside the QR.
      </div> -->

      <div class="grid grid-cols-1 gap-5 lg:grid-cols-[25rem_minmax(0,1fr)]">
        <!-- options -->
        <section aria-label="Label options" class="min-w-0 space-y-5 rounded-xl border border-surface-border bg-white p-4">
          <fieldset class="min-w-0">
            <legend class="mb-2 text-sm font-semibold text-gray-900">Laptops</legend>
            <p *ngIf="isLoading" class="text-sm text-gray-500">Loading...</p>
            <p *ngIf="!isLoading && laptops.length === 0" class="text-sm text-gray-500">There are no laptops yet.</p>
            <!-- Each laptop with its photo and specs: two laptops can have the same name -->
            <div class="max-h-80 space-y-1 overflow-y-auto pr-1 sm:max-h-[26rem]">
              <label *ngFor="let laptop of laptops" class="flex cursor-pointer items-center gap-2.5 rounded-lg p-1.5 text-sm text-gray-800 hover:bg-gray-50" [class.bg-primary-50]="isPicked(laptop)">
                <input type="checkbox" [checked]="isPicked(laptop)" (change)="toggle(laptop)" class="h-4 w-4 flex-shrink-0 rounded border-gray-300 text-primary-600" [attr.data-code]="laptop.code" />
                <span class="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100" data-photo>
                  <img *ngIf="photoOf(laptop) as photo" [src]="photo | imgSrc" alt="" class="h-full w-full object-cover" />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block break-words font-medium leading-snug" data-name>{{ laptop.name }}</span>
                  <span *ngIf="specsOf(laptop) as specs" class="line-clamp-2 break-words text-xs leading-snug text-gray-500" data-specs>{{ specs }}</span>
                </span>
                <span class="flex-shrink-0 font-mono text-xs text-gray-500">{{ laptop.code }}</span>
              </label>
            </div>
            <div *ngIf="laptops.length > 1" class="mt-1 flex gap-4 text-xs font-medium text-primary-700">
              <button type="button" (click)="pickAll()" class="py-2 hover:underline">Pick all</button>
              <button type="button" (click)="pickNone()" class="py-2 hover:underline">Pick none</button>
            </div>
          </fieldset>

          <fieldset class="min-w-0">
            <legend class="mb-2 text-sm font-semibold text-gray-900">Labels for each laptop</legend>
            <div class="flex overflow-hidden rounded-lg border border-surface-border" role="group">
              <button type="button" (click)="setPer(1)" [attr.aria-pressed]="per === 1" data-per="1"
                class="h-10 flex-1 text-sm" [ngClass]="per === 1 ? 'bg-primary-600 font-semibold text-white' : 'bg-white text-gray-700'">1</button>
              <button type="button" (click)="setPer(2)" [attr.aria-pressed]="per === 2" data-per="2"
                class="h-10 flex-[2] text-sm" [ngClass]="per === 2 ? 'bg-primary-600 font-semibold text-white' : 'bg-white text-gray-700'">2 (laptop + charger)</button>
            </div>
          </fieldset>

          <div>
            <label for="label-size" class="mb-2 block text-sm font-semibold text-gray-900">Label size</label>
            <select id="label-size" [(ngModel)]="size" (ngModelChange)="refresh()" name="size"
              class="h-10 w-full rounded-lg border border-surface-border bg-white px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100">
              <option *ngFor="let s of sizes" [value]="s.value">{{ s.label }}</option>
            </select>
          </div>

          <div class="space-y-2.5">
            <!-- <p class="text-xs leading-relaxed text-gray-500">Use sticker paper. Each label says LAPTOP or CHARGER, so you can tell them apart.</p> -->
            <button type="button" (click)="print()" [disabled]="count === 0" data-action="print"
              class="inline-flex h-11 w-full items-center justify-center rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50">
              {{ count === 0 ? 'Pick a laptop first' : count === 1 ? 'Print 1 label' : 'Print ' + count + ' labels' }}
            </button>
          </div>
        </section>

        <!-- the sheet that is printed -->
        <section aria-label="Print preview" class="flex min-w-0 flex-col items-center">
          <!-- The A4 page (794 x 1123) is shrunk to the width it has: full width on a phone, at most 497px on a big screen -->
          <div #previewBox class="relative w-full max-w-[497px] overflow-hidden rounded bg-white shadow-md" style="aspect-ratio: 794 / 1123" data-preview>
            <iframe #sheet title="Labels to print" [srcdoc]="sheetHtml"
              class="absolute left-0 top-0" style="width: 794px; height: 1123px; border: 0; transform-origin: top left" [style.transform]="'scale(' + previewScale + ')'"></iframe>
          </div>
          <p class="mt-2 text-center text-xs text-gray-500" data-pages>Preview · page 1 of {{ pages }} · A4 sticker paper</p>
        </section>
      </div>
    </div>
  `,
})
export class LabelsComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('sheet') private sheet?: ElementRef<HTMLIFrameElement>;
  @ViewChild('previewBox') private previewBox?: ElementRef<HTMLElement>;

  /** How much the A4 page (794px wide) is shrunk in the preview: it follows the width the preview has (phone, tablet, desktop). */
  previewScale = PREVIEW_WIDTH / A4_WIDTH_PX;
  private resizeWatch?: ResizeObserver;

  readonly sizes = LABEL_SIZES;
  laptops: Product[] = [];
  private picked = new Set<number>();
  per: 1 | 2 = 2;
  size: LabelSize = '50x30';
  isLoading = true;
  errorMessage = '';

  base = '';
  fromSettings = true;
  ready = false;

  sheetHtml: SafeHtml = '';
  count = 0;

  constructor(
    private productService: ProductService,
    private config: ConfigService,
    private route: ActivatedRoute,
    private sanitizer: DomSanitizer,
    private zone: NgZone,
    private changes: ChangeDetectorRef
  ) { }

  ngAfterViewInit(): void {
    // The observer reports the width once it is watching, and again whenever it changes (a phone turned around, a window resized).
    const box = this.previewBox?.nativeElement;
    if (!box || typeof ResizeObserver === 'undefined') return;
    this.resizeWatch = new ResizeObserver(() => this.zone.run(() => { this.fitPreview(); this.changes.detectChanges(); }));
    this.resizeWatch.observe(box);
  }

  ngOnDestroy(): void {
    this.resizeWatch?.disconnect();
  }

  /** Shrinks the A4 page to the width of the preview box (nothing happens while the box has no width yet, e.g. hidden). */
  private fitPreview(): void {
    const width = this.previewBox?.nativeElement.clientWidth ?? 0;
    if (width > 0) this.previewScale = width / A4_WIDTH_PX;
  }

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const ids = (query.get('ids') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    this.picked = new Set(ids);
    this.per = query.get('per') === '1' ? 1 : 2;

    this.config.baseUrl().subscribe(({ url, fromSettings }) => {
      this.base = url;
      this.fromSettings = fromSettings;
      this.ready = true;
      this.refresh();
    });
    // Sold laptops are not stuck on anything any more: only the ones the shop still has.
    this.productService.getAllProducts().subscribe({
      next: (products) => {
        this.laptops = products.filter(p => !!p.code).sort((a, b) => a.name.localeCompare(b.name));
        this.isLoading = false;
        this.refresh();
      },
      error: () => {
        this.errorMessage = 'Failed to load the laptops.';
        this.isLoading = false;
      }
    });
  }

  /** How many sheets of paper the labels need. */
  get pages(): number {
    return Math.max(1, Math.ceil(this.count / labelsPerPage(this.size)));
  }

  get thisComputerOnly(): boolean {
    return isThisComputerOnly(this.base);
  }

  /** The cover photo of a laptop ('' = none). */
  photoOf(laptop: Product): string {
    return productCover(laptop) ?? '';
  }

  /** What tells two laptops of the same name apart: the first two lines of the specs ("Chip M3 Pro · Ram 18GB | Storage 512GB"), or the model. */
  specsOf(laptop: Product): string {
    const lines = (laptop.description ?? '').split('\n').map(l => l.trim()).filter(l => l !== '');
    return lines.length ? lines.slice(0, 2).join(' · ') : laptop.model ?? '';
  }

  isPicked(laptop: Product): boolean {
    return laptop.id !== undefined && this.picked.has(laptop.id);
  }

  toggle(laptop: Product): void {
    if (laptop.id === undefined) return;
    if (this.picked.has(laptop.id)) this.picked.delete(laptop.id);
    else this.picked.add(laptop.id);
    this.refresh();
  }

  pickAll(): void {
    this.picked = new Set(this.laptops.map(l => l.id as number));
    this.refresh();
  }

  pickNone(): void {
    this.picked.clear();
    this.refresh();
  }

  setPer(per: 1 | 2): void {
    this.per = per;
    this.refresh();
  }

  /** Makes the sheet again (after any choice) and counts the labels. */
  refresh(): void {
    const chosen = this.laptops.filter(l => this.isPicked(l)).map(l => ({ code: l.code as string, name: l.name }));
    const labels = buildLabels(chosen, this.per, code => laptopLink(this.base, code));
    this.count = labels.length;
    this.sheetHtml = this.sanitizer.bypassSecurityTrustHtml(this.ready ? labelSheetHtml(labels, this.size) : '');
  }

  /** The browser's print window for the sheet itself (a test replaces this). */
  protected printSheet(): void {
    const frame = this.sheet?.nativeElement.contentWindow;
    frame?.focus();
    frame?.print();
  }

  print(): void {
    if (this.count === 0) return;
    this.printSheet();
  }
}
