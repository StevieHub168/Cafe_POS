import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { User } from '../../models/user.model';

interface NavItem {
  label: string;
  route: string;
  icon: string;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Menu', route: '/menu', icon: 'menu' },
  { label: 'Products', route: '/products', icon: 'package' },
  { label: 'Sales', route: '/sales', icon: 'tag' },
  { label: 'Bookings', route: '/bookings', icon: 'calendar' },
  { label: 'Repairs', route: '/repairs', icon: 'wrench' },
  { label: 'Dashboard', route: '/dashboard', icon: 'chart' },
];

const ICON_PATHS: Record<string, string> = {
  'tag': 'M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3zM6 6h.008v.008H6V6z',
  'wrench': 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z',
  'document': 'M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z',
  'calendar': 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  'chart': 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  'menu': 'M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z',
  'package': 'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
};

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <!-- Overlay -->
    <div *ngIf="open" class="fixed inset-0 z-40 bg-gray-900/50 lg:hidden" (click)="close.emit()"></div>

    <aside
      class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-surface-border bg-sidebar-bg transition-transform duration-200 lg:translate-x-0"
      [class.translate-x-0]="open"
      [class.-translate-x-full]="!open"
    >
      <!-- Logo -->
      <div class="flex h-16 items-center gap-2.5 border-b border-surface-border px-5">
        <img src="/logo-icon.png" alt="ThaStore logo" class="h-9 w-9 flex-shrink-0 rounded-full object-cover" />
        <div class="leading-tight">
          <p class="text-sm font-semibold text-gray-900">ThaStore</p>
          <!-- <p class="text-[11px] text-gray-400">Management System</p> -->
        </div>
      </div>

      <!-- Nav -->
      <nav class="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p class="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">Main</p>
        <a
          *ngFor="let item of navItems"
          [routerLink]="item.route"
          [routerLinkActiveOptions]="{ exact: !!item.exact }"
          routerLinkActive="bg-primary-50 text-primary-700"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-sidebar-hover hover:text-gray-900"
          (click)="navigate.emit()"
        >
          <svg class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
            <path stroke-linecap="round" stroke-linejoin="round" [attr.d]="ICON_PATHS[item.icon]" />
          </svg>
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <!-- User footer -->
      <div class="border-t border-surface-border p-3" *ngIf="user">
        <div class="flex items-center gap-3 px-2 py-1">
          <div class="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
            {{ user.username.charAt(0).toUpperCase() }}
          </div>
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium text-gray-800">{{ user.username }}</p>
            <p class="truncate text-xs text-gray-400">{{ user.email }}</p>
          </div>
          <button (click)="logout.emit()" class="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="Logout">
            <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.75">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  @Input() user: User | null = null;
  @Input() open = false;
  @Output() close = new EventEmitter<void>();
  @Output() navigate = new EventEmitter<void>();
  @Output() logout = new EventEmitter<void>();

  navItems = NAV_ITEMS;
  ICON_PATHS = ICON_PATHS;
}
