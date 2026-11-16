import { Booking } from '../models/booking.model';
import { bookingDetailsText } from './booking-text';

const EXAMPLE: Booking = {
  id: 1, product_id: 7, product_name: 'MacBook Air M5 | RAM 16GB | SSD 512GB', phone: '011968240', telegram: '@Horth_Heng',
  full_price: 1050, deposit: 500, remaining_balance: 550, booking_date: '2026-11-08', pickup_date: '2026-11-12', status: 'booked',
};

// The message exactly as the shop types it today.
const SHOP_MESSAGE = [
  'Booking Details',
  '• Product: MacBook Air M5 | RAM 16GB | SSD 512GB',
  '• Phone: 011968240',
  '• Telegram: @Horth_Heng',
  '• Full Price: $1,050',
  '• Deposit: $500',
  '• Remaining Balance: $550',
  '• Booking Date: 08/11/2026',
  '• Pickup Date: 12/11/2026 (Thursday)',
  '• Status: Booked',
].join('\n');

describe('bookingDetailsText (the message to send)', () => {
  it('is word for word the message the shop usually writes', () => {
    expect(bookingDetailsText(EXAMPLE)).toBe(SHOP_MESSAGE);
  });

  it('leaves out the Telegram line when there is none (and the Phone line when there is none)', () => {
    const noTelegram = bookingDetailsText({ ...EXAMPLE, telegram: null });
    expect(noTelegram).not.toContain('Telegram');
    expect(noTelegram).toContain('• Phone: 011968240');
    const noPhone = bookingDetailsText({ ...EXAMPLE, phone: null });
    expect(noPhone).not.toContain('Phone');
    expect(noPhone).toContain('• Telegram: @Horth_Heng');
  });

  it('uses the words Picked up / Cancelled for the status', () => {
    expect(bookingDetailsText({ ...EXAMPLE, status: 'picked_up' })).toContain('• Status: Picked up');
    expect(bookingDetailsText({ ...EXAMPLE, status: 'cancelled' })).toContain('• Status: Cancelled');
  });

  it('works out the remaining balance itself when the API did not send it, and shows cents', () => {
    const text = bookingDetailsText({ ...EXAMPLE, full_price: 999.99, deposit: 100.1, remaining_balance: undefined });
    expect(text).toContain('• Full Price: $999.99');
    expect(text).toContain('• Deposit: $100.10');
    expect(text).toContain('• Remaining Balance: $899.89');
  });
});
