import { routes } from './app.routes';
import { SalesComponent } from './components/sales/sales.component';
import { RepairsComponent } from './components/repairs/repairs.component';
import { LabelsComponent } from './components/qr/labels.component';
import { LaptopScanComponent } from './components/scan/laptop-scan.component';
import { UsersComponent } from './components/users/users.component';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';

describe('routes', () => {
  const find = (path: string) => routes.find(r => r.path === path);
  /** The page of a route: pages are downloaded when first opened (loadComponent), Login comes with the app. */
  const pageOf = async (path: string) => {
    const route = find(path)!;
    return route.component ?? (await (route.loadComponent as () => Promise<unknown>)());
  };

  it('Sales and Repairs are pages behind the login', async () => {
    expect(await pageOf('sales')).toBe(SalesComponent);
    expect(find('sales')!.canActivate).toEqual([authGuard]);
    expect(await pageOf('repairs')).toBe(RepairsComponent);
    expect(find('repairs')!.canActivate).toEqual([authGuard]);
  });

  it('the old Invoices address leads to Sales (a saved link or an old bookmark still works)', () => {
    expect(find('invoices')!.redirectTo).toBe('sales');
    expect(find('invoices')!.pathMatch).toBe('full');
    expect(find('invoices')!.component).toBeUndefined();
    expect(find('invoices')!.loadComponent).toBeUndefined();
  });

  it('Print labels is a page behind the login (reached from the QR drawer and the Products page)', async () => {
    expect(await pageOf('labels')).toBe(LabelsComponent);
    expect(find('labels')!.canActivate).toEqual([authGuard]);
  });

  it('a scanned laptop (/l/LP-0042) is a page behind the login, and it is found before the catch-all', async () => {
    expect(await pageOf('l/:code')).toBe(LaptopScanComponent);
    expect(find('l/:code')!.canActivate).toEqual([authGuard]);
    expect(routes.findIndex(r => r.path === 'l/:code')).toBeLessThan(routes.findIndex(r => r.path === '**'));
  });

  it('Users is a page for an admin only (the admin guard), found before the catch-all', async () => {
    expect(await pageOf('users')).toBe(UsersComponent);
    expect(find('users')!.canActivate).toEqual([adminGuard]);
    expect(routes.findIndex(r => r.path === 'users')).toBeLessThan(routes.findIndex(r => r.path === '**'));
  });

  it('Bookings, Menu, Products, Dashboard and Register are still there, each behind a guard', async () => {
    for (const path of ['menu', 'products', 'bookings', 'dashboard', 'register']) {
      expect(find(path)).withContext(path).toBeDefined();
      expect(find(path)!.canActivate?.length).withContext(path).toBe(1);
      expect(await pageOf(path)).withContext(path).toBeDefined();
    }
  });

  it('Login comes with the app; every other page is downloaded when it is opened first', () => {
    expect(find('login')!.component).toBeDefined();
    const pages = routes.filter(r => r.path && !['login', 'invoices', '**'].includes(r.path));   // "" (the redirect) is left out
    expect(pages.length).toBe(10);
    for (const page of pages) {
      expect(page.component).withContext(page.path!).toBeUndefined();
      expect(typeof page.loadComponent).withContext(page.path!).toBe('function');
    }
  });
});
