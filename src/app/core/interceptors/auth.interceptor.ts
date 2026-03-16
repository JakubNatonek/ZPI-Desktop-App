import { HttpBackend, HttpClient, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, finalize, map, Observable, shareReplay, switchMap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AccessTokenService } from '../services/access-token.service';

interface RefreshResponse {
  access_token: string;
}

let refreshInFlight$: Observable<string> | null = null;

function refreshAccessToken(apiBaseUrl: string, tokenService: AccessTokenService): Observable<string> {
  if (!refreshInFlight$) {
    const http = new HttpClient(inject(HttpBackend));

    refreshInFlight$ = http
      .post<RefreshResponse>(`${apiBaseUrl}/auth/refresh`, {}, { withCredentials: true })
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
  const tokenService = inject(AccessTokenService);
  const accessToken = tokenService.getToken();
  const apiBaseUrl = environment.apiBaseUrl;
  const isApiRequest = req.url.startsWith(apiBaseUrl);
  const isRefreshRequest = req.url === `${apiBaseUrl}/auth/refresh`;

  if (!isApiRequest) {
    return next(req);
  }

  const headers = accessToken
    ? req.headers.set('Authorization', `Bearer ${accessToken}`)
    : req.headers;

  const authenticatedRequest = req.clone({
    headers,
    withCredentials: true,
  });

  return next(authenticatedRequest).pipe(
    catchError((error) => {
      if (isRefreshRequest || error.status !== 401) {
        return throwError(() => error);
      }

      return refreshAccessToken(apiBaseUrl, tokenService).pipe(
        switchMap((newAccessToken) => {
          tokenService.setToken(newAccessToken);
          const retriedRequest = req.clone({
            withCredentials: true,
            headers: req.headers.set('Authorization', `Bearer ${newAccessToken}`),
          });
          return next(retriedRequest);
        }),
        catchError((refreshError) => {
          tokenService.clear();
          return throwError(() => refreshError);
        })
      );
    })
  );
};
