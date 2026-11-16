import { formatMoney } from './money';

describe('formatMoney', () => {
  it('whole amounts have no cents, with a comma for thousands', () => {
    expect(formatMoney(1050)).toBe('$1,050');
    expect(formatMoney(500)).toBe('$500');
    expect(formatMoney(0)).toBe('$0');
    expect(formatMoney(1999)).toBe('$1,999');
    expect(formatMoney(1234567)).toBe('$1,234,567');
  });

  it('amounts with cents always show two digits', () => {
    expect(formatMoney(1050.5)).toBe('$1,050.50');
    expect(formatMoney(899.89)).toBe('$899.89');
    expect(formatMoney(0.5)).toBe('$0.50');
  });

  it('copes with numbers that arrive as text (MySQL) and float noise', () => {
    expect(formatMoney('1050.00')).toBe('$1,050');
    expect(formatMoney('899.89')).toBe('$899.89');
    expect(formatMoney(999.99 - 100.1)).toBe('$899.89');          // 899.8900000000001
  });

  it('shows a minus for a negative amount, and $0 for rubbish', () => {
    expect(formatMoney(-5)).toBe('-$5');
    expect(formatMoney(-12.5)).toBe('-$12.50');
    for (const bad of [null, undefined, 'abc', NaN]) expect(formatMoney(bad as number)).toBe('$0');
  });
});
