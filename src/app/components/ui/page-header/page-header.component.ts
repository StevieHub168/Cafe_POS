import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-page-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div class="min-w-0">
        <h1 class="text-xl font-semibold text-gray-900">{{ title }}</h1>
        <p *ngIf="description" class="mt-0.5 text-sm text-gray-500">{{ description }}</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <ng-content></ng-content>
      </div>
    </div>
  `,
})
export class PageHeaderComponent {
  @Input() title!: string;
  @Input() description?: string;
}
