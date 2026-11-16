import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { map } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

export const adminGuard: CanActivateFn = () => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (!authService.isLoggedIn()) {
        router.navigate(['/login']);
        return false;
    }

    return authService.loadCurrentUser().pipe(
        map((user) => {
            if (user?.role === 'admin') {
                return true;
            }

            console.warn('Access denied: Admin privileges required.');
            router.navigate(['/menu']);
            return false;
        })
    );
};
