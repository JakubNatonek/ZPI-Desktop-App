import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { JwtService } from './jwt.service';

export interface AuthUser {
  user_id: number;
  login: string;
  email: string;
  role: string;
  department: string;
}

export interface LoginRequest {
  login: string;
  password: string;
}

export interface LoginResponse {
  user_id: number;
  login: string;
  email: string;
  access_token: string;
  token_type: string;
  access_token_expires_in: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly loginUrl = `${environment.apiBaseUrl}/auth/`;
  private readonly refreshUrl = `${environment.apiBaseUrl}/auth/refresh`;
  private readonly meUrl = `${environment.apiBaseUrl}/auth/me`;
  private readonly logoutUrl = `${environment.apiBaseUrl}/auth/logout`;

  private accessToken: string | null = null;
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(null);

  readonly currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private readonly http: HttpClient,
    private readonly jwtService: JwtService
  ) { }

  login(payload: LoginRequest): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(this.loginUrl, payload, { withCredentials: true }).pipe(
      tap((response) => {
        this.setAccessToken(response.access_token);
      })
    );
  }

  refreshAccessToken(): Observable<string> {
    return this.http.post<LoginResponse>(this.refreshUrl, {}, { withCredentials: true }).pipe(
      map((response) => response.access_token),
      tap((token) => this.setAccessToken(token))
    );
  }

  fetchCurrentUser(): Observable<AuthUser> {
    return this.http.get<AuthUser>(this.meUrl, { withCredentials: true }).pipe(
      tap((user) => this.currentUserSubject.next(user))
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(this.logoutUrl, {}, { withCredentials: true }).pipe(
      tap(() => this.clearSession())
    );
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  isAuthenticated(): boolean {
    return !this.jwtService.isExpired(this.accessToken, 10);
  }

  private _mustChangePassword = false;

  get mustChangePassword(): boolean {
    return this._mustChangePassword;
  }

  setMustChangePassword(value: boolean): void {
    this._mustChangePassword = value;
  }

  clearSession(): void {
    this.accessToken = null;
    this._mustChangePassword = false;
    this.currentUserSubject.next(null);
  }
}
