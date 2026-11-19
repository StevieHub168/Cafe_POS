import { PageState, pageAfterShrink, pageParams } from './page-state';

describe('PageState', () => {
  it('starts on page 1 with nothing', () => {
    const state = new PageState(10);
    expect([state.page, state.perPage, state.total, state.totalPages, state.from, state.to]).toEqual([1, 10, 0, 1, 0, 0]);
  });

  it('remembers what the API said, and works out the rows shown', () => {
    const state = new PageState(10);
    state.take({ page: 2, per_page: 10, total: 25, total_pages: 3 });
    expect([state.page, state.perPage, state.total, state.totalPages, state.from, state.to]).toEqual([2, 10, 25, 3, 11, 20]);
    state.take({ page: 3, per_page: 10, total: 25, total_pages: 3 });
    expect([state.from, state.to]).toEqual([21, 25]);
  });

  it('first() goes back to page 1 (a new search, tab or size)', () => {
    const state = new PageState(10);
    state.take({ page: 4, per_page: 10, total: 80, total_pages: 8 });
    state.first();
    expect(state.page).toBe(1);
  });
});

describe('pageParams', () => {
  it('page and per_page, and the filters that have something in them', () => {
    const params = pageParams({ page: 2, perPage: 20 }, { status: 'booked', search: '  dell xps ', period: '', type: null, other: undefined });
    expect(params.keys().sort()).toEqual(['page', 'per_page', 'search', 'status']);
    expect(params.get('page')).toBe('2');
    expect(params.get('per_page')).toBe('20');
    expect(params.get('search')).toBe('dell xps');
    expect(params.get('status')).toBe('booked');
  });

  it('with no filters: just the page', () => {
    expect(pageParams({ page: 1, perPage: 10 }).keys().sort()).toEqual(['page', 'per_page']);
  });
});

describe('pageAfterShrink', () => {
  it('a page that still has rows stays where it is', () => {
    expect(pageAfterShrink(3, { total: 25, per_page: 10, results: [{}] })).toBeNull();
  });

  it('the first page is never moved', () => {
    expect(pageAfterShrink(1, { total: 0, per_page: 10, results: [] })).toBeNull();
  });

  it('a page that went empty (its last row was deleted) goes back to the last page that has rows', () => {
    expect(pageAfterShrink(3, { total: 20, per_page: 10, results: [] })).toBe(2);
    expect(pageAfterShrink(5, { total: 20, per_page: 10, results: [] })).toBe(2);
    expect(pageAfterShrink(2, { total: 0, per_page: 10, results: [] })).toBe(1);
  });
});
