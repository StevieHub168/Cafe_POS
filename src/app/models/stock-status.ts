import { Product } from './product.model';
import { StatusTone } from '../components/ui/status-badge.component';

export interface StockInfo {
  text: string;
  tone: StatusTone;
}

/**
 * The one place that decides how a product's stock is worded and coloured, so the Products table, the Products cards
 * and the Menu detail always agree:
 *   green  = in stock          amber = running low          red = out of stock
 *   grey   = single item (stock is not counted) or sold
 *   blue / amber = a single laptop that is booked / in repair
 */
export function stockInfo(product: Pick<Product, 'track_stock' | 'stock_quantity' | 'min_stock_level' | 'is_archived' | 'hold_status'>): StockInfo {
  // The only way a product gets archived is "Mark as sold" (Menu), so that is what it is called.
  if (product.is_archived) return { text: 'Sold', tone: 'neutral' };
  if (product.hold_status === 'booked') return { text: 'Booked', tone: 'info' };
  if (product.hold_status === 'repair') return { text: 'In repair', tone: 'warning' };
  if (!product.track_stock) return { text: 'Single item', tone: 'neutral' };
  if (product.stock_quantity <= 0) return { text: 'Out of stock', tone: 'danger' };
  if (product.stock_quantity <= product.min_stock_level) return { text: `Low stock · ${product.stock_quantity} left`, tone: 'warning' };
  return { text: `In stock · ${product.stock_quantity}`, tone: 'success' };
}
