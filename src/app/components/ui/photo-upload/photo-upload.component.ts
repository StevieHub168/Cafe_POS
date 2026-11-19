import { Component, EventEmitter, HostListener, Input, OnDestroy, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { catchError, concatMap, finalize, from, map, of } from 'rxjs';
import { ProductService } from '../../../services/product/product.service';
import { ImgSrcPipe } from '../../../pipes/img-src.pipe';
import { shrinkPhoto } from '../../../utils/shrink-photo/shrink-photo';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * A small photo box: "Take photo" (phones and tablets only), "Choose files", pasting a screenshot (Ctrl/⌘ + V) and
 * dragging pictures in. Photos are uploaded straight away and the box tells its parent the list of addresses.
 *
 *   <app-photo-upload [(photos)]="form.images" [max]="4" (uploadingChange)="uploading = $event"></app-photo-upload>
 *
 * Nothing is left behind on the server: a photo that was uploaded here but never saved is deleted again when it is
 * removed, or when the box goes away (the form was cancelled). After a successful save the parent calls markSaved().
 */
@Component({
  selector: 'app-photo-upload',
  standalone: true,
  imports: [CommonModule, ImgSrcPipe],
  // A block, so the space a form puts between its sections applies to it (an unknown tag is "inline" by default).
  styles: [`:host { display: block; }`],
  template: `
    <div>
      <div class="mb-1.5 flex items-center justify-between">
        <span class="text-xs font-medium text-gray-700">{{ label }}</span>
        <span *ngIf="photos.length > 0" class="text-[11px] text-gray-400">{{ photos.length }} / {{ max }}</span>
      </div>

      <div class="rounded-lg border-2 border-dashed p-3 transition"
        [ngClass]="isDragging ? 'border-primary-400 bg-primary-50' : 'border-surface-border'"
        (dragover)="onDragOver($event)" (dragleave)="isDragging = false" (drop)="onDrop($event)">

        <!-- Preview of the chosen photo -->
        <div class="relative flex h-48 items-center justify-center overflow-hidden rounded-lg bg-gray-50 ring-1 ring-inset ring-surface-border">
          <img *ngIf="activePhoto; else noPreview" [src]="activePhoto | imgSrc" alt="Photo preview" class="h-full w-full object-contain" />
          <ng-template #noPreview>
            <div class="flex flex-col items-center gap-1">
              <svg class="h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5z" />
              </svg>
              <span class="text-xs text-gray-400">No photo yet</span>
            </div>
          </ng-template>

          <span *ngIf="activeIsLead" class="absolute left-2 top-2 rounded bg-primary-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Laptop</span>

          <div *ngIf="isUploading" aria-label="Uploading" class="absolute inset-0 flex items-center justify-center bg-white/70">
            <span class="inline-flex items-center gap-2 text-sm font-medium text-gray-600">
              <span class="h-4 w-4 animate-spin rounded-full border-2 border-primary-600 border-t-transparent"></span>
              Uploading…<span *ngIf="pendingUploads > 1" class="font-normal text-gray-500">({{ pendingUploads }} left)</span>
            </span>
          </div>
        </div>

        <!-- All photos: click one to see it big. The laptop's own photo (if any) is first and cannot be removed here. -->
        <ul *ngIf="all.length > 1" class="mt-3 flex flex-wrap gap-2" aria-label="All photos">
          <li *ngFor="let photo of all; let i = index; trackBy: trackByIndex" class="relative">
            <button type="button" (click)="select(i)" [attr.aria-label]="'Show photo ' + (i + 1)" [attr.aria-current]="i === shownIndex ? 'true' : null"
              class="block h-14 w-14 overflow-hidden rounded-md border-2 bg-gray-50 transition"
              [ngClass]="i === shownIndex ? 'border-primary-600' : 'border-transparent hover:border-gray-300'">
              <img [src]="photo | imgSrc" [alt]="'Photo ' + (i + 1)" class="h-full w-full object-cover" />
            </button>
            <span *ngIf="lead && i === 0" class="pointer-events-none absolute inset-x-0 bottom-0 rounded-b bg-primary-600/90 text-center text-[9px] font-semibold uppercase text-white">Laptop</span>
            <button *ngIf="!(lead && i === 0)" type="button" (click)="remove(i - leadCount)" [attr.aria-label]="'Remove photo ' + (i - leadCount + 1)"
              class="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-gray-700 text-[10px] leading-none text-white hover:bg-red-600">✕</button>
          </li>
        </ul>

        <!-- Buttons -->
        <div class="mt-3 flex flex-wrap items-center gap-3">
          <!-- Phone / tablet only: opens the camera for one picture -->
          <label *ngIf="canTakePhoto"
            class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700 focus-within:ring-2 focus-within:ring-primary-100"
            [class.cursor-pointer]="canAdd" [class.cursor-not-allowed]="!canAdd" [class.opacity-50]="!canAdd">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" /><path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" /></svg>
            Take photo
            <input type="file" accept="image/*" capture="environment" class="sr-only" [disabled]="!canAdd" (change)="onCameraPhoto($event)" />
          </label>

          <label class="inline-flex items-center gap-1.5 rounded-lg border border-surface-border bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus-within:ring-2 focus-within:ring-primary-100"
            [class.cursor-pointer]="canAdd" [class.cursor-not-allowed]="!canAdd" [class.opacity-50]="!canAdd">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
            {{ all.length > 0 ? 'Add photos' : 'Choose files' }}
            <input type="file" multiple accept="image/png,image/jpeg,image/webp,image/gif" class="sr-only" [disabled]="!canAdd" (change)="onFilesSelected($event)" />
          </label>

          <button *ngIf="activePhoto && !activeIsLead" type="button" (click)="removeActive()" class="text-xs font-medium text-red-600 hover:underline">Remove photo</button>
          <span *ngIf="hint" class="ml-auto text-[11px] text-gray-400">{{ hint }}</span>
        </div>

        <p *ngIf="uploadError" role="alert" class="mt-2 text-xs text-red-600">{{ uploadError }}</p>
      </div>
    </div>
  `,
})
export class PhotoUploadComponent implements OnDestroy {
  @Input() photos: string[] = [];
  /** A photo shown first, that is not one of `photos` and cannot be removed here (e.g. the laptop's own photo). */
  @Input() lead: string | null = null;
  @Input() max = 4;
  @Input() label = 'Photos';
  @Input() hint = 'PNG, JPG, WEBP or GIF · up to 5 MB each';
  @Output() photosChange = new EventEmitter<string[]>();
  /** true while pictures are being sent (the parent keeps its Save button off until it is false). */
  @Output() uploadingChange = new EventEmitter<boolean>();

  pendingUploads = 0;
  uploadError = '';
  isDragging = false;
  /** Photos uploaded by this box that nobody has saved yet. */
  private readonly uploadedThisSession = new Set<string>();
  private destroyed = false;

  constructor(private productService: ProductService) { }

  get isUploading(): boolean {
    return this.pendingUploads > 0;
  }

  get canAdd(): boolean {
    return this.photos.length + this.pendingUploads < this.max;
  }

  /** The "Take photo" button exists only on touch devices; a computer has no camera app worth opening. */
  get canTakePhoto(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  }

  // ---------- what is shown ----------

  /** Which of the shown photos is big (0 = the first). */
  activeIndex = 0;
  trackByIndex = (index: number) => index;
  private shown: { lead: string | null; photos: string[]; list: string[] } | null = null;

  /** The lead photo (when there is one), then the photos. The same list is given back until one of them changes. */
  get all(): string[] {
    if (!this.shown || this.shown.lead !== this.lead || this.shown.photos !== this.photos) {
      this.shown = { lead: this.lead, photos: this.photos, list: this.lead ? [this.lead, ...this.photos] : this.photos };
    }
    return this.shown.list;
  }

  get leadCount(): number {
    return this.lead ? 1 : 0;
  }

  get shownIndex(): number {
    return Math.max(0, Math.min(this.activeIndex, this.all.length - 1));
  }

  get activePhoto(): string {
    return this.all[this.shownIndex] ?? '';
  }

  get activeIsLead(): boolean {
    return !!this.lead && !!this.activePhoto && this.shownIndex === 0;
  }

  select(index: number): void {
    this.activeIndex = index;
  }

  // ---------- adding ----------

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // lets the same file be chosen again later
    if (files.length > 0) this.addFiles(files);
  }

  /** One picture from the camera. A phone photo is often over 5 MB, so it is made smaller first. */
  onCameraPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.canAdd) return;

    this.uploadError = '';
    this.setPending(this.pendingUploads + 1);          // shows the spinner while the picture is made smaller
    shrinkPhoto(file).then(photo => {
      this.setPending(this.pendingUploads - 1);
      if (!this.destroyed) this.addFiles([photo]);
    });
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = true;
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) this.addFiles(files);
  }

  /** A screenshot or picture copied to the clipboard (Ctrl/⌘ + V). Pasting text is left alone. */
  @HostListener('document:paste', ['$event'])
  onPaste(event: ClipboardEvent): void {
    const files = Array.from(event.clipboardData?.files ?? []).filter(file => file.type.startsWith('image/'));
    if (files.length === 0) return;
    event.preventDefault();
    this.addFiles(files);
  }

  /** Checks the files, then uploads them one after another so they keep the order they were chosen in. */
  private addFiles(files: File[]): void {
    this.uploadError = '';
    const problems: string[] = [];
    const accepted: File[] = [];
    let room = this.max - this.photos.length - this.pendingUploads;

    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) {
        problems.push(`“${file.name}” is not a PNG, JPG, WEBP or GIF image.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`“${file.name}” is too big. The limit is 5 MB.`);
      } else if (room <= 0) {
        problems.push(`Only ${this.max} photos.`);
        break;
      } else {
        accepted.push(file);
        room--;
      }
    }
    this.uploadError = [...new Set(problems)].join(' ');
    if (accepted.length === 0) return;

    this.setPending(this.pendingUploads + accepted.length);
    from(accepted).pipe(
      concatMap(file => this.productService.uploadImage(file).pipe(
        map(({ url }) => url as string | null),
        catchError(err => {
          problems.push(`“${file.name}”: ${err?.error?.error || 'Upload failed. Please try again.'}`);
          return of(null);
        }),
        finalize(() => this.setPending(this.pendingUploads - 1))
      ))
    ).subscribe({
      next: (url) => {
        if (!url) return;
        // The form was closed while this was on its way, or there is no room any more: do not leave the file behind.
        if (this.destroyed || this.photos.length >= this.max || this.photos.includes(url)) {
          this.discard(url);
          return;
        }
        this.uploadedThisSession.add(url);
        this.setPhotos([...this.photos, url]);
        this.activeIndex = this.all.length - 1;           // show the one just added
      },
      complete: () => (this.uploadError = [...new Set(problems)].join(' '))
    });
  }

  // ---------- removing / cleaning up ----------

  /** The "Remove photo" button: the photo that is big (the lead photo cannot be removed). */
  removeActive(): void {
    if (!this.activeIsLead) this.remove(this.shownIndex - this.leadCount);
  }

  remove(index: number): void {
    const url = this.photos[index];
    if (!url) return;
    this.setPhotos(this.photos.filter((_, i) => i !== index));
    // A photo that was never saved is thrown away on the server right now; a saved one is cleaned up when the parent saves.
    if (this.uploadedThisSession.delete(url)) this.discard(url);
  }

  /** The parent saved the photos: from now on they belong to it and are never thrown away here. */
  markSaved(): void {
    this.uploadedThisSession.clear();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    // Closed without saving: the photos uploaded in this box go away too.
    this.uploadedThisSession.forEach(url => this.discard(url));
    this.uploadedThisSession.clear();
  }

  private discard(url: string): void {
    this.productService.discardImage(url).subscribe({ error: () => { /* the file just stays; nothing breaks */ } });
  }

  private setPhotos(photos: string[]): void {
    this.photos = photos;                      // also here, so several files arriving together never overwrite each other
    this.photosChange.emit(photos);
  }

  private setPending(count: number): void {
    this.pendingUploads = Math.max(0, count);
    this.uploadingChange.emit(this.pendingUploads > 0);
  }
}
