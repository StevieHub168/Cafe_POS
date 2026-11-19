import { Component, OnInit, OnDestroy } from '@angular/core';
import { RouterOutlet, NavigationEnd, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { Observable, Subject, takeUntil } from 'rxjs';
import { User } from './models/user.model';
import { SidebarComponent } from './components/ui/sidebar/sidebar.component';
import { HeaderComponent } from './components/ui/header/header.component';
import { TelegramToastsComponent } from './components/ui/telegram-toasts/telegram-toasts.component';

const ROUTE_TITLES: Record<string, string> = {
  '/menu': 'Menu',
  '/products': 'Products',
  '/sales': 'Sales',
  '/bookings': 'Bookings',
  '/repairs': 'Repairs',
  '/dashboard': 'Dashboard',
  '/labels': 'Print labels',
  '/register': 'Create User',
  '/users': 'Users',
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, CommonModule, SidebarComponent, HeaderComponent, TelegramToastsComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit, OnDestroy {
  currentUser$: Observable<User | null>;
  sidebarOpen = false;
  pageTitle = 'Menu';
  currentUrl = '';
  private destroy$ = new Subject<void>();

  constructor(
    private authService: AuthService,
    private router: Router
  ) {
    this.currentUser$ = this.authService.currentUser$;
  }

  ngOnInit(): void {
    this.currentUrl = this.router.url;

    if (this.authService.isLoggedIn()) {
      this.authService.loadCurrentUser().subscribe();
    }

    this.router.events.pipe(takeUntil(this.destroy$)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentUrl = event.urlAfterRedirects;
        // "/products?category=2" is still the Products page: look the title up without the "?..." part.
        const path = event.urlAfterRedirects.split(/[?#]/)[0];
        this.pageTitle = ROUTE_TITLES[path] || (path.startsWith('/l/') ? 'Laptop' : 'Menu');
      }
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  isAdmin(): boolean {
    return this.authService.isAdmin();
  }

  logout(): void {
    this.authService.logout();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  isAuthPage(): boolean {
    return this.currentUrl === '/login' || this.currentUrl === '/register';
  }
}
