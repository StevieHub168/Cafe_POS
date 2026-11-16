import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="rounded-lg border border-surface-border bg-white p-4 shadow-card">
      <div class="flex items-start justify-between">
        <div class="min-w-0">
          <p class="text-xs font-medium text-gray-500 uppercase tracking-wide">{{ label }}</p>
          <p class="mt-2 text-2xl font-semibold text-gray-900 tabular-nums">{{ value }}</p>
          <p *ngIf="sub" class="mt-1 text-xs text-gray-400">{{ sub }}</p>
        </div>
        <div [class]="'flex h-10 w-10 items-center justify-center rounded-lg ' + iconBg">
          <ng-content select="[icon]"></ng-content>
        </div>
      </div>
      <div *ngIf="trend !== undefined" class="mt-3 flex items-center gap-1 text-xs">
        <span [class]="trend >= 0 ? 'text-green-600' : 'text-red-600'" class="font-medium">
          {{ trend >= 0 ? '+' : '' }}{{ trend }}%
        </span>
        <span class="text-gray-400">vs last period</span>
      </div>
    </div>
  `,
})
export class StatCardComponent {
  @Input() label!: string;
  @Input() value!: string | number;
  @Input() sub?: string;
  @Input() trend?: number;
  @Input() iconBg = 'bg-blue-50';
}
