import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SkeletonComponent, SkeletonKind } from './skeleton.component';

describe('SkeletonComponent', () => {
  let fixture: ComponentFixture<SkeletonComponent>;
  let component: SkeletonComponent;

  const show = (kind: SkeletonKind, count?: number, extra: Partial<SkeletonComponent> = {}) => {
    component.kind = kind;
    if (count !== undefined) component.count = count;
    Object.assign(component, extra);
    fixture.detectChanges();
  };
  const dom = () => fixture.nativeElement as HTMLElement;
  const items = () => dom().querySelectorAll('[data-skeleton-item]');

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [SkeletonComponent] }).compileComponents();
    fixture = TestBed.createComponent(SkeletonComponent);
    component = fixture.componentInstance;
  });

  it('is a "Loading" status for a screen reader, and plain grey shapes for the eyes (no words on screen)', () => {
    show('cards');
    const root = dom().querySelector('[data-skeleton]') as HTMLElement;
    expect(root.getAttribute('role')).toBe('status');
    expect(root.getAttribute('aria-busy')).toBe('true');
    expect(root.querySelector('.sr-only')!.textContent).toBe('Loading');
    expect(root.textContent!.replace(/\s+/g, '')).toBe('Loading');
  });

  it('pulses, unless the person asked their device for less motion', () => {
    show('cards');
    const classes = (dom().querySelector('[data-skeleton]') as HTMLElement).className;
    expect(classes).toContain('animate-pulse');
    expect(classes).toContain('motion-reduce:animate-none');
  });

  it('shows as many shapes as it is told (4 by default, none for 0)', () => {
    show('cards');
    expect(items().length).toBe(4);
    show('cards', 7);
    expect(items().length).toBe(7);
    show('cards', 0);
    expect(items().length).toBe(0);
  });

  it('every kind has its own shape and its own number of shapes', () => {
    const kinds: SkeletonKind[] = ['cards', 'users', 'table', 'product-cards', 'stats', 'rows'];
    for (const kind of kinds) {
      show(kind, 3);
      expect((dom().querySelector('[data-skeleton]') as HTMLElement).getAttribute('data-kind')).withContext(kind).toBe(kind);
      expect(items().length).withContext(kind).toBe(3);
    }
  });

  it('cards: the shape of a Sales / Bookings / Repairs card (photo, lines, a badge, four facts, four buttons), two per row on a wide screen', () => {
    show('cards', 2);
    const card = items()[0] as HTMLElement;
    expect(card.querySelectorAll('.rounded-lg.bg-gray-200').length).toBe(1);        // the photo
    expect(card.querySelectorAll('.grid-cols-2 > div').length).toBe(4);             // the four facts
    expect(card.querySelectorAll('.grid-cols-4 > div').length).toBe(4);             // the four buttons
    expect(dom().querySelector('[data-skeleton] > div, [data-skeleton] > .grid')!.className).toContain('xl:grid-cols-2');
  });

  it('product cards: the Menu size, or the smaller size of the Products page', () => {
    show('product-cards', 2);
    expect(dom().querySelector('.h-36')).not.toBeNull();
    expect(dom().querySelector('.h-28')).toBeNull();
    expect(dom().querySelector('.grid')!.className).toContain('2xl:grid-cols-5');

    show('product-cards', 2, { dense: true });
    expect(dom().querySelector('.h-28')).not.toBeNull();
    expect(dom().querySelector('.h-36')).toBeNull();
    expect(dom().querySelector('.grid')!.className).toContain('gap-2.5');
  });

  it('the numbers on top: laid out as the page says', () => {
    show('stats', 5, { gridClass: 'grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5' });
    expect(dom().querySelector('.grid')!.className).toContain('xl:grid-cols-5');
    expect(items().length).toBe(5);
  });

  it('the table: a header strip, then a row for each shape', () => {
    show('table', 5);
    expect(dom().querySelector('.bg-gray-50')).not.toBeNull();
    expect(items().length).toBe(5);
  });
});
