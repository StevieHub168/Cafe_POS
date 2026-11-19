import { StatusTone } from '../../components/ui/status-badge/status-badge.component';
import { Warranty } from '../invoice/invoice.model';

export type RepairStatus = 'received' | 'fixed' | 'picked_up';

/** A repair job: a laptop (the shop's or a customer's) in the shop. It goes through 3 steps. */
export interface Repair {
  id?: number;
  /** One of the shop's laptops, if it was picked from Products. */
  product_id: number | null;
  /** The laptop or device, e.g. "Dell Inspiron 15". */
  device: string;
  customer_name: string | null;
  phone: string | null;
  /** Always "@username". */
  telegram: string | null;
  problem: string;
  /** "YYYY-MM-DD". */
  received_date: string;
  /** When it should be ready ("YYYY-MM-DD", optional). */
  back_on: string | null;
  /** The price of the repair (null = not set yet). */
  cost: number | null;
  status: RepairStatus;
  fixed_date: string | null;
  picked_up_date: string | null;
  /** The Sale of this laptop, when the shop sold it (a warranty repair). */
  sale_invoice_id: number | null;
  sale_invoice_number?: number | null;
  sale_date?: string | null;
  sale_warranty?: Warranty | null;
  /** This repair took one of the shop's laptops off the shelf while it is 'received' (counted stock: one less, a single laptop: set aside). */
  stock_held?: boolean;
  /** Of the laptop of the shop: true = counted stock, false = a single laptop, null = no laptop of the shop. */
  product_track_stock?: boolean | null;
  /** Photos of what is wrong (uploaded from this app): ["/uploads/x.png"]. */
  images?: string[];
  created_at?: string;
  updated_at?: string;
}

/** What is sent to the API when saving (the API fills in the dates of the steps). */
export type RepairInput = Omit<Repair, 'id' | 'sale_invoice_number' | 'sale_date' | 'sale_warranty' | 'stock_held' | 'product_track_stock' | 'created_at' | 'updated_at' | 'fixed_date' | 'picked_up_date'>;

export const MAX_REPAIR_DEVICE = 80;
export const MAX_REPAIR_PROBLEM = 140;
export const MAX_REPAIR_PHOTOS = 4;

/** The 3 steps, in order. */
export const REPAIR_STEPS: { value: RepairStatus; label: string; tone: StatusTone }[] = [
  { value: 'received', label: 'Received', tone: 'warning' },
  { value: 'fixed', label: 'Fixed', tone: 'info' },
  { value: 'picked_up', label: 'Picked up', tone: 'success' },
];

export function repairStep(status: RepairStatus): { value: RepairStatus; label: string; tone: StatusTone } {
  return REPAIR_STEPS.find(s => s.value === status) ?? REPAIR_STEPS[0];
}

/** 0 = received, 1 = fixed, 2 = picked up. */
export function repairStepIndex(status: RepairStatus): number {
  return Math.max(0, REPAIR_STEPS.findIndex(s => s.value === status));
}

/** The step after this one (null after the last). */
export function nextRepairStatus(status: RepairStatus): RepairStatus | null {
  return REPAIR_STEPS[repairStepIndex(status) + 1]?.value ?? null;
}
