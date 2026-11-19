import { stockInfo } from './stock-status';

const item = (over: object = {}) => ({ track_stock: 1, stock_quantity: 6, min_stock_level: 2, is_archived: false, hold_status: null, ...over });

describe('stockInfo (one wording and one colour everywhere)', () => {
  it('a product that does not track stock is a grey "Single item", whatever its numbers say', () => {
    expect(stockInfo(item({ track_stock: 0, stock_quantity: 1 }))).toEqual({ text: 'Single item', tone: 'neutral' });
    expect(stockInfo(item({ track_stock: false, stock_quantity: 0 })).text).toBe('Single item');
  });

  it('plenty in stock is green and shows the count', () => {
    expect(stockInfo(item())).toEqual({ text: 'In stock · 6', tone: 'success' });
  });

  it('at or below the low-stock level is amber and says how many are left', () => {
    expect(stockInfo(item({ stock_quantity: 3 })).tone).toBe('success');                 // just above the level
    expect(stockInfo(item({ stock_quantity: 2 }))).toEqual({ text: 'Low stock · 2 left', tone: 'warning' });   // exactly at it
    expect(stockInfo(item({ stock_quantity: 1 })).tone).toBe('warning');
  });

  it('nothing left is red - even when the low-stock level is 0', () => {
    expect(stockInfo(item({ stock_quantity: 0 }))).toEqual({ text: 'Out of stock', tone: 'danger' });
    expect(stockInfo(item({ stock_quantity: 0, min_stock_level: 0 })).tone).toBe('danger');
  });

  it('a sold (archived) product says "Sold" (grey), before anything else', () => {
    expect(stockInfo(item({ is_archived: true, stock_quantity: 0 }))).toEqual({ text: 'Sold', tone: 'neutral' });
    expect(stockInfo(item({ is_archived: true, track_stock: 0 })).text).toBe('Sold');
  });

  it('a single laptop that is booked says "Booked" (blue), one in repair says "In repair" (amber)', () => {
    expect(stockInfo(item({ track_stock: 0, hold_status: 'booked' }))).toEqual({ text: 'Booked', tone: 'info' });
    expect(stockInfo(item({ track_stock: 0, hold_status: 'repair' }))).toEqual({ text: 'In repair', tone: 'warning' });
  });

  it('"Sold" comes before "Booked" (a sold laptop is no longer held), and a product without hold_status is as before', () => {
    expect(stockInfo(item({ is_archived: true, hold_status: 'booked' })).text).toBe('Sold');
    const { hold_status, ...old } = item({ track_stock: 0 });
    expect(stockInfo(old as any).text).toBe('Single item');
  });
});
