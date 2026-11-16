import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrandLogo, brandLogo } from '../../utils/brand-logos';

/**
 * The logo of a laptop brand (Apple, Dell, HP...), drawn inside the box the page gives it: set the size with classes on the
 * tag, e.g. <app-brand-logo brand="Dell" class="h-5 w-8">. The logo is as high as the box and as wide as its shape needs
 * (never wider than the box, and never stretched), so a wide word-mark and a round mark can use the same box. Give only a
 * height and a largest width (class="h-4 max-w-7") and the box is as wide as the logo.
 *
 * A brand with no logo (a new one typed in "Add brand") shows its first letter on grey instead.
 * It is only a picture: the brand's name is always written next to it, so it is hidden from screen readers.
 */
@Component({
  selector: 'app-brand-logo',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'inline-flex items-center justify-center', 'aria-hidden': 'true' },
  template: `
    <svg *ngIf="logo; else letter" class="h-full w-auto max-w-full" [attr.viewBox]="logo.viewBox" preserveAspectRatio="xMidYMid meet" focusable="false">
      <path *ngFor="let shape of logo.paths" [attr.d]="shape.d" [attr.fill]="shape.fill" />
    </svg>
    <ng-template #letter>
      <span *ngIf="initial" class="flex aspect-square h-full items-center justify-center rounded bg-gray-100 text-[10px] font-semibold leading-none text-gray-500">{{ initial }}</span>
    </ng-template>
  `,
})
export class BrandLogoComponent {
  logo: BrandLogo | null = null;
  initial = '';

  @Input() set brand(value: string | null | undefined) {
    this.logo = brandLogo(value);
    this.initial = (value ?? '').trim().charAt(0).toUpperCase();
  }
}
