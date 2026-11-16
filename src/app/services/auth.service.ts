import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { User, AuthResponse, LoginRequest, RegisterRequest } from '../models/user.model';

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly API_URL = environment.apiUrl;
    private readonly TOKEN_KEY = 'laptop_auth_token';

    private currentUserSubject = new BehaviorSubject<User | null>(null);
    public currentUser$ = this.currentUserSubject.asObservable();

    private isBrowser: boolean;

    constructor(
        private http: HttpClient,
        private router: Router,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);
    }

    createUser(data: RegisterRequest): Observable<User> {
        return this.http.post<User>(`${this.API_URL}/auth/register`, data, {
            headers: this.getAuthHeaders()
        }).pipe(
            catchError(this.handleError)
        );
    }

    /**
     * Login user
     */
    login(data: LoginRequest): Observable<AuthResponse> {
        return this.http.post<AuthResponse>(`${this.API_URL}/auth/login`, data)
            .pipe(
                tap(response => this.handleAuthSuccess(response)),
                catchError(this.handleError)
            );
    }

    /**
     * Logout user
     */
    logout(): void {
        if (this.isBrowser) {
            localStorage.removeItem(this.TOKEN_KEY);
        }
        this.currentUserSubject.next(null);
        this.router.navigate(['/login']);
    }

    /**
     * Get current user value
     */
    get currentUserValue(): User | null {
        return this.currentUserSubject.value;
    }

    /**
     * Check if user is logged in
     */
    isLoggedIn(): boolean {
        return !!this.getToken();
    }

    /**
     * Check if current user is an admin
     */
    isAdmin(): boolean {
        const user = this.currentUserValue;
        return user?.role === 'admin';
    }

    /**
     * Get stored token
     */
    getToken(): string | null {
        if (!this.isBrowser) {
            return null;
        }
        return localStorage.getItem(this.TOKEN_KEY);
    }

    /**
     * Get HTTP headers with auth token
     */
    getAuthHeaders(): HttpHeaders {
        const token = this.getToken();
        return new HttpHeaders({
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        });
    }

    getMe(): Observable<User> {
        return this.http.get<{ user: User }>(`${this.API_URL}/auth/me`, {
            headers: this.getAuthHeaders()
        }).pipe(
            map((response) => response.user),
            catchError(this.handleError)
        );
    }

    loadCurrentUser(): Observable<User | null> {
        if (!this.isLoggedIn()) {
            this.currentUserSubject.next(null);
            return of(null);
        }

        return this.getMe().pipe(
            tap((user) => this.currentUserSubject.next(user)),
            catchError(() => {
                this.logout();
                return of(null);
            })
        );
    }

    /**
     * Handle successful authentication
     */
    private handleAuthSuccess(response: AuthResponse): void {
        if (this.isBrowser) {
            localStorage.setItem(this.TOKEN_KEY, response.token);
        }
        this.currentUserSubject.next(response.user);
    }

    /**
     * Handle HTTP errors
     */
    private handleError(error: any): Observable<never> {
        let errorMessage = 'An error occurred';

        if (error.error?.error) {
            errorMessage = error.error.error;
        } else if (error.error?.message) {
            errorMessage = error.error.message;
        } else if (error.message) {
            errorMessage = error.message;
        }

        return throwError(() => new Error(errorMessage));
    }
}
