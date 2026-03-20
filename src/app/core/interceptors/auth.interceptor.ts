
import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AccessTokenService } from '../services/access-token.service';

interface AuthRefreshResponse {
  access_token: string;
}

let refreshInFlight$: Observable<AuthRefreshResponse> | null = null;

function runRefresh(): Observable<AuthRefreshResponse> {
  if (!refreshInFlight$) {
    const http = new HttpClient(inject(HttpBackend));
    const accessTokenService = inject(AccessTokenService);
    refreshInFlight$ = http
      .post<AuthRefreshResponse>(`${environment.apiBaseUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((response) => {
          accessTokenService.setToken(response.access_token);
        }),
        finalize(() => {
          refreshInFlight$ = null;
        }),
        shareReplay(1)
      );
  }

  return refreshInFlight$;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const accessTokenService = inject(AccessTokenService);
  const apiBaseUrl = environment.apiBaseUrl;
  const isApiRequest = req.url.startsWith(apiBaseUrl);
  const isAuthFlowRequest =
    req.url === `${apiBaseUrl}/auth/refresh` ||
    req.url === `${apiBaseUrl}/auth/logout`;

  if (!isApiRequest) {
    return next(req);
  }

  const accessToken = accessTokenService.getToken();
  const requestWithAuth = req.clone({
    withCredentials: true,
    setHeaders: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });

  return next(requestWithAuth).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthFlowRequest) {
        return throwError(() => error);
      }

      return runRefresh().pipe(
        switchMap(() => {
          const newAccessToken = accessTokenService.getToken();
          const retryRequest = req.clone({
            withCredentials: true,
            setHeaders: newAccessToken ? { Authorization: `Bearer ${newAccessToken}` } : {},
          });
          return next(retryRequest);
        }),
        catchError((refreshError) => {
          const existingToken = accessTokenService.getToken();
          if (existingToken) {
            const retryRequest = req.clone({
              withCredentials: true,
              setHeaders: { Authorization: `Bearer ${existingToken}` },
            });
            return next(retryRequest);
          }

          accessTokenService.clear();
          void router.navigateByUrl('/login');
          return throwError(() => refreshError);
        })
      );
    })
  );
};
