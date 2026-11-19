import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ImgSrcPipe } from '../../../pipes/img-src.pipe';

/**
 * The photos of a booking or a repair as small squares on its card. Click one to see it big (it opens in a new tab).
 * Shows nothing when there are no photos.
 *
 *   <app-photo-strip [photos]="booking.images"></app-photo-strip>
 */
@Component({
  selector: 'app-photo-strip',
  standalone: true,
  imports: [CommonModule, ImgSrcPipe],
  styles: [`:host { display: block; }`],
  template: `
    <ul *ngIf="photos && photos.length > 0" class="flex flex-wrap gap-2 border-t border-gray-100 px-4 py-3" aria-label="Photos">
      <li *ngFor="let photo of photos">
        <a [href]="photo | imgSrc" target="_blank" rel="noopener" aria-label="Open photo"
          class="block h-12 w-12 overflow-hidden rounded-md border border-surface-border bg-gray-50 hover:border-primary-400">
          <img [src]="photo | imgSrc" alt="" class="h-full w-full object-cover" loading="lazy" />
        </a>
      </li>
    </ul>
  `,
})
export class PhotoStripComponent {
  @Input() photos: string[] | null | undefined = [];
}
