import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LabelsComponent } from './labels.component';
import { ProductService } from '../../services/product.service';
import { ConfigService } from '../../services/config.service';
import { Product } from '../../models/product.model';

const laptop = (id: number, name: string, code: string | undefined, over: Partial<Product> = {}): Product => ({
  id, sku: `S-${id}`, code, name, category_id: 1, selling_price: 100, stock_quantity: 1, min_stock_level: 0, is_archived: false, ...over,
});
const PRODUCTS = [
  laptop(3, 'Dell XPS 13', 'LP-0003', { image_url: '/uploads/dell.png', images: ['/uploads/dell.png', '/uploads/dell-2.png'], description: 'Core i7\nRam 16GB | SSD 512GB\nOLED screen' }),
  laptop(1, 'MacBook Air 13" M1', 'LP-0001', { model: 'Air 13' }),
  laptop(2, 'No code yet', undefined),
];

describe('LabelsComponent (Print labels)', () => {
  let fixture: ComponentFixture<LabelsComponent>;
  let component: LabelsComponent;
  let printed: number;

  async function open(query: Record<string, string> = {}, base = { url: 'https://thastore.example', fromSettings: true }, products: unknown = of(PRODUCTS)): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [LabelsComponent],
      providers: [
        { provide: ProductService, useValue: { getAllProducts: () => products } },
        { provide: ConfigService, useValue: { baseUrl: () => of(base) } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap(query) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LabelsComponent);
    component = fixture.componentInstance;
    printed = 0;
    spyOn(component as any, 'printSheet').and.callFake(() => { printed++; });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const dom = () => fixture.nativeElement as HTMLElement;
  const text = () => (dom().textContent ?? '').replace(/\s+/g, ' ');
  const printButton = () => dom().querySelector('[data-action="print"]') as HTMLButtonElement;
  const box = (code: string) => dom().querySelector(`input[data-code="${code}"]`) as HTMLInputElement;
  const sheet = () => new DOMParser().parseFromString((dom().querySelector('iframe') as HTMLIFrameElement).srcdoc, 'text/html');

  it('lists the laptops that have a code, A-Z, with the code beside each', async () => {
    await open();
    const rows = Array.from(dom().querySelectorAll('fieldset label')).map(l => (l.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Dell XPS 13Core i7 · Ram 16GB | SSD 512GBLP-0003', 'MacBook Air 13" M1Air 13LP-0001']);       // A-Z (spaces between the tags are not text)
  });

  it('shows the photo of each laptop, so two laptops of the same name can be told apart (a grey box when there is none)', async () => {
    await open();
    const photos = Array.from(dom().querySelectorAll('[data-photo]')) as HTMLElement[];
    expect(photos.length).toBe(2);
    expect(photos[0].querySelector('img')!.getAttribute('src')).toContain('/uploads/dell.png');       // the cover: the first photo
    expect(photos[1].querySelector('img')).toBeNull();
    expect(photos[1].classList).toContain('bg-gray-100');
  });

  it('shows the specs under the name (the first two lines of the description), or the model when there are none', async () => {
    await open();
    expect(Array.from(dom().querySelectorAll('[data-specs]')).map(e => e.textContent!.trim())).toEqual(['Core i7 · Ram 16GB | SSD 512GB', 'Air 13']);
  });

  it('two laptops with the same name are told apart by photo, specs and code', async () => {
    const twins = [
      laptop(5, 'Asus TUF A15', 'LP-0036', { image_url: '/uploads/a.png', description: 'Ryzen 7\nRam 8GB' }),
      laptop(6, 'Asus TUF A15', 'LP-0119', { image_url: '/uploads/b.png', description: 'Ryzen 5\nRam 16GB' }),
    ];
    await open({}, undefined, of(twins));
    const rows = Array.from(dom().querySelectorAll('fieldset label'));
    expect(rows.map(r => r.querySelector('[data-specs]')!.textContent!.trim())).toEqual(['Ryzen 7 · Ram 8GB', 'Ryzen 5 · Ram 16GB']);
    expect(rows.map(r => r.querySelector('img')!.getAttribute('src'))).toEqual([jasmine.stringContaining('/uploads/a.png'), jasmine.stringContaining('/uploads/b.png')]);
  });

  it('a long name or spec line is cut short inside the panel (the code stays inside it)', async () => {
    const long = [laptop(5, 'Asus TUF Gaming A15 with a very long name that does not fit', 'LP-0036', { description: 'Ryzen 7-7450HS with a long line\nRam 8GB DDR5 | M2 512 GB | GPU RTX 2050 4GB | and more words' })];
    await open({}, undefined, of(long));
    const section = dom().querySelector('[aria-label="Label options"]') as HTMLElement;
    const code = Array.from(dom().querySelectorAll('fieldset label span.font-mono'))[0] as HTMLElement;
    expect(code.getBoundingClientRect().right).toBeLessThanOrEqual(section.getBoundingClientRect().right);
    expect(dom().querySelector('fieldset')!.classList).toContain('min-w-0');
  });

  it('a picked laptop is highlighted', async () => {
    await open({ ids: '1' });
    const rows = Array.from(dom().querySelectorAll('fieldset label'));
    expect(rows.map(r => r.classList.contains('bg-primary-50'))).toEqual([false, true]);
  });

  it('opens with nothing picked and says so on the button', async () => {
    await open();
    expect(printButton().disabled).toBeTrue();
    expect(printButton().textContent!.trim()).toBe('Pick a laptop first');
    expect(sheet().querySelectorAll('.label').length).toBe(0);
  });

  it('from the QR drawer (?ids=1&per=2) that laptop is picked with 2 labels, and the button says 2', async () => {
    await open({ ids: '1', per: '2' });
    expect(box('LP-0001').checked).toBeTrue();
    expect(box('LP-0003').checked).toBeFalse();
    expect(printButton().textContent!.trim()).toBe('Print 2 labels');
    expect(Array.from(sheet().querySelectorAll('.tag')).map(t => t.textContent)).toEqual(['LAPTOP', 'CHARGER']);
  });

  it('?per=1 starts with 1 label each', async () => {
    await open({ ids: '1,3', per: '1' });
    expect(printButton().textContent!.trim()).toBe('Print 2 labels');         // 2 laptops x 1 label
    expect(sheet().querySelectorAll('.label').length).toBe(2);
    expect(sheet().querySelectorAll('.tag').length).toBe(0);
  });

  it('a wrong ?ids is ignored', async () => {
    await open({ ids: 'abc,-4,,0' });
    expect(printButton().disabled).toBeTrue();
  });

  it('picking and unpicking a laptop changes the count and the sheet', async () => {
    await open();
    box('LP-0003').click();
    fixture.detectChanges();
    expect(printButton().textContent!.trim()).toBe('Print 2 labels');
    box('LP-0001').click();
    fixture.detectChanges();
    expect(printButton().textContent!.trim()).toBe('Print 4 labels');
    expect(sheet().querySelectorAll('.label').length).toBe(4);
    box('LP-0003').click();
    box('LP-0001').click();
    fixture.detectChanges();
    expect(printButton().disabled).toBeTrue();
  });

  it('"Pick all" and "Pick none"', async () => {
    await open();
    (Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Pick all') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(printButton().textContent!.trim()).toBe('Print 4 labels');
    (Array.from(dom().querySelectorAll('button')).find(b => b.textContent!.trim() === 'Pick none') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(printButton().disabled).toBeTrue();
  });

  it('1 or 2 labels for each laptop (laptop + charger)', async () => {
    await open({ ids: '1' });
    (dom().querySelector('[data-per="1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(printButton().textContent!.trim()).toBe('Print 1 label');
    expect(dom().querySelector('[data-per="1"]')!.getAttribute('aria-pressed')).toBe('true');
    (dom().querySelector('[data-per="2"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(printButton().textContent!.trim()).toBe('Print 2 labels');
  });

  it('the label size changes the sheet', async () => {
    await open({ ids: '1' });
    expect(new DOMParser().parseFromString((dom().querySelector('iframe') as HTMLIFrameElement).srcdoc, 'text/html').head.textContent).toContain('width: 50mm; height: 30mm;');
    const select = dom().querySelector('#label-size') as HTMLSelectElement;
    select.value = '40x25';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect((dom().querySelector('iframe') as HTMLIFrameElement).srcdoc).toContain('width: 40mm; height: 25mm;');
  });

  it('says how many sheets of paper the labels need', async () => {
    const many = Array.from({ length: 14 }, (_, i) => laptop(i + 1, `Laptop ${i + 1}`, `LP-${String(i + 1).padStart(4, '0')}`));
    await open({ ids: many.map(l => l.id).join(','), per: '2' }, undefined, of(many));
    expect(dom().querySelector('[data-pages]')!.textContent).toContain('page 1 of 2');       // 28 labels, 24 on a sheet
    (dom().querySelector('[data-per="1"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(dom().querySelector('[data-pages]')!.textContent).toContain('page 1 of 1');       // 14 labels
  });

  it('every label has the QR of its own laptop: the address of the shop and the code', async () => {
    await open({ ids: '1' });
    const html = (dom().querySelector('iframe') as HTMLIFrameElement).srcdoc;
    expect(html).toContain('aria-label="QR code of LP-0001"');
    expect(sheet().querySelector('.name')!.textContent).toBe('MacBook Air 13" M1');
  });

  it('Print opens the browser print window for the sheet, only when something is picked', async () => {
    await open();
    printButton().click();
    expect(printed).toBe(0);
    box('LP-0001').click();
    fixture.detectChanges();
    printButton().click();
    expect(printed).toBe(1);
  });

  it('the address warning is switched off on this page (the QR drawer still has it)', async () => {
    await open({ ids: '1' }, { url: 'http://localhost:4000', fromSettings: false });
    expect(dom().querySelector('[data-address-warning]')).toBeNull();
  });

  it('the preview page shrinks to the width it has, so it fits a phone and keeps the A4 shape', async () => {
    await open({ ids: '1' });
    const frame = dom().querySelector('iframe') as HTMLIFrameElement;
    const preview = dom().querySelector('[data-preview]') as HTMLElement;
    const scale = () => Number(/scale\(([\d.]+)\)/.exec(frame.style.transform)?.[1]);
    const until = async (done: () => boolean) => { for (let i = 0; i < 80 && !done(); i++) await new Promise(r => setTimeout(r, 25)); };

    preview.style.width = '320px';                                  // a phone
    preview.style.maxWidth = 'none';
    await until(() => Math.abs(scale() - 320 / 794) < 0.001);
    expect(scale()).toBeCloseTo(320 / 794, 3);
    expect(preview.clientHeight).toBeCloseTo(320 * 1123 / 794, -1);   // the page keeps its A4 shape

    preview.style.width = '497px';                                  // a desktop
    await until(() => Math.abs(scale() - 497 / 794) < 0.001);
    expect(scale()).toBeCloseTo(497 / 794, 3);
  });

  it('says so when the laptops cannot be loaded', async () => {
    await open({}, undefined, throwError(() => new Error('down')));
    expect(text()).toContain('Failed to load the laptops.');
  });

  it('says so when there are no laptops yet', async () => {
    await open({}, undefined, of([]));
    expect(text()).toContain('There are no laptops yet.');
  });
});
