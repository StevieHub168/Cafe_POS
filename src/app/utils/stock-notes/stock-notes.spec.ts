import { gaveBackNote, holdChangeNote, tookNote } from './stock-notes';

describe('stock notes (a booking or repair takes a laptop off the shelf)', () => {
  const singleHeld = { product_id: 1, stock_held: true, product_track_stock: false };
  const countedHeld = { product_id: 2, stock_held: true, product_track_stock: true };
  const nothing = { product_id: 3, stock_held: false, product_track_stock: true };

  it('says what was taken: a single laptop is set aside, counted stock goes down', () => {
    expect(tookNote(singleHeld, 'booking')).toBe('The laptop is set aside as Booked and left the Menu.');
    expect(tookNote(singleHeld, 'repair')).toBe('The laptop is set aside as In repair and left the Menu.');
    expect(tookNote(countedHeld, 'booking')).toBe('One laptop less in stock.');
  });

  it('says nothing when nothing was taken (no laptop of the shop, or counted stock that was already at 0)', () => {
    expect(tookNote(nothing, 'booking')).toBe('');
    expect(tookNote({ stock_held: false, product_track_stock: null }, 'repair')).toBe('');
    expect(tookNote(null, 'booking')).toBe('');
    expect(tookNote(undefined, 'repair')).toBe('');
  });

  it('says what is given back', () => {
    expect(gaveBackNote(singleHeld)).toBe('The laptop is back on the Menu.');
    expect(gaveBackNote(countedHeld)).toBe('One laptop is back in stock.');
    expect(gaveBackNote(nothing)).toBe('');
  });

  it('a change: taken, given back, moved to another laptop, or nothing', () => {
    expect(holdChangeNote(nothing, singleHeld, 'booking')).toBe('The laptop is set aside as Booked and left the Menu.');
    expect(holdChangeNote(singleHeld, nothing, 'booking')).toBe('The laptop is back on the Menu.');
    expect(holdChangeNote(singleHeld, { ...singleHeld, product_id: 9 }, 'booking'))
      .toBe('The laptop is back on the Menu. The laptop is set aside as Booked and left the Menu.');
    expect(holdChangeNote(singleHeld, { ...singleHeld }, 'repair')).toBe('');
    expect(holdChangeNote(nothing, nothing, 'repair')).toBe('');
    expect(holdChangeNote(singleHeld, undefined, 'repair')).toBe('The laptop is back on the Menu.');
  });
});
