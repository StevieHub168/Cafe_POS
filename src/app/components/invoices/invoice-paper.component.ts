import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Invoice, MAX_LINES, formatInvoiceNumber, itemAmount, typeInfo, warrantyInfo } from '../../models/invoice.model';
import { formatDate, parseIso, weekdayName } from '../../utils/dates';
import { formatMoney } from '../../utils/money';

interface PaperRow {
  n: number;
  name: string;
  qty: string;
  price: string;
  amount: string;
}

/**
 * The A5 paper of an invoice (sale, booking or repair), the same look as the paper pad: logo, Khmer + English, a blue
 * table, Total / Deposit / Balance and the shop's rules. It only DRAWS the invoice it is given.
 *
 * The paper is always 592 x 840 px (A5 shape). The page that shows it makes it smaller or larger to fit; printing scales
 * it to exactly 148 x 210 mm (see styles.css).
 */
@Component({
  selector: 'app-invoice-paper',
  standalone: true,
  imports: [CommonModule],
  styles: [`:host { display: block; width: 592px; height: 840px; }`],
  template: `
    <div class="invoice-paper"
      style="position:relative;overflow:hidden;width:592px;height:840px;box-sizing:border-box;padding:24px 28px 20px;background:#ffffff;color:#1f2f5c;font-family:'Noto Sans Khmer','Noto Sans',Arial,sans-serif;font-size:12px;line-height:1.55;display:flex;flex-direction:column;-webkit-print-color-adjust:exact;print-color-adjust:exact">

      <!-- Header: logo, title, number and date -->
      <div style="display:grid;grid-template-columns:112px 1fr 168px;align-items:start;gap:10px;height:118px">
        <img src="/logo.png" alt="Store logo" style="width:112px;height:112px;object-fit:contain" crossorigin="anonymous">
        <div style="text-align:center;padding-top:8px">
          <div style="font-family:'Moul','Noto Sans Khmer',serif;font-size:21px;line-height:1.6;color:#1f2f5c">វិក្កយបត្រ</div>
          <div style="font-weight:700;font-size:16px;line-height:1.3;letter-spacing:0.5px">Invoices</div>
          <div class="invoice-chip" style="display:inline-block;margin-top:6px;border:1.5px solid #2a5db0;color:#2a5db0;border-radius:4px;padding:0 10px;font-size:11px;font-weight:700;line-height:1.8">{{ kind.khmer }} · {{ kind.label | uppercase }}</div>
        </div>
        <div style="text-align:right;padding-top:6px">
          <div style="font-size:11px;color:#5b6477">លេខ / No.</div>
          <div class="invoice-number" style="font-size:22px;font-weight:700;color:#b3122a;letter-spacing:1px;line-height:1.3">{{ numberText }}</div>
          <div class="invoice-date" style="margin-top:8px;font-size:12px">ថ្ងៃទី <b>{{ day }}</b> ខែ <b>{{ month }}</b> ឆ្នាំ <b>{{ year }}</b></div>
        </div>
      </div>

      <!-- Customer (and, for a repair, the device and the problem) -->
      <div style="display:grid;gap:3px;margin-top:6px">
        <div style="display:flex;align-items:baseline;gap:8px;border-bottom:1px dotted #5b6477;padding-bottom:1px;min-height:21px">
          <span style="font-weight:700;white-space:nowrap">អតិថិជន / Customer</span>
          <span class="invoice-customer" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ invoice.customer_name }}</span>
        </div>
        <div style="display:flex;align-items:baseline;gap:8px;border-bottom:1px dotted #5b6477;padding-bottom:1px;min-height:21px">
          <span style="font-weight:700;white-space:nowrap">ទូរស័ព្ទ / Phone</span>
          <span class="invoice-contact" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ contact }}</span>
        </div>
        <ng-container *ngIf="invoice.type === 'repair'">
          <div style="display:flex;align-items:baseline;gap:8px;border-bottom:1px dotted #5b6477;padding-bottom:1px;min-height:21px">
            <span style="font-weight:700;white-space:nowrap">ឧបករណ៍ / Device</span>
            <span class="invoice-device" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ invoice.device }}</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:8px;border-bottom:1px dotted #5b6477;padding-bottom:1px;min-height:21px">
            <span style="font-weight:700;white-space:nowrap">បញ្ហា / Problem</span>
            <span class="invoice-problem" style="line-height:1.4">{{ invoice.problem }}</span>
          </div>
        </ng-container>
      </div>

      <!-- Goods (or work and parts) -->
      <div style="margin-top:10px;border:1.5px solid #2a5db0">
        <div style="display:grid;grid-template-columns:38px 1fr 54px 80px 92px;background:#2a5db0;color:#ffffff;text-align:center;font-size:11px;font-weight:600;line-height:1.5;height:46px;align-items:center">
          <div>ល.រ<br>No</div>
          <div *ngIf="invoice.type !== 'repair'">ឈ្មោះទំនិញ<br>Name of Goods</div>
          <div *ngIf="invoice.type === 'repair'">ការងារ និងគ្រឿងបន្លាស់<br>Work and Parts</div>
          <div>ចំនួន<br>Quantity</div>
          <div>តម្លៃរាយ<br>Unit Price</div>
          <div>តម្លៃសរុប<br>Amount</div>
        </div>
        <div *ngFor="let row of rows" class="invoice-row" style="display:grid;grid-template-columns:38px 1fr 54px 80px 92px;height:30px;border-top:1px solid #2a5db0;align-items:stretch;font-size:12px">
          <div style="display:flex;align-items:center;justify-content:center;font-weight:700;color:#2a5db0">{{ row.n }}</div>
          <div class="invoice-row-name" style="border-left:1px solid #2a5db0;padding:0 8px;display:flex;align-items:center;overflow:hidden;font-size:11.5px;line-height:1.25;word-break:break-word">{{ row.name }}</div>
          <div style="border-left:1px solid #2a5db0;display:flex;align-items:center;justify-content:center">{{ row.qty }}</div>
          <div style="border-left:1px solid #2a5db0;padding:0 8px;display:flex;align-items:center;justify-content:flex-end">{{ row.price }}</div>
          <div style="border-left:1px solid #2a5db0;padding:0 8px;display:flex;align-items:center;justify-content:flex-end;font-weight:600">{{ row.amount }}</div>
        </div>
      </div>

      <!-- Pickup date (booking), signature and totals -->
      <div style="display:grid;grid-template-columns:1fr 262px;gap:16px;margin-top:10px;align-items:end">
        <div style="padding-bottom:4px">
          <div *ngIf="invoice.type === 'booking'" class="invoice-pickup" style="display:inline-block;border:1.5px solid #b5174f;border-radius:4px;padding:4px 12px 5px">
            <div style="font-size:11px;color:#5b6477;line-height:1.6">ថ្ងៃមកយក / Pickup date</div>
            <div style="font-weight:700;font-size:15px;line-height:1.4;color:#b5174f">{{ pickupText }}</div>
          </div>
          <div [style.margin-top.px]="invoice.type === 'booking' ? 12 : 0" style="font-weight:700">{{ invoice.type === 'repair' ? 'អ្នកជួសជុល / The Technician' : 'អ្នកលក់ / The Seller' }}</div>
          <div [style.margin-top.px]="invoice.type === 'booking' ? 26 : 44" style="border-top:1px solid #2a5db0;width:200px"></div>
        </div>
        <div>
          <div style="display:grid;grid-template-columns:1fr 104px;align-items:center;gap:8px;height:30px">
            <div style="text-align:right;font-weight:700">សរុប / Total</div>
            <div class="invoice-total" style="border:1.5px solid #2a5db0;height:25px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;font-weight:700">{{ money(invoice.total) }}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 104px;align-items:center;gap:8px;height:30px">
            <div style="text-align:right;font-weight:700">កក់ប្រាក់ / Deposit</div>
            <div class="invoice-deposit" style="border:1.5px solid #2a5db0;height:25px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;font-weight:700">{{ money(invoice.deposit) }}</div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 104px;align-items:center;gap:8px;height:30px">
            <div style="text-align:right;font-weight:700">នៅខ្វះ / Balance</div>
            <div class="invoice-balance" style="border:1.5px solid #2a5db0;height:25px;display:flex;align-items:center;justify-content:flex-end;padding:0 8px;font-weight:700">{{ money(balance) }}</div>
          </div>
        </div>
      </div>

      <!-- Booking policy (booking invoices only) -->
      <div *ngIf="invoice.type === 'booking'" class="invoice-policy" style="margin-top:12px;border:1.5px solid #b5174f;border-radius:4px;padding:5px 12px 6px">
        <div style="font-weight:700;color:#b5174f;line-height:1.7">គោលការណ៍កក់ / Booking Policy</div>
        <div style="display:flex;gap:26px;font-size:11.5px;line-height:1.7">
          <span>• មិនសងប្រាក់វិញទេ · <b>No Refunds</b></span>
          <span>• មិនអាចលុបចោលការកក់បានទេ · <b>No Cancellations</b></span>
        </div>
      </div>

      <!-- Our rules -->
      <div class="invoice-rules" style="margin-top:auto">
        <div style="display:inline-block;font-family:'Moul','Noto Sans Khmer',serif;font-size:14px;line-height:1.8;color:#b5174f;border-bottom:2px solid #b5174f">គោលការណ៍របស់យើងខ្ញុំ៖</div>
        <div style="margin-top:6px;font-size:11.5px;line-height:1.65">
          <div class="invoice-warranty">
            <ng-container *ngIf="invoice.warranty !== 'none'; else noWarranty">1. ធានារយៈពេល <b>{{ warranty.khmer }} ({{ warranty.label }})</b> for {{ invoice.type === 'repair' ? 'Repair work' : 'Hardware' }}</ng-container>
            <ng-template #noWarranty>1. គ្មានការធានា <b>(No warranty)</b></ng-template>
          </div>
          <ng-container *ngIf="invoice.type !== 'repair'">
            <div>2. រាល់ទំនិញដែលបានទិញរួច មិនអាចដូរយកប្រាក់វិញបានទេ។</div>
            <div style="padding-left:14px;color:#5b6477">(Goods sold are not returnable)</div>
          </ng-container>
          <div>{{ invoice.type === 'repair' ? '2' : '3' }}. រាល់ផលិតផលមិនធានាលើដុំសាក និងអេក្រង់។</div>
          <div style="padding-left:14px;color:#5b6477">(No warranty on Adapter and screen)</div>
          <div>{{ invoice.type === 'repair' ? '3' : '4' }}. មិនមានការធានាក្នុងករណី បែកបាក់ ប្រេះ ចូលទឹក ឬបាត់បង់គ្រឿងបន្លាស់។</div>
          <div style="padding-left:14px;color:#5b6477">(No warranty physical damage, crack, water damage)</div>
        </div>
      </div>
    </div>
  `,
})
export class InvoicePaperComponent {
  @Input({ required: true }) invoice!: Invoice;

