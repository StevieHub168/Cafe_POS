import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type StatusTone = 'success' | 'warning' | 'info' | 'danger' | 'neutral';

const TONE_CLASSES: Record<StatusTone, string> = {
  success: 'bg-green-50 text-green-700 ring-green-600/20',
  warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  danger: 'bg-red-50 text-red-700 ring-red-600/20',
  neutral: 'bg-gray-100 text-gray-600 ring-gray-500/20',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span [class]="'inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ' + toneClass">
      <span class="h-1.5 w-1.5 flex-shrink-0 rounded-full" [style.background-color]="dotColor"></span>
      <ng-content></ng-content>
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() tone: StatusTone = 'neutral';

  get toneClass(): string {
    return TONE_CLASSES[this.tone] || TONE_CLASSES.neutral;
  }

  get dotColor(): string {
    const map: Record<StatusTone, string> = {
      success: '#16a34a',
      warning: '#d97706',
      info: '#2563eb',
      danger: '#dc2626',
      neutral: '#6b7280',
    };
    return map[this.tone] || map.neutral;
  }
}
