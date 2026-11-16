import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrandLogoComponent } from './brand-logo.component';

@Component({
  standalone: true,
  imports: [BrandLogoComponent],
  template: `<app-brand-logo [brand]="brand" class="h-5 w-8"></app-brand-logo>`,
})
class HostComponent {
  brand: string | null = 'Dell';
}

describe('BrandLogoComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  const tag = () => (fixture.nativeElement as HTMLElement).querySelector('app-brand-logo') as HTMLElement;
  const svg = () => tag().querySelector('svg') as SVGElement | null;
  const show = (brand: string | null) => { host.brand = brand; fixture.detectChanges(); };

  it('draws the logo of a known brand as an SVG that fits its box without stretching', () => {
    expect(svg()).not.toBeNull();
    expect(svg()!.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
    expect(svg()!.getAttribute('viewBox')).toMatch(/^[\d. -]+$/);
    expect(svg()!.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(svg()!.querySelector('path')!.getAttribute('fill')).toBe('#007db8');   // Dell blue
  });

  it('is only a picture: hidden from screen readers, because the brand name is written next to it', () => {
    expect(tag().getAttribute('aria-hidden')).toBe('true');
    expect(svg()!.getAttribute('focusable')).toBe('false');
  });

  it('keeps the size the page gives it', () => {
    expect(tag().classList).toContain('h-5');
    expect(tag().classList).toContain('w-8');
  });

  it('follows the brand when it changes (HP -> Surface has four coloured squares)', () => {
    show('HP');
    expect(svg()!.querySelectorAll('path').length).toBe(1);
    show('Surface');
    expect(svg()!.querySelectorAll('path').length).toBe(4);
  });

  it('a brand with no logo shows its first letter, in capitals, on grey', () => {
    show('totally new brand');
    expect(svg()).toBeNull();
    expect(tag().textContent!.trim()).toBe('T');
    expect(tag().querySelector('span')!.classList).toContain('bg-gray-100');
  });

  it('shows nothing at all for an empty or missing brand', () => {
    show('');
    expect(svg()).toBeNull();
    expect(tag().textContent!.trim()).toBe('');
    show(null);
    expect(svg()).toBeNull();
    expect(tag().textContent!.trim()).toBe('');
  });

  it('goes back to the logo when a known brand comes after an unknown one', () => {
    show('Nothing');
    expect(svg()).toBeNull();
    show('MSI');
    expect(svg()).not.toBeNull();
    expect(tag().textContent!.trim()).toBe('');
  });
});
