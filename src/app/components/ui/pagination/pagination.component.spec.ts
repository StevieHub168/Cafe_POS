import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;
  let component: PaginationComponent;
  let pages: number[];
  let sizes: number[];

  const show = (state: Partial<PaginationComponent>) => {
    Object.assign(component, state);
    fixture.detectChanges();
  };
  const dom = () => fixture.nativeElement as HTMLElement;
  const q = (selector: string) => dom().querySelector(selector) as HTMLElement | null;
  const all = (selector: string) => Array.from(dom().querySelectorAll(selector)) as HTMLElement[];
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ').trim();
  const numbers = () => all('[data-page]').map(b => b.textContent!.trim());

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [PaginationComponent] }).compileComponents();
    fixture = TestBed.createComponent(PaginationComponent);
    component = fixture.componentInstance;
    pages = [];
    sizes = [];
    component.pageChange.subscribe(p => pages.push(p));
    component.perPageChange.subscribe(s => sizes.push(s));
    spyOn(window, 'scrollTo');
  });

  it('shows nothing for an empty list', () => {
    show({ total: 0 });
    expect(q('[data-pagination]')).toBeNull();
  });

  describe('what it says', () => {
    it('"Showing 1–10 of 25" on the first page, "11–20" on the second and "21–25" on the last', () => {
      show({ page: 1, perPage: 10, total: 25 });
      expect(q('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Showing 1–10 of 25');
      show({ page: 2 });
      expect(q('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Showing 11–20 of 25');
      show({ page: 3 });
      expect(q('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Showing 21–25 of 25');
    });

    it('a list that fits one page still says how many there are, but has no buttons', () => {
      show({ page: 1, perPage: 10, total: 4 });
      expect(q('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Showing 1–4 of 4');
      expect(q('[data-pager]')).toBeNull();
      expect(q('[data-previous]')).toBeNull();
      expect(q('[data-next]')).toBeNull();
    });

    it('no "Per page" box when even the smallest page (10) shows everything: there is nothing to choose', () => {
      show({ page: 1, perPage: 10, total: 4 });
      expect(q('[data-per-page]')).toBeNull();
      show({ total: 10 });
      expect(q('[data-per-page]')).toBeNull();
    });

    it('the "Per page" box comes back when there are more rows than the smallest page holds, even if all fit the page in use', () => {
      show({ page: 1, perPage: 20, total: 15 });
      expect(q('[data-per-page]')).not.toBeNull();
      expect(q('[data-pager]')).toBeNull();                 // 15 rows on a page of 20: one page, no buttons
      show({ perPage: 10, total: 11 });
      expect(q('[data-per-page]')).not.toBeNull();
      expect(q('[data-pager]')).not.toBeNull();
    });

    it('the choices of "Per page" are 10, 20 and 50, with the one in use picked (and a size that is not a choice is added)', () => {
      show({ page: 1, perPage: 20, total: 100 });
      const select = q('[data-per-page]') as HTMLSelectElement;
      expect(Array.from(select.options).map(o => o.value)).toEqual(['10', '20', '50']);
      expect(select.value).toBe('20');
      show({ perPage: 25 });
      expect(Array.from((q('[data-per-page]') as HTMLSelectElement).options).map(o => o.value)).toEqual(['10', '20', '25', '50']);
    });
  });

  describe('the page numbers', () => {
    it('all of them when there are few', () => {
      show({ page: 2, perPage: 10, total: 70 });
      expect(numbers()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
    });

    it('the first, the last and the ones around this page, with a gap where numbers are left out', () => {
      show({ page: 1, perPage: 10, total: 120 });
      expect(component.numbers).toEqual([1, 2, null, 12]);
      show({ page: 6 });
      expect(component.numbers).toEqual([1, null, 5, 6, 7, null, 12]);
      show({ page: 12 });
      expect(component.numbers).toEqual([1, null, 11, 12]);
    });

    it('a gap of one number shows that number instead of dots', () => {
      show({ page: 3, perPage: 10, total: 120 });
      expect(component.numbers).toEqual([1, 2, 3, 4, null, 12]);
      show({ page: 5 });
      expect(component.numbers).toEqual([1, null, 4, 5, 6, null, 12]);
      show({ page: 4 });
      expect(component.numbers).toEqual([1, 2, 3, 4, 5, null, 12]);
    });

    it('the page you are on is marked', () => {
      show({ page: 3, perPage: 10, total: 70 });
      const current = all('[data-page]').filter(b => b.getAttribute('aria-current') === 'page');
      expect(current.map(b => b.textContent!.trim())).toEqual(['3']);
    });

    it('a phone gets "Page 3 of 7" instead of the numbers', () => {
      show({ page: 3, perPage: 10, total: 70 });
      expect(q('[data-page-of]')!.textContent!.trim()).toBe('Page 3 of 7');
      expect(q('[data-page-of]')!.className).toContain('sm:hidden');
      expect(all('[data-page]').every(b => b.className.includes('hidden'))).toBeTrue();
    });
  });

  describe('Previous and Next', () => {
    it('Previous is off on the first page and Next on the last', () => {
      show({ page: 1, perPage: 10, total: 25 });
      expect((q('[data-previous]') as HTMLButtonElement).disabled).toBeTrue();
      expect((q('[data-next]') as HTMLButtonElement).disabled).toBeFalse();
      show({ page: 3 });
      expect((q('[data-previous]') as HTMLButtonElement).disabled).toBeFalse();
      expect((q('[data-next]') as HTMLButtonElement).disabled).toBeTrue();
    });

    it('Next and Previous ask for the page after and before, and the new page starts from the top of the screen', () => {
      show({ page: 2, perPage: 10, total: 50 });
      (q('[data-next]') as HTMLButtonElement).click();
      (q('[data-previous]') as HTMLButtonElement).click();
      expect(pages).toEqual([3, 1]);
      expect(window.scrollTo as jasmine.Spy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    });

    it('a page number asks for that page; the page you are on asks for nothing', () => {
      show({ page: 2, perPage: 10, total: 50 });
      all('[data-page]').find(b => b.textContent!.trim() === '5')!.click();
      all('[data-page]').find(b => b.textContent!.trim() === '2')!.click();
      expect(pages).toEqual([5]);
    });

    it('while the next page is loading every button is off, and nothing is asked', () => {
      show({ page: 2, perPage: 10, total: 50, disabled: true });
      expect(all('[data-previous], [data-next], [data-page]').every(b => (b as HTMLButtonElement).disabled)).toBeTrue();
      component.go(3);
      expect(pages).toEqual([]);
    });

    it('a page outside the list is brought back inside it', () => {
      show({ page: 2, perPage: 10, total: 25 });
      component.go(99);
      component.go(-4);
      expect(pages).toEqual([3, 1]);
    });
  });

  describe('Per page', () => {
    it('picking a size says so (the page that owns the list goes back to the first page)', () => {
      show({ page: 2, perPage: 10, total: 100 });
      const select = q('[data-per-page]') as HTMLSelectElement;
      select.value = '50';
      select.dispatchEvent(new Event('change'));
      expect(sizes).toEqual([50]);
      expect(pages).toEqual([]);
    });

    it('picking the size already in use says nothing', () => {
      show({ page: 1, perPage: 10, total: 100 });
      const select = q('[data-per-page]') as HTMLSelectElement;
      select.value = '10';
      select.dispatchEvent(new Event('change'));
      expect(sizes).toEqual([]);
    });
  });

  it('the words are plain: Showing, Per page, Previous, Next', () => {
    show({ page: 2, perPage: 10, total: 50 });
    expect(text()).toContain('Showing');
    expect(text()).toContain('Per page');
    expect(text()).toContain('Previous');
    expect(text()).toContain('Next');
  });
});