  readonly money = formatMoney;

  get kind() {
    return typeInfo(this.invoice.type);
  }

  get warranty() {
    return warrantyInfo(this.invoice.warranty);
  }

  /** 41 -> "000041". */
  get numberText(): string {
    return formatInvoiceNumber(this.invoice.number);
  }

  private get dateParts(): string[] {
    const date = parseIso(this.invoice.invoice_date);
    return date
      ? [String(date.getDate()).padStart(2, '0'), String(date.getMonth() + 1).padStart(2, '0'), String(date.getFullYear())]
      : ['', '', ''];
  }

  get day(): string { return this.dateParts[0]; }
  get month(): string { return this.dateParts[1]; }
  get year(): string { return this.dateParts[2]; }

  /** "012 345 678 · @sok_dara": what the customer can be reached on. */
  get contact(): string {
    return [this.invoice.phone, this.invoice.telegram].filter(Boolean).join(' · ');
  }

  /** "12/11/2026 (Thursday)". */
  get pickupText(): string {
    const date = formatDate(this.invoice.pickup_date);
    return date ? `${date} (${weekdayName(this.invoice.pickup_date)})` : '';
  }

  get balance(): number {
    return this.invoice.balance ?? Math.round((this.invoice.total - this.invoice.deposit) * 100) / 100;
  }

  /** The rows are kept until the items change (a new list on every refresh would upset Angular's own checks). */
  private rowsCache: { key: string; rows: PaperRow[] } | null = null;

  /** The table rows: the items, then empty rows up to what the paper of this kind has (9 / 5 / 7). */
  get rows(): PaperRow[] {
    const items = this.invoice.items ?? [];
    const key = `${this.invoice.type}|${JSON.stringify(items)}`;
    if (this.rowsCache?.key !== key) {
      const count = Math.max(MAX_LINES[this.invoice.type] ?? 9, items.length);
      const rows = Array.from({ length: count }, (_, i): PaperRow => {
        const item = items[i];
        return item
          ? { n: i + 1, name: item.name, qty: String(item.qty), price: formatMoney(item.unit_price), amount: formatMoney(itemAmount(item)) }
          : { n: i + 1, name: '', qty: '', price: '', amount: '' };
      });
      this.rowsCache = { key, rows };
    }
    return this.rowsCache.rows;
  }
}
