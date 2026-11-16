import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { Product } from '../models/product.model';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class ProductService {
    private readonly API_URL = `${environment.apiUrl}/products`;

    constructor(
        private http: HttpClient,
        private authService: AuthService
    ) { }

    getAllProducts(includeArchived = false): Observable<Product[]> {
        return this.http.get<Product[]>(this.API_URL, {
            headers: this.authService.getAuthHeaders(),
            params: { include_archived: String(includeArchived) }
        });
    }

    getProductById(id: number): Observable<Product> {
        return this.http.get<Product>(`${this.API_URL}/${id}`, {
            headers: this.authService.getAuthHeaders()
        });
    }

    /** The laptop a QR code points at: "LP-0042" (any state: available, booked, in repair or sold). 404 = no such laptop. */
    getProductByCode(code: string): Observable<Product> {
        return this.http.get<Product>(`${this.API_URL}/by-code/${encodeURIComponent(code)}`, {
            headers: this.authService.getAuthHeaders()
        });
    }

    createProduct(product: Partial<Product>): Observable<Product> {
        return this.http.post<Product>(this.API_URL, product, {
            headers: this.authService.getAuthHeaders()
        });
    }

    updateProduct(id: number, product: Partial<Product>): Observable<Product> {
        return this.http.put<Product>(`${this.API_URL}/${id}`, product, {
            headers: this.authService.getAuthHeaders()
        });
    }

    deleteProduct(id: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`, {
            headers: this.authService.getAuthHeaders()
        });
    }

    /** Uploads an image file and returns its path, e.g. { url: '/uploads/abc.jpg' }. */
    uploadImage(file: File): Observable<{ url: string }> {
        return from(this.readAsDataUrl(file)).pipe(
            switchMap(data => this.http.post<{ url: string }>(`${environment.apiUrl}/uploads/image`, { data }, {
                headers: this.authService.getAuthHeaders()
            }))
        );
    }

    /** Deletes a photo that was uploaded but never saved on a product. The server refuses if a product uses it. */
    discardImage(url: string): Observable<{ message: string }> {
        const name = url.split('/').pop() ?? '';
        return this.http.delete<{ message: string }>(`${environment.apiUrl}/uploads/${encodeURIComponent(name)}`, {
            headers: this.authService.getAuthHeaders()
        });
    }

    private readAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(new Error('Could not read the file'));
            reader.readAsDataURL(file);
        });
    }

    getLowStock(): Observable<Product[]> {
        return this.http.get<Product[]>(`${this.API_URL}/low-stock`, {
            headers: this.authService.getAuthHeaders()
        });
    }
}
