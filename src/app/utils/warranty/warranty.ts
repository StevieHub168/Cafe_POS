import { Warranty, warrantyInfo } from '../../models/invoice/invoice.model';
import { daysFromToday, parseIso, toIso } from '../dates/dates';

/** The last day of a warranty ("YYYY-MM-DD"), counted from the invoice date. null = no warranty (or no date). */
export function warrantyEnd(invoiceDate: string | null | undefined, warranty: Warranty): string | null {
  const start = parseIso(invoiceDate);
  if (!start || warranty === 'none') return null;
  if (warranty === '1_week') return toIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7));
  if (warranty === '2_weeks') return toIso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 14));
  // 1 month: the same day next month (31 Jan -> 28 Feb: never spills into the month after)
  const lastOfNext = new Date(start.getFullYear(), start.getMonth() + 2, 0).getDate();
  return toIso(new Date(start.getFullYear(), start.getMonth() + 1, Math.min(start.getDate(), lastOfNext)));
}

/** Days left of a warranty: 0 = ends today, negative = it ended. null when there is no warranty. */
export function warrantyDaysLeft(invoiceDate: string | null | undefined, warranty: Warranty, now: Date = new Date()): number | null {
  const end = warrantyEnd(invoiceDate, warranty);
  return end === null ? null : daysFromToday(end, now);
}

/** Still under warranty today (the last day counts). */
export function isUnderWarranty(invoiceDate: string | null | undefined, warranty: Warranty, now: Date = new Date()): boolean {
  const left = warrantyDaysLeft(invoiceDate, warranty, now);
  return left !== null && left >= 0;
}

/** "1 week · 4 days left", "2 weeks · ends today", "1 month · ended", "No warranty". */
export function warrantyText(invoiceDate: string | null | undefined, warranty: Warranty, now: Date = new Date()): string {
  const label = warrantyInfo(warranty).label;
  const left = warrantyDaysLeft(invoiceDate, warranty, now);
  if (left === null) return label;
  if (left < 0) return `${label} · ended`;
  if (left === 0) return `${label} · ends today`;
  return `${label} · ${left} ${left === 1 ? 'day' : 'days'} left`;
}
