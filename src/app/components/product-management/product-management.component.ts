import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, concatMap, finalize, from, map, Observable, of } from 'rxjs';
import { ProductService } from '../../services/product/product.service';
import { CategoryService } from '../../services/category/category.service';
import { ExtraPrice, Product } from '../../models/product/product.model';
import { Category } from '../../models/category/category.model';
import { StockInfo, stockInfo } from '../../models/stock-status/stock-status';
import { Booking } from '../../models/booking/booking.model';
import { PageHeaderComponent } from '../ui/page-header/page-header.component';
import { PaginationComponent } from '../ui/pagination/pagination.component';
import { SkeletonComponent } from '../ui/skeleton/skeleton.component';
import { StatusBadgeComponent } from '../ui/status-badge/status-badge.component';
import { BrandLogoComponent } from '../ui/brand-logo/brand-logo.component';
import { BookingFormComponent, BookingSaved } from '../bookings/booking-form.component';
import { LaptopQrDrawerComponent } from '../qr/laptop-qr-drawer.component';
import { ImgSrcPipe } from '../../pipes/img-src.pipe';
import { shrinkPhoto } from '../../utils/shrink-photo/shrink-photo';
import { todayIso } from '../../utils/dates/dates';
import { tookNote } from '../../utils/stock-notes/stock-notes';
import { TelegramNotifier } from '../../services/telegram-notifier/telegram-notifier.service';

// No SKU here: the API creates it automatically (e.g. MAC-007, WIN-ASU-005).
interface ProductForm {
  name: string;
  category_id: number | null;
  brand: string;
  model: string;
  description: string;
  selling_price: number | null;
  extra_prices: { label: string; price: number | null }[];
  track_stock: boolean;
  stock_quantity: number;
  min_stock_level: number;
  /** All photos; the first one is the cover. */
  images: string[];
}

