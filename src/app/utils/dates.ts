// Dates travel as plain "YYYY-MM-DD" text (the same as <input type="date"> and the API) and are shown as DD/MM/YYYY.
// Everything is worked out in the local time zone, so a day never shifts.

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-12" -> a Date at local midnight. null when it is not a real day (also "2026-02-31"). */
export function parseIso(iso: string | null | undefined): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? ''));
  if (!m) return null;
  const date = new Date(+m[1], +m[2] - 1, +m[3]);
  const real = date.getFullYear() === +m[1] && date.getMonth() === +m[2] - 1 && date.getDate() === +m[3];
  return real ? date : null;
}

export function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayIso(now: Date = new Date()): string {
  return toIso(now);
}

/** "2026-11-12" -> "12/11/2026" ('' when it is not a date). */
export function formatDate(iso: string | null | undefined): string {
  const date = parseIso(iso);
  return date ? `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}` : '';
}

/** "2026-11-12" -> "Thursday" ('' when it is not a date). */
export function weekdayName(iso: string | null | undefined): string {
  const date = parseIso(iso);
  return date ? WEEKDAYS[date.getDay()] : '';
}

/** How many days from today: 0 = today, 1 = tomorrow, -2 = two days ago. null when it is not a date. */
export function daysFromToday(iso: string | null | undefined, now: Date = new Date()): number | null {
  const date = parseIso(iso);
  if (!date) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / 86_400_000);   // round: a clock change makes a day 23 or 25 hours
}
