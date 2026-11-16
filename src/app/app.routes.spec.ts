import { routes } from './app.routes';
import { SalesComponent } from './components/sales/sales.component';
import { RepairsComponent } from './components/repairs/repairs.component';
import { LabelsComponent } from './components/qr/labels.component';
import { LaptopScanComponent } from './components/scan/laptop-scan.component';
import { authGuard } from './guards/auth.guard';

describe('routes', () => {
  const find = (path: string) => routes.find(r => r.path === path);

  it('Sales and Repairs are pages behind the login', () => {
    expect(find('sales')!.component).toBe(SalesComponent);
    expect(find('sales')!.canActivate).toEqual([authGuard]);
    expect(find('repairs')!.component).toBe(RepairsComponent);
    expect(find('repairs')!.canActivate).toEqual([authGuard]);
  });

  it('the old Invoices address leads to Sales (a saved link or an old bookmark still works)', () => {
    expect(find('invoices')!.redirectTo).toBe('sales');
    expect(find('invoices')!.pathMatch).toBe('full');
    expect(find('invoices')!.component).toBeUndefined();
  });

  it('Print labels is a page behind the login (reached from the QR drawer and the Products page)', () => {
    expect(find('labels')!.component).toBe(LabelsComponent);
    expect(find('labels')!.canActivate).toEqual([authGuard]);
  });

  it('a scanned laptop (/l/LP-0042) is a page behind the login, and it is found before the catch-all', () => {
    expect(find('l/:code')!.component).toBe(LaptopScanComponent);
    expect(find('l/:code')!.canActivate).toEqual([authGuard]);
    expect(routes.findIndex(r => r.path === 'l/:code')).toBeLessThan(routes.findIndex(r => r.path === '**'));
  });

  it('Bookings, Menu, Products and Dashboard are still there', () => {
    for (const path of ['menu', 'products', 'bookings', 'dashboard']) expect(find(path)).withContext(path).toBeDefined();
  });
});
