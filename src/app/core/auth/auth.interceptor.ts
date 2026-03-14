import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, shareReplay, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthService, LoginResponse } from './auth.service';

let refreshInFlight$: Observable<string> | null = null;

function runRefresh(authService: AuthService): Observable<string> {
  if (!refreshInFlight$) {
    const http = new HttpClient(inject(HttpBackend));
    refreshInFlight$ = http
      .post<LoginResponse>(`${environment.apiBaseUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        map((response) => response.access_token),
        finalize(() => {
          refreshInFlight$ = null;
        }),
        shareReplay(1)
      );
  }

  return refreshInFlight$;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const isApiRequest = req.url.startsWith(environment.apiBaseUrl);

  if (!isApiRequest) {
    return next(req);
  }

  const isAuthFlowRequest =
    req.url === `${environment.apiBaseUrl}/auth/refresh` ||
    req.url === `${environment.apiBaseUrl}/auth/logout`;

  const token = authService.getAccessToken();
  const headers = token ? req.headers.set('Authorization', `Bearer ${token}`) : req.headers;

  const requestWithAuth = req.clone({
    headers,
    withCredentials: true,
  });

  return next(requestWithAuth).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthFlowRequest) {
        return throwError(() => error);
      }

      return runRefresh(authService).pipe(
        switchMap((newAccessToken) => {
          authService.setAccessToken(newAccessToken);
          const retryRequest = req.clone({
            withCredentials: true,
            headers: req.headers.set('Authorization', `Bearer ${newAccessToken}`),
          });
          return next(retryRequest);
        }),
        catchError((refreshError) => {
          authService.clearSession();
          router.navigateByUrl('/login');
          return throwError(() => refreshError);
        })
      );
    })
  );
};
