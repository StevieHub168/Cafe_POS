import { Booking, statusOf } from '../models/booking.model';
import { formatDate, weekdayName } from './dates';
import { formatMoney } from './money';

/**
 * The booking as the message the shop sends (to Telegram...), in the same layout it is usually typed:
 *
 *   Booking Details
 *   • Product: MacBook Air M5 | RAM 16GB | SSD 512GB
 *   • Phone: 011968240
 *   • Telegram: @Horth_Heng
 *   • Full Price: $1,050
 *   • Deposit: $500
 *   • Remaining Balance: $550
 *   • Booking Date: 08/11/2026
 *   • Pickup Date: 12/11/2026 (Thursday)
 *   • Status: Booked
 *
 * A phone or Telegram line is left out when the customer gave only the other one.
 */
export function bookingDetailsText(booking: Booking): string {
  const remaining = booking.remaining_balance ?? Math.round((booking.full_price - booking.deposit) * 100) / 100;
  const lines = ['Booking Details', `• Product: ${booking.product_name}`];
  if (booking.phone) lines.push(`• Phone: ${booking.phone}`);
  if (booking.telegram) lines.push(`• Telegram: ${booking.telegram}`);
  lines.push(
    `• Full Price: ${formatMoney(booking.full_price)}`,
    `• Deposit: ${formatMoney(booking.deposit)}`,
    `• Remaining Balance: ${formatMoney(remaining)}`,
    `• Booking Date: ${formatDate(booking.booking_date)}`,
    `• Pickup Date: ${formatDate(booking.pickup_date)} (${weekdayName(booking.pickup_date)})`,
    `• Status: ${statusOf(booking.status).label}`,
  );
  return lines.join('\n');
}
