import { daysFromToday, formatDate, parseIso, todayIso, toIso, weekdayName } from './dates';

describe('dates (YYYY-MM-DD in, DD/MM/YYYY out)', () => {
  it('shows a date the way the shop writes it: day / month / year', () => {
    expect(formatDate('2026-11-08')).toBe('08/11/2026');
    expect(formatDate('2026-11-12')).toBe('12/11/2026');
    expect(formatDate('2026-01-05')).toBe('05/01/2026');
  });

  it('knows the weekday (12/11/2026 is a Thursday)', () => {
    expect(weekdayName('2026-11-12')).toBe('Thursday');
    expect(weekdayName('2026-11-08')).toBe('Sunday');
    expect(weekdayName('2026-11-09')).toBe('Monday');
  });

  it('gives back nothing for something that is not a date', () => {
    for (const bad of ['', null, undefined, 'abc', '12/11/2026', '2026-13-01', '2026-02-31', '2026-2-3']) {
      expect(formatDate(bad as string)).toBe('');
      expect(weekdayName(bad as string)).toBe('');
      expect(parseIso(bad as string)).toBeNull();
      expect(daysFromToday(bad as string)).toBeNull();
    }
  });

  it('accepts 29 February only in a leap year', () => {
    expect(formatDate('2028-02-29')).toBe('29/02/2028');
    expect(formatDate('2026-02-29')).toBe('');
  });

  it('turns a Date into YYYY-MM-DD in the local time zone (and back)', () => {
    const lateEvening = new Date(2026, 10, 8, 23, 59);       // 8 Nov 2026, 23:59 local time
    expect(toIso(lateEvening)).toBe('2026-11-08');
    expect(todayIso(lateEvening)).toBe('2026-11-08');
    expect(toIso(parseIso('2026-11-08')!)).toBe('2026-11-08');
  });

  describe('days from today', () => {
    const now = new Date(2026, 10, 9, 15, 30);               // Monday 9 Nov 2026, afternoon

    it('0 = today (whatever the time of day), 1 = tomorrow, negative = in the past', () => {
      expect(daysFromToday('2026-11-09', now)).toBe(0);
      expect(daysFromToday('2026-11-09', new Date(2026, 10, 9, 0, 1))).toBe(0);
      expect(daysFromToday('2026-11-09', new Date(2026, 10, 9, 23, 59))).toBe(0);
      expect(daysFromToday('2026-11-10', now)).toBe(1);
      expect(daysFromToday('2026-11-12', now)).toBe(3);
      expect(daysFromToday('2026-11-08', now)).toBe(-1);
      expect(daysFromToday('2026-11-01', now)).toBe(-8);
    });

    it('counts whole days across a month and a year end', () => {
      expect(daysFromToday('2026-12-01', now)).toBe(22);
      expect(daysFromToday('2027-01-01', new Date(2026, 11, 31, 10))).toBe(1);
    });
  });
});
