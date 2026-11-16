import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SidebarComponent } from './sidebar.component';

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
});
