import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { BehaviorSubject, of, Subject, throwError } from 'rxjs';
import { ProductManagementComponent } from './product-management.component';
import { ProductService } from '../../services/product.service';
import { CategoryService } from '../../services/category.service';
import { BookingService } from '../../services/booking.service';
import { BookingFormComponent } from '../bookings/booking-form.component';
import { Category } from '../../models/category.model';
import { TelegramNotifier } from '../../services/telegram-notifier.service';
import { ConfigService } from '../../services/config.service';

const MAC: Category = { id: 1, name: 'Mac', brands: ['Apple'], product_count: 0 };
const WINDOWS: Category = { id: 2, name: 'Windows', brands: ['Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI'], product_count: 0 };

function pasteEvent(text: string): ClipboardEvent {
  return { clipboardData: { getData: () => text }, preventDefault: jasmine.createSpy('preventDefault') } as unknown as ClipboardEvent;
}

describe('ProductManagementComponent - product drawer', () => {
  // Sending to Telegram is replaced by a spy here: the real one is tested in telegram-notifier.service.spec.ts.
  let telegramApi: { send: jasmine.Spy };
  beforeEach(() => { telegramApi = { send: jasmine.createSpy('send') }; });

  let fixture: ComponentFixture<ProductManagementComponent>;
  let component: ProductManagementComponent;
  let products: { [k: string]: jasmine.Spy };
  let categories: { [k: string]: jasmine.Spy };
  let bookings: { [k: string]: jasmine.Spy };
  let queryParams: BehaviorSubject<ParamMap>;     // the "?category=..&brand=.." part of the address

  beforeEach(async () => {
    try { localStorage.removeItem('products_view'); } catch { /* ignore */ }
    queryParams = new BehaviorSubject<ParamMap>(convertToParamMap({}));
    products = {
      getAllProducts: jasmine.createSpy('getAllProducts').and.returnValue(of([])),
      createProduct: jasmine.createSpy('createProduct').and.callFake((p: any) => of({ id: 9, sku: 'WIN-ASU-005', ...p })),
      updateProduct: jasmine.createSpy('updateProduct').and.callFake((id: number, p: any) => of({ id, sku: 'WIN-ASU-004', ...p })),
      deleteProduct: jasmine.createSpy('deleteProduct').and.returnValue(of({ message: 'ok' })),
      uploadImage: jasmine.createSpy('uploadImage').and.returnValue(of({ url: '/uploads/x.png' })),
      discardImage: jasmine.createSpy('discardImage').and.returnValue(of({ message: 'Photo removed' })),
    };
    bookings = {
      createBooking: jasmine.createSpy('createBooking').and.callFake((b: any) => of({ id: 50, remaining_balance: b.full_price - b.deposit, ...b })),
    };
    categories = {
      getCategories: jasmine.createSpy('getCategories').and.returnValue(of([MAC, WINDOWS])),
      addBrand: jasmine.createSpy('addBrand').and.callFake((id: number, name: string) =>
        of({ ...WINDOWS, id, brands: [...(WINDOWS.brands ?? []), name] })),
    };

    await TestBed.configureTestingModule({
      imports: [ProductManagementComponent],
      providers: [
        { provide: ProductService, useValue: products },
        { provide: TelegramNotifier, useValue: telegramApi },
        { provide: ConfigService, useValue: { baseUrl: () => of({ url: 'https://thastore.example', fromSettings: true }) } },
        { provide: CategoryService, useValue: categories },
        { provide: BookingService, useValue: bookings },
        { provide: ActivatedRoute, useValue: { queryParamMap: queryParams } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => dom().textContent ?? '';

  describe('SKU is automatic', () => {
    it('has no SKU input when adding, and says the SKU is created for you', () => {
      component.openAddProduct();
      fixture.detectChanges();
      expect(dom().querySelector('#p-sku')).toBeNull();
      expect(text()).toContain('The SKU is created for you');
    });

    it('shows the existing SKU (read only) when editing', () => {
      component.openEditProduct({ id: 5, sku: 'WIN-ASU-004', name: 'Asus TUF A15', category_id: 2, brand: 'Asus', selling_price: 749,
        stock_quantity: 5, min_stock_level: 2, track_stock: 1, is_archived: false, extra_prices: [], model: 'TUF', description: 'x' } as any);
      fixture.detectChanges();
      expect(dom().querySelector('#p-sku')).toBeNull();
      expect(text()).toContain('WIN-ASU-004');
    });

    it('never sends a SKU when saving a new product', () => {
      component.openAddProduct();
      component.selectFormCategory(1);
      component.form.name = 'MacBook Air M1';
      component.form.selling_price = 799;
      component.submitProduct();
      const payload = products['createProduct'].calls.mostRecent().args[0];
      expect('sku' in payload).toBeFalse();
    });
  });

  describe('category and brand are one-click pills', () => {
    it('shows a pill per category and, for Windows, a pill per brand plus "+ New brand"', () => {
      component.openAddProduct();
      component.selectFormCategory(2);
      fixture.detectChanges();
      const pills = Array.from(dom().querySelectorAll('[role="radio"]')).map(e => (e.textContent ?? '').trim());
      expect(pills).toEqual(['Mac', 'Windows', 'Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI']);
      expect(text()).toContain('+ New brand');
    });

    it('Mac fills Apple in automatically', () => {
      component.openAddProduct();
      component.selectFormCategory(1);
      expect(component.form.brand).toBe('Apple');
    });

    it('switching category clears a brand that does not belong to it', () => {
      component.openAddProduct();
      component.selectFormCategory(2);
      component.selectFormBrand('Dell');
      component.selectFormCategory(1);
      expect(component.form.brand).toBe('Apple');
      component.selectFormCategory(2);
      expect(component.form.brand).toBe('');
    });
  });

  describe('paste name + specs together', () => {
    it('splits the first line into the name and the rest into the description, and removes emoji', () => {
      component.openAddProduct();
      const event = pasteEvent('Asus TUF A15 💭\nRyzen 7-7450HS \nRam 8GB DDR5 | M2 512 GB\nGPU 2050 4GB');
      component.onNamePaste(event);
      expect(event.preventDefault).toHaveBeenCalled();
      expect(component.form.name).toBe('Asus TUF A15');
      expect(component.form.description).toBe('Ryzen 7-7450HS\nRam 8GB DDR5 | M2 512 GB\nGPU 2050 4GB');
    });

    it('leaves a normal one-line paste alone', () => {
      component.openAddProduct();
      const event = pasteEvent('Asus TUF A15');
      component.onNamePaste(event);
      expect(event.preventDefault).not.toHaveBeenCalled();
    });

    it('adds to an existing description instead of replacing it', () => {
      component.openAddProduct();
      component.form.description = 'Backlit keyboard';
      component.onNamePaste(pasteEvent('MSI Cyborg 17" 144Hz\nCpu i7 GEN 13'));
      expect(component.form.description).toBe('Backlit keyboard\nCpu i7 GEN 13');
    });
  });

  describe('guesses the category and brand from the name', () => {
    beforeEach(() => component.openAddProduct());

    it('Asus TUF A15 -> Windows / Asus', () => {
      component.onNameChange('Asus TUF A15');
      expect(component.form.category_id).toBe(2);
      expect(component.form.brand).toBe('Asus');
    });

    it('MSI Cyborg 17" 144Hz -> Windows / MSI', () => {
      component.onNameChange('MSI Cyborg 17" 144Hz');
      expect(component.form.brand).toBe('MSI');
    });

    it('MacBook Air M1 -> Mac / Apple', () => {
      component.selectCategory(2);                // viewing Windows in the left panel...
      component.openAddProduct();                 // ...so the drawer starts on Windows, nothing chosen by hand
      expect(component.form.category_id).toBe(2);
      component.onNameChange('MacBook Air M1');
      expect(component.form.category_id).toBe(1);
      expect(component.form.brand).toBe('Apple');
    });

    it('does not guess when the name says nothing useful', () => {
      const before = component.form.category_id;
      component.onNameChange('Some laptop');
      expect(component.form.category_id).toBe(before);
    });

    it('stops guessing once you picked a brand yourself', () => {
      component.selectFormCategory(2);
      component.selectFormBrand('Dell');
      component.onNameChange('Asus TUF A15');
      expect(component.form.brand).toBe('Dell');
    });

    it('never changes the category while editing an existing product', () => {
      component.openEditProduct({ id: 5, sku: 'WIN-DEL-001', name: 'Dell Inspiron', category_id: 2, brand: 'Dell', selling_price: 599,
        stock_quantity: 1, min_stock_level: 0, track_stock: 0, is_archived: false, extra_prices: [] } as any);
      component.onNameChange('Asus Vivobook');
      expect(component.form.brand).toBe('Dell');
    });
  });

  describe('+ New brand without leaving the form', () => {
    beforeEach(() => {
      component.openAddProduct();
      component.selectFormCategory(2);
    });

    it('adds the brand and selects it', () => {
      component.startAddBrand();
      component.newBrandName = 'Lenovo';
      component.confirmAddBrand();
      expect(categories['addBrand']).toHaveBeenCalledWith(2, 'Lenovo');
      expect(component.form.brand).toBe('Lenovo');
      expect(component.formBrands).toContain('Lenovo');
      expect(component.addingBrand).toBeFalse();
    });

    it('shows the server message when the brand already exists', () => {
      categories['addBrand'].and.returnValue(throwError(() => ({ error: { error: 'Brand already exists' } })));
      component.startAddBrand();
      component.newBrandName = 'asus';
      component.confirmAddBrand();
      expect(component.newBrandError).toBe('Brand already exists');
      expect(component.addingBrand).toBeTrue();
    });

    it('asks for a name when it is empty', () => {
      component.startAddBrand();
      component.newBrandName = '   ';
      component.confirmAddBrand();
      expect(component.newBrandError).toBe('Type the brand name.');
      expect(categories['addBrand']).not.toHaveBeenCalled();
    });
  });

  describe('saving', () => {
    function fillValid(): void {
      component.openAddProduct();
      component.selectFormCategory(2);
      component.selectFormBrand('Asus');
      component.form.name = 'Asus TUF A15';
      component.form.selling_price = 749;
    }

    it('needs a name, a price and (for Windows) a brand', () => {
      component.openAddProduct();
      component.submitProduct();
      expect(component.formError).toBe('Please type the product name.');

      component.form.name = 'X';
      component.selectFormCategory(2);
      component.submitProduct();
      expect(component.formError).toBe('Please choose a brand.');

      component.selectFormBrand('Dell');
      component.submitProduct();
      expect(component.formError).toBe('Please enter the price.');
      expect(products['createProduct']).not.toHaveBeenCalled();
    });

    it('rejects a half-filled "other price" row', () => {
      fillValid();
      component.form.extra_prices = [{ label: '16GB', price: null }];
      component.submitProduct();
      expect(component.formError).toContain('Other price 1');
      expect(products['createProduct']).not.toHaveBeenCalled();
    });

    it('sends a clean payload: single item stock, trimmed extra prices, empty rows dropped', () => {
      fillValid();
      component.form.extra_prices = [{ label: ' Ram 16GB ', price: 799 }, { label: '', price: null }];
      component.submitProduct();
      const p = products['createProduct'].calls.mostRecent().args[0];
      expect(p.name).toBe('Asus TUF A15');
      expect(p.brand).toBe('Asus');
      expect(p.extra_prices).toEqual([{ label: 'Ram 16GB', price: 799 }]);
      expect(p.track_stock).toBeFalse();
      expect(p.stock_quantity).toBe(1);
      expect(p.min_stock_level).toBe(0);
    });

    it('sends the stock numbers only when tracking is on', () => {
      fillValid();
      component.setTrackStock(true);
      component.form.stock_quantity = 7;
      component.form.min_stock_level = 2;
      component.submitProduct();
      const p = products['createProduct'].calls.mostRecent().args[0];
      expect(p.track_stock).toBeTrue();
      expect(p.stock_quantity).toBe(7);
      expect(p.min_stock_level).toBe(2);
    });

    it('Save closes the drawer and confirms with the new SKU', () => {
      fillValid();
      component.submitProduct();
      expect(component.showProductModal).toBeFalse();
      expect(component.successMessage).toContain('WIN-ASU-005');
    });

    it('"Save & add another" keeps the drawer open with a fresh form, same category and brand', () => {
      fillValid();
      component.form.description = 'Ryzen 7';
      component.submitProduct(true);
      expect(products['createProduct']).toHaveBeenCalledTimes(1);
      expect(component.showProductModal).toBeTrue();
      expect(component.form.name).toBe('');
      expect(component.form.description).toBe('');
      expect(component.form.selling_price).toBeNull();
      expect(component.form.category_id).toBe(2);
      expect(component.form.brand).toBe('Asus');
      expect(component.successMessage).toContain('Add the next one');
    });

    it('only offers "Save & add another" when adding, not when editing', () => {
      component.openAddProduct();
      fixture.detectChanges();
      expect(text()).toContain('Save & add another');

      component.openEditProduct({ id: 5, sku: 'MAC-001', name: 'MacBook', category_id: 1, brand: 'Apple', selling_price: 1, stock_quantity: 1,
        min_stock_level: 0, track_stock: 0, is_archived: false, extra_prices: [] } as any);
      fixture.detectChanges();
      expect(text()).not.toContain('Save & add another');
    });

    it('editing updates the product and never sends a SKU', () => {
      component.openEditProduct({ id: 5, sku: 'MAC-001', name: 'MacBook', category_id: 1, brand: 'Apple', selling_price: 1, stock_quantity: 1,
        min_stock_level: 0, track_stock: 0, is_archived: false, extra_prices: [] } as any);
      component.form.selling_price = 999;
      component.submitProduct();
      const [id, payload] = products['updateProduct'].calls.mostRecent().args;
      expect(id).toBe(5);
      expect('sku' in payload).toBeFalse();
      expect(payload.selling_price).toBe(999);
    });

    it('Esc closes the drawer', () => {
      component.openAddProduct();
      component.onEscape();
      expect(component.showProductModal).toBeFalse();
    });
  });

  describe('the window does not save or close by accident', () => {
    function openFilled(): void {
      component.openAddProduct();
      component.selectFormCategory(2);
      component.selectFormBrand('Asus');
      component.form.name = 'Asus TUF A15';
      component.form.selling_price = 749;
      fixture.detectChanges();
    }
    const field = (selector: string) => dom().querySelector(selector) as HTMLElement;
    const backdrop = () => field('.drawer-backdrop');
    const pressKey = (target: HTMLElement, init: KeyboardEventInit = {}): KeyboardEvent => {
      const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...init });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    const mouse = (target: HTMLElement, type: 'mousedown' | 'click') => {
      target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    describe('Enter', () => {
      it('in a text box does not save (a stray Enter on a phone keyboard saved the laptop and closed the window)', () => {
        openFilled();
        const event = pressKey(field('#p-name'));
        expect(event.defaultPrevented).toBeTrue();       // the browser does not submit the form
        expect(products['createProduct']).not.toHaveBeenCalled();
        expect(component.showProductModal).toBeTrue();
      });

      it('in the price box does not save either', () => {
        openFilled();
        expect(pressKey(field('#p-selling')).defaultPrevented).toBeTrue();
      });

      it('in the description still makes a new line', () => {
        openFilled();
        expect(pressKey(field('#p-desc')).defaultPrevented).toBeFalse();
      });

      it('on a button is left alone (the button still gets pressed)', () => {
        openFilled();
        const cancel = [...dom().querySelectorAll('.drawer-panel button')].find(b => b.textContent?.trim() === 'Cancel') as HTMLElement;
        expect(pressKey(cancel).defaultPrevented).toBeFalse();
      });

      it('with Ctrl still saves (the tip at the bottom says so)', () => {
        openFilled();
        pressKey(field('#p-name'), { ctrlKey: true });
        expect(products['createProduct']).toHaveBeenCalledTimes(1);
        expect(component.showProductModal).toBeFalse();
      });

      it('with Cmd still saves', () => {
        openFilled();
        pressKey(field('#p-name'), { metaKey: true });
        expect(products['createProduct']).toHaveBeenCalledTimes(1);
      });
    });

    describe('the dark area around the window', () => {
      it('a click on it closes the window', () => {
        openFilled();
        mouse(backdrop(), 'mousedown');
        mouse(backdrop(), 'click');
        expect(component.showProductModal).toBeFalse();
      });

      it('a click with no press before it (a script or an assistive tool) closes it too', () => {
        openFilled();
        mouse(backdrop(), 'click');
        expect(component.showProductModal).toBeFalse();
      });

      it('pressing inside a box and letting go on the dark area (selecting text) does NOT close it, and nothing typed is lost', () => {
        openFilled();
        mouse(field('#p-name'), 'mousedown');            // the press begins in the name box...
        mouse(backdrop(), 'click');                      // ...and ends on the dark area: the browser reports a click there
        expect(component.showProductModal).toBeTrue();
        expect(component.form.name).toBe('Asus TUF A15');
      });

      it('after such a drag, the next real click on the dark area closes it', () => {
        openFilled();
        mouse(field('#p-name'), 'mousedown');
        mouse(backdrop(), 'click');
        expect(component.showProductModal).toBeTrue();

        mouse(backdrop(), 'mousedown');
        mouse(backdrop(), 'click');
        expect(component.showProductModal).toBeFalse();
      });

      it('a normal click inside the window does not close it, and the next click outside still does', () => {
        openFilled();
        mouse(field('#p-name'), 'mousedown');
        mouse(field('#p-name'), 'click');
        expect(component.showProductModal).toBeTrue();

        mouse(backdrop(), 'mousedown');
        mouse(backdrop(), 'click');
        expect(component.showProductModal).toBeFalse();
      });

      it('works the same when editing a laptop', () => {
        component.openEditProduct({ id: 5, sku: 'WIN-ASU-004', name: 'Asus TUF A15', category_id: 2, brand: 'Asus', selling_price: 749,
          stock_quantity: 1, min_stock_level: 0, track_stock: 0, is_archived: false, extra_prices: [], model: '', description: '' } as any);
        fixture.detectChanges();
        mouse(field('#p-name'), 'mousedown');
        mouse(backdrop(), 'click');
        expect(component.showProductModal).toBeTrue();
        expect(pressKey(field('#p-name')).defaultPrevented).toBeTrue();
        expect(products['updateProduct']).not.toHaveBeenCalled();
      });
    });
  });

  describe('photos: several per product, the first one is the cover', () => {
    const png = (name: string): File => new File(['x'], name, { type: 'image/png' });
    const pngs = (...names: string[]): File[] => names.map(png);

    const drop = (files: File[], uriList = ''): DragEvent => ({
      preventDefault: () => undefined,
      dataTransfer: { files, getData: (type: string) => (type === 'text/uri-list' ? uriList : '') },
    } as unknown as DragEvent);

    const pasteFiles = (files: File[]): ClipboardEvent =>
      ({ clipboardData: { files, getData: () => '' }, target: document.body, preventDefault: jasmine.createSpy('preventDefault') } as unknown as ClipboardEvent);

    const pasteText = (text: string, target: unknown = document.body): ClipboardEvent =>
      ({ clipboardData: { files: [], getData: () => text }, target, preventDefault: jasmine.createSpy('preventDefault') } as unknown as ClipboardEvent);

    beforeEach(() => {
      // every file gets its own address, like the real server (/uploads/<name>)
      products['uploadImage'].and.callFake((file: File) => of({ url: `/uploads/${file.name}` }));
      component.openAddProduct();
    });

    describe('adding', () => {
      it('uploads a dropped file and adds it', () => {
        const file = png('a.png');
        component.onImageDrop(drop([file]));
        expect(products['uploadImage']).toHaveBeenCalledWith(file);
        expect(component.form.images).toEqual(['/uploads/a.png']);
      });

      it('several files at once are all added, in the order they were chosen', () => {
        component.onImageDrop(drop(pngs('1.png', '2.png', '3.png')));
        expect(component.form.images).toEqual(['/uploads/1.png', '/uploads/2.png', '/uploads/3.png']);
        expect(products['uploadImage']).toHaveBeenCalledTimes(3);
      });

      it('a second photo is ADDED, it does not replace the first', () => {
        component.onImageDrop(drop([png('first.png')]));
        component.onImageDrop(drop([png('second.png')]));
        expect(component.form.images).toEqual(['/uploads/first.png', '/uploads/second.png']);
      });

      it('choosing files with the Choose files button adds them all', () => {
        const input = { files: pngs('x.png', 'y.png'), value: 'C:\\fakepath\\x.png' } as unknown as HTMLInputElement;
        component.onImageSelected({ target: input } as unknown as Event);
        expect(component.form.images).toEqual(['/uploads/x.png', '/uploads/y.png']);
        expect(input.value).toBe('');                       // so the same file can be chosen again
      });

      it('pasted picture files are added (one or many)', () => {
        const event = pasteFiles(pngs('p1.png', 'p2.png'));
        component.onDocumentPaste(event);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(component.form.images).toEqual(['/uploads/p1.png', '/uploads/p2.png']);
      });

      it('pasting does nothing while the drawer is closed', () => {
        component.closeProductModal();
        component.onDocumentPaste(pasteFiles(pngs('p1.png')));
        expect(products['uploadImage']).not.toHaveBeenCalled();
      });

      it('pasted image links are added, one per line', () => {
        const event = pasteText('https://a.example/1.jpg\nhttps://a.example/2.jpg\r\nnot a link\nhttps://a.example/3.jpg');
        component.onDocumentPaste(event);
        expect(event.preventDefault).toHaveBeenCalled();
        expect(component.form.images).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg']);
        expect(products['uploadImage']).not.toHaveBeenCalled();
      });

      it('files and links can be mixed', () => {
        component.onDocumentPaste(pasteText('https://a.example/1.jpg'));
        component.onImageDrop(drop([png('b.png')]));
        expect(component.form.images).toEqual(['https://a.example/1.jpg', '/uploads/b.png']);
      });

      it('leaves a link alone when it is pasted into a text box (it is just text there)', () => {
        const event = pasteText('https://example.com/a.png', document.createElement('input'));
        component.onDocumentPaste(event);
        expect(component.form.images).toEqual([]);
        expect(event.preventDefault).not.toHaveBeenCalled();
      });

      it('ignores ordinary text pasted outside a text box', () => {
        const event = pasteText('Asus TUF A15');
        component.onDocumentPaste(event);
        expect(component.form.images).toEqual([]);
        expect(event.preventDefault).not.toHaveBeenCalled();
      });

      it('adds the same photo only once', () => {
        component.onDocumentPaste(pasteText('https://a.example/1.jpg'));
        component.onDocumentPaste(pasteText('https://a.example/1.jpg'));
        expect(component.form.images).toEqual(['https://a.example/1.jpg']);
      });

      it('refuses a link over 500 characters with a clear message', () => {
        component.onDocumentPaste(pasteText('https://a.com/' + 'x'.repeat(500)));
        expect(component.form.images).toEqual([]);
        expect(component.uploadError).toContain('too long');
      });

      it('pictures dragged in from a web page (they arrive as links) are added', () => {
        component.onImageDrop(drop([], 'https://example.com/dragged.png'));
        expect(component.form.images).toEqual(['https://example.com/dragged.png']);
      });

      it('shows each new photo big, right away', () => {
        component.onImageDrop(drop(pngs('1.png', '2.png')));
        expect(component.activeImage).toBe(1);
        expect(component.activePhoto).toBe('/uploads/2.png');
      });
    });

    describe('problems', () => {
      it('refuses a file that is not a picture, and names it', () => {
        component.onImageDrop(drop([new File(['x'], 'a.pdf', { type: 'application/pdf' })]));
        expect(component.uploadError).toContain('a.pdf');
        expect(component.uploadError).toContain('PNG, JPG, WEBP or GIF');
        expect(products['uploadImage']).not.toHaveBeenCalled();
      });

      it('refuses a file over 5 MB, and names it', () => {
        const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' });
        component.onImageDrop(drop([big]));
        expect(component.uploadError).toContain('big.png');
        expect(component.uploadError).toContain('5 MB');
        expect(products['uploadImage']).not.toHaveBeenCalled();
      });

      it('one bad file does not stop the good ones', () => {
        component.onImageDrop(drop([new File(['x'], 'notes.pdf', { type: 'application/pdf' }), png('good.png')]));
        expect(component.form.images).toEqual(['/uploads/good.png']);
        expect(component.uploadError).toContain('notes.pdf');
      });

      it('stops at 8 photos and says so', () => {
        component.onImageDrop(drop(Array.from({ length: 10 }, (_, i) => png(`${i}.png`))));
        expect(component.form.images.length).toBe(8);
        expect(products['uploadImage']).toHaveBeenCalledTimes(8);
        expect(component.uploadError).toContain('Only 8 photos');
        expect(component.canAddPhotos).toBeFalse();
      });

      it('links over the limit are refused too', () => {
        component.onDocumentPaste(pasteText(Array.from({ length: 10 }, (_, i) => `https://a.example/${i}.jpg`).join('\n')));
        expect(component.form.images.length).toBe(8);
        expect(component.uploadError).toContain('Only 8 photos');
      });

      it('a failed upload is reported with its file name, and the others still go through', () => {
        products['uploadImage'].and.callFake((file: File) =>
          file.name === 'bad.png' ? throwError(() => ({ error: { error: 'Boom' } })) : of({ url: `/uploads/${file.name}` }));
        component.onImageDrop(drop(pngs('1.png', 'bad.png', '3.png')));
        expect(component.form.images).toEqual(['/uploads/1.png', '/uploads/3.png']);
        expect(component.uploadError).toContain('bad.png');
        expect(component.uploadError).toContain('Boom');
        expect(component.isUploading).toBeFalse();
      });

      it('the Save buttons wait while pictures are still being sent', () => {
        const waiting = new Subject<{ url: string }>();
        products['uploadImage'].and.returnValue(waiting);
        component.selectFormCategory(1);
        component.form.name = 'MacBook';
        component.form.selling_price = 1;

        component.onImageDrop(drop(pngs('slow.png')));
        expect(component.isUploading).toBeTrue();
        component.submitProduct();
        expect(products['createProduct']).not.toHaveBeenCalled();

        waiting.next({ url: '/uploads/slow.png' });
        waiting.complete();
        expect(component.isUploading).toBeFalse();
        component.submitProduct();
        expect(products['createProduct']).toHaveBeenCalledTimes(1);
      });

      it('a bad link (the preview cannot load it) is dropped, only that one', () => {
        component.onDocumentPaste(pasteText('https://a.example/1.jpg\nhttps://a.example/bad.jpg\nhttps://a.example/3.jpg'));
        component.onPreviewError('https://a.example/bad.jpg');
        component.onPreviewError('https://a.example/bad.jpg');           // the preview and the thumbnail both report it
        expect(component.form.images).toEqual(['https://a.example/1.jpg', 'https://a.example/3.jpg']);
        expect(component.uploadError).toContain('could not be loaded');
      });

      it('an uploaded photo that cannot load is kept (the server may just be slow), with a warning', () => {
        component.onImageDrop(drop([png('keep.png')]));
        component.onPreviewError('/uploads/keep.png');
        expect(component.form.images).toEqual(['/uploads/keep.png']);
        expect(component.uploadError).toContain('could not be loaded');
      });
    });

    describe('organising', () => {
      beforeEach(() => component.onImageDrop(drop(pngs('a.png', 'b.png', 'c.png'))));

      it('Make cover moves a photo to the front and shows it', () => {
        component.makeCover(2);
        expect(component.form.images).toEqual(['/uploads/c.png', '/uploads/a.png', '/uploads/b.png']);
        expect(component.activeImage).toBe(0);
      });

      it('Make cover on the cover (or a wrong position) changes nothing', () => {
        component.makeCover(0);
        component.makeCover(9);
        expect(component.form.images).toEqual(['/uploads/a.png', '/uploads/b.png', '/uploads/c.png']);
      });

      it('removing a photo takes only that one, and the preview moves to a neighbour', () => {
        component.selectPhoto(2);
        component.removePhoto(2);
        expect(component.form.images).toEqual(['/uploads/a.png', '/uploads/b.png']);
        expect(component.activePhoto).toBe('/uploads/b.png');
      });

      it('removing the last photo empties the preview', () => {
        component.removePhoto(2);
        component.removePhoto(1);
        component.removePhoto(0);
        expect(component.form.images).toEqual([]);
        expect(component.activePhoto).toBe('');
      });

      it('selecting a thumbnail shows that photo', () => {
        component.selectPhoto(1);
        expect(component.activePhoto).toBe('/uploads/b.png');
      });
    });

    describe('what is on screen', () => {
      const button = (label: string): HTMLButtonElement | undefined =>
        Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').trim() === label) as HTMLButtonElement | undefined;

      it('has no "Drag a photo here / paste..." sentence and no image-link box', () => {
        fixture.detectChanges();
        expect(text()).not.toContain('Drag a photo here');
        expect(text()).not.toContain('paste a photo');
        expect(text()).not.toContain('Ctrl/⌘ + V');
        expect(dom().querySelector('#p-image')).toBeNull();
        expect(dom().querySelector('input[placeholder*="image link"]')).toBeNull();
      });

      it('with no photo: "No photo yet" and a Choose files button that accepts several files', () => {
        fixture.detectChanges();
        expect(text()).toContain('No photo yet');
        expect(text()).toContain('Choose files');
        expect(dom().querySelector('img[alt="Photo preview"]')).toBeNull();
        expect(dom().querySelector('#p-file')?.hasAttribute('multiple')).toBeTrue();
        expect(dom().querySelector('ul[aria-label="All photos"]')).toBeNull();
      });

      it('with one photo: a large preview, no thumbnail strip, an Add photos button', () => {
        component.form.images = ['https://example.com/laptop.jpg'];
        fixture.detectChanges();
        const img = dom().querySelector('img[alt="Photo preview"]') as HTMLImageElement;
        expect(img.getAttribute('src')).toBe('https://example.com/laptop.jpg');
        expect(img.classList).toContain('object-contain');                 // the whole picture, never cropped
        expect(img.parentElement?.classList).toContain('h-48');            // a big preview, not a thumbnail
        expect(dom().querySelector('ul[aria-label="All photos"]')).toBeNull();
        expect(text()).toContain('Add photos');
        expect(text()).toContain('1 / 8');
        expect(button('Remove photo')).toBeDefined();
        expect(button('Make cover')).toBeUndefined();                      // it already is the cover
      });

      it('an uploaded photo previews through the API address', () => {
        component.form.images = ['/uploads/abc.png'];
        fixture.detectChanges();
        const src = (dom().querySelector('img[alt="Photo preview"]') as HTMLImageElement).getAttribute('src') ?? '';
        expect(src).toMatch(/\/uploads\/abc\.png$/);
        expect(src).not.toBe('/uploads/abc.png');                           // the server address is in front
      });

      it('with several photos: a thumbnail for each, the first marked Cover, and a counter', () => {
        component.form.images = ['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg'];
        fixture.detectChanges();
        const thumbs = Array.from(dom().querySelectorAll('ul[aria-label="All photos"] > li'));
        expect(thumbs.length).toBe(3);
        expect(thumbs[0].textContent).toContain('Cover');
        expect(thumbs[1].textContent).not.toContain('Cover');
        expect(text()).toContain('3 / 8');
      });

      it('clicking a thumbnail shows that photo big', () => {
        component.form.images = ['https://a.example/1.jpg', 'https://a.example/2.jpg'];
        fixture.detectChanges();
        (dom().querySelector('button[aria-label="Show photo 2"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect((dom().querySelector('img[alt="Photo preview"]') as HTMLImageElement).getAttribute('src')).toBe('https://a.example/2.jpg');
        expect(dom().querySelector('button[aria-label="Show photo 2"]')?.getAttribute('aria-current')).toBe('true');
      });

      it('Make cover on a non-cover photo works from the screen', () => {
        component.form.images = ['https://a.example/1.jpg', 'https://a.example/2.jpg'];
        component.selectPhoto(1);
        fixture.detectChanges();
        button('Make cover')!.click();
        fixture.detectChanges();
        expect(component.form.images).toEqual(['https://a.example/2.jpg', 'https://a.example/1.jpg']);
        expect(button('Make cover')).toBeUndefined();
      });

      it('the small ✕ on a thumbnail removes that photo', () => {
        component.form.images = ['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg'];
        fixture.detectChanges();
        (dom().querySelector('button[aria-label="Remove photo 2"]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(component.form.images).toEqual(['https://a.example/1.jpg', 'https://a.example/3.jpg']);
      });

      it('"Remove photo" removes the one shown in the preview; the preview empties after the last one', () => {
        component.form.images = ['https://a.example/1.jpg'];
        fixture.detectChanges();
        button('Remove photo')!.click();
        fixture.detectChanges();
        expect(text()).toContain('No photo yet');
      });

      it('shows "Uploading…" over the preview, with how many are left', () => {
        component.pendingUploads = 3;
        fixture.detectChanges();
        expect(text()).toContain('Uploading');
        expect(text()).toContain('(3 left)');
      });

      it('locks the add button when the product is full', async () => {
        component.form.images = Array.from({ length: 8 }, (_, i) => `https://a.example/${i}.jpg`);
        fixture.detectChanges();
        await fixture.whenStable();
        expect((dom().querySelector('#p-file') as HTMLInputElement).disabled).toBeTrue();
        expect(text()).toContain('8 / 8');
      });

      it('highlights the photo area while files are dragged over it', () => {
        component.onImageDragOver({ preventDefault: () => undefined } as unknown as DragEvent);
        fixture.detectChanges();
        expect(dom().querySelector('.border-primary-400')).not.toBeNull();
        component.isDraggingImage = false;
        fixture.detectChanges();
        expect(dom().querySelector('.border-primary-400')).toBeNull();
      });

      it('shows a problem under the preview', () => {
        component.uploadError = '“a.pdf” is not a PNG, JPG, WEBP or GIF image.';
        fixture.detectChanges();
        expect(dom().querySelector('[role="alert"]')?.textContent).toContain('a.pdf');
      });
    });

    describe('editing and saving', () => {
      it('opens an existing product with all its photos, cover first', () => {
        component.openEditProduct({ ...catalog[0], images: ['https://a.example/1.jpg', 'https://a.example/2.jpg'] });
        expect(component.form.images).toEqual(['https://a.example/1.jpg', 'https://a.example/2.jpg']);
        expect(component.activeImage).toBe(0);
      });

      it('opens an older product that only has a cover as a list of one', () => {
        component.openEditProduct({ ...catalog[0], images: undefined, image_url: 'https://a.example/only.jpg' });
        expect(component.form.images).toEqual(['https://a.example/only.jpg']);
      });

      it('opens a product with no photo as an empty list', () => {
        component.openEditProduct({ ...catalog[2], images: [], image_url: null });
        expect(component.form.images).toEqual([]);
      });

      it('saves the whole list (cover first) and no longer sends image_url', () => {
        component.selectFormCategory(1);
        component.form.name = 'MacBook';
        component.form.selling_price = 1;
        component.onImageDrop(drop(pngs('1.png', '2.png')));
        component.makeCover(1);
        component.submitProduct();
        const payload = products['createProduct'].calls.mostRecent().args[0];
        expect(payload.images).toEqual(['/uploads/2.png', '/uploads/1.png']);
        expect('image_url' in payload).toBeFalse();
      });

      it('editing a product and removing all its photos saves an empty list', () => {
        component.openEditProduct({ ...catalog[0], images: ['https://a.example/1.jpg'] });
        component.removePhoto(0);
        component.submitProduct();
        expect(products['updateProduct'].calls.mostRecent().args[1].images).toEqual([]);
      });

      it('starts with no photos for "Save & add another"', () => {
        component.selectFormCategory(1);
        component.form.name = 'MacBook';
        component.form.selling_price = 1;
        component.onImageDrop(drop(pngs('1.png')));
        component.submitProduct(true);
        expect(component.form.images).toEqual([]);
        expect(component.activeImage).toBe(0);
      });
    });

    describe('unsaved uploads are cleaned up (nothing is left behind on the server)', () => {
      it('removing a photo uploaded in this form deletes its file right away', () => {
        component.onImageDrop(drop(pngs('a.png', 'b.png')));
        component.removePhoto(0);
        expect(products['discardImage']).toHaveBeenCalledTimes(1);
        expect(products['discardImage']).toHaveBeenCalledWith('/uploads/a.png');
      });

      it('cancelling the form deletes every file uploaded in it', () => {
        component.onImageDrop(drop(pngs('a.png', 'b.png', 'c.png')));
        component.closeProductModal();
        expect(products['discardImage']).toHaveBeenCalledTimes(3);
        ['a.png', 'b.png', 'c.png'].forEach(name => expect(products['discardImage']).toHaveBeenCalledWith(`/uploads/${name}`));
      });

      it('Esc also cancels and cleans up', () => {
        component.onImageDrop(drop(pngs('a.png')));
        component.onEscape();
        expect(component.showProductModal).toBeFalse();
        expect(products['discardImage']).toHaveBeenCalledWith('/uploads/a.png');
      });

      it('saving keeps the files: nothing is deleted, not even by a later cancel', () => {
        component.selectFormCategory(1);
        component.form.name = 'MacBook';
        component.form.selling_price = 1;
        component.onImageDrop(drop(pngs('a.png')));
        component.submitProduct(true);              // saved, drawer stays open for the next product
        component.closeProductModal();
        expect(products['discardImage']).not.toHaveBeenCalled();
      });

      it('a photo that was already saved on the product is never discarded by the form (the server removes it when you save)', () => {
        component.openEditProduct({ ...catalog[0], images: ['/uploads/saved.png', 'https://a.example/1.jpg'] });
        component.removePhoto(0);
        component.closeProductModal();
        expect(products['discardImage']).not.toHaveBeenCalled();
      });

      it('links are never discarded (there is no file)', () => {
        component.onDocumentPaste(pasteText('https://a.example/1.jpg'));
        component.removePhoto(0);
        component.onDocumentPaste(pasteText('https://a.example/2.jpg'));
        component.closeProductModal();
        expect(products['discardImage']).not.toHaveBeenCalled();
      });

      it('a file that arrives when the product is already full is deleted, not left behind', () => {
        const slow = new Subject<{ url: string }>();
        products['uploadImage'].and.returnValue(slow);
        component.onImageDrop(drop(pngs('late.png')));
        component.form.images = Array.from({ length: 8 }, (_, i) => `https://a.example/${i}.jpg`);   // filled meanwhile
        slow.next({ url: '/uploads/late.png' });
        slow.complete();
        expect(component.form.images.length).toBe(8);
        expect(products['discardImage']).toHaveBeenCalledWith('/uploads/late.png');
      });

      it('opening the form again starts clean (old uploads are not carried over)', () => {
        component.onImageDrop(drop(pngs('a.png')));
        component.openAddProduct();
        component.closeProductModal();
        expect(products['discardImage']).not.toHaveBeenCalled();
      });

      it('a failed delete is ignored (the file just stays; nothing breaks)', () => {
        products['discardImage'].and.returnValue(throwError(() => ({ error: { error: 'nope' } })));
        component.onImageDrop(drop(pngs('a.png')));
        expect(() => component.closeProductModal()).not.toThrow();
      });
    });

    describe('the table', () => {
      const row = (id: number, images: string[]): any => ({ ...catalog[0], id, sku: `S${id}`, name: `Row ${id}`, images, image_url: images[0] ?? null });

      it('shows the cover thumbnail and a count badge only when there are several photos', () => {
        products['getAllProducts'].and.returnValue(of([row(1, ['https://a.example/1.jpg']), row(2, ['https://a.example/1.jpg', 'https://a.example/2.jpg', 'https://a.example/3.jpg']), row(3, [])]));
        component.loadProducts();
        component.closeProductModal();
        fixture.detectChanges();

        const rows = Array.from(dom().querySelectorAll('tbody tr')) as HTMLElement[];
        expect(rows[0].querySelector('span[title$="photos"]')).toBeNull();
        expect(rows[1].querySelector('span[title="3 photos"]')?.textContent?.trim()).toBe('3');
        expect(rows[1].querySelector('img')?.getAttribute('src')).toBe('https://a.example/1.jpg');   // the cover
        expect(rows[2].querySelector('img')).toBeNull();
      });
    });
  });

  describe('take a photo with the phone camera (touch devices only)', () => {
    const cameraInput = () => dom().querySelector('#p-camera') as HTMLInputElement | null;
    const open = (touchDevice: boolean) => {
      spyOnProperty(component, 'canTakePhoto', 'get').and.returnValue(touchDevice);
      component.openAddProduct();
      fixture.detectChanges();
    };
    /** What the browser sends when the camera app returns a picture. */
    const shoot = (files: File[]) => {
      const input = { files, value: 'C:\\fakepath\\shot' };
      component.onCameraPhoto({ target: input } as unknown as Event);
      return input;
    };
    const until = async (done: () => boolean) => {
      for (let i = 0; i < 100 && !done(); i++) await new Promise(resolve => setTimeout(resolve, 30));
      expect(done()).toBeTrue();
    };
    const bigShot = async () => {
      const canvas = document.createElement('canvas');
      canvas.width = 3200;
      canvas.height = 2400;
      canvas.getContext('2d')!.fillRect(0, 0, 3200, 2400);
      const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'));
      return new File([blob], 'IMG_4021.png', { type: 'image/png' });
    };

    it('is decided by the device: only a touch screen (pointer: coarse) gets the button', () => {
      expect(component.canTakePhoto).toBe(window.matchMedia('(pointer: coarse)').matches);
    });

    it('is not on a computer (no button, no camera input)', () => {
      open(false);
      expect(cameraInput()).toBeNull();
      expect(text()).not.toContain('Take photo');
      expect(dom().querySelector('#p-file')).not.toBeNull();            // "Choose files" is still there
    });

    it('is on a phone: a "Take photo" button that opens the back camera for one picture', () => {
      open(true);
      expect(text()).toContain('Take photo');
      const input = cameraInput()!;
      expect(input.getAttribute('capture')).toBe('environment');
      expect(input.accept).toBe('image/*');
      expect(input.multiple).toBeFalse();
      expect(dom().querySelector('label[for="p-camera"]')).not.toBeNull();
      expect(dom().querySelector('#p-file')).not.toBeNull();            // choosing from the gallery still works
    });

    it('a picture taken is made smaller, uploaded and added as the newest photo', async () => {
      open(true);
      shoot([await bigShot()]);
      await until(() => component.form.images.length === 1);
      const sent = products['uploadImage'].calls.mostRecent().args[0] as File;
      expect(sent.type).toBe('image/jpeg');
      expect(sent.name).toMatch(/^camera-\d+\.jpg$/);
      expect(component.form.images).toEqual(['/uploads/x.png']);
      expect(component.pendingUploads).toBe(0);
    });

    it('shows "Uploading..." while the photo is being made smaller', async () => {
      open(true);
      shoot([await bigShot()]);
      expect(component.isUploading).toBeTrue();
      await until(() => !component.isUploading);
    });

    it('if the photo cannot be made smaller, the original is uploaded as it is', async () => {
      open(true);
      const odd = new File([new Uint8Array(2000)], 'odd.jpg', { type: 'image/jpeg' });
      shoot([odd]);
      await until(() => products['uploadImage'].calls.count() === 1);
      expect(products['uploadImage']).toHaveBeenCalledWith(odd);
    });

    it('can take another one straight away (the field is cleared)', async () => {
      open(true);
      const input = shoot([await bigShot()]);
      expect(input.value).toBe('');
      await until(() => !component.isUploading);
    });

    it('closing the camera without taking a picture does nothing', () => {
      open(true);
      shoot([]);
      expect(component.pendingUploads).toBe(0);
      expect(products['uploadImage']).not.toHaveBeenCalled();
    });

    it('is switched off once the product has 8 photos', async () => {
      open(true);
      // (upload-style paths: a dead web link would be dropped from the form when its preview fails to load)
      component.form.images = Array.from({ length: 8 }, (_, i) => `/uploads/${i}.png`);
      fixture.detectChanges();
      expect(cameraInput()!.disabled).toBeTrue();
      shoot([await bigShot()]);
      expect(products['uploadImage']).not.toHaveBeenCalled();
      expect(component.form.images.length).toBe(8);
    });

    it('a photo that finishes after the drawer was closed is dropped (nothing is uploaded)', async () => {
      open(true);
      shoot([await bigShot()]);
      component.closeProductModal();
      await until(() => component.pendingUploads === 0);
      expect(products['uploadImage']).not.toHaveBeenCalled();
    });
  });

  describe('Book: a customer reserves this laptop (from the Edit drawer)', () => {
    const flush = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };
    const bookDialog = () => dom().querySelector('[aria-label="Book this laptop"]') as HTMLElement | null;
    const drawerEl = () => dom().querySelector('[aria-label="Edit product"]') as HTMLElement | null;
    const bookButton = () => Array.from(drawerEl()?.querySelectorAll('button') ?? []).find(b => b.textContent!.trim() === 'Book') as HTMLButtonElement | undefined;
    const bookingForm = () => fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
    const noticeButton = (label: string) => Array.from(dom().querySelectorAll('[role="status"] button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
    const key = (name: string) => { document.dispatchEvent(new KeyboardEvent('keydown', { key: name })); fixture.detectChanges(); };

    /** Opens the Edit drawer of MacBook Air M1 (799, one other price) and clicks Book. */
    const openBooking = async () => {
      products['getAllProducts'].and.returnValue(of(catalog));
      component.loadProducts();
      component.openEditProduct(catalog[0]);
      fixture.detectChanges();
      bookButton()!.click();
      await flush();
    };
    const fillAndSave = () => {
      Object.assign(bookingForm().form, { phone: '011968240', deposit: 200, booking_date: '2026-11-08', pickup_date: '2026-11-12' });
      bookingForm().submit();
      fixture.detectChanges();
    };

    it('the Edit drawer has a Book button; the Add drawer does not (there is nothing to book yet)', async () => {
      component.openAddProduct();
      fixture.detectChanges();
      expect(dom().querySelector('[aria-label="Add product"]')).not.toBeNull();
      expect(Array.from(dom().querySelectorAll('[aria-label="Add product"] button')).some(b => b.textContent!.trim() === 'Book')).toBeFalse();
      component.closeProductModal();
      products['getAllProducts'].and.returnValue(of(catalog));
      component.loadProducts();
      component.openEditProduct(catalog[0]);
      fixture.detectChanges();
      expect(bookButton()).toBeTruthy();
    });

    it('is a SIDE panel from the right edge (like the drawer under it), not a centered popup', async () => {
      await openBooking();
      const backdrop = bookDialog()!.parentElement!;
      expect(backdrop.classList).toContain('justify-end');
      expect(backdrop.classList).not.toContain('items-center');
      expect(bookDialog()!.classList).toContain('h-full');
      expect(bookDialog()!.classList).toContain('max-w-lg');
      expect(bookDialog()!.classList).not.toContain('rounded-xl');
    });

    it('opens its own dialog on top of the drawer, and the drawer stays open underneath', async () => {
      await openBooking();
      expect(bookDialog()).not.toBeNull();
      expect(bookDialog()!.textContent).toContain('Book this laptop');
      expect(bookDialog()!.textContent).toContain('MacBook Air M1');
      expect(component.showProductModal).toBeTrue();
      expect(drawerEl()).not.toBeNull();
      expect(bookDialog()!.parentElement!.className).toContain('z-[55]');
    });

    it('is a booking form already filled in from that product: name, link and price', async () => {
      await openBooking();
      expect(bookingForm().product?.id).toBe(1);
      expect((dom().querySelector('#b-product') as HTMLInputElement).value).toBe('MacBook Air M1');
      expect((dom().querySelector('#b-price') as HTMLInputElement).value).toBe('799');
      expect(bookingForm().form.product_id).toBe(1);
    });

    it('offers the other prices of the product as buttons', async () => {
      await openBooking();
      const options = Array.from(bookDialog()!.querySelectorAll('[aria-label="Prices of this product"] button')).map(b => b.textContent!.replace(/\s+/g, ' ').trim());
      expect(options).toEqual(['Normal price · $799', '16GB / 512GB · $949']);
    });

    it('has what a booking needs: phone, Telegram, deposit, dates, photos and status', async () => {
      await openBooking();
      for (const id of ['#b-phone', '#b-telegram', '#b-price', '#b-deposit', '#b-booked', '#b-pickup', '#b-status']) {
        expect(bookDialog()!.querySelector(id)).not.toBeNull();
      }
      expect(bookDialog()!.querySelector('app-photo-upload')).not.toBeNull();
    });

    it('saving makes the booking for that product, closes the dialog, and the drawer is still there', async () => {
      await openBooking();
      fillAndSave();
      expect(bookings['createBooking']).toHaveBeenCalledTimes(1);
      const sent = bookings['createBooking'].calls.mostRecent().args[0];
      expect(sent.product_id).toBe(1);
      expect(sent.product_name).toBe('MacBook Air M1');
      expect(sent.full_price).toBe(799);
      expect(sent.deposit).toBe(200);
      expect(bookDialog()).toBeNull();
      expect(drawerEl()).not.toBeNull();
    });

    it('then says "Booked ..." with View bookings (and no Copy details)', async () => {
      await openBooking();
      fillAndSave();
      const notice = dom().querySelector('[role="status"]') as HTMLElement;
      expect(notice.textContent).toContain('Booked “MacBook Air M1”.');
      expect(notice.textContent).not.toContain('Copy details');
      expect(noticeButton('View bookings')).toBeTruthy();
    });

    it('"View bookings" goes to the Bookings page', async () => {
      await openBooking();
      const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.returnValue(Promise.resolve(true));
      fillAndSave();
      noticeButton('View bookings').click();
      expect(go).toHaveBeenCalledOnceWith('/bookings');
    });

    it('the ✕, Cancel, Esc and the dark background close only the dialog (the drawer stays)', async () => {
      const close = async (how: () => void) => {
        await openBooking();
        how();
        fixture.detectChanges();
        expect(bookDialog()).toBeNull();
        expect(drawerEl()).not.toBeNull();
      };
      await close(() => (bookDialog()!.querySelector('button[aria-label="Close"]') as HTMLButtonElement).click());
      await close(() => Array.from(bookDialog()!.querySelectorAll('button')).find(b => b.textContent!.trim() === 'Cancel')!.click());
      await close(() => key('Escape'));
      await close(() => (bookDialog()!.parentElement as HTMLElement).click());
      expect(bookings['createBooking']).not.toHaveBeenCalled();
    });

    it('a second Esc then closes the drawer', async () => {
      await openBooking();
      key('Escape');
      expect(drawerEl()).not.toBeNull();
      key('Escape');
      expect(drawerEl()).toBeNull();
    });

    it('a click inside the dialog does not close it', async () => {
      await openBooking();
      bookDialog()!.click();
      fixture.detectChanges();
      expect(bookDialog()).not.toBeNull();
    });

    it('cannot be closed while the booking is being saved', async () => {
      await openBooking();
      const pending = new Subject<any>();
      bookings['createBooking'].and.returnValue(pending);
      fillAndSave();
      key('Escape');
      component.closeBooking();
      expect(bookDialog()).not.toBeNull();
      pending.next({ id: 50, product_name: 'MacBook Air M1', full_price: 799, deposit: 200, booking_date: '2026-11-09', pickup_date: '2026-11-12', status: 'booked' });
      pending.complete();
      fixture.detectChanges();
      expect(bookDialog()).toBeNull();
    });

    it('a failed save stays open and says why', async () => {
      await openBooking();
      bookings['createBooking'].and.returnValue(throwError(() => ({ error: { error: 'Deposit cannot be more than the full price' } })));
      fillAndSave();
      expect(bookDialog()).not.toBeNull();
      expect(bookDialog()!.textContent).toContain('Deposit cannot be more than the full price');
    });

    it('a picture pasted while the dialog is open goes to the BOOKING, not to the product behind it', async () => {
      await openBooking();
      const imagesBefore = [...component.form.images];
      const event = new Event('paste', { cancelable: true }) as ClipboardEvent;
      Object.defineProperty(event, 'clipboardData', { value: { files: [new File([new Uint8Array(10)], 'receipt.png', { type: 'image/png' })] } });
      document.dispatchEvent(event);
      fixture.detectChanges();
      expect(products['uploadImage']).toHaveBeenCalledTimes(1);          // once: by the booking's photo box
      expect(bookingForm().form.images).toEqual(['/uploads/x.png']);
      expect(component.form.images).toEqual(imagesBefore);
    });

    it('closing the dialog without saving throws away a receipt that was uploaded in it', async () => {
      await openBooking();
      const box = fixture.debugElement.query(By.css('app-photo-upload')).componentInstance;
      box.onFilesSelected({ target: { files: [new File([new Uint8Array(10)], 'receipt.png', { type: 'image/png' })], value: '' } } as unknown as Event);
      fixture.detectChanges();
      key('Escape');
      expect(products['discardImage']).toHaveBeenCalledOnceWith('/uploads/x.png');
    });

    it('does nothing when the product is no longer in the list', async () => {
      products['getAllProducts'].and.returnValue(of(catalog));
      component.loadProducts();
      component.openEditProduct(catalog[0]);
      fixture.detectChanges();
      component.products = [];
      component.openBooking();
      fixture.detectChanges();
      expect(bookDialog()).toBeNull();
    });
  });

  describe('a laptop that was sold (hidden from the Menu): Put back on the Menu', () => {
    const flush = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };
    const drawerEl = () => dom().querySelector('[aria-label="Edit product"]') as HTMLElement | null;
    const soldNotice = () => Array.from(dom().querySelectorAll('[role="status"]')).find(e => e.textContent!.includes('This laptop was sold')) as HTMLElement | undefined;
    const putBack = () => Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Put back on the Menu' || b.textContent!.trim() === 'Please wait...') as HTMLButtonElement;
    const bookButton = () => Array.from(drawerEl()?.querySelectorAll('button') ?? []).find(b => b.textContent!.trim() === 'Book');
    const SOLD = () => catalog[4];                     // the archived one (id 5)

    const openFor = async (p: any) => {
      products['getAllProducts'].and.returnValue(of(catalog));
      component.loadProducts();
      component.openEditProduct(p);
      fixture.detectChanges();
      await flush();
    };

    it('shows a notice in the Edit drawer, with the button to put it back', async () => {
      await openFor(SOLD());
      expect(soldNotice()!.textContent).toContain('It is hidden from the Menu.');
      expect(putBack()).toBeTruthy();
      expect(component.editingIsSold).toBeTrue();
    });

    it('a laptop that is for sale has no such notice', async () => {
      await openFor(catalog[0]);
      expect(soldNotice()).toBeUndefined();
      expect(component.editingIsSold).toBeFalse();
    });

    it('the Add drawer never has it', async () => {
      component.openAddProduct();
      fixture.detectChanges();
      expect(soldNotice()).toBeUndefined();
      expect(component.editingIsSold).toBeFalse();
    });

    it('a sold laptop cannot be booked (no Book button), a laptop for sale can', async () => {
      await openFor(SOLD());
      expect(bookButton()).toBeUndefined();
      component.closeProductModal();
      await openFor(catalog[0]);
      expect(bookButton()).toBeTruthy();
    });

    it('"Put back on the Menu" makes it not archived, reloads the list, says so, and keeps the drawer open', async () => {
      await openFor(SOLD());
      const loadsBefore = products['getAllProducts'].calls.count();
      products['getAllProducts'].and.returnValue(of(catalog.map(c => c.id === 5 ? { ...c, is_archived: false } : c)));
      putBack().click();
      await flush();
      expect(products['updateProduct']).toHaveBeenCalledOnceWith(5, { is_archived: false });
      expect(products['getAllProducts'].calls.count()).toBeGreaterThan(loadsBefore);
      expect(text()).toContain('Put back on the Menu.');
      expect(drawerEl()).not.toBeNull();
      expect(soldNotice()).toBeUndefined();                   // it is for sale again
      expect(component.editingIsSold).toBeFalse();
    });

    it('when it fails it says why and can be tried again', async () => {
      await openFor(SOLD());
      products['updateProduct'].and.returnValue(throwError(() => ({ error: { error: 'Product not found' } })));
      putBack().click();
      await flush();
      expect(component.formError).toBe('Product not found');
      expect(text()).toContain('Product not found');
      expect(putBack().disabled).toBeFalse();
      expect(soldNotice()).toBeDefined();
    });

    it('a failure with no reason says so in plain words', async () => {
      await openFor(SOLD());
      products['updateProduct'].and.returnValue(throwError(() => new Error('offline')));
      putBack().click();
      await flush();
      expect(component.formError).toBe('Could not put it back. Please try again.');
    });

    it('while it is being done the button is off and a second click does nothing', async () => {
      await openFor(SOLD());
      const pending = new Subject<any>();
      products['updateProduct'].and.returnValue(pending);
      putBack().click();
      fixture.detectChanges();
      expect(putBack().disabled).toBeTrue();
      expect(putBack().textContent!.trim()).toBe('Please wait...');
      component.restoreProduct();
      expect(products['updateProduct']).toHaveBeenCalledTimes(1);
      pending.next({});
      pending.complete();
      await flush();
      expect(component.isRestoring).toBeFalse();
    });

    it('does nothing when no laptop is being edited', async () => {
      component.restoreProduct();
      expect(products['updateProduct']).not.toHaveBeenCalled();
    });
  });

  describe('a single laptop that is booked or in repair (set aside by a booking or a repair)', () => {
    const flush = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };
    const drawerEl = () => dom().querySelector('[aria-label="Edit product"]') as HTMLElement | null;
    const holdNote = () => drawerEl()?.querySelector('[data-hold-note]') as HTMLElement | null;
    const bookButton = () => Array.from(drawerEl()?.querySelectorAll('button') ?? []).find(b => b.textContent!.trim() === 'Book');
    const BOOKED = () => ({ ...catalog[2], hold_status: 'booked' });      // MacBook Pro 14 M3: a single laptop
    const REPAIRING = () => ({ ...catalog[2], hold_status: 'repair' });

    const openFor = async (p: any, all: any[] = [p]) => {
      products['getAllProducts'].and.returnValue(of(all));
      component.loadProducts();
      component.openEditProduct(p);
      fixture.detectChanges();
      await flush();
    };

    it('the Edit drawer says it is booked, and that the booking gives it back', async () => {
      await openFor(BOOKED());
      expect(holdNote()!.textContent).toContain('This laptop is booked. It is not on the Menu until the booking is picked up or cancelled.');
      expect(component.editingHold).toBe('booked');
    });

    it('the Edit drawer says it is in repair, and that fixing it gives it back', async () => {
      await openFor(REPAIRING());
      expect(holdNote()!.textContent).toContain('This laptop is in repair. It is back on the Menu when the repair is fixed.');
      expect(component.editingHold).toBe('repair');
    });

    it('has no Book button (it cannot be booked again), and no "Put back on the Menu" (a booking or repair gives it back)', async () => {
      await openFor(BOOKED());
      expect(bookButton()).toBeUndefined();
      expect(Array.from(dom().querySelectorAll('button')).some(b => b.textContent!.trim() === 'Put back on the Menu')).toBeFalse();
    });

    it('a free laptop has no such note and keeps its Book button; the Add drawer has no note', async () => {
      await openFor(catalog[2]);
      expect(holdNote()).toBeNull();
      expect(component.editingHold).toBeNull();
      expect(bookButton()).toBeTruthy();
      component.closeProductModal();
      component.openAddProduct();
      fixture.detectChanges();
      expect(dom().querySelector('[aria-label="Add product"]')).not.toBeNull();
      expect(dom().querySelector('[data-hold-note]')).toBeNull();
      expect(component.editingHold).toBeNull();
    });

    it('is shown as "Booked" / "In repair" in the list (not "Single item")', async () => {
      products['getAllProducts'].and.returnValue(of([BOOKED(), { ...REPAIRING(), id: 30, sku: 'X-30', name: 'Other laptop' }]));
      component.loadProducts();
      fixture.detectChanges();
      const t = text().replace(/\s+/g, ' ');
      expect(t).toContain('Booked');
      expect(t).toContain('In repair');
      expect(t).not.toContain('Single item');
    });

    it('booking a free laptop from here reads the products again and says what happened', async () => {
      const withPhoto = catalog.map((p, i) => (i === 2 ? { ...p, image_url: '/uploads/free.png' } : p));   // (it goes to Telegram with its photo)
      products['getAllProducts'].and.returnValue(of(withPhoto));
      component.loadProducts();
      component.openEditProduct(withPhoto[2]);
      fixture.detectChanges();
      bookings['createBooking'].and.callFake((b: any) => of({ id: 50, remaining_balance: b.full_price - b.deposit, ...b, stock_held: true, product_track_stock: false }));
      bookButton()!.click();
      await flush();
      const before = products['getAllProducts'].calls.count();
      const form = fixture.debugElement.query(By.directive(BookingFormComponent)).componentInstance as BookingFormComponent;
      Object.assign(form.form, { phone: '011968240', deposit: 200, booking_date: '2026-11-08', pickup_date: '2026-11-12' });
      form.submit();
      fixture.detectChanges();
      expect(products['getAllProducts'].calls.count()).toBe(before + 1);
      expect((dom().querySelector('[role="status"]')?.textContent ?? '').replace(/\s+/g, ' ')).toContain('The laptop is set aside as Booked and left the Menu.');
      expect(telegramApi.send).toHaveBeenCalledOnceWith('booking', 50);       // "Booking Details" with the laptop photo, to Telegram
    });
  });

  describe('the QR code of a laptop (a side drawer) and Print labels', () => {
    const flush = async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); fixture.detectChanges(); };
    const qrDrawer = () => dom().querySelector('app-laptop-qr-drawer [role="dialog"]') as HTMLElement | null;
    const editDrawer = () => dom().querySelector('[aria-label="Edit product"]') as HTMLElement | null;
    const qrButton = () => editDrawer()?.querySelector('[data-action="qr"]') as HTMLButtonElement | null;
    const CODED = () => ({ ...catalog[2], code: 'LP-0003' });

    const openFor = async (p: any) => {
      products['getAllProducts'].and.returnValue(of([p]));
      component.loadProducts();
      component.openEditProduct(p);
      fixture.detectChanges();
      await flush();
    };
    const addWindows = () => {
      component.openAddProduct();
      component.selectFormCategory(2);
      component.selectFormBrand('Asus');
      component.form.name = 'Asus TUF A15';
      component.form.selling_price = 749;
    };

    it('the Edit drawer shows the code next to the SKU, and a QR button', async () => {
      await openFor(CODED());
      expect(dom().querySelector('[data-edit-code]')!.textContent).toBe('LP-0003');
      expect(qrButton()).not.toBeNull();
      expect(component.editingCode).toBe('LP-0003');
    });

    it('a product without a code (not made by the new API yet) has no QR button', async () => {
      await openFor(catalog[2]);
      expect(qrButton()).toBeNull();
      expect(dom().querySelector('[data-edit-code]')).toBeNull();
    });

    it('the Add drawer has no code and no QR button (there is nothing to scan yet)', async () => {
      component.openAddProduct();
      fixture.detectChanges();
      expect(dom().querySelector('[aria-label="Add product"] [data-action="qr"]')).toBeNull();
      expect(component.editingCode).toBe('');
    });

    it('the QR button opens the QR drawer of THAT laptop, on top of the Edit drawer (which stays open)', async () => {
      await openFor(CODED());
      qrButton()!.click();
      await flush();
      expect(qrDrawer()!.getAttribute('aria-label')).toBe('QR code');
      expect(dom().querySelector('app-laptop-qr-drawer [data-code]')!.textContent).toBe('LP-0003');
      expect(editDrawer()).not.toBeNull();
    });

    it('Esc closes only the QR drawer: the Edit drawer stays', async () => {
      await openFor(CODED());
      qrButton()!.click();
      await flush();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      fixture.detectChanges();
      expect(qrDrawer()).toBeNull();
      expect(editDrawer()).not.toBeNull();
    });

    it('a NEW laptop that was saved opens its QR drawer ("Laptop saved")', async () => {
      products['createProduct'].and.callFake((p: any) => of({ id: 9, sku: 'WIN-ASU-005', code: 'LP-0009', category_name: 'Windows', ...p }));
      addWindows();
      component.submitProduct();
      await flush();
      expect(qrDrawer()!.getAttribute('aria-label')).toBe('Laptop saved');
      expect(dom().querySelector('app-laptop-qr-drawer [data-code]')!.textContent).toBe('LP-0009');
    });

    it('"save and add another" does not stop for the QR (print the labels later)', async () => {
      products['createProduct'].and.callFake((p: any) => of({ id: 9, sku: 'WIN-ASU-005', code: 'LP-0009', ...p }));
      addWindows();
      component.submitProduct(true);
      await flush();
      expect(qrDrawer()).toBeNull();
    });

    it('saving changes to a laptop that already exists does not open the QR drawer', async () => {
      await openFor(CODED());
      component.submitProduct();
      await flush();
      expect(qrDrawer()).toBeNull();
    });

    it('"Print labels" in the page header opens the labels page', async () => {
      const go = spyOn(TestBed.inject(Router), 'navigateByUrl').and.returnValue(Promise.resolve(true));
      (dom().querySelector('[data-action="labels"]') as HTMLButtonElement).click();
      expect(go).toHaveBeenCalledOnceWith('/labels');
    });

    it('the search finds a laptop by its code', async () => {
      products['getAllProducts'].and.returnValue(of([CODED(), { ...catalog[0], code: 'LP-0001' }]));
      component.loadProducts();
      component.searchQuery = 'lp-0003';
      fixture.detectChanges();
      expect(component.filteredProducts.map(p => p.id)).toEqual([3]);
    });
  });

  describe('the list: table or cards', () => {
    const load = (list: any[]) => {
      products['getAllProducts'].and.returnValue(of(list));
      component.loadProducts();
      component.closeProductModal();
      fixture.detectChanges();
    };
    const toggle = (label: string) => Array.from(dom().querySelectorAll('[role="group"] button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
    const rows = () => Array.from(dom().querySelectorAll('tbody tr')) as HTMLElement[];
    const cardEls = () => Array.from(dom().querySelectorAll('[data-card]')) as HTMLElement[];

    it('starts as a table, with the Table button marked as the current one', () => {
      load(catalog);
      expect(component.viewMode).toBe('table');
      expect(rows().length).toBe(catalog.length);
      expect(cardEls().length).toBe(0);
      expect(toggle('Table').getAttribute('aria-pressed')).toBe('true');
      expect(toggle('Cards').getAttribute('aria-pressed')).toBe('false');
    });

    it('the Cards button swaps the table for cards (same products), and Table swaps back', () => {
      load(catalog);
      toggle('Cards').click();
      fixture.detectChanges();
      expect(dom().querySelector('table')).toBeNull();
      expect(cardEls().length).toBe(catalog.length);
      expect(toggle('Cards').getAttribute('aria-pressed')).toBe('true');

      toggle('Table').click();
      fixture.detectChanges();
      expect(dom().querySelector('table')).not.toBeNull();
      expect(cardEls().length).toBe(0);
    });

    it('the choice is remembered in this browser', () => {
      load(catalog);
      toggle('Cards').click();
      expect(localStorage.getItem('products_view')).toBe('cards');

      const again = TestBed.createComponent(ProductManagementComponent);
      again.detectChanges();
      expect(again.componentInstance.viewMode).toBe('cards');
    });

    it('a broken saved value falls back to the table', () => {
      localStorage.setItem('products_view', 'nonsense');
      const again = TestBed.createComponent(ProductManagementComponent);
      again.detectChanges();
      expect(again.componentInstance.viewMode).toBe('table');
    });

    describe('brand logos in the category panel', () => {
      const brandButtons = () => Array.from(dom().querySelectorAll('ul button.flex.w-full'))
        .filter(b => b.querySelector('app-brand-logo')) as HTMLElement[];

      it('every brand of the chosen category has its logo before its name, in the same small box', () => {
        load(catalog);
        component.selectCategory(2);
        fixture.detectChanges();
        const rowsOfBrands = brandButtons();
        expect(rowsOfBrands.map(b => b.querySelector('span.truncate')!.textContent!.trim())).toEqual(['Asus', 'Dell', 'HP', 'Acer', 'Surface', 'MSI']);
        for (const row of rowsOfBrands) {
          const logo = row.querySelector('app-brand-logo') as HTMLElement;
          expect(logo.querySelector('svg')).withContext(row.textContent ?? '').not.toBeNull();
          expect(logo.classList).toContain('w-8');
          expect(logo.classList).toContain('h-5');
          expect(logo.compareDocumentPosition(row.querySelector('span.truncate')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        }
      });

      it('the product count stays on the right, and clicking the row still filters by the brand', () => {
        load(catalog);
        component.selectCategory(2);
        fixture.detectChanges();
        const dell = brandButtons().find(b => b.textContent!.includes('Dell'))!;
        expect(dell.querySelector('span.tabular-nums')).not.toBeNull();
        dell.click();
        fixture.detectChanges();
        expect(component.selectedBrand).toBe('Dell');
      });

      it('a brand just added (no logo yet) gets a grey letter, and the row still works', async () => {
        load(catalog);
        component.selectCategory(2);
        categories['getCategories'].and.returnValue(of([MAC, { ...WINDOWS, brands: [...(WINDOWS.brands ?? []), 'Framework'] }]));
        component.loadCategories();
        fixture.detectChanges();
        const row = brandButtons().find(b => b.textContent!.includes('Framework'))!;
        expect(row.querySelector('app-brand-logo svg')).toBeNull();
        expect(row.querySelector('app-brand-logo')!.textContent!.trim()).toBe('F');
      });
    });

    it('search and the category panel filter the cards just like the table', () => {
      load(catalog);
      toggle('Cards').click();
      component.selectCategory(2);
      fixture.detectChanges();
      expect(cardEls().length).toBe(catalog.filter(p => p.category_id === 2).length);
      component.searchQuery = 'zzz-no-match';
      fixture.detectChanges();
      expect(cardEls().length).toBe(0);
      expect(text()).toContain('No products found.');
    });

    describe('table columns', () => {
      it('Stock and Status are one column now (no separate Status), and Actions has no visible title', () => {
        load(catalog);
        const heads = Array.from(dom().querySelectorAll('thead th')).map(th => th.textContent!.trim());
        expect(heads).toEqual(['Product', 'SKU', 'Price', 'Stock', 'Actions']);
        expect(dom().querySelector('thead th .sr-only')!.textContent).toBe('Actions');
        expect(rows()[0].querySelectorAll('td').length).toBe(5);
      });

      it('the price cell shows just the price (no "+1" note about other prices)', () => {
        load(catalog);
        const cell = rows()[0].querySelectorAll('td')[2];     // this product has one other price
        expect(cell.textContent!.trim()).toBe('$799.00');
        expect(dom().textContent).not.toMatch(/other price/);
      });

      it('says the stock in words, in the same colours as the Menu', () => {
        load([
          { ...catalog[0], id: 1 },                                                    // 6, level 2
          { ...catalog[0], id: 2, stock_quantity: 2 },                                 // at the level
          { ...catalog[0], id: 3, stock_quantity: 0 },
          { ...catalog[2], id: 4 },                                                    // single item
          { ...catalog[4], id: 5 },                                                    // archived
        ]);
        const badge = (i: number) => rows()[i].querySelectorAll('td')[3].querySelector('app-status-badge span') as HTMLElement;
        expect(rows().map((_, i) => badge(i).textContent!.trim())).toEqual(['In stock · 6', 'Low stock · 2 left', 'Out of stock', 'Single item', 'Sold']);
        expect(badge(0).className).toContain('bg-green-50');
        expect(badge(1).className).toContain('bg-amber-50');
        expect(badge(2).className).toContain('bg-red-50');
        expect(badge(3).className).toContain('bg-gray-100');
      });

      it('a status never breaks onto two lines', () => {
        load(catalog);
        const badge = rows()[0].querySelector('app-status-badge span') as HTMLElement;
        expect(getComputedStyle(badge).whiteSpace).toBe('nowrap');
      });
    });

    describe('delete confirmation (our own dialog, not the browser popup)', () => {
      const dialog = () => dom().querySelector('[role="alertdialog"]') as HTMLElement | null;
      const dialogButton = (label: string) => Array.from(dialog()!.querySelectorAll('button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
      const rowDelete = (i: number) => Array.from(rows()[i].querySelectorAll('button')).find(b => b.textContent!.trim() === 'Delete') as HTMLButtonElement;
      const WIN = { ...WINDOWS, product_count: 17 };

      beforeEach(() => {
        load(catalog);
        spyOn(window, 'confirm');
        categories['deleteCategory'] = jasmine.createSpy('deleteCategory').and.returnValue(of({ message: 'ok', deletedProducts: 17 }));
        categories['deleteBrand'] = jasmine.createSpy('deleteBrand').and.returnValue(of({ message: 'ok', deletedProducts: 1 }));
      });

      it('Delete opens our own dialog and never the browser popup', () => {
        rowDelete(3).click();
        fixture.detectChanges();
        expect(window.confirm).not.toHaveBeenCalled();
        expect(dialog()).not.toBeNull();
        expect(dialog()!.getAttribute('aria-modal')).toBe('true');
      });

      it('names the product (with SKU and brand) and says it cannot be undone - nothing is deleted yet', () => {
        rowDelete(3).click();
        fixture.detectChanges();
        const text = dialog()!.textContent!;
        expect(text).toContain('Delete this product?');
        expect(text).toContain('Asus TUF A15');
        expect(text).toContain('WIN-ASU-004 · Asus');
        expect(text).toContain("This can't be undone.");
        expect(products['deleteProduct']).not.toHaveBeenCalled();
      });

      it('shows the product photo when it has one', () => {
        rowDelete(0).click();
        fixture.detectChanges();
        expect(dialog()!.querySelector('img')!.getAttribute('src')).toBe('https://img.example.com/a.jpg');
        component.cancelDelete();
        rowDelete(3).click();           // no photo
        fixture.detectChanges();
        expect(dialog()!.querySelector('img')).toBeNull();
      });

      it('Cancel, Esc and the dark background close it without deleting anything', () => {
        rowDelete(3).click();
        fixture.detectChanges();
        dialogButton('Cancel').click();
        fixture.detectChanges();
        expect(dialog()).toBeNull();

        rowDelete(3).click();
        fixture.detectChanges();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();
        expect(dialog()).toBeNull();

        rowDelete(3).click();
        fixture.detectChanges();
        (dom().querySelector('.confirm-backdrop') as HTMLElement).click();
        fixture.detectChanges();
        expect(dialog()).toBeNull();

        expect(products['deleteProduct']).not.toHaveBeenCalled();
      });

      it('a click inside the box does not close it', () => {
        rowDelete(3).click();
        fixture.detectChanges();
        dialog()!.click();
        fixture.detectChanges();
        expect(dialog()).not.toBeNull();
      });

      it('Cancel has the focus when it opens, so a stray Enter cannot delete anything', async () => {
        rowDelete(3).click();
        fixture.detectChanges();
        await new Promise(resolve => setTimeout(resolve, 120));
        expect(document.activeElement?.id).toBe('delete-cancel');
      });

      it('Esc closes the dialog first, not the drawer behind it', () => {
        component.openAddProduct();
        fixture.detectChanges();
        component.deleteProduct(catalog[3]);
        fixture.detectChanges();
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        fixture.detectChanges();
        expect(dialog()).toBeNull();
        expect(component.showProductModal).toBeTrue();
      });

      it('"Delete product" deletes THAT product, closes, refreshes the list and says it is done', () => {
        const loadsBefore = products['getAllProducts'].calls.count();
        rowDelete(3).click();
        fixture.detectChanges();
        dialogButton('Delete product').click();
        fixture.detectChanges();
        expect(products['deleteProduct']).toHaveBeenCalledOnceWith(4);
        expect(dialog()).toBeNull();
        expect(products['getAllProducts'].calls.count()).toBeGreaterThan(loadsBefore);
        expect(text()).toContain('Deleted Asus TUF A15');
      });

      it('a failed delete stays open and says why (right in the dialog)', () => {
        products['deleteProduct'].and.returnValue(throwError(() => ({ error: { error: 'Cannot delete: it is in use' } })));
        rowDelete(3).click();
        fixture.detectChanges();
        dialogButton('Delete product').click();
        fixture.detectChanges();
        expect(dialog()).not.toBeNull();
        expect(dialog()!.textContent).toContain('Cannot delete: it is in use');
        expect(dialogButton('Delete product').disabled).toBeFalse();      // can be tried again
      });

      it('while it is deleting the buttons are off, and a second click does nothing', () => {
        const pending = new Subject<unknown>();
        products['deleteProduct'].and.returnValue(pending);
        rowDelete(3).click();
        fixture.detectChanges();
        dialogButton('Delete product').click();
        fixture.detectChanges();
        expect(dialogButton('Deleting...').disabled).toBeTrue();
        expect(dialogButton('Cancel').disabled).toBeTrue();
        component.confirmDeleteNow();
        component.cancelDelete();
        expect(products['deleteProduct']).toHaveBeenCalledTimes(1);
        expect(dialog()).not.toBeNull();
        pending.next({ message: 'ok' });
        pending.complete();
        fixture.detectChanges();
        expect(dialog()).toBeNull();
      });

      it('a category says how many products go with it, and deletes that category', () => {
        component.deleteCategory(WIN);
        fixture.detectChanges();
        const box = dialog()!.textContent!;
        expect(box).toContain('Delete this category?');
        expect(box).toContain('Windows');
        expect(box).toContain('The 17 products in it will be deleted too.');
        dialogButton('Delete category').click();
        expect(categories['deleteCategory']).toHaveBeenCalledOnceWith(2);
      });

      it('an empty category has no red warning', () => {
        component.deleteCategory({ ...MAC, product_count: 0 });
        fixture.detectChanges();
        expect(dialog()!.textContent).not.toContain('will be deleted too');
      });

      it('one product is written as "1 product", not "1 product(s)"', () => {
        component.deleteCategory({ ...MAC, product_count: 1 });
        fixture.detectChanges();
        expect(dialog()!.textContent).toContain('The 1 product in it will be deleted too.');
      });

      it('a brand says how many of its products go with it, deletes it, and clears the brand filter', () => {
        component.selectedBrand = 'Dell';
        component.deleteBrand(WIN, 'Dell');
        fixture.detectChanges();
        const box = dialog()!.textContent!;
        expect(box).toContain('Delete this brand?');
        expect(box).toContain('Dell');
        expect(box).toContain('The 1 product of this brand will be deleted too.');
        dialogButton('Delete brand').click();
        expect(categories['deleteBrand']).toHaveBeenCalledOnceWith(2, 'Dell');
        expect(component.selectedBrand).toBeNull();
      });

      it('deleting a brand you are not filtering by leaves the filter alone', () => {
        component.selectedBrand = 'Asus';
        component.deleteBrand(WIN, 'Dell');
        fixture.detectChanges();
        dialogButton('Delete brand').click();
        expect(component.selectedBrand).toBe('Asus');
      });
    });

    describe('cards', () => {
      beforeEach(() => { load(catalog); toggle('Cards').click(); fixture.detectChanges(); });

      it('are laid out 2 per row on a phone, 3 on a tablet and 5 on a desktop screen', () => {
        const grid = dom().querySelector('[data-card-grid]') as HTMLElement;
        expect(grid.classList).toContain('grid-cols-2');
        expect(grid.classList).toContain('sm:grid-cols-3');
        expect(grid.classList).toContain('xl:grid-cols-5');
        expect(grid.classList).not.toContain('grid-cols-1');
      });

      it('the stock is one short coloured line (same words and colours as the table badge), not a badge', () => {
        const line = (i: number) => cardEls()[i].querySelector('p.mt-auto') as HTMLElement;
        expect(cardEls()[0].querySelector('app-status-badge')).toBeNull();
        expect(line(0).textContent!.trim()).toBe('In stock · 6');
        expect(line(0).className).toContain('text-green-700');
        expect(line(2).textContent!.trim()).toBe('Single item');
        expect(line(2).className).toContain('text-gray-600');
        expect(line(4).textContent!.trim()).toBe('Sold');
      });

      it('low and out of stock are amber and red', () => {
        expect(component.stockTextClass({ ...catalog[0], stock_quantity: 2 })).toBe('text-amber-700');
        expect(component.stockTextClass({ ...catalog[0], stock_quantity: 0 })).toBe('text-red-700');
        expect(component.stockTextClass(catalog[0])).toBe('text-green-700');
      });

      it('Edit and Delete are two even buttons along the bottom of the card', () => {
        const footer = cardEls()[0].querySelector('.grid-cols-2') as HTMLElement;
        expect(Array.from(footer.querySelectorAll('button')).map(b => b.textContent!.trim())).toEqual(['Edit', 'Delete']);
      });

      it('show cover photo, price, name, brand + model, SKU, specs and the stock', () => {
        const card = cardEls()[0];
        expect(card.querySelector('img')!.getAttribute('src')).toBe('https://img.example.com/a.jpg');
        expect(card.textContent).toContain('$799.00');
        expect(card.textContent).toContain('MacBook Air M1');
        expect(card.textContent).toContain('Apple');
        expect(card.textContent).toContain('Air 13');
        expect(card.textContent).toContain('MAC-005');
        expect(card.textContent).toContain('Ram 8GB | Storage 256GB');
        expect(card.textContent).toContain('In stock · 6');
        expect(card.textContent).not.toContain('other price');
      });

      it('a product without a photo gets the picture placeholder', () => {
        const card = cardEls()[2];
        expect(card.querySelector('img')).toBeNull();
        expect(card.querySelector('svg')).not.toBeNull();
      });

      it('says "3 photos" only when there are several', () => {
        expect(cardEls()[0].textContent).toContain('3 photos');
        expect(cardEls()[1].textContent).not.toContain('photo');
      });

      it('Edit opens the drawer for THAT product', () => {
        const edit = Array.from(cardEls()[3].querySelectorAll('button')).find(b => b.textContent!.trim() === 'Edit') as HTMLButtonElement;
        edit.click();
        fixture.detectChanges();
        expect(component.showProductModal).toBeTrue();
        expect(component.editingSku).toBe('WIN-ASU-004');
      });

      it('Delete asks first (nothing is deleted yet) and the question is about THAT product', () => {
        const del = Array.from(cardEls()[3].querySelectorAll('button')).find(b => b.textContent!.trim() === 'Delete') as HTMLButtonElement;
        del.click();
        fixture.detectChanges();
        expect(dom().querySelector('[role="alertdialog"]')!.textContent).toContain('Asus TUF A15');
        expect(products['deleteProduct']).not.toHaveBeenCalled();
      });

      it('an archived product is dimmed and labelled', () => {
        const card = cardEls()[4];
        expect(card.className).toContain('opacity-60');
        expect(card.textContent).toContain('Sold');
      });
    });
  });

  // ---------------------------------------------------------------------------------------------
  // Suggestions
  // ---------------------------------------------------------------------------------------------

  const catalog: any[] = [
    { id: 1, sku: 'MAC-005', name: 'MacBook Air M1', category_id: 1, category_name: 'Mac', brand: 'Apple', model: 'Air 13',
      description: 'Chip M1\nRam 8GB | Storage 256GB', selling_price: 799, extra_prices: [{ label: '16GB / 512GB', price: 949 }],
      image_url: 'https://img.example.com/a.jpg', images: ['https://img.example.com/a.jpg', '/uploads/own.png', 'https://img.example.com/b.jpg'],
      track_stock: 1, stock_quantity: 6, min_stock_level: 2, is_archived: false },
    { id: 2, sku: 'MAC-001', name: 'MacBook Air M2', category_id: 1, category_name: 'Mac', brand: 'Apple', model: '',
      description: 'Chip M2\nRam 8GB | Storage 256GB', selling_price: 1099, extra_prices: [],
      image_url: '/uploads/abc.png', images: ['/uploads/abc.png'], track_stock: 1, stock_quantity: 4, min_stock_level: 1, is_archived: false },
    { id: 3, sku: 'MAC-003', name: 'MacBook Pro 14 M3', category_id: 1, category_name: 'Mac', brand: 'Apple', model: '',
      description: 'Chip M3 Pro\nRam 18GB | Storage 512GB', selling_price: 1599, extra_prices: [], image_url: null,
      track_stock: 0, stock_quantity: 1, min_stock_level: 0, is_archived: false },
    { id: 4, sku: 'WIN-ASU-004', name: 'Asus TUF A15', category_id: 2, category_name: 'Windows', brand: 'Asus', model: 'TUF Gaming A15',
      description: 'Ryzen 7-7450HS\nRam 8GB DDR5 | M2 512 GB\nGPU 2050 4GB', selling_price: 749, extra_prices: [], image_url: null,
      track_stock: 1, stock_quantity: 5, min_stock_level: 2, is_archived: false },
    { id: 5, sku: 'MAC-009', name: 'Old MacBook (archived)', category_id: 1, category_name: 'Mac', brand: 'Apple', model: '',
      description: 'Chip Intel', selling_price: 300, extra_prices: [], image_url: null, track_stock: 0, stock_quantity: 1, min_stock_level: 0, is_archived: true },
    { id: 6, sku: 'WIN-DEL-001', name: 'Dell Inspiron 15', category_id: 2, category_name: 'Windows', brand: 'Dell', model: '',
      description: 'Core i5 Gen 13\nRam 16GB DDR5 | SSD 512GB', selling_price: 599, extra_prices: [], image_url: null,
      track_stock: 1, stock_quantity: 8, min_stock_level: 3, is_archived: false },
  ];

  describe('opening the list from a Dashboard link (?category=..&brand=..)', () => {
    const open = (params: Record<string, string>) => queryParams.next(convertToParamMap(params));

    beforeEach(() => {
      products['getAllProducts'].and.returnValue(of([
        { ...catalog[0] },                                                      // Mac
        { ...catalog[3] },                                                      // Windows / Asus
        { ...catalog[5] },                                                      // Windows / Dell
      ]));
      component.loadProducts();
    });

    it('shows everything when the address has no filter', () => {
      expect(component.selectedCategoryId).toBeNull();
      expect(component.selectedBrand).toBeNull();
      expect(component.filteredProducts.length).toBe(3);
    });

    it('filters by category', () => {
      open({ category: '2' });
      expect(component.selectedCategoryId).toBe(2);
      expect(component.selectedBrand).toBeNull();
      expect(component.filteredProducts.map(p => p.name)).toEqual(['Asus TUF A15', 'Dell Inspiron 15']);
    });

    it('filters by category and brand', () => {
      open({ category: '2', brand: 'Asus' });
      expect(component.selectedCategoryId).toBe(2);
      expect(component.selectedBrand).toBe('Asus');
      expect(component.filteredProducts.map(p => p.name)).toEqual(['Asus TUF A15']);
    });

    it('shows the filter in the left panel', () => {
      open({ category: '2', brand: 'Asus' });
      fixture.detectChanges();
      expect(text()).toContain('Windows');
      expect(text()).toContain('Asus');
    });

    it('ignores a category that is not a real number', () => {
      for (const bad of ['abc', '0', '-3', '1.5', '']) {
        open({ category: bad });
        expect(component.selectedCategoryId).toBeNull();
      }
    });

    it('a category that no longer exists falls back to all products', () => {
      open({ category: '99' });
      expect(component.selectedCategoryId).toBe(99);
      component.loadCategories();
      expect(component.selectedCategoryId).toBeNull();
    });
  });

  describe('suggestion: copy a product you already have', () => {
    beforeEach(() => {
      products['getAllProducts'].and.returnValue(of(catalog));
      component.loadProducts();
      component.openAddProduct();
    });

    const names = () => component.nameSuggestions.map(p => p.name);

    it('needs at least 2 letters, and matches words in any order', () => {
      component.onNameChange('m');
      expect(names()).toEqual([]);
      component.onNameChange('air macbook');
      expect(names()).toEqual(['MacBook Air M1', 'MacBook Air M2']);
    });

    it('lists the best matches first, never archived products', () => {
      component.onNameChange('macbook');
      expect(names()).toEqual(['MacBook Air M1', 'MacBook Air M2', 'MacBook Pro 14 M3']);
      expect(names()).not.toContain('Old MacBook (archived)');
    });

    it('also matches the brand', () => {
      component.onNameChange('asus');
      expect(names()).toEqual(['Asus TUF A15']);
    });

    it('shows at most 4', () => {
      component.products = Array.from({ length: 9 }, (_, i) => ({ ...catalog[0], id: 100 + i, name: `MacBook ${i}` }));
      component.onNameChange('macbook');
      expect(component.nameSuggestions.length).toBe(4);
    });

    it('is only for NEW products, never while editing one', () => {
      component.openEditProduct(catalog[0]);
      component.onNameChange('macbook');
      expect(names()).toEqual([]);
    });

    it('shows the matching products on screen, with their price', () => {
      component.onNameChange('macbook air');
      fixture.detectChanges();
      expect(text()).toContain('You already have similar products');
      expect(text()).toContain('MacBook Air M1');
      expect(text()).toContain('$799.00');
      expect(dom().querySelectorAll('[aria-label="Similar products you already have"] li').length).toBe(2);
    });

    it('one click copies category, brand, model, description, price and other prices', () => {
      component.onNameChange('macbook air m1');
      component.applySuggestion(component.nameSuggestions[0]);
      const f = component.form;
      expect(f.name).toBe('MacBook Air M1');
      expect(f.category_id).toBe(1);
      expect(f.brand).toBe('Apple');
      expect(f.model).toBe('Air 13');
      expect(f.description).toBe('Chip M1\nRam 8GB | Storage 256GB');
      expect(f.selling_price).toBe(799);
      expect(f.extra_prices).toEqual([{ label: '16GB / 512GB', price: 949 }]);
    });

    it('does NOT copy the stock: the copy is a new unit, a single item', () => {
      component.applySuggestion(catalog[0]);
      expect(component.form.track_stock).toBeFalse();
      expect(component.form.stock_quantity).toBe(1);
      expect(component.form.min_stock_level).toBe(0);
    });

    it('shares photo LINKS but never uploaded photo files (deleting one product would break the other)', () => {
      component.applySuggestion(catalog[0]);       // has two links and one uploaded file
      expect(component.form.images).toEqual(['https://img.example.com/a.jpg', 'https://img.example.com/b.jpg']);

      component.openAddProduct();
      component.applySuggestion(catalog[1]);       // only an uploaded file
      expect(component.form.images).toEqual([]);
    });

    it('keeps the photos you already chose', () => {
      component.form.images = ['/uploads/mine.png'];
      component.applySuggestion(catalog[0]);
      expect(component.form.images).toEqual(['/uploads/mine.png']);
    });

    it('copying an older product that only has a cover (no photo list) still shares its link', () => {
      component.applySuggestion({ ...catalog[0], images: undefined });
      expect(component.form.images).toEqual(['https://img.example.com/a.jpg']);
    });

    it('the copy is independent: editing its prices does not change the original product', () => {
      component.applySuggestion(catalog[0]);
      component.form.extra_prices[0].price = 1;
      expect(catalog[0].extra_prices[0].price).toBe(949);
    });

    it('opens More options when the copied product has other prices or a model', () => {
      expect(component.showMoreOptions).toBeFalse();
      component.applySuggestion(catalog[0]);
      expect(component.showMoreOptions).toBeTrue();
    });

    it('says what happened and Undo puts back exactly what was typed before', () => {
      component.form.name = 'MacBook Air';
      component.form.selling_price = null;
      component.applySuggestion(catalog[0]);
      fixture.detectChanges();
      expect(component.copiedFrom).toBe('MacBook Air M1');
      expect(text()).toContain('Copied from “MacBook Air M1”');
      expect(text()).toContain('Undo');

      component.undoCopy();
      expect(component.form.name).toBe('MacBook Air');
      expect(component.form.selling_price).toBeNull();
      expect(component.copiedFrom).toBeNull();
    });

    it('hides the list after a copy, and brings it back when the name is edited again', () => {
      component.onNameChange('macbook air m1');
      component.applySuggestion(catalog[0]);
      expect(names()).toEqual([]);
      component.onNameChange('MacBook Air');
      expect(names()).toEqual(['MacBook Air M1', 'MacBook Air M2']);
    });

    it('stops suggesting once the words typed match nothing you have', () => {
      component.onNameChange('MacBook Air M1 16GB');
      expect(names()).toEqual([]);
    });

    it('a copied product saves like any new product: no SKU sent, stock 1', () => {
      component.applySuggestion(catalog[0]);
      component.submitProduct();
      const payload = products['createProduct'].calls.mostRecent().args[0];
      expect('sku' in payload).toBeFalse();
      expect(payload.name).toBe('MacBook Air M1');
      expect(payload.description).toBe('Chip M1\nRam 8GB | Storage 256GB');
      expect(payload.selling_price).toBe(799);
      expect(payload.stock_quantity).toBe(1);
    });

    it('opening the drawer again starts clean (no old notice, no old list)', () => {
      component.applySuggestion(catalog[0]);
      component.openAddProduct();
      expect(component.copiedFrom).toBeNull();
      expect(component.nameSuggestions).toEqual([]);
    });
  });

  describe('suggestion: specs you used before', () => {
    function textarea(value: string, caret: number = value.length): HTMLTextAreaElement {
      const box = document.createElement('textarea');
      box.value = value;
      box.setSelectionRange(caret, caret);
      return box;
    }

    beforeEach(() => {
      products['getAllProducts'].and.returnValue(of(catalog));
      component.loadProducts();
      component.openAddProduct();            // starts on Mac
    });

    it('on an empty line offers one idea per kind, from products of the same category first', () => {
      component.updateSpecSuggestions(textarea(''));
      const list = component.specSuggestions;
      const kinds = list.map(s => s.split(' ')[0].toLowerCase());
      expect(new Set(kinds).size).toBe(kinds.length);
      expect(list).toContain('Ram 8GB');
      expect(list).toContain('Storage 256GB');
      expect(list.some(s => s.startsWith('Chip'))).toBeTrue();
      expect(component.specHint).toBe('Common specs:');
    });

    it('when two specs are equally common, the one from the newest product comes first', () => {
      component.products = [
        { ...catalog[0], id: 1, description: 'Chip M1' },
        { ...catalog[0], id: 2, description: 'Chip M2' },
        { ...catalog[0], id: 3, description: 'Chip M3' },
      ] as any;
      component.updateSpecSuggestions(textarea('Chip'));
      expect(component.specSuggestions).toEqual(['Chip M3', 'Chip M2', 'Chip M1']);
    });

    it('does not learn from archived (old) products', () => {
      component.updateSpecSuggestions(textarea('Chip'));
      expect(component.specSuggestions).not.toContain('Chip Intel');   // only the archived "Old MacBook" has it
      expect(component.specSuggestions).toContain('Chip M1');
    });

    it('while typing offers specs that start with what you typed, most used first', () => {
      component.updateSpecSuggestions(textarea('Ra'));
      expect(component.specSuggestions[0]).toBe('Ram 8GB');
      expect(component.specHint).toBe('Used before:');
    });

    it('does not offer a spec that is already in the description', () => {
      component.updateSpecSuggestions(textarea('Ram 8GB\nR'));
      expect(component.specSuggestions).not.toContain('Ram 8GB');
      expect(component.specSuggestions).toContain('Ram 18GB');
    });

    it('works after a "|" or a ","', () => {
      component.updateSpecSuggestions(textarea('Ram 8GB | St'));
      expect(component.specSuggestions).toContain('Storage 256GB');
      component.updateSpecSuggestions(textarea('Chip M1, st'));
      expect(component.specSuggestions).toContain('Storage 256GB');
    });

    it('uses the other category when there is nothing for this one', () => {
      component.selectFormCategory(2);        // Windows
      component.updateSpecSuggestions(textarea('Ry'));
      expect(component.specSuggestions).toContain('Ryzen 7-7450HS');
    });

    it('has no built-in list: with no products yet there is nothing to suggest', () => {
      component.products = [];
      component.updateSpecSuggestions(textarea(''));
      expect(component.specSuggestions).toEqual([]);
      component.updateSpecSuggestions(textarea('Ra'));
      expect(component.specSuggestions).toEqual([]);
    });

    it('only ever suggests specs that appear in a product you made', () => {
      const everything = catalog.flatMap(p => (p.description as string).split(/[\n|,]/).map(s => s.trim().toLowerCase()));
      component.updateSpecSuggestions(textarea(''));
      component.specSuggestions.forEach(s => expect(everything).toContain(s.toLowerCase()));
      component.updateSpecSuggestions(textarea('r'));
      component.specSuggestions.forEach(s => expect(everything).toContain(s.toLowerCase()));
    });

    it('learns: a spec from a product you just saved is suggested next time', () => {
      component.products = [{ ...catalog[0], id: 50, description: 'Cpu i9 Gen 14' } as any];
      component.updateSpecSuggestions(textarea('Cpu'));
      expect(component.specSuggestions).toEqual(['Cpu i9 Gen 14']);
    });

    it('choosing one replaces only the spec being typed and starts a new line at the end', () => {
      const box = textarea('Chip M1\nRa');
      component.applySpecSuggestion('Ram 8GB', box);
      expect(component.form.description).toBe('Chip M1\nRam 8GB\n');
      expect(box.value).toBe('Chip M1\nRam 8GB\n');
      expect(box.selectionStart).toBe('Chip M1\nRam 8GB\n'.length);
    });

    it('choosing one in the middle of a line keeps everything around it', () => {
      const box = textarea('Ra | SSD 512GB', 2);
      component.applySpecSuggestion('Ram 16GB', box);
      expect(component.form.description).toBe('Ram 16GB | SSD 512GB');
      expect(box.selectionStart).toBe('Ram 16GB'.length);
    });

    it('keeps the space after a separator', () => {
      const box = textarea('Chip M1, St');
      component.applySpecSuggestion('Storage 256GB', box);
      expect(component.form.description).toBe('Chip M1, Storage 256GB\n');
    });

    it('shows the chips under the Description box while it is focused, and clicking one adds it', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const box = dom().querySelector('#p-desc') as HTMLTextAreaElement;
      box.value = 'Ra';
      box.setSelectionRange(2, 2);
      box.dispatchEvent(new Event('focus'));
      fixture.detectChanges();

      const chip = Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').trim() === 'Ram 8GB') as HTMLButtonElement;
      expect(chip).toBeDefined();
      chip.click();
      expect(component.form.description).toBe('Ram 8GB\n');
    });

    it('hides the chips shortly after leaving the Description box', async () => {
      const box = textarea('');
      component.onDescFocus(box);
      expect(component.descFocused).toBeTrue();
      component.onDescBlur();
      await new Promise(resolve => setTimeout(resolve, 260));
      expect(component.descFocused).toBeFalse();
    });
  });

  describe('suggestion: other-price labels used before', () => {
    const withPrices = (id: number, categoryId: number, labels: [string, number][], archived = false): any => ({
      ...catalog[0], id, category_id: categoryId, is_archived: archived, description: null,
      extra_prices: labels.map(([label, price]) => ({ label, price })),
    });

    beforeEach(() => {
      products['getAllProducts'].and.returnValue(of([
        withPrices(1, 1, [['16GB / 512GB', 949], ['Installment', 849]]),
        withPrices(2, 1, [['16GB / 512GB', 1299]]),
        withPrices(3, 2, [['Ram 16GB', 649]]),
        withPrices(4, 1, [['Old archived label', 1]], true),
      ]));
      component.loadProducts();
      component.openAddProduct();            // starts on Mac
      component.showMoreOptions = true;
      component.addExtraPrice();
    });

    it('offers the labels from your products, same category and most used first', () => {
      component.onLabelFocus(0, '');
      expect(component.labelSuggestions).toEqual(['16GB / 512GB', 'Installment', 'Ram 16GB']);
    });

    it('never offers a label from an archived product', () => {
      component.onLabelFocus(0, '');
      expect(component.labelSuggestions).not.toContain('Old archived label');
    });

    it('filters while typing', () => {
      component.onLabelFocus(0, '');
      component.onLabelInput(0, 'ins');
      expect(component.labelSuggestions).toEqual(['Installment']);
      component.onLabelInput(0, '512');
      expect(component.labelSuggestions).toEqual(['16GB / 512GB']);
    });

    it('does not offer a label that is already used on another row of this product', () => {
      component.form.extra_prices = [{ label: '16GB / 512GB', price: 949 }, { label: '', price: null }];
      component.onLabelFocus(1, '');
      expect(component.labelSuggestions).toEqual(['Installment', 'Ram 16GB']);
    });

    it('choosing one fills the label of the row you are on', () => {
      component.onLabelFocus(0, '');
      component.applyLabelSuggestion('Installment');
      expect(component.form.extra_prices[0].label).toBe('Installment');
      expect(component.labelSuggestions).toEqual([]);
    });

    it('has no built-in labels: with no products yet there is nothing to suggest', () => {
      component.products = [];
      component.onLabelFocus(0, '');
      expect(component.labelSuggestions).toEqual([]);
    });

    it('a label from a product you just saved is suggested next time', () => {
      component.products = [withPrices(9, 1, [['Student price', 1000]])];
      component.onLabelFocus(0, 'stu');
      expect(component.labelSuggestions).toEqual(['Student price']);
    });

    it('shows the suggestions under the rows while a label box is focused', async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      const box = dom().querySelector('#xp-label-0') as HTMLInputElement;
      box.dispatchEvent(new Event('focus'));
      fixture.detectChanges();
      const chips = Array.from(dom().querySelectorAll('button')).map(b => (b.textContent ?? '').trim());
      expect(chips).toContain('16GB / 512GB');
      expect(chips).toContain('Installment');
    });

    it('removing a row hides the suggestions', () => {
      component.onLabelFocus(0, '');
      component.removeExtraPrice(0);
      expect(component.activeLabelRow).toBeNull();
      expect(component.labelSuggestions).toEqual([]);
    });
  });

  describe('example text comes from your own products (nothing fixed)', () => {
    const own = (id: number, categoryId: number, extra: object = {}): any => ({
      ...catalog[0], id, category_id: categoryId, is_archived: false, extra_prices: [], model: '', description: '', ...extra,
    });

    it('with no products yet the boxes only have plain labels', async () => {
      products['getAllProducts'].and.returnValue(of([]));
      component.loadProducts();
      component.openAddProduct();
      component.showMoreOptions = true;
      component.addExtraPrice();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.examples.name).toBe('Product name');
      expect(component.examples.description).toBe('One spec per line');
      expect(component.examples.model).toBe('Model code');
      expect(component.examples.label).toBe('Label');
      expect(component.examples.priceHint).toBe('Need another price? Add a label and an amount for each.');

      const everyPlaceholder = Array.from(dom().querySelectorAll('[placeholder]')).map(e => e.getAttribute('placeholder')).join(' | ');
      ['Asus TUF A15', 'UX3402VA', 'Cpu i7', '16GB / 512GB', 'Lenovo', 'Laptop'].forEach(oldStatic =>
        expect(everyPlaceholder).not.toContain(oldStatic));
      expect(text()).not.toContain('Installment');
    });

    it('with products, the examples are real ones from them', () => {
      products['getAllProducts'].and.returnValue(of([
        own(1, 1, { name: 'MacBook Air M2', model: 'A2681', description: 'Chip M2\nRam 8GB | Storage 256GB\nExtra line', extra_prices: [{ label: '16GB / 512GB', price: 1299 }] }),
      ]));
      component.loadProducts();
      component.openAddProduct();
      expect(component.examples.name).toBe('e.g. MacBook Air M2');
      expect(component.examples.model).toBe('e.g. A2681');
      expect(component.examples.description).toBe('One spec per line, e.g.\nChip M2\nRam 8GB | Storage 256GB');
      expect(component.examples.label).toBe('e.g. 16GB / 512GB');
      expect(component.examples.priceHint).toContain('“16GB / 512GB” → $1299.00');
    });

    it('the examples follow the category and use the newest product of it', () => {
      products['getAllProducts'].and.returnValue(of([
        own(1, 1, { name: 'MacBook Air M1' }),
        own(2, 1, { name: 'MacBook Air M2' }),
        own(3, 2, { name: 'Asus TUF A15' }),
      ]));
      component.loadProducts();
      component.openAddProduct();                 // Mac
      expect(component.examples.name).toBe('e.g. MacBook Air M2');
      component.selectFormCategory(2);            // Windows
      expect(component.examples.name).toBe('e.g. Asus TUF A15');
    });

    it('never uses an archived product as an example', () => {
      products['getAllProducts'].and.returnValue(of([own(1, 1, { name: 'Old thing', is_archived: true })]));
      component.loadProducts();
      component.openAddProduct();
      expect(component.examples.name).toBe('Product name');
    });

    it('a product you just saved becomes the next example', () => {
      products['getAllProducts'].and.returnValue(of([]));
      component.loadProducts();
      expect(component.examples.name).toBe('Product name');
      products['getAllProducts'].and.returnValue(of([own(5, 1, { name: 'Just saved' })]));
      component.loadProducts();
      expect(component.examples.name).toBe('e.g. Just saved');
    });
  });

  describe('More options', () => {
    const openMore = () => {
      (Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').includes('More options')) as HTMLButtonElement).click();
      fixture.detectChanges();
    };

    it('keeps Other prices, Track stock and Model code out of the way until you open it', () => {
      component.openAddProduct();
      fixture.detectChanges();
      expect(text()).not.toContain('Other prices');
      expect(text()).not.toContain('Track stock');
      expect(dom().querySelector('#p-stock')).toBeNull();
      expect(dom().querySelector('#p-model')).toBeNull();

      openMore();
      expect(text()).toContain('Other prices');
      expect(text()).toContain('Add price');
      expect(text()).toContain('Track stock');
      expect(dom().querySelector('#p-stock')).not.toBeNull();
      expect(dom().querySelector('#p-model')).not.toBeNull();
    });

    it('a new product is a single item (stock 1) even though Track stock is hidden', () => {
      component.openAddProduct();
      component.selectFormCategory(1);
      component.form.name = 'MacBook Air M1';
      component.form.selling_price = 799;
      expect(component.showMoreOptions).toBeFalse();
      component.submitProduct();
      const p = products['createProduct'].calls.mostRecent().args[0];
      expect(p.track_stock).toBeFalse();
      expect(p.stock_quantity).toBe(1);
      expect(p.min_stock_level).toBe(0);
    });

    it('the Track stock switch works inside More options and unlocks the two number boxes', async () => {
      component.openAddProduct();
      component.showMoreOptions = true;
      fixture.detectChanges();
      await fixture.whenStable();
      expect((dom().querySelector('#p-stock') as HTMLInputElement).disabled).toBeTrue();
      expect((dom().querySelector('#p-min') as HTMLInputElement).disabled).toBeTrue();

      (dom().querySelector('button[role="switch"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.form.track_stock).toBeTrue();
      expect((dom().querySelector('#p-stock') as HTMLInputElement).disabled).toBeFalse();
      expect((dom().querySelector('#p-min') as HTMLInputElement).disabled).toBeFalse();
    });

    it('says "stock tracking on" on the closed button when it is switched on', () => {
      component.openAddProduct();
      expect(text()).not.toContain('stock tracking on');
      component.setTrackStock(true);
      fixture.detectChanges();
      expect(text()).toContain('stock tracking on');
    });

    it('opens by itself when you edit a product that tracks stock', async () => {
      component.openEditProduct({ id: 5, sku: 'MAC-001', name: 'MacBook', category_id: 1, brand: 'Apple', selling_price: 1, stock_quantity: 6,
        min_stock_level: 2, track_stock: 1, is_archived: false, extra_prices: [] } as any);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.showMoreOptions).toBeTrue();
      expect((dom().querySelector('#p-stock') as HTMLInputElement).value).toBe('6');
    });

    it('stays closed when you edit a plain single-item product', () => {
      component.openEditProduct({ id: 5, sku: 'MAC-006', name: 'MacBook Pro 2019', category_id: 1, brand: 'Apple', selling_price: 1099, stock_quantity: 1,
        min_stock_level: 0, track_stock: 0, is_archived: false, extra_prices: [] } as any);
      expect(component.showMoreOptions).toBeFalse();
    });

    it('opens by itself when the server complains about the stock numbers', () => {
      products['createProduct'].and.returnValue(throwError(() => ({ error: { error: 'Stock must be a whole number of 0 or more' } })));
      component.openAddProduct();
      component.selectFormCategory(1);
      component.form.name = 'MacBook';
      component.form.selling_price = 1;
      component.setTrackStock(true);
      component.showMoreOptions = false;      // pretend the user had closed it
      component.submitProduct();
      expect(component.formError).toContain('Stock must be');
      expect(component.showMoreOptions).toBeTrue();
    });

    it('lets you add and remove a price row inside it', () => {
      component.openAddProduct();
      component.showMoreOptions = true;
      fixture.detectChanges();
      (Array.from(dom().querySelectorAll('button')).find(b => (b.textContent ?? '').includes('Add price')) as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.form.extra_prices.length).toBe(1);
      expect(dom().querySelectorAll('input[aria-label^="Label for price"]').length).toBe(1);

      (dom().querySelector('button[aria-label="Remove this price"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.form.extra_prices.length).toBe(0);
    });

    it('tells you about hidden other prices while it is closed', () => {
      component.openAddProduct();
      component.form.extra_prices = [{ label: '16GB', price: 799 }];
      fixture.detectChanges();
      expect(text()).toContain('1 other price(s)');
    });

    it('opens by itself when you edit a product that has other prices', async () => {
      component.openEditProduct({ id: 5, sku: 'MAC-001', name: 'MacBook', category_id: 1, brand: 'Apple', selling_price: 1, stock_quantity: 1,
        min_stock_level: 0, track_stock: 0, is_archived: false, extra_prices: [{ label: '16GB', price: 799 }] } as any);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(component.showMoreOptions).toBeTrue();
      const labels = Array.from(dom().querySelectorAll('input[aria-label^="Label for price"]')).map(i => (i as HTMLInputElement).value);
      expect(labels).toEqual(['16GB']);
    });

    it('opens by itself when an other-price row is half filled, so you can see the problem', () => {
      component.openAddProduct();
      component.selectFormCategory(1);
      component.form.name = 'MacBook';
      component.form.selling_price = 1;
      component.form.extra_prices = [{ label: '16GB', price: null }];
      expect(component.showMoreOptions).toBeFalse();
      component.submitProduct();
      expect(component.showMoreOptions).toBeTrue();
      expect(component.formError).toContain('Other price 1');
    });
  });

  describe('grey shapes and pages', () => {
    const load = (list: any[]) => {
      products['getAllProducts'].and.returnValue(of(list));
      component.loadProducts();
      component.closeProductModal();
      fixture.detectChanges();
    };
    /** `n` laptops that are not sold: "Laptop 01", "Laptop 02", ... */
    const many = (n: number) => Array.from({ length: n }, (_, i) => ({ ...catalog[3], id: 100 + i, sku: `WIN-ASU-${100 + i}`, name: `Laptop ${String(i + 1).padStart(2, '0')}`, is_archived: false }));
    const rows = () => Array.from(dom().querySelectorAll('tbody tr')) as HTMLElement[];
    const cardEls = () => Array.from(dom().querySelectorAll('[data-card]')) as HTMLElement[];
    const toggle = (label: string) => Array.from(dom().querySelectorAll('[role="group"] button')).find(b => b.textContent!.trim() === label) as HTMLButtonElement;
    const bar = () => dom().querySelector('[data-pagination]') as HTMLElement | null;
    const barText = () => bar()!.querySelector('[data-range]')!.textContent!.replace(/\s+/g, ' ').trim();
    const next = () => (bar()!.querySelector('[data-next]') as HTMLButtonElement);
    const searchFor = (value: string) => {
      const box = dom().querySelector('input[aria-label="Search products"]') as HTMLInputElement;
      box.value = value;
      box.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };

    beforeEach(() => spyOn(window, 'scrollTo'));

    describe('grey shapes', () => {
      it('the first load shows the shape of the table, and then the table', () => {
        const pending = new Subject<any[]>();
        products['getAllProducts'].and.returnValue(pending);
        component.loadProducts(true);
        fixture.detectChanges();
        expect(dom().querySelectorAll('[data-skeleton][data-kind="table"] [data-skeleton-item]').length).toBe(8);
        expect(dom().querySelector('table')).toBeNull();
        expect(bar()).toBeNull();
        expect(text()).not.toContain('No products found.');
        pending.next(catalog);
        pending.complete();
        fixture.detectChanges();
        expect(dom().querySelector('[data-skeleton]')).toBeNull();
        expect(rows().length).toBe(catalog.length);
      });

      it('as cards, the first load shows the shape of the cards', () => {
        load(catalog);
        toggle('Cards').click();
        const pending = new Subject<any[]>();
        products['getAllProducts'].and.returnValue(pending);
        component.loadProducts(true);
        fixture.detectChanges();
        expect(dom().querySelectorAll('[data-skeleton][data-kind="product-cards"] [data-skeleton-item]').length).toBe(10);
        expect(cardEls().length).toBe(0);
        pending.next(catalog);
        pending.complete();
        fixture.detectChanges();
        expect(dom().querySelector('[data-skeleton]')).toBeNull();
        expect(cardEls().length).toBe(catalog.length);
      });

      it('"No categories yet." is not shown while the categories are still coming, only when there are none', () => {
        const pending = new Subject<any[]>();
        categories['getCategories'].and.returnValue(pending);
        component.categoriesLoaded = false;
        component.loadCategories();
        fixture.detectChanges();
        expect(text()).not.toContain('No categories yet.');
        pending.next([]);
        pending.complete();
        fixture.detectChanges();
        expect(text()).toContain('No categories yet.');
      });

      it('a reload after a save is quiet: the list stays on screen', () => {
        load(catalog);
        const pending = new Subject<any[]>();
        products['getAllProducts'].and.returnValue(pending);
        component.loadProducts();
        fixture.detectChanges();
        expect(dom().querySelector('[data-skeleton]')).toBeNull();
        expect(rows().length).toBe(catalog.length);
      });
    });

    describe('pages', () => {
      it('20 products on a page: with 25 the table shows 20 and "Showing 1–20 of 25"', () => {
        load(many(25));
        expect(rows().length).toBe(20);
        expect(barText()).toBe('Showing 1–20 of 25');
        expect(dom().querySelector('h2.truncate')!.textContent!.replace(/\s+/g, '')).toContain('(25)');
      });

      it('Next shows the rest, and Previous comes back', () => {
        load(many(25));
        next().click();
        fixture.detectChanges();
        expect(rows().length).toBe(5);
        expect(rows()[0].textContent).toContain('Laptop 21');
        expect(rows()[4].textContent).toContain('Laptop 25');
        expect(barText()).toBe('Showing 21–25 of 25');
        (bar()!.querySelector('[data-previous]') as HTMLButtonElement).click();
        fixture.detectChanges();
        expect(rows().length).toBe(20);
      });

      it('the cards are cut in pages too', () => {
        load(many(25));
        toggle('Cards').click();
        fixture.detectChanges();
        expect(cardEls().length).toBe(20);
        next().click();
        fixture.detectChanges();
        expect(cardEls().length).toBe(5);
      });

      it('"Per page" changes how many are shown, from the first page', () => {
        load(many(25));
        next().click();
        fixture.detectChanges();
        const select = bar()!.querySelector('[data-per-page]') as HTMLSelectElement;
        select.value = '10';
        select.dispatchEvent(new Event('change'));
        fixture.detectChanges();
        expect(rows().length).toBe(10);
        expect(barText()).toBe('Showing 1–10 of 25');
      });

      it('a new search starts from the first page', () => {
        load(many(25));
        next().click();
        fixture.detectChanges();
        searchFor('laptop');
        expect(barText()).toBe('Showing 1–20 of 25');
      });

      it('choosing a category or a brand starts from the first page', () => {
        load(many(25));
        next().click();
        fixture.detectChanges();
        component.selectCategory(2);
        fixture.detectChanges();
        expect(barText()).toBe('Showing 1–20 of 25');
        next().click();
        fixture.detectChanges();
        component.selectBrand('Asus');
        fixture.detectChanges();
        expect(barText()).toBe('Showing 1–20 of 25');
      });

      it('when products are gone and the page is past the last one, the last page is shown (never an empty page)', () => {
        load(many(25));
        next().click();
        fixture.detectChanges();
        load(many(20));
        expect(rows().length).toBe(20);
        expect(barText()).toBe('Showing 1–20 of 20');
      });

      it('the number next to the title is all the products that match, not only the page', () => {
        load(many(25));
        component.searchQuery = 'Laptop 2';
        fixture.detectChanges();
        expect(dom().querySelector('h2.truncate')!.textContent!.replace(/\s+/g, '')).toContain('(6)');
      });

      it('no bar when there are no products to show', () => {
        load([]);
        expect(bar()).toBeNull();
        expect(text()).toContain('No products found.');
      });
    });
  });
});
