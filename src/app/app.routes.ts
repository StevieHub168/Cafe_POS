import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { RegisterComponent } from './components/register/register.component';
import { MenuComponent } from './menu/menu.component';
import { ProductManagementComponent } from './components/product-management/product-management.component';
import { BookingsComponent } from './components/bookings/bookings.component';
import { SalesComponent } from './components/sales/sales.component';
import { RepairsComponent } from './components/repairs/repairs.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { LabelsComponent } from './components/qr/labels.component';
import { LaptopScanComponent } from './components/scan/laptop-scan.component';
import { adminGuard } from './guards/admin.guard';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  { path: 'register', component: RegisterComponent, canActivate: [adminGuard] },
  { path: 'menu', component: MenuComponent, canActivate: [authGuard] },
  { path: 'products', component: ProductManagementComponent, canActivate: [authGuard] },
  { path: 'bookings', component: BookingsComponent, canActivate: [authGuard] },
  { path: 'sales', component: SalesComponent, canActivate: [authGuard] },
  { path: 'repairs', component: RepairsComponent, canActivate: [authGuard] },
  // The Invoices page is gone: every Sale, Booking and Repair has its own invoice button.
  { path: 'invoices', redirectTo: 'sales', pathMatch: 'full' },
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'labels', component: LabelsComponent, canActivate: [authGuard] },
  // What a QR label opens: the laptop with its status. Signing in first brings you back here (see authGuard).
  { path: 'l/:code', component: LaptopScanComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' }
];
