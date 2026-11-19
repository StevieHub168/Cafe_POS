import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';

// Login is the first screen, so it comes with the app. Every other page is downloaded when it is opened first
// (the phone does not load the Products page just to show the Menu).
export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', loadComponent: () => import('./components/register/register.component').then(m => m.RegisterComponent), canActivate: [adminGuard] },
  { path: 'menu', loadComponent: () => import('./menu/menu.component').then(m => m.MenuComponent), canActivate: [authGuard] },
  { path: 'products', loadComponent: () => import('./components/product-management/product-management.component').then(m => m.ProductManagementComponent), canActivate: [authGuard] },
  { path: 'bookings', loadComponent: () => import('./components/bookings/bookings.component').then(m => m.BookingsComponent), canActivate: [authGuard] },
  { path: 'sales', loadComponent: () => import('./components/sales/sales.component').then(m => m.SalesComponent), canActivate: [authGuard] },
  { path: 'repairs', loadComponent: () => import('./components/repairs/repairs.component').then(m => m.RepairsComponent), canActivate: [authGuard] },
  // The Invoices page is gone: every Sale, Booking and Repair has its own invoice button.
  { path: 'invoices', redirectTo: 'sales', pathMatch: 'full' },
  { path: 'dashboard', loadComponent: () => import('./components/dashboard/dashboard.component').then(m => m.DashboardComponent), canActivate: [authGuard] },
  { path: 'labels', loadComponent: () => import('./components/qr/labels.component').then(m => m.LabelsComponent), canActivate: [authGuard] },
  // Admin only: who can sign in, and reset a password.
  { path: 'users', loadComponent: () => import('./components/users/users.component').then(m => m.UsersComponent), canActivate: [adminGuard] },
  // What a QR label opens: the laptop with its status. Signing in first brings you back here (see authGuard).
  { path: 'l/:code', loadComponent: () => import('./components/scan/laptop-scan.component').then(m => m.LaptopScanComponent), canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
