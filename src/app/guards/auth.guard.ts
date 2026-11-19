import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth/auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
    const authService = inject(AuthService);
    const router = inject(Router);

    if (authService.isLoggedIn()) {
        return true;
    }

    // Remember where the person wanted to go (a scanned laptop, for example): after signing in they land there.
    router.navigate(['/login'], { queryParams: state?.url && state.url !== '/' ? { returnUrl: state.url } : {} });
    return false;
};
