import { isUnderWarranty, warrantyDaysLeft, warrantyEnd, warrantyText } from './warranty';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 0);

describe('warranty dates', () => {
  describe('warrantyEnd', () => {
    it('1 week ends 7 days after the invoice', () => {
      expect(warrantyEnd('2026-11-10', '1_week')).toBe('2026-11-17');
    });

    it('2 weeks ends 14 days after, also across a month end', () => {
      expect(warrantyEnd('2026-11-10', '2_weeks')).toBe('2026-11-24');
      expect(warrantyEnd('2026-10-25', '2_weeks')).toBe('2026-11-08');
    });

    it('1 month ends on the same day of the next month', () => {
      expect(warrantyEnd('2026-10-29', '1_month')).toBe('2026-11-29');
      expect(warrantyEnd('2026-12-15', '1_month')).toBe('2027-01-15');
    });

    it('1 month from the 31st ends on the last day of a shorter month (never spills over)', () => {
      expect(warrantyEnd('2026-01-31', '1_month')).toBe('2026-02-28');
      expect(warrantyEnd('2028-01-31', '1_month')).toBe('2028-02-29');
      expect(warrantyEnd('2026-03-31', '1_month')).toBe('2026-04-30');
    });

    it('is null with no warranty, or when the date is not a date', () => {
      expect(warrantyEnd('2026-11-10', 'none')).toBeNull();
      expect(warrantyEnd('', '1_week')).toBeNull();
      expect(warrantyEnd(null, '1_week')).toBeNull();
      expect(warrantyEnd('2026-02-31', '1_week')).toBeNull();
    });
  });

  describe('warrantyDaysLeft', () => {
    it('counts the days to the last day: 4 days left on the 13th of a warranty that ends on the 17th', () => {
      expect(warrantyDaysLeft('2026-11-10', '1_week', at(2026, 11, 13))).toBe(4);
    });

    it('is 0 on the last day, and negative after it', () => {
      expect(warrantyDaysLeft('2026-11-10', '1_week', at(2026, 11, 17))).toBe(0);
      expect(warrantyDaysLeft('2026-11-10', '1_week', at(2026, 11, 20))).toBe(-3);
    });

    it('is null with no warranty', () => {
      expect(warrantyDaysLeft('2026-11-10', 'none', at(2026, 11, 13))).toBeNull();
    });
  });

  describe('isUnderWarranty', () => {
    it('is true until the last day (the last day counts) and false after', () => {
      expect(isUnderWarranty('2026-11-10', '1_week', at(2026, 11, 10))).toBeTrue();
      expect(isUnderWarranty('2026-11-10', '1_week', at(2026, 11, 17))).toBeTrue();
      expect(isUnderWarranty('2026-11-10', '1_week', at(2026, 11, 18))).toBeFalse();
    });

    it('is false with no warranty', () => {
      expect(isUnderWarranty('2026-11-10', 'none', at(2026, 11, 10))).toBeFalse();
    });
  });

  describe('warrantyText', () => {
    it('says the length and the days left', () => {
      expect(warrantyText('2026-11-10', '1_week', at(2026, 11, 13))).toBe('1 week · 4 days left');
      expect(warrantyText('2026-11-10', '2_weeks', at(2026, 11, 18))).toBe('2 weeks · 6 days left');
      expect(warrantyText('2026-10-29', '1_month', at(2026, 11, 11))).toBe('1 month · 18 days left');
    });

    it('says "1 day left" in the singular, and "ends today" on the last day', () => {
      expect(warrantyText('2026-11-10', '1_week', at(2026, 11, 16))).toBe('1 week · 1 day left');
      expect(warrantyText('2026-11-10', '1_week', at(2026, 11, 17))).toBe('1 week · ends today');
    });

    it('says "ended" after it, and "No warranty" when there is none', () => {
      expect(warrantyText('2026-11-10', '1_week', at(2026, 11, 25))).toBe('1 week · ended');
      expect(warrantyText('2026-11-10', 'none', at(2026, 11, 13))).toBe('No warranty');
    });
  });
});
