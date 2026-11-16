/** 1050 -> "$1,050", 1050.5 -> "$1,050.50", 899.89 -> "$899.89". Whole amounts have no ".00". */
export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '$0';
  const cents = Math.round(Math.abs(amount) * 100);
  const text = (cents / 100).toLocaleString('en-US', cents % 100 === 0
    ? { maximumFractionDigits: 0 }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${amount < 0 ? '-' : ''}$${text}`;
}
