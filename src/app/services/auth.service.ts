import { Injectable, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of, throwError } from 'rxjs';
import { tap, catchError, map } from 'rxjs/operators';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { User, AuthResponse, CreatedUser, LoginRequest, RegisterRequest } from '../models/user.model';

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
        private location: Location,
        @Inject(PLATFORM_ID) private platformId: Object
    ) {
        this.isBrowser = isPlatformBrowser(this.platformId);
    }

    /** Admin only: adds a member. Does NOT sign them in here (the answer holds their token, and it is left alone). */
    createUser(data: RegisterRequest): Observable<CreatedUser> {
        return this.http.post<CreatedUser>(`${this.API_URL}/auth/register`, data).pipe(
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
     * Logout user. The server is told first, so the token stops working there too (not only in this browser).
     * The person is signed out here even when that call fails (offline, token already out of date).
     */
    logout(): void {
        const token = this.getToken();
        if (this.isBrowser && token) {
            this.http.post(`${this.API_URL}/auth/logout`, {}, { headers: { Authorization: `Bearer ${token}` } }).subscribe({ error: () => { } });
            localStorage.removeItem(this.TOKEN_KEY);
        }
        this.currentUserSubject.next(null);
        this.router.navigate(['/login']);
    }

    /**
     * The API no longer accepts `failedToken` (it ran out, or the person signed in on another device): sign out here, without
     * telling the server, and go to the Login page, which brings the person back to this page after signing in.
     * Nothing happens when that token is not the current one (several calls fail together, or the person already signed in again).
     */
    sessionEnded(failedToken: string): void {
        if (!this.isBrowser || this.getToken() !== failedToken) return;
        localStorage.removeItem(this.TOKEN_KEY);
        this.currentUserSubject.next(null);

        // While the app is starting the router has not finished its first navigation (its url is still "/"): the address bar knows the page.
        const page = this.router.url === '/' ? this.location.path() : this.router.url;
        const comeBack = page && page !== '/' && !page.startsWith('/login');
        this.router.navigate(['/login'], { queryParams: comeBack ? { returnUrl: page } : {} });
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

    getMe(): Observable<User> {
        return this.http.get<{ user: User }>(`${this.API_URL}/auth/me`).pipe(
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
                // A 401 was already handled (sessionEnded: the token is gone, and Login knows the page to come back to).
                // Anything else (the API cannot be reached): sign out as before.
                if (this.getToken()) this.logout();
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
