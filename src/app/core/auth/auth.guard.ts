import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';

import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return authService.refreshAccessToken().pipe(
    map((newToken) => {
      authService.setAccessToken(newToken);
      return true;
    }),
    catchError(() => of(router.createUrlTree(['/login'])))
  );
};
