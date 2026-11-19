export type InvoiceType = 'sale' | 'booking' | 'repair';
export type Warranty = '1_week' | '2_weeks' | '1_month' | 'none';

export interface InvoiceItem {
  name: string;
  qty: number;
  unit_price: number;
}

/** A printed paper (A5) for one sale, booking or repair. It keeps its own copy of everything printed on it. */
export interface Invoice {
  id?: number;
  /** 41 -> printed as 000041. */
  number: number;
  number_text?: string;
  type: InvoiceType;
  /** "YYYY-MM-DD". */
  invoice_date: string;
  customer_name: string | null;
  phone: string | null;
  /** Always "@username". */
  telegram: string | null;
  /** Repair only. */
  device: string | null;
  /** Repair only. */
  problem: string | null;
  /** Booking only, "YYYY-MM-DD". */
  pickup_date: string | null;
  /** The booking this invoice was made from (one invoice per booking). */
  booking_id: number | null;
  /** The repair job this invoice was made from (one invoice per repair). Repair invoices only. */
  repair_id?: number | null;
  warranty: Warranty;
  items: InvoiceItem[];
  /** Worked out by the API from the items. */
  total: number;
  deposit: number;
  /** total - deposit (worked out by the API). */
  balance?: number;
  created_at?: string;
  updated_at?: string;
}

/** What is sent to the API when saving (the total and the balance are worked out there; no number = the next one). */
export type InvoiceInput = Omit<Invoice, 'id' | 'number' | 'number_text' | 'total' | 'balance' | 'created_at' | 'updated_at'> & { number?: number };

/** How many lines fit on the printed paper of each kind. */
export const MAX_LINES: Record<InvoiceType, number> = { sale: 9, booking: 5, repair: 7 };

/** What still fits on the paper without being cut off. */
export const MAX_NAME = 90;
export const MAX_DEVICE = 80;
export const MAX_PROBLEM = 140;

export const INVOICE_TYPES: { value: InvoiceType; label: string; khmer: string }[] = [
  { value: 'sale', label: 'Sale', khmer: 'វិក្កយបត្រលក់' },
  { value: 'booking', label: 'Booking', khmer: 'វិក្កយបត្រកក់' },
  { value: 'repair', label: 'Repair', khmer: 'វិក្កយបត្រជួសជុល' },
];

export function typeInfo(type: InvoiceType): { value: InvoiceType; label: string; khmer: string } {
  return INVOICE_TYPES.find(t => t.value === type) ?? INVOICE_TYPES[0];
}

/** The warranty has three choices only (or none). */
export const WARRANTY_CHOICES: { value: Warranty; label: string; khmer: string }[] = [
  { value: '1_week', label: '1 week', khmer: '1 សប្តាហ៍' },
  { value: '2_weeks', label: '2 weeks', khmer: '2 សប្តាហ៍' },
  { value: '1_month', label: '1 month', khmer: '1 ខែ' },
  { value: 'none', label: 'No warranty', khmer: '' },
];

export function warrantyInfo(warranty: Warranty): { value: Warranty; label: string; khmer: string } {
  return WARRANTY_CHOICES.find(w => w.value === warranty) ?? WARRANTY_CHOICES[3];
}

/** 41 -> "000041". */
export function formatInvoiceNumber(number: number | null | undefined): string {
  return String(Math.max(0, Math.trunc(Number(number) || 0))).padStart(6, '0');
}

export function itemAmount(item: Pick<InvoiceItem, 'qty' | 'unit_price'>): number {
  return Math.round((Number(item.qty) || 0) * (Number(item.unit_price) || 0) * 100) / 100;
}

/** The total of the items (the API works it out the same way). */
export function itemsTotal(items: Pick<InvoiceItem, 'qty' | 'unit_price'>[]): number {
  return Math.round(items.reduce((sum, item) => sum + itemAmount(item), 0) * 100) / 100;
}
