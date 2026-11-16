/**
 * Booking or repairing one of the shop's laptops takes it off the shelf: counted stock goes down by one, a single laptop is set
 * aside ("Booked" / "In repair") and leaves the Menu. These are the plain words for that, shown after saving.
 * The API tells what happened: `stock_held` (this booking / repair holds a laptop) and `product_track_stock` (counted stock or a single laptop).
 */
export interface HoldInfo {
  product_id?: number | null;
  stock_held?: boolean;
  product_track_stock?: boolean | null;
}

export type HoldKind = 'booking' | 'repair';

/** What was taken ('' = nothing was taken). */
export function tookNote(item: HoldInfo | null | undefined, kind: HoldKind): string {
  if (!item?.stock_held) return '';
  if (item.product_track_stock) return 'One laptop less in stock.';
  return kind === 'booking' ? 'The laptop is set aside as Booked and left the Menu.' : 'The laptop is set aside as In repair and left the Menu.';
}

/** What is given back ('' = nothing was held). */
export function gaveBackNote(item: HoldInfo | null | undefined): string {
  if (!item?.stock_held) return '';
  return item.product_track_stock ? 'One laptop is back in stock.' : 'The laptop is back on the Menu.';
}

/** What a change did, from the booking / repair before to the one after ('' = no change to any stock). */
export function holdChangeNote(before: HoldInfo | null | undefined, after: HoldInfo | null | undefined, kind: HoldKind): string {
  const held = !!before?.stock_held;
  const holds = !!after?.stock_held;
  if (held && holds && before?.product_id === after?.product_id) return '';
  return [held ? gaveBackNote(before) : '', holds ? tookNote(after, kind) : ''].filter(Boolean).join(' ');
}
