import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // If user must change password, block any route other than /change-password
  if (authService.isAuthenticated() && authService.mustChangePassword) {
    return router.createUrlTree(['/change-password']);
  }

  if (authService.isAuthenticated()) {
    return true;
  }

  return authService.refreshAccessToken().pipe(
    map((newToken) => {
      authService.setAccessToken(newToken);
      // After token refresh, re-check mustChangePassword
      if (authService.mustChangePassword) {
        return router.createUrlTree(['/change-password']);
      }
      return true;
    }),
    catchError(() => of(router.createUrlTree(['/login'])))
  );
};
