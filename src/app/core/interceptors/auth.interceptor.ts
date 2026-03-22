
import { HttpBackend, HttpClient, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, shareReplay, switchMap, tap, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';



interface AuthRefreshResponse {
  access_token: string;
}


let refreshInFlight$: Observable<AuthRefreshResponse> | null = null;

function runRefresh(http: HttpClient): Observable<AuthRefreshResponse> {
  if (!refreshInFlight$) {
    refreshInFlight$ = http
      .post<AuthRefreshResponse>(`${environment.apiBaseUrl}/auth/refresh`, {}, { withCredentials: true })
      .pipe(
        // Optionally handle token here if needed
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
  const httpBackend = inject(HttpBackend);
  const http = new HttpClient(httpBackend);
  const apiBaseUrl = environment.apiBaseUrl;
  const isApiRequest = req.url.startsWith(apiBaseUrl);
  const isAuthFlowRequest =
    req.url === `${apiBaseUrl}/auth/refresh` ||
    req.url === `${apiBaseUrl}/auth/logout`;

  if (!isApiRequest) {
    return next(req);
  }

  const requestWithCredentials = req.clone({
    withCredentials: true
  });
  return next(requestWithCredentials).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isAuthFlowRequest) {
        return throwError(() => error);
      }

      return runRefresh(http).pipe(
        switchMap(() => {
          return next(requestWithCredentials);
        }),
        catchError((refreshError) => {
          void router.navigateByUrl('/login');
          return throwError(() => refreshError);
        })
      );
    })
  );
};
