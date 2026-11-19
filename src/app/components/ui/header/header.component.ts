import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { User } from '../../../models/user.model';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-surface-border bg-white px-4 lg:px-6">
      <div class="flex items-center gap-3">
        <button
          (click)="toggleSidebar.emit()"
          class="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 lg:hidden"
        >
          <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
        </button>

        <!-- Breadcrumb -->
        <nav class="hidden items-center gap-1.5 text-sm sm:flex">
          <span class="text-gray-400">Nice</span>
          <svg class="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span class="font-medium text-gray-700">{{ pageTitle }}</span>
        </nav>
      </div>

      <div class="flex items-center gap-1">
        <!-- Search -->
        <div class="relative mr-2 hidden md:block">
          <svg class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            placeholder="Search..."
            class="w-48 rounded-lg border border-surface-border bg-gray-50 py-1.5 pl-8 pr-3 text-sm text-gray-700 placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
        </div>

        <!-- User -->
        <div class="ml-1 flex items-center gap-2 border-l border-surface-border pl-3" *ngIf="user">
          <div class="hidden text-right sm:block">
            <p class="text-sm font-medium text-gray-800 leading-tight">{{ user.username }}</p>
            <p class="text-xs text-gray-400 leading-tight">{{ isAdmin ? 'Admin' : 'Staff' }}</p>
          </div>
          <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
            {{ user.username.charAt(0).toUpperCase() }}
          </div>
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  @Input() user: User | null = null;
  @Input() pageTitle = 'Menu';
  @Input() isAdmin = false;
  @Output() toggleSidebar = new EventEmitter<void>();
}
