/** An extra price option, e.g. { label: '16GB / 512GB', price: 799 }. */
export interface ExtraPrice {
    label: string;
    price: number;
}

export interface Product {
    id?: number;
    sku: string;
    /** The laptop code the QR points at, e.g. "LP-0042" (made by the API from the id). */
    code?: string;
    name: string;
    category_id: number;
    category_name?: string;
    brand?: string;
    model?: string;
    /** Multi-line specs, e.g. "Chip M1\nRam 8GB | Storage 256GB". */
    description?: string | null;
    /** The main price. */
    selling_price: number;
    /** Other price options (variants, installment, ...). */
    extra_prices?: ExtraPrice[];
    /** Off = a single item (stock is always 1). On = count the stock and warn when it is low. */
    track_stock?: boolean | number;
    stock_quantity: number;
    min_stock_level: number;
    is_archived: boolean;
    /** A single laptop that is set aside: 'booked' (a customer booked it) or 'repair' (it is in repair). It is not on the Menu until it is free again. */
    hold_status?: 'booked' | 'repair' | null;
    /** The cover photo (the first one of `images`). */
    image_url?: string | null;
    /** All photos, cover first. */
    images?: string[];
    created_at?: string;
    updated_at?: string;
}