function emptyForm(categoryId: number | null = null): ProductForm {
  return {
    name: '',
    category_id: categoryId,
    brand: '',
    model: '',
    description: '',
    selling_price: null,
    extra_prices: [],
    track_stock: false,   // new products start as a single item
    stock_quantity: 1,
    min_stock_level: 0,
    images: []
  };
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 8;

/** What the delete dialog shows, and what happens when you confirm. */
interface DeleteRequest {
  title: string;
  /** The thing being deleted, e.g. the product name. */
  name: string;
  /** A small grey line under the name (SKU, category...). */
  detail?: string;
  image?: string | null;
  /** A red notice, e.g. "The 3 products in it will be deleted too." */
  warning?: string;
  confirmLabel: string;
  failMessage: string;
  run: () => Observable<unknown>;
  /** Runs after a successful delete. */
  after?: () => void;
}

export type ProductView = 'table' | 'cards';
const VIEW_KEY = 'products_view';

@Component({
  selector: 'app-product-management',
  standalone: true,
  imports: [CommonModule, FormsModule, PageHeaderComponent, PaginationComponent, SkeletonComponent, StatusBadgeComponent, BrandLogoComponent, BookingFormComponent, LaptopQrDrawerComponent, ImgSrcPipe],
  templateUrl: './product-management.component.html',
  styleUrl: './product-management.component.css'
})
export class ProductManagementComponent implements OnInit {
  products: Product[] = [];
  categories: Category[] = [];
  /** False until the categories have come (or failed): "No categories yet." must not flash while they load. */
  categoriesLoaded = false;
  /** True while the grey shapes are shown (the first load). A reload after a save is quiet: the list stays on screen. */
  isLoading = true;
  searchQuery = '';
  /** The page on screen and how many products it holds. The whole list is already here, so the pages are cut in the browser. */
  page = 1;
  perPage = 20;
  selectedCategoryId: number | null = null;
  selectedBrand: string | null = null;
  errorMessage = '';
  successMessage = '';
  /** The list as a table or as cards (like the Menu). Remembered in this browser. */
  viewMode: ProductView = 'table';
  private successTimer: ReturnType<typeof setTimeout> | undefined;

  // Product drawer
  showProductModal = false;
  editingProductId: number | null = null;
  editingSku = '';
  isSubmitting = false;
  /** How many pictures are still being sent to the server (the Save buttons wait for 0). */
  pendingUploads = 0;
  /** Which photo is shown big in the preview. */
  activeImage = 0;
  /** Files uploaded in THIS form and not saved yet. If the form is cancelled, they are deleted from the server. */
  private readonly uploadedThisSession = new Set<string>();
  isDraggingImage = false;
  uploadError = '';
  formError = '';
  showMoreOptions = false;
  form: ProductForm = emptyForm();
  /** Once you click a category / brand yourself, we stop guessing them from the name. */
  private brandTouched = false;

  // Inline "+ New brand" inside the product drawer
  addingBrand = false;
  newBrandName = '';
  newBrandError = '';
  isAddingBrand = false;

  // Suggestions inside the drawer
  /** Products you already have that look like the name being typed (click one to copy it). */
  nameSuggestions: Product[] = [];
  /** Set after a copy: the name of the product it was copied from (shows the green notice + Undo). */
  copiedFrom: string | null = null;
  private copyUndo: ProductForm | null = null;
  /** After a copy the list stays hidden until the name is edited again. */
  private suggestionsOff = false;
  /** Spec snippets used before, offered under the Description box. */
  specSuggestions: string[] = [];
  specHint = '';
  descFocused = false;
  private descBlurTimer: ReturnType<typeof setTimeout> | undefined;
  /** Labels used on other prices before, offered under the "Other prices" rows. */
  labelSuggestions: string[] = [];
  activeLabelRow: number | null = null;
  private labelBlurTimer: ReturnType<typeof setTimeout> | undefined;
  /**
   * The grey example text in empty boxes. It is always taken from products you already made
   * (nothing is fixed text); with no products yet it is a plain label such as "Product name".
   */
  examples = {
    name: 'Product name',
    description: 'One spec per line',
    model: 'Model code',
    label: 'Label',
    priceHint: 'Need another price? Add a label and an amount for each.'
  };

  // Brand dialog (add / rename a brand inside a category)
  showBrandModal = false;
  brandCategory: Category | null = null;
  editingBrand: string | null = null;   // null = adding a new brand
  brandName = '';
  brandFormError = '';
  isSubmittingBrand = false;

  // Category dialog
  showCategoryModal = false;
  editingCategoryId: number | null = null;
  isSubmittingCategory = false;
  categoryFormError = '';
  categoryForm = { name: '', description: '' };

  constructor(
    private productService: ProductService,
    private categoryService: CategoryService,
    private route: ActivatedRoute,
    private router: Router,
    private telegram: TelegramNotifier
  ) { }

  ngOnInit(): void {
    this.viewMode = this.savedView();

    // Links such as /products?category=2&brand=Asus (from the Dashboard) open the list already filtered.
    this.route.queryParamMap.subscribe(params => {
      const category = Number(params.get('category'));
      if (Number.isInteger(category) && category > 0) {
        this.selectedCategoryId = category;
        this.selectedBrand = params.get('brand') || null;
      }
    });

    this.loadCategories();
    this.loadProducts(true);
  }

  /** Esc closes whichever dialog / drawer is open. */
  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.qrFor) return;                      // the QR drawer closes itself (and only itself)
    if (this.deleteRequest) this.cancelDelete();
    else if (this.bookingProduct) this.closeBooking();
    else if (this.showProductModal) this.closeProductModal();
    else if (this.showBrandModal) this.closeBrandModal();
    else if (this.showCategoryModal) this.closeCategoryModal();
  }

  /**
   * Ctrl/Cmd+V while the product drawer is open. Everything pasted is ADDED to the photos (a product can have several):
   *  - copied picture FILES  -> uploaded, one after another
   *  - copied image LINKS    -> added as they are (one link per line)
   * A link pasted into a text box (name, description...) is left alone, so normal typing still works.
   */
  @HostListener('document:paste', ['$event'])
  onDocumentPaste(event: ClipboardEvent): void {
    // (While the Book dialog is open, a pasted picture belongs to the booking - its own photo box takes it.)
    if (!this.showProductModal || this.bookingProduct) return;

    const files = Array.from(event.clipboardData?.files ?? []).filter(f => f.type.startsWith('image/'));
    if (files.length > 0) {
      event.preventDefault();
      this.addPhotoFiles(files);
      return;
    }

    if (this.isEditableTarget(event.target)) return;
    if (this.addPhotoLinks(event.clipboardData?.getData('text') ?? '')) {
      event.preventDefault();
    }
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
  }

  /** Adds every web link found in the text (one per line) as a photo. Returns false when there is no link at all. */
  private addPhotoLinks(raw: string): boolean {
    const links = raw.split(/\r?\n/).map(l => l.trim()).filter(l => /^https?:\/\/\S+$/i.test(l));
    if (links.length === 0) return false;

    this.uploadError = '';
    for (const link of links) {
      if (link.length > 500) {
        this.uploadError = 'That link is too long. Save the picture and upload the file instead.';
      } else if (!this.addPhoto(link)) {
        break;                                   // full: addPhoto already said so
      }
    }
    return true;
  }

  /** A picture could not be shown. A bad link is dropped; an uploaded file is kept (the server may just be slow). */
  onPreviewError(url: string): void {
    const index = this.form.images.indexOf(url);
    if (index === -1) return;                    // already handled (the preview and the thumbnail both report it)
    this.uploadError = 'A picture could not be loaded. Check the link, or upload the file.';
    if (!url.startsWith('/uploads/')) this.removePhotoAt(index, false);
  }

  // ---------- data ----------

  loadCategories(): void {
    this.categoryService.getCategories().subscribe({
      next: (categories) => {
        this.categories = categories;
        this.categoriesLoaded = true;
        // If the selected category was deleted, fall back to "All".
        if (this.selectedCategoryId !== null && !categories.some(c => c.id === this.selectedCategoryId)) {
          this.selectedCategoryId = null;
          this.selectedBrand = null;
        }
      },
      error: (err) => {
        this.errorMessage = this.messageFrom(err, 'Failed to load categories');
        this.categoriesLoaded = true;
      }
    });
  }

  /** `withShapes`: show the grey shapes meanwhile (the first load). */
  loadProducts(withShapes = false): void {
    if (withShapes) this.isLoading = true;
    this.productService.getAllProducts(true).subscribe({
      next: (products) => {
        this.products = products;
        this.isLoading = false;
        this.refreshExamples();             // new products become new examples and suggestions
      },
      error: (err) => {
        this.errorMessage = this.messageFrom(err, 'Failed to load products');
        this.isLoading = false;
      }
    });
  }

  private reload(): void {
    this.loadProducts();
    this.loadCategories();
  }

  private showSuccess(message: string, booking: Booking | null = null): void {
    this.successMessage = message;
    this.savedBooking = booking;
    clearTimeout(this.successTimer);
    this.successTimer = setTimeout(() => {
      this.successMessage = '';
      this.savedBooking = null;
    }, booking ? 10000 : 4000);               // after a booking the notice has a button in it, so it stays a bit longer
  }

  // ---------- the QR code of a laptop (a side drawer) ----------

  /** The QR drawer: the laptop it is open for (justSaved = it just got made), null = closed. */
  qrFor: { product: Product; justSaved: boolean } | null = null;

  /** From the Edit drawer: the QR of the laptop that is being edited. */
  openQr(): void {
    const product = this.products.find(p => p.id === this.editingProductId);
    if (product?.code) this.qrFor = { product, justSaved: false };
  }

  closeQr(): void {
    this.qrFor = null;
  }

  openLabels(): void {
    void this.router.navigateByUrl('/labels');
  }

  // ---------- Book: a customer reserves this laptop (its own dialog, opened from the Edit drawer) ----------

  /** The product the Book dialog is open for (null = closed). */
  bookingProduct: Product | null = null;
  /** The booking just saved: the notice offers "View bookings" for it. */
  savedBooking: Booking | null = null;
  @ViewChild(BookingFormComponent) private bookingForm?: BookingFormComponent;

  /** "YYYY-MM-DD" of today: the booking date a new booking starts with. */
  get today(): string {
    return todayIso();
  }

  openBooking(): void {
    const product = this.products.find(p => p.id === this.editingProductId);
    if (product) this.bookingProduct = product;
  }

  closeBooking(): void {
    if (this.bookingForm?.isSubmitting) return;       // saving: wait
    this.bookingProduct = null;
  }

  onBookingSaved(result: BookingSaved): void {
    this.bookingProduct = null;
    this.reload();                                    // the laptop is off the shelf now (one less, or set aside as Booked)
    this.telegram.send('booking', result.booking.id); // "Booking Details" with the laptop photo
    this.showSuccess([`Booked “${result.booking.product_name}”.`, tookNote(result.booking, 'booking')].filter(Boolean).join(' '), result.booking);
  }

  viewBookings(): void {
    this.router.navigateByUrl('/bookings');
  }

  get filteredProducts(): Product[] {
    const q = this.searchQuery.trim().toLowerCase();
    return this.products.filter(p => {
      const matchesSearch = !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.code || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q);
      const matchesCategory = this.selectedCategoryId === null || p.category_id === this.selectedCategoryId;
      const matchesBrand = this.selectedBrand === null || (p.brand || '').toLowerCase() === this.selectedBrand.toLowerCase();
      return matchesSearch && matchesCategory && matchesBrand;
    });
  }

  // ---------- the pages (cut in the browser: the whole list is here anyway, for the brand counts and the drawer) ----------

  /** The page on screen. A page past the last one (after a delete or a new search) shows the last one. */
  get currentPage(): number {
    return Math.min(this.page, Math.max(1, Math.ceil(this.filteredProducts.length / this.perPage)));
  }

  /** Only the products of the page on screen (the table and the cards show these). */
  get pagedProducts(): Product[] {
    const start = (this.currentPage - 1) * this.perPage;
    return this.filteredProducts.slice(start, start + this.perPage);
  }

  goToPage(page: number): void {
    this.page = page;
  }

  changePageSize(size: number): void {
    this.perPage = size;
    this.page = 1;
  }

  /** Something was typed in the search box: the first page of what matches. */
  onSearch(): void {
    this.page = 1;
  }

  /** The code ("LP-0042") of the laptop being edited ('' = none yet / a new laptop). */
  get editingCode(): string {
    return this.editingProductId === null ? '' : this.products.find(x => x.id === this.editingProductId)?.code ?? '';
  }

  /** The laptop being edited was sold (it is hidden from the Menu). */
  get editingIsSold(): boolean {
    return this.editingProductId !== null && !!this.products.find(p => p.id === this.editingProductId)?.is_archived;
  }

  /** The laptop being edited is a single laptop that is set aside: 'booked' or 'repair' (null = free). A booking or a repair holds it, not this page. */
  get editingHold(): 'booked' | 'repair' | null {
    if (this.editingProductId === null) return null;
    const product = this.products.find(p => p.id === this.editingProductId);
    return product && !product.is_archived ? product.hold_status ?? null : null;
  }

  isRestoring = false;

  /** Undoes "Mark as sold": the laptop is on the Menu again. The drawer stays open. */
  restoreProduct(): void {
    const id = this.editingProductId;
    if (id === null || this.isRestoring) return;
    this.isRestoring = true;
    this.formError = '';
    this.productService.updateProduct(id, { is_archived: false }).pipe(finalize(() => (this.isRestoring = false))).subscribe({
      next: () => {
        this.reload();
        this.showSuccess('Put back on the Menu.');
      },
      error: (err) => (this.formError = this.messageFrom(err, 'Could not put it back. Please try again.'))
    });
  }

  get activeProductCount(): number {
    return this.products.filter(p => !p.is_archived).length;
  }

  get selectedCategory(): Category | null {
    return this.categories.find(c => c.id === this.selectedCategoryId) ?? null;
  }

  get selectedCategoryDescription(): string {
    return this.selectedCategory?.description || '';
  }

  /** Brands of the category currently selected in the left panel (empty when it has no brand list). */
  get selectedCategoryBrands(): string[] {
    return this.selectedCategory?.brands ?? [];
  }

  selectCategory(id: number | null): void {
    this.selectedCategoryId = id;
    this.selectedBrand = null;
    this.page = 1;
  }

  selectBrand(brand: string | null): void {
    this.selectedBrand = this.selectedBrand === brand ? null : brand;
    this.page = 1;
  }

  brandCount(categoryId: number | undefined, brand: string): number {
    return this.products.filter(p =>
      !p.is_archived && p.category_id === categoryId && (p.brand || '').toLowerCase() === brand.toLowerCase()
    ).length;
  }

  /** Stock as one short line + a colour (the same wording and colours as the Menu). */
  stockInfo(product: Product): StockInfo {
    return stockInfo(product);
  }

  // ---------- table / cards ----------

  /** The stock line of a small card is plain coloured text, in the same colours as the badge: green / amber / red / grey. */
  stockTextClass(product: Product): string {
    const tone = this.stockInfo(product).tone;
    if (tone === 'success') return 'text-green-700';
    if (tone === 'warning') return 'text-amber-700';
    if (tone === 'danger') return 'text-red-700';
    return 'text-gray-600';
  }

  setView(mode: ProductView): void {
    this.viewMode = mode;
    try { localStorage.setItem(VIEW_KEY, mode); } catch { /* private window / blocked storage: just not remembered */ }
  }

  private savedView(): ProductView {
    try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; }
  }

  // ---------- the product drawer: category + brand ----------

  /** Allowed brands for the category chosen in the form ([] = free text). */
  get formBrands(): string[] {
    return this.categories.find(c => c.id === this.form.category_id)?.brands ?? [];
  }

  /** Keeps the brand valid for the chosen category (Mac -> Apple; Windows -> pick one). */
  onFormCategoryChange(): void {
    const brands = this.formBrands;
    if (brands.length === 1) {
      this.form.brand = brands[0];
    } else if (brands.length > 1 && !brands.includes(this.form.brand)) {
      this.form.brand = '';
    }
    this.refreshExamples();                 // examples follow the category (Mac examples vs Windows examples)
  }

  selectFormCategory(id: number | null): void {
    this.form.category_id = id;
    this.brandTouched = true;
    this.cancelAddBrand();
    this.onFormCategoryChange();
  }

  selectFormBrand(brand: string): void {
    this.form.brand = brand;
    this.brandTouched = true;
  }

  // "+ New brand" without leaving the form

  startAddBrand(): void {
    this.addingBrand = true;
    this.newBrandName = '';
    this.newBrandError = '';
    this.focusSoon('new-brand');
  }

  cancelAddBrand(): void {
    this.addingBrand = false;
    this.newBrandName = '';
    this.newBrandError = '';
  }

  confirmAddBrand(): void {
    const name = this.newBrandName.trim();
    const categoryId = this.form.category_id;
    if (!name) {
      this.newBrandError = 'Type the brand name.';
      return;
    }
    if (categoryId === null) return;

    this.isAddingBrand = true;
    this.newBrandError = '';
    this.categoryService.addBrand(categoryId, name).subscribe({
      next: (category) => {
        this.isAddingBrand = false;
        this.categories = this.categories.map(c => (c.id === category.id ? category : c));
        this.form.brand = name;
        this.brandTouched = true;
        this.cancelAddBrand();
      },
      error: (err) => {
        this.newBrandError = this.messageFrom(err, 'Could not add the brand.');
        this.isAddingBrand = false;
      }
    });
  }

  // ---------- the product drawer: fast entry helpers ----------

  onNameChange(value: string): void {
    this.form.name = value;
    this.suggestionsOff = false;          // typing again brings the suggestions back
    this.detectFromName(value);
    this.refreshNameSuggestions();
  }

  /**
   * Paste the name and the specs together, e.g.
   *   Asus TUF A15
   *   Ryzen 7-7450HS
   *   Ram 8GB DDR5 | M2 512 GB
   * The first line becomes the name and the other lines become the description.
   */
  onNamePaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    if (!text.includes('\n')) return; // one line: normal paste

    event.preventDefault();
    const lines = text.split(/\r?\n/).map(l => this.stripEmoji(l)).filter(Boolean);
    if (lines.length === 0) return;

    this.form.name = lines[0];
    const rest = lines.slice(1).join('\n');
    if (rest) {
      const current = this.form.description.trim();
      this.form.description = current ? `${current}\n${rest}` : rest;
    }
    this.detectFromName(this.form.name);
    this.refreshNameSuggestions();
  }

  /** Picks Mac / the brand for you when the name says it ("Asus TUF A15", "MacBook Air M1"). You can still change it. */
  private detectFromName(name: string): void {
    if (this.brandTouched || this.editingProductId !== null) return;
    const text = name.toLowerCase();

    for (const category of this.categories) {
      const brands = category.brands ?? [];
      if (brands.length < 2) continue;
      const brand = brands.find(b => new RegExp(`\\b${this.escapeRegExp(b.toLowerCase())}\\b`).test(text));
      if (brand) {
        this.form.category_id = category.id ?? null;
        this.form.brand = brand;
        this.refreshExamples();
        return;
      }
    }

    const mac = this.categories.find(c => c.name.toLowerCase() === 'mac');
    if (mac && /\b(macbook|imac|mac)\b/.test(text)) {
      this.form.category_id = mac.id ?? null;
      this.onFormCategoryChange();
    }
  }

  private escapeRegExp(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /** Removes emoji (e.g. a pasted "💭") so names stay clean. */
  private stripEmoji(text: string): string {
    return text.replace(/\p{Extended_Pictographic}/gu, '').replace(/️/g, '').trim();
  }

  private focusSoon(id: string): void {
    if (typeof document === 'undefined') return;
    setTimeout(() => document.getElementById(id)?.focus(), 60);
  }

  // ---------- suggestion 1: copy a product you already have ----------

  private resetSuggestions(): void {
    this.nameSuggestions = [];
    this.suggestionsOff = false;
    this.copiedFrom = null;
    this.copyUndo = null;
    this.specSuggestions = [];
    this.descFocused = false;
    this.labelSuggestions = [];
    this.activeLabelRow = null;
    this.refreshExamples();
  }

  /** Up to 4 existing products that match what is typed in Name (only while adding a new product). */
  private refreshNameSuggestions(): void {
    const q = this.form.name.trim().toLowerCase();
    if (this.editingProductId !== null || this.suggestionsOff || q.length < 2) {
      this.nameSuggestions = [];
      return;
    }

    const words = q.split(/\s+/).filter(Boolean);
    this.nameSuggestions = this.products
      .filter(p => !p.is_archived)
      .map(p => ({ product: p, name: p.name.toLowerCase(), text: `${p.name} ${p.brand ?? ''} ${p.model ?? ''}`.toLowerCase() }))
      .filter(x => words.every(w => x.text.includes(w)))
      .map(x => ({ product: x.product, rank: x.name === q ? 0 : x.name.startsWith(q) ? 1 : x.name.includes(q) ? 2 : 3 }))
      .sort((a, b) => a.rank - b.rank || a.product.name.localeCompare(b.product.name))
      .slice(0, 4)
      .map(x => x.product);
  }

  /** Copies an existing product into the form. Stock is NOT copied (a new unit), and neither is an uploaded photo file. */
  applySuggestion(product: Product): void {
    this.copyUndo = JSON.parse(JSON.stringify(this.form)) as ProductForm;

    // A photo we uploaded belongs to the original product (deleting that product deletes the file),
    // so only web links are shared. Photos already chosen for this product are kept.
    const original = product.images?.length ? product.images : (product.image_url ? [product.image_url] : []);
    const sharedLinks = original.filter(url => !url.startsWith('/uploads/'));

    this.form = {
      ...this.form,
      name: product.name,
      category_id: product.category_id,
      brand: product.brand || '',
      model: product.model || '',
      description: product.description || '',
      selling_price: Number(product.selling_price),
      extra_prices: (product.extra_prices ?? []).map(x => ({ label: x.label, price: Number(x.price) })),
      images: this.form.images.length > 0 ? this.form.images : sharedLinks
    };
    this.activeImage = 0;
    this.onFormCategoryChange();
    this.brandTouched = true;                 // it came from a real product: stop guessing the brand
    this.showMoreOptions = this.showMoreOptions || !!this.form.model || this.form.extra_prices.length > 0;
    this.copiedFrom = product.name;
    this.suggestionsOff = true;
    this.nameSuggestions = [];
    this.focusSoon('p-name');
  }

  undoCopy(): void {
    if (this.copyUndo) this.form = this.copyUndo;
    this.copyUndo = null;
    this.copiedFrom = null;
    this.suggestionsOff = false;
    this.refreshNameSuggestions();
  }

  // ---------- suggestion 2: specs you used before ----------

  /** "Cpu i7 GEN 13, DDR5 16 Gb" -> ["Cpu i7 GEN 13", "DDR5 16 Gb"] (a spec ends at a new line, "|" or ",") */
  private splitSpecs(text: string): string[] {
    return text.split(/[\n|,]/).map(s => s.trim()).filter(s => s.length >= 2 && s.length <= 40);
  }

  /**
   * Every spec your staff have used before, best first: used most and in the same category ranks higher, and when
   * two are equally common the one from the newest product wins. Archived (old) products are not used.
   * There is no built-in list: with no products yet there is nothing to suggest.
   */
  private specCandidates(): string[] {
    const found = new Map<string, { text: string; score: number; newest: number }>();
    const add = (text: string, score: number, productId: number): void => {
      const key = text.toLowerCase();
      const known = found.get(key);
      if (known) {
        known.score += score;
        known.newest = Math.max(known.newest, productId);
      } else {
        found.set(key, { text, score, newest: productId });
      }
    };

    for (const p of this.products) {
      if (!p.description || p.is_archived) continue;
      const sameCategory = p.category_id === this.form.category_id;
      this.splitSpecs(p.description).forEach(spec => add(spec, sameCategory ? 10 : 1, p.id ?? 0));
    }

    return [...found.values()]
      .sort((a, b) => b.score - a.score || b.newest - a.newest || a.text.localeCompare(b.text))
      .map(x => x.text);
  }

  /** Start of the spec being typed at the caret: just after the last new line, "|" or ",". */
  private specStart(before: string): number {
    return Math.max(before.lastIndexOf('\n'), before.lastIndexOf('|'), before.lastIndexOf(',')) + 1;
  }

  onDescFocus(box: HTMLTextAreaElement): void {
    clearTimeout(this.descBlurTimer);
    this.descFocused = true;
    this.updateSpecSuggestions(box);
  }

  onDescBlur(): void {
    // A short delay so a click on a suggestion still lands before the list disappears.
    this.descBlurTimer = setTimeout(() => (this.descFocused = false), 200);
  }

  updateSpecSuggestions(box: HTMLTextAreaElement | null): void {
    if (!box) {
      this.specSuggestions = [];
      return;
    }
    const caret = box.selectionStart ?? box.value.length;
    const before = box.value.slice(0, caret);
    const typed = before.slice(this.specStart(before)).trim().toLowerCase();

    const alreadyThere = new Set(this.splitSpecs(box.value).map(s => s.toLowerCase()));
    const options = this.specCandidates().filter(s => !alreadyThere.has(s.toLowerCase()));

    if (!typed) {
      // Empty line: offer one idea per kind (Ram, SSD, Core, GPU...) instead of five RAM sizes.
      const kinds = new Set<string>();
      const list: string[] = [];
      for (const spec of options) {
        const kind = spec.split(/\s+/)[0].toLowerCase();
        if (kinds.has(kind)) continue;
        kinds.add(kind);
        list.push(spec);
        if (list.length === 6) break;
      }
      this.specSuggestions = list;
      this.specHint = 'Common specs:';
      return;
    }

    const startsWith = options.filter(s => s.toLowerCase().startsWith(typed));
    const contains = options.filter(s => !s.toLowerCase().startsWith(typed) && s.toLowerCase().includes(typed));
    this.specSuggestions = [...startsWith, ...contains].slice(0, 6);
    this.specHint = 'Used before:';
  }

  /** Replaces the spec being typed with the chosen one. At the very end of the text it also starts a new line. */
  applySpecSuggestion(spec: string, box: HTMLTextAreaElement): void {
    const value = box.value;
    const caret = box.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const start = this.specStart(before);
    const spaces = /^\s*/.exec(before.slice(start))?.[0] ?? '';   // keep the space after "|" or ","

    const rest = value.slice(caret);
    const nextBreak = rest.search(/[\n|,]/);
    const end = nextBreak === -1 ? value.length : caret + nextBreak;
    const after = value.slice(end);
    // Keep the space that sits before a following "|" or ","; at the very end there is nothing to keep.
    const trailing = after === '' ? '' : (/\s*$/.exec(value.slice(caret, end))?.[0] ?? '');

    let text = value.slice(0, start) + spaces + spec + trailing + after;
    let newCaret = start + spaces.length + spec.length;   // right after the inserted spec
    if (after === '') {            // nothing after it: ready for the next spec on a new line
      text += '\n';
      newCaret += 1;
    }

    box.value = text;              // update the box right now so the caret can be placed correctly
    this.form.description = text;
    box.focus();
    box.setSelectionRange(newCaret, newCaret);
    this.updateSpecSuggestions(box);
  }

  // ---------- suggestion 3: other-price labels used before ----------

  /**
   * Labels used before on "other prices", best first: same category, used most, newest product.
   * Each comes with the price it had on its newest product. Archived products are not used.
   */
  private labelCandidates(): { text: string; price: number }[] {
    const found = new Map<string, { text: string; price: number; score: number; newest: number }>();
    for (const p of this.products) {
      if (p.is_archived) continue;
      const score = p.category_id === this.form.category_id ? 10 : 1;
      const productId = p.id ?? 0;
      for (const extra of p.extra_prices ?? []) {
        const text = (extra.label ?? '').trim();
        if (!text) continue;
        const known = found.get(text.toLowerCase());
        if (!known) {
          found.set(text.toLowerCase(), { text, price: Number(extra.price), score, newest: productId });
        } else {
          known.score += score;
          if (productId > known.newest) {
            known.newest = productId;
            known.price = Number(extra.price);
          }
        }
      }
    }
    return [...found.values()]
      .sort((a, b) => b.score - a.score || b.newest - a.newest || a.text.localeCompare(b.text))
      .map(({ text, price }) => ({ text, price }));
  }

  onLabelFocus(row: number, typed: string): void {
    clearTimeout(this.labelBlurTimer);
    this.activeLabelRow = row;
    this.refreshLabelSuggestions(typed);
  }

  onLabelInput(row: number, typed: string): void {
    this.activeLabelRow = row;
    this.refreshLabelSuggestions(typed);
  }

  onLabelBlur(): void {
    // A short delay so a click on a suggestion still lands before the list disappears.
    this.labelBlurTimer = setTimeout(() => {
      this.activeLabelRow = null;
      this.labelSuggestions = [];
    }, 200);
  }

  private refreshLabelSuggestions(typed: string): void {
    const q = typed.trim().toLowerCase();
    const row = this.activeLabelRow;
    const usedElsewhere = new Set(
      this.form.extra_prices.filter((_, i) => i !== row).map(r => r.label.trim().toLowerCase()).filter(Boolean)
    );
    const options = this.labelCandidates().map(c => c.text).filter(t => !usedElsewhere.has(t.toLowerCase()) && t.toLowerCase() !== q);

    const startsWith = q ? options.filter(t => t.toLowerCase().startsWith(q)) : options;
    const contains = q ? options.filter(t => !t.toLowerCase().startsWith(q) && t.toLowerCase().includes(q)) : [];
    this.labelSuggestions = [...startsWith, ...contains].slice(0, 6);
  }

  applyLabelSuggestion(label: string): void {
    const row = this.activeLabelRow;
    if (row === null || !this.form.extra_prices[row]) return;
    this.form.extra_prices[row].label = label;
    clearTimeout(this.labelBlurTimer);
    this.labelSuggestions = [];
    this.focusSoon(`xp-price-${row}`);       // the next thing to type is the amount
  }

  // ---------- examples taken from products you already made ----------

  /** Fills the grey example text from your own products: this category first, newest first. */
  private refreshExamples(): void {
    const category = this.form.category_id;
    const pool = this.products
      .filter(p => !p.is_archived)
      .sort((a, b) => Number(b.category_id === category) - Number(a.category_id === category) || (b.id ?? 0) - (a.id ?? 0));

    const named = pool.find(p => !!p.name);
    const described = pool.find(p => !!p.description);
    const modelled = pool.find(p => !!p.model);
    const label = this.labelCandidates()[0];
    const lines = this.splitLines(described?.description).slice(0, 2);

    this.examples = {
      name: named ? `e.g. ${named.name}` : 'Product name',
      description: lines.length > 0 ? `One spec per line, e.g.\n${lines.join('\n')}` : 'One spec per line',
      model: modelled ? `e.g. ${modelled.model}` : 'Model code',
      label: label ? `e.g. ${label.text}` : 'Label',
      priceHint: label
        ? `Need another price? Add a label and an amount, e.g. “${label.text}” → $${label.price.toFixed(2)}.`
        : 'Need another price? Add a label and an amount for each.'
    };
  }

  private splitLines(text: string | null | undefined): string[] {
    return (text ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  }

  /** The Track-stock switch. Off = single item (stock 1, no low-stock level). */
  setTrackStock(on: boolean): void {
    this.form.track_stock = on;
    if (!on) {
      this.form.stock_quantity = 1;
      this.form.min_stock_level = 0;
    }
  }

  // ---------- products ----------

  openAddProduct(): void {
    this.editingProductId = null;
    this.editingSku = '';
    this.form = emptyForm(this.selectedCategoryId ?? this.categories[0]?.id ?? null);
    this.onFormCategoryChange();
    if (this.selectedBrand && this.formBrands.includes(this.selectedBrand)) {
      this.form.brand = this.selectedBrand;               // adding while filtering by a brand -> preselect it
    }
    this.activeImage = 0;
    this.uploadedThisSession.clear();
    this.brandTouched = false;
    this.showMoreOptions = false;
    this.cancelAddBrand();
    this.formError = '';
    this.uploadError = '';
    this.resetSuggestions();
    this.showProductModal = true;
    this.focusSoon('p-name');
  }

  openEditProduct(product: Product): void {
    this.editingProductId = product.id ?? null;
    this.editingSku = product.sku;
    this.form = {
      name: product.name,
      category_id: product.category_id,
      brand: product.brand || '',
      model: product.model || '',
      description: product.description || '',
      selling_price: Number(product.selling_price),
      extra_prices: (product.extra_prices ?? []).map(x => ({ label: x.label, price: Number(x.price) })),
      track_stock: !!product.track_stock,
      stock_quantity: Number(product.stock_quantity),
      min_stock_level: Number(product.min_stock_level),
      images: product.images?.length ? [...product.images] : (product.image_url ? [product.image_url] : [])
    };
    this.activeImage = 0;
    this.uploadedThisSession.clear();
    this.brandTouched = true;
    // Optional things live in "More options": show them straight away when this product uses any.
    this.showMoreOptions = !!product.model || (product.extra_prices ?? []).length > 0 || !!product.track_stock;
    this.cancelAddBrand();
    this.formError = '';
    this.uploadError = '';
    this.resetSuggestions();
    this.showProductModal = true;
  }

  closeProductModal(): void {
    this.showProductModal = false;
    this.discardUnsavedUploads();          // cancelled: photos uploaded in this form are not needed any more
    this.resetSuggestions();
  }

  /** True when the last mouse press began INSIDE the window (for example: selecting text in a box). */
  private pressBeganInside = false;

  onBackdropPress(event: MouseEvent): void {
    this.pressBeganInside = event.target !== event.currentTarget;
  }

  /**
   * A click on the dark area closes the window. But if the press began inside the window and was let go on the dark
   * area (selecting text and going a little too far), the browser reports a click on the dark area too: that must not
   * close the window and throw away what was typed.
   */
  onBackdropClick(): void {
    const draggedOut = this.pressBeganInside;
    this.pressBeganInside = false;
    if (!draggedOut) this.closeProductModal();
  }

  /**
   * A plain Enter in a text box must not save: a stray Enter (the phone keyboard's "Go" key) saved the laptop and
   * closed the window. Ctrl/⌘ + Enter saves. The description keeps its new line and the buttons keep their Enter.
   */
  onFormEnter(event: Event): void {
    if ((event.target as HTMLElement | null)?.tagName === 'INPUT') event.preventDefault();
  }

  // ---------- product photos (up to 8; the first one is the cover) ----------

  readonly maxPhotos = MAX_PHOTOS;

  /** True while pictures are being sent to the server. */
  get isUploading(): boolean {
    return this.pendingUploads > 0;
  }

  /** The picture shown big in the preview. */
  get activePhoto(): string {
    return this.form.images[this.activeImage] ?? '';
  }

  get canAddPhotos(): boolean {
    return this.form.images.length + this.pendingUploads < MAX_PHOTOS;
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = ''; // lets the same file be chosen again later
    if (files.length > 0) this.addPhotoFiles(files);
  }

  /**
   * The "Take photo" button only exists on touch devices (a phone or tablet). A computer has no useful camera app to
   * open, and there the normal "Choose files" button is all you need.
   */
  get canTakePhoto(): boolean {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;
  }

  /**
   * A picture just taken with the phone camera. A phone photo is often bigger than the 5 MB limit, so it is made
   * smaller first (see shrinkPhoto), then it goes the same way as any other photo.
   */
  onCameraPhoto(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // lets the next shot be taken
    if (!file || !this.canAddPhotos) return;

    this.uploadError = '';
    this.pendingUploads++;           // shows "Uploading…" while the photo is being made smaller
    shrinkPhoto(file).then(photo => {
      this.pendingUploads--;
      if (this.showProductModal) this.addPhotoFiles([photo]);   // the drawer was closed meanwhile: drop it
    });
  }

  onImageDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingImage = true;
  }

  onImageDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDraggingImage = false;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.addPhotoFiles(files);
      return;
    }
    // Pictures dragged from a web page arrive as links.
    const links = event.dataTransfer?.getData('text/uri-list') || event.dataTransfer?.getData('text/plain') || '';
    this.addPhotoLinks(links);
  }

  /** Adds one photo address to the list. Returns false when it was not added (already there, or the product is full). */
  private addPhoto(url: string): boolean {
    if (this.form.images.includes(url)) return false;
    if (this.form.images.length >= MAX_PHOTOS) {
      this.uploadError = `Only ${MAX_PHOTOS} photos per product.`;
      return false;
    }
    this.form.images.push(url);
    this.activeImage = this.form.images.length - 1;      // show the one just added
    return true;
  }

  /** Checks the files, then uploads them one after another so they keep the order they were chosen in. */
  private addPhotoFiles(files: File[]): void {
    this.uploadError = '';
    const problems: string[] = [];
    const accepted: File[] = [];
    let room = MAX_PHOTOS - this.form.images.length - this.pendingUploads;

    for (const file of files) {
      if (!IMAGE_TYPES.includes(file.type)) {
        problems.push(`“${file.name}” is not a PNG, JPG, WEBP or GIF image.`);
      } else if (file.size > MAX_IMAGE_BYTES) {
        problems.push(`“${file.name}” is too big. The limit is 5 MB.`);
      } else if (room <= 0) {
        problems.push(`Only ${MAX_PHOTOS} photos per product.`);
        break;
      } else {
        accepted.push(file);
        room--;
      }
    }
    this.uploadError = [...new Set(problems)].join(' ');
    if (accepted.length === 0) return;

    this.pendingUploads += accepted.length;
    from(accepted).pipe(
      concatMap(file => this.productService.uploadImage(file).pipe(
        map(({ url }) => url as string | null),
        catchError(err => {
          problems.push(`“${file.name}”: ${this.messageFrom(err, 'Upload failed. Please try again.')}`);
          return of(null);
        }),
        finalize(() => this.pendingUploads--)
      ))
    ).subscribe({
      next: (url) => {
        if (!url) return;
        if (this.addPhoto(url)) this.uploadedThisSession.add(url);
        else this.discardUpload(url);                    // no room any more: do not leave the file behind
      },
      complete: () => (this.uploadError = [...new Set(problems)].join(' '))
    });
  }

  selectPhoto(index: number): void {
    this.activeImage = index;
  }

  /** Makes the chosen photo the cover (the first one, shown on the Menu and in the table). */
  makeCover(index: number): void {
    if (index <= 0 || index >= this.form.images.length) return;
    const [photo] = this.form.images.splice(index, 1);
    this.form.images.unshift(photo);
    this.activeImage = 0;
  }

  removePhoto(index: number): void {
    this.removePhotoAt(index, true);
  }

  private removePhotoAt(index: number, clearMessage: boolean): void {
    const [removed] = this.form.images.splice(index, 1);
    if (clearMessage) this.uploadError = '';
    this.activeImage = Math.max(0, Math.min(this.activeImage, this.form.images.length - 1));
    // A file uploaded in this form and never saved: delete it from the server now.
    if (removed && this.uploadedThisSession.has(removed)) this.discardUpload(removed);
  }

  /** Deletes an uploaded-but-never-saved file on the server. The server refuses if any product uses it. */
  private discardUpload(url: string): void {
    this.uploadedThisSession.delete(url);
    if (url.startsWith('/uploads/')) {
      this.productService.discardImage(url).subscribe({ error: () => undefined });
    }
  }

  /** The form was closed without saving: throw away everything uploaded in it. */
  private discardUnsavedUploads(): void {
    [...this.uploadedThisSession].forEach(url => this.discardUpload(url));
  }

  // ---------- other prices ----------

  addExtraPrice(): void {
    if (this.form.extra_prices.length < 10) {
      this.form.extra_prices.push({ label: '', price: null });
      this.focusSoon(`xp-label-${this.form.extra_prices.length - 1}`);   // the label box opens with its suggestions
    }
  }

  removeExtraPrice(index: number): void {
    this.form.extra_prices.splice(index, 1);
    this.activeLabelRow = null;
    this.labelSuggestions = [];
  }

  trackByIndex(index: number): number {
    return index;
  }

  /** Only the rows that are completely filled in (empty rows are dropped). */
  private cleanExtraPrices(): ExtraPrice[] {
    return this.form.extra_prices
      .filter(r => r.label.trim() !== '' && r.price !== null && String(r.price) !== '')
      .map(r => ({ label: r.label.trim(), price: Number(r.price) }));
  }

  /** Description on one line for the table, e.g. "Chip M1 · Ram 8GB | Storage 256GB". */
  oneLine(text: string | null | undefined): string {
    return (text ?? '').split('\n').map(l => l.trim()).filter(Boolean).join(' · ');
  }

  // ---------- save ----------

  /** addAnother = true -> after saving, keep the drawer open with a fresh form (same category + brand). */
  submitProduct(addAnother = false): void {
    if (this.isSubmitting || this.isUploading) return;

    if (!this.form.name.trim()) {
      this.formError = 'Please type the product name.';
      this.focusSoon('p-name');
      return;
    }
    if (this.form.category_id === null) {
      this.formError = 'Please choose a category.';
      return;
    }
    if (this.formBrands.length > 1 && !this.form.brand) {
      this.formError = 'Please choose a brand.';
      return;
    }
    if (!(Number(this.form.selling_price) > 0)) {
      this.formError = 'Please enter the price.';
      this.focusSoon('p-selling');
      return;
    }
    const halfFilled = this.form.extra_prices.findIndex(r => {
      const hasLabel = r.label.trim() !== '';
      const hasPrice = r.price !== null && String(r.price) !== '';
      return hasLabel !== hasPrice; // one is filled and the other is empty
    });
    if (halfFilled !== -1) {
      this.showMoreOptions = true; // the prices live in "More options": open it so the problem is visible
      this.formError = `Other price ${halfFilled + 1}: fill in both the label and the price (or remove the row).`;
      return;
    }

    const name = this.form.name.trim();
    const payload: Partial<Product> = {
      name,
      category_id: this.form.category_id,
      brand: this.form.brand.trim(),
      model: this.form.model.trim() || null as any,
      description: this.form.description.trim() || null,
      selling_price: Number(this.form.selling_price) || 0,
      extra_prices: this.cleanExtraPrices(),
      track_stock: this.form.track_stock,
      stock_quantity: this.form.track_stock ? Number(this.form.stock_quantity) || 0 : 1,
      min_stock_level: this.form.track_stock ? Number(this.form.min_stock_level) || 0 : 0,
      images: [...this.form.images]          // the API makes the first one the cover (image_url)
    };

    this.isSubmitting = true;
    this.formError = '';
    const isNew = this.editingProductId === null;

    const request$ = isNew
      ? this.productService.createProduct(payload)
      : this.productService.updateProduct(this.editingProductId as number, payload);

    request$.subscribe({
      next: (saved) => {
        this.isSubmitting = false;
        this.uploadedThisSession.clear();     // saved: these files now belong to the product
        if (isNew && addAnother) {
          this.showSuccess(`“${name}” added (${saved.sku}). Add the next one.`);
          this.startNextProduct();
        } else {
          this.showProductModal = false;
          this.showSuccess(isNew ? `“${name}” added (${saved.sku}).` : `“${name}” saved.`);
          // A new laptop has its QR code now: show it (to print the labels).
          if (isNew && saved.code) this.qrFor = { product: saved, justSaved: true };
        }
        this.reload();
      },
      error: (err) => {
        this.formError = this.messageFrom(err, 'Failed to save product.');
        // A complaint about stock / other prices / model is about something inside "More options": open it.
        if (/stock|other price|extra price|model/i.test(this.formError)) this.showMoreOptions = true;
        this.isSubmitting = false;
      }
    });
  }

  /** Fresh form for the next product, keeping the same category + brand. */
  private startNextProduct(): void {
    const { category_id, brand } = this.form;
    this.form = emptyForm(category_id);
    this.form.brand = brand;
    this.activeImage = 0;
    this.brandTouched = false;
    this.showMoreOptions = false;
    this.cancelAddBrand();
    this.formError = '';
    this.uploadError = '';
    this.resetSuggestions();
    this.focusSoon('p-name');
  }

  // ---------- delete: one confirmation dialog for products, categories and brands ----------

  /** What the dialog is asking about (null = closed). */
  deleteRequest: DeleteRequest | null = null;
  isDeleting = false;
  deleteError = '';

  private askToDelete(request: DeleteRequest): void {
    this.deleteError = '';
    this.deleteRequest = request;
    this.focusSoon('delete-cancel');
  }

  cancelDelete(): void {
    if (this.isDeleting) return;
    this.deleteRequest = null;
    this.deleteError = '';
  }

  confirmDeleteNow(): void {
    const request = this.deleteRequest;
    if (!request || this.isDeleting) return;
    this.isDeleting = true;
    this.deleteError = '';
    this.errorMessage = '';
    request.run().pipe(finalize(() => (this.isDeleting = false))).subscribe({
      next: () => {
        this.deleteRequest = null;
        request.after?.();
        this.reload();
        this.showSuccess(`Deleted ${request.name}`);
      },
      // Stay open and say why, so the message is where you are looking.
      error: (err) => (this.deleteError = this.messageFrom(err, request.failMessage))
    });
  }

  private productsText(count: number): string {
    return `${count} ${count === 1 ? 'product' : 'products'}`;
  }

  deleteProduct(product: Product): void {
    if (!product.id) return;
    const id = product.id;
    this.askToDelete({
      title: 'Delete this product?',
      name: product.name,
      detail: [product.sku, product.brand].filter(Boolean).join(' · '),
      image: product.image_url ?? null,
      confirmLabel: 'Delete product',
      failMessage: 'Failed to delete product.',
      run: () => this.productService.deleteProduct(id)
    });
  }

  // ---------- categories ----------

  openAddCategory(): void {
    this.editingCategoryId = null;
    this.categoryForm = { name: '', description: '' };
    this.categoryFormError = '';
    this.showCategoryModal = true;
  }

  openEditCategory(category: Category, event?: Event): void {
    event?.stopPropagation();
    this.editingCategoryId = category.id ?? null;
    this.categoryForm = { name: category.name, description: category.description || '' };
    this.categoryFormError = '';
    this.showCategoryModal = true;
  }

  closeCategoryModal(): void {
    this.showCategoryModal = false;
  }

  submitCategory(): void {
    const name = this.categoryForm.name.trim();
    if (!name) {
      this.categoryFormError = 'Category name is required.';
      return;
    }

    const payload = { name, description: this.categoryForm.description.trim() || null };
    this.isSubmittingCategory = true;
    this.categoryFormError = '';

    const request$ = this.editingCategoryId === null
      ? this.categoryService.createCategory(payload)
      : this.categoryService.updateCategory(this.editingCategoryId, payload);

    request$.subscribe({
      next: (saved) => {
        this.isSubmittingCategory = false;
        this.showCategoryModal = false;
        if (this.editingCategoryId === null && saved.id) {
          this.selectedCategoryId = saved.id; // jump to the new category
        }
        this.reload();
      },
      error: (err) => {
        this.categoryFormError = this.messageFrom(err, 'Failed to save category.');
        this.isSubmittingCategory = false;
      }
    });
  }

  deleteCategory(category: Category, event?: Event): void {
    event?.stopPropagation();
    if (!category.id) return;
    const id = category.id;
    const count = category.product_count ?? 0;
    const brands = category.brands?.length ?? 0;
    this.askToDelete({
      title: 'Delete this category?',
      name: category.name,
      detail: brands > 0 ? `${brands} ${brands === 1 ? 'brand' : 'brands'}` : '',
      warning: count > 0 ? `The ${this.productsText(count)} in it will be deleted too.` : '',
      confirmLabel: 'Delete category',
      failMessage: 'Failed to delete category.',
      run: () => this.categoryService.deleteCategory(id)
    });
  }

  // ---------- brands (left panel) ----------

  openAddBrand(category: Category): void {
    this.brandCategory = category;
    this.editingBrand = null;
    this.brandName = '';
    this.brandFormError = '';
    this.showBrandModal = true;
  }

  openEditBrand(category: Category, brand: string, event?: Event): void {
    event?.stopPropagation();
    this.brandCategory = category;
    this.editingBrand = brand;
    this.brandName = brand;
    this.brandFormError = '';
    this.showBrandModal = true;
  }

  closeBrandModal(): void {
    this.showBrandModal = false;
  }

  submitBrand(): void {
    const name = this.brandName.trim();
    const categoryId = this.brandCategory?.id;
    if (!name) {
      this.brandFormError = 'Brand name is required.';
      return;
    }
    if (categoryId === undefined) return;

    this.isSubmittingBrand = true;
    this.brandFormError = '';

    const renamedFrom = this.editingBrand;
    const request$ = renamedFrom === null
      ? this.categoryService.addBrand(categoryId, name)
      : this.categoryService.renameBrand(categoryId, renamedFrom, name);

    request$.subscribe({
      next: () => {
        this.isSubmittingBrand = false;
        this.showBrandModal = false;
        if (renamedFrom !== null && this.selectedBrand === renamedFrom) {
          this.selectedBrand = name; // keep the filter on the renamed brand
        }
        this.reload(); // a rename also changes the brand shown on its products
      },
      error: (err) => {
        this.brandFormError = this.messageFrom(err, 'Failed to save brand.');
        this.isSubmittingBrand = false;
      }
    });
  }

  deleteBrand(category: Category, brand: string, event?: Event): void {
    event?.stopPropagation();
    if (category.id === undefined) return;
    const categoryId = category.id;
    const count = this.brandCount(categoryId, brand);
    this.askToDelete({
      title: 'Delete this brand?',
      name: brand,
      detail: category.name,
      warning: count > 0 ? `The ${this.productsText(count)} of this brand will be deleted too.` : '',
      confirmLabel: 'Delete brand',
      failMessage: 'Failed to delete brand.',
      run: () => this.categoryService.deleteBrand(categoryId, brand),
      after: () => { if (this.selectedBrand === brand) this.selectedBrand = null; }
    });
  }

  private messageFrom(err: any, fallback: string): string {
    return err?.error?.error || fallback;
  }
}
