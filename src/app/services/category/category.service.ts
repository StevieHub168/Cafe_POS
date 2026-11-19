import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Category } from '../../models/category/category.model';

@Injectable({
    providedIn: 'root'
})
export class CategoryService {
    private readonly API_URL = `${environment.apiUrl}/categories`;

    constructor(private http: HttpClient) { }

    getCategories(): Observable<Category[]> {
        return this.http.get<Category[]>(this.API_URL);
    }

    createCategory(category: Partial<Category>): Observable<Category> {
        return this.http.post<Category>(this.API_URL, category);
    }

    updateCategory(id: number, category: Partial<Category>): Observable<Category> {
        return this.http.put<Category>(`${this.API_URL}/${id}`, category);
    }

    addBrand(categoryId: number, name: string): Observable<Category> {
        return this.http.post<Category>(`${this.API_URL}/${categoryId}/brands`, { name });
    }

    renameBrand(categoryId: number, from: string, to: string): Observable<Category> {
        return this.http.put<Category>(`${this.API_URL}/${categoryId}/brands/${encodeURIComponent(from)}`, { name: to });
    }

    /** Also deletes every product of that brand. */
    deleteBrand(categoryId: number, name: string): Observable<{ message: string; deletedProducts: number }> {
        return this.http.delete<{ message: string; deletedProducts: number }>(
            `${this.API_URL}/${categoryId}/brands/${encodeURIComponent(name)}`
        );
    }

    deleteCategory(id: number): Observable<{ message: string }> {
        return this.http.delete<{ message: string }>(`${this.API_URL}/${id}`);
    }
}
