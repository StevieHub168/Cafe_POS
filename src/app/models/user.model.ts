/** The shortest password the API accepts (for a new member and for a reset). */
export const MIN_PASSWORD = 8;

export interface User {
    id: number;
    username: string;
    email: string;
    full_name: string;
    role: 'admin' | 'staff';
    phone?: string;
    created_at?: string;
}

export interface AuthResponse {
    message: string;
    token: string;
    user: User;
}

export interface LoginRequest {
    email: string;
    password: string;
}

/** What the API answers when an admin adds a member. The token is the new member's own: it is never kept here. */
export interface CreatedUser {
    user: User;
    token: string;
}

export interface RegisterRequest {
    /** Optional: without one the API makes it from the email. */
    username?: string;
    email: string;
    password: string;
    full_name?: string;
    role?: 'admin' | 'staff';
    phone?: string;
}
