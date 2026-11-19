import { HttpParams } from '@angular/common/http';

/** How many rows a page can hold: the choices of the "Per page" box. */
export const PAGE_SIZES = [10, 20, 50];

/**
 * Where a list is: which page, how many on a page, how many in all. A page with a pagination bar keeps one of these
 * and updates it with `take()` from every answer of the API.
 */
export class PageState {
  page = 1;
  total = 0;
  totalPages = 1;

  constructor(public perPage = PAGE_SIZES[0]) { }

  /** Remembers what the API said about the page it sent. */
  take(answer: { page: number; per_page: number; total: number; total_pages: number }): void {
    this.page = answer.page;
    this.perPage = answer.per_page;
    this.total = answer.total;
    this.totalPages = answer.total_pages;
  }

  /** Back to the first page (after a new search, a new tab or a new page size). */
  first(): void {
    this.page = 1;
  }

  /** The number of the first row shown: "11" of "11–20 of 134". 0 when there is nothing. */
  get from(): number {
    return this.total === 0 ? 0 : (this.page - 1) * this.perPage + 1;
  }

  /** The number of the last row shown: "20" of "11–20 of 134". */
  get to(): number {
    return Math.min(this.total, this.page * this.perPage);
  }
}

/** What goes in the address of a page request: page, per_page and the filters. A filter that is empty is left out. */
export function pageParams(state: Pick<PageState, 'page' | 'perPage'>, filters: Record<string, string | number | null | undefined> = {}): HttpParams {
  let params = new HttpParams().set('page', String(state.page)).set('per_page', String(state.perPage));
  for (const [name, value] of Object.entries(filters)) {
    if (value !== null && value !== undefined && String(value).trim() !== '') params = params.set(name, String(value).trim());
  }
  return params;
}

/** The page after rows were deleted: when the page asked for is past the last one (it is empty now), the last one is asked for. */
export function pageAfterShrink(page: number, answer: { total: number; per_page: number; results: unknown[] }): number | null {
  if (answer.results.length > 0 || page <= 1) return null;
  return Math.max(1, Math.ceil(answer.total / answer.per_page));
}
