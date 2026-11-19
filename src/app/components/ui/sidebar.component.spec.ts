import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SidebarComponent } from './sidebar.component';
import { User } from '../../models/user.model';

describe('SidebarComponent', () => {
  let fixture: ComponentFixture<SidebarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SidebarComponent], providers: [provideRouter([])] }).compileComponents();
    fixture = TestBed.createComponent(SidebarComponent);
    fixture.detectChanges();
  });

  const links = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('nav a')) as HTMLAnchorElement[];

  it('lists the pages in this order: Menu, Products, Sales, Bookings, Repairs, Dashboard', () => {
    expect(links().map(a => a.textContent!.trim())).toEqual(['Menu', 'Products', 'Sales', 'Bookings', 'Repairs', 'Dashboard']);
  });

  it('each one goes to its own page', () => {
    expect(links().map(a => a.getAttribute('href'))).toEqual(['/menu', '/products', '/sales', '/bookings', '/repairs', '/dashboard']);
  });

  it('there is no Invoices page any more (every Sale, Booking and Repair has its own invoice button)', () => {
    expect(links().some(a => /invoices/i.test(a.textContent!) || a.getAttribute('href') === '/invoices')).toBeFalse();
  });

  it('every item has an icon', () => {
    for (const link of links()) expect(link.querySelector('svg path')!.getAttribute('d')!.length).withContext(link.textContent ?? '').toBeGreaterThan(10);
  });

  describe('Admin group', () => {
    const show = (user: Partial<User> | null) => {
      fixture.componentRef.setInput('user', user);
      fixture.componentInstance.ngOnChanges();          // (the page does this itself when the user arrives)
      fixture.detectChanges();
    };
    const me = (role: 'admin' | 'staff'): Partial<User> => ({ id: 1, username: 'sok', email: 'sok@x.com', role });

    it('an admin sees Users under an "Admin" title, after the main pages', () => {
      show(me('admin'));
      expect(links().map(a => a.textContent!.trim())).toEqual(['Menu', 'Products', 'Sales', 'Bookings', 'Repairs', 'Dashboard', 'Users']);
      expect(links()[6].getAttribute('href')).toBe('/users');
      expect((fixture.nativeElement as HTMLElement).querySelector('nav')!.textContent).toContain('Admin');
    });

    it('staff do not see it (nor the "Admin" title), and neither does nobody', () => {
      for (const user of [me('staff'), null]) {
        show(user);
        expect(links().some(a => a.getAttribute('href') === '/users')).toBeFalse();
        expect((fixture.nativeElement as HTMLElement).querySelector('nav')!.textContent).not.toContain('Admin');
      }
    });

    it('it goes away again when an admin signs out', () => {
      show(me('admin'));
      show(null);
      expect(links().length).toBe(6);
    });
  });
});
