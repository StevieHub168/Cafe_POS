export interface Category {
    id?: number;
    name: string;
    description?: string | null;
    /** Allowed brands for products in this category. null = free-text brand. */
    brands?: string[] | null;
    product_count?: number;
    created_at?: string;
}
