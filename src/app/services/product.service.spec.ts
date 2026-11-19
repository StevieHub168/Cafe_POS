import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProductService } from './product.service';
import { environment } from '../../environments/environment';

describe('ProductService.getProductByCode', () => {
  let service: ProductService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ProductService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks the API for the laptop of the code', () => {
    let got: unknown;
    service.getProductByCode('LP-0042').subscribe(p => (got = p));
    const req = http.expectOne(`${environment.apiUrl}/products/by-code/LP-0042`);
    expect(req.request.method).toBe('GET');
    req.flush({ id: 42, code: 'LP-0042' });
    expect(got).toEqual({ id: 42, code: 'LP-0042' });
  });

  it('writes the code safely into the address', () => {
    service.getProductByCode('LP-1/../x?y').subscribe({ error: () => undefined });
    const req = http.expectOne(`${environment.apiUrl}/products/by-code/LP-1%2F..%2Fx%3Fy`);
    req.flush({ error: 'not found' }, { status: 404, statusText: 'Not Found' });
  });
});
