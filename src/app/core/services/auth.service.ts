import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, catchError, map, of, switchMap, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AccessTokenService } from './access-token.service';

export type UserRole = 'admin' | 'lecturer' | 'planner';
export type AppTheme = 'light' | 'dark';

interface UserAccount {
  email: string;
  password: string;
  role: UserRole;
  displayName: string;
}

interface UserPreferences {
  password?: string;
  avatar?: string;
  theme?: AppTheme;
}

interface ApiLoginResponse {
  user_id: number;
  login: string;
  email: string;
  access_token: string;
  token_type: string;
  access_token_expires_in: number;
  must_change_password: boolean;
}

interface ApiCurrentUserResponse {
  user_id: number;
  login: string;
  email: string;
  role: string;
  dzial: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sessionStorageKey = 'authSessionStartedAt';
  private readonly userPreferencesStorageKey = 'userPreferencesByEmail';
  private readonly sessionDurationMs = 5 * 60 * 1000;
  private readonly defaultAvatarUrl = 'https://ionicframework.com/docs/img/demos/avatar.svg';
  private readonly accounts: UserAccount[] = [
    {
      email: 'admin@ans.local',
      password: 'admin123',
      role: 'admin',
      displayName: 'Administrator',
    },
    {
      email: 'wykladowca@ans.local',
      password: 'wykl123',
      role: 'lecturer',
      displayName: 'Wykładowca',
    },
    {
      email: 'wykladowca2@ans.local',
      password: 'wykl123',
      role: 'lecturer',
      displayName: 'Wykładowca 2',
    },
    {
      email: 'planista@ans.local',
      password: 'plan123',
      role: 'planner',
      displayName: 'Planista harmonogramu',
    },
  ];

  private _authenticated = new BehaviorSubject<boolean>(false);
  private _userRole = new BehaviorSubject<UserRole | null>(null);
  private _displayName = new BehaviorSubject<string>('');
  private _email = new BehaviorSubject<string>('');
  private _mustChangePassword = new BehaviorSubject<boolean>(false);
  private sessionTimeoutId: number | null = null;

  readonly isAuthenticated$ = this._authenticated.asObservable();
  readonly userRole$ = this._userRole.asObservable();
  readonly displayName$ = this._displayName.asObservable();
  readonly email$ = this._email.asObservable();
  readonly mustChangePassword$ = this._mustChangePassword.asObservable();
  private readonly loginUrl = `${environment.apiBaseUrl}/auth/`;
  private readonly meUrl = `${environment.apiBaseUrl}/auth/me`;
  private readonly logoutUrl = `${environment.apiBaseUrl}/auth/logout`;

  constructor(
    private router: Router,
    private http: HttpClient,
    private accessTokenService: AccessTokenService
  ) {
    const authenticated = localStorage.getItem('authenticated') === 'true';
    const role = localStorage.getItem('userRole') as UserRole | null;
    const displayName = localStorage.getItem('displayName') || '';
    const emailLocal = localStorage.getItem('userEmail') || '';
    const mustChangePw = localStorage.getItem('mustChangePassword') === 'true';
    const sessionStartedAtRaw = localStorage.getItem(this.sessionStorageKey);
    const sessionStartedAt = sessionStartedAtRaw ? Number(sessionStartedAtRaw) : NaN;
    const sessionAgeMs = Date.now() - sessionStartedAt;
    const isSessionValid = Number.isFinite(sessionStartedAt) && sessionAgeMs < this.sessionDurationMs;

    if (authenticated && role && isSessionValid) {
      this._authenticated.next(true);
      this._userRole.next(role);
      this._displayName.next(displayName);
      this._email.next(emailLocal);
      this._mustChangePassword.next(mustChangePw);
      this.scheduleSessionExpiry(this.sessionDurationMs - sessionAgeMs);
      this.applyCurrentTheme();
      return;
    }

    this.applyTheme('light');
    this.clearSessionState(false);
  }

  login(email: string, password: string): Observable<{ success: boolean; mustChangePassword?: boolean }> {
    const identifier = email.trim();

    return this.http
      .post<ApiLoginResponse>(
        this.loginUrl,
        {
          login: identifier,
          password,
        },
        { withCredentials: true }
      )
      .pipe(
        switchMap((loginResponse) => {
          this.accessTokenService.setToken(loginResponse.access_token);
          const needsPasswordChange = loginResponse.must_change_password;

          return this.http.get<ApiCurrentUserResponse>(this.meUrl, { withCredentials: true }).pipe(
            tap((me) => {
              const mappedRole = this.mapBackendRoleToAppRole(me.role, me.email);
              this.activateSession(mappedRole, this.resolveDisplayName(me.email, me.login), me.email, needsPasswordChange);
            }),
            map(() => ({ success: true, mustChangePassword: needsPasswordChange }))
          );
        }),
        catchError(() => of(this.loginWithLocalAccount(identifier, password)))
      );
  }

  private loginWithLocalAccount(identifier: string, password: string): { success: boolean; mustChangePassword?: boolean } {
    this.accessTokenService.clear();
    const account = this.accounts.find(
      (candidate) => candidate.email === identifier
    );

    if (!account || this.getEffectivePassword(account) !== password) {
      return { success: false };
    }

    this.activateSession(account.role, account.displayName, account.email, false);
    return { success: true, mustChangePassword: false };
  }

  private activateSession(role: UserRole, displayName: string, email: string, mustChangePassword: boolean = false): void {
    this._authenticated.next(true);
    this._userRole.next(role);
    this._displayName.next(displayName);
    this._email.next(email);
    this._mustChangePassword.next(mustChangePassword);

    const sessionStartedAt = Date.now();
    localStorage.setItem('authenticated', 'true');
    localStorage.setItem('userRole', role);
    localStorage.setItem('displayName', displayName);
    localStorage.setItem('userEmail', email);
    localStorage.setItem('mustChangePassword', mustChangePassword ? 'true' : 'false');
    localStorage.setItem(this.sessionStorageKey, String(sessionStartedAt));
    this.scheduleSessionExpiry(this.sessionDurationMs);
    this.applyCurrentTheme();
  }

  logout() {
    this.http.post(this.logoutUrl, {}, { withCredentials: true }).subscribe({
      error: () => {
        // Local cleanup still runs even if backend cannot revoke current cookie.
      },
    });

    this.accessTokenService.clear();
    this.clearSessionState(true);
  }

  get isLoggedIn(): boolean {
    if (!this.ensureActiveSession()) {
      return false;
    }

    return this._authenticated.value;
  }

  get role(): UserRole | null {
    if (!this.ensureActiveSession()) {
      return null;
    }

    return this._userRole.value;
  }

  get roleLabel(): string {
    if (!this.ensureActiveSession()) {
      return 'Gość';
    }

    switch (this._userRole.value) {
      case 'admin':
        return 'Administrator';
      case 'lecturer':
        return 'Wykładowca';
      case 'planner':
        return 'Planista harmonogramu';
      default:
        return 'Gość';
    }
  }

  get displayName(): string {
    if (!this.ensureActiveSession()) {
      return '';
    }

    return this._displayName.value;
  }

  get email(): string {
    if (!this.ensureActiveSession()) {
      return '';
    }

    return this._email.value;
  }

  get mustChangePassword(): boolean {
    if (!this.ensureActiveSession()) {
      return false;
    }
    return this._mustChangePassword.value;
  }

  get availableAccounts() {
    return this.accounts.map(({ email, password, role, displayName }) => ({
      email,
      password,
      role,
      displayName,
    }));
  }

  getProfileAvatarUrl(): string {
    if (!this.ensureActiveSession()) {
      return this.defaultAvatarUrl;
    }

    const preferences = this.getUserPreferences(this._email.value);
    return preferences?.avatar || this.defaultAvatarUrl;
  }

  updateProfileAvatar(avatarDataUrl: string): void {
    if (!this.ensureActiveSession() || !avatarDataUrl) {
      return;
    }

    this.updateUserPreferences(this._email.value, {
      avatar: avatarDataUrl,
    });
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ success: boolean; message: string }> {
    if (!this.ensureActiveSession()) {
      return of({ success: false, message: 'Sesja wygasła. Zaloguj się ponownie.' });
    }

    // Jeśli używamy backendowego auth z access_tokenem
    if (this.accessTokenService.getToken()) {
      const url = `${environment.apiBaseUrl}/auth/change-one-time-password`;
      return this.http.post<{ message: string }>(url, {
        new_password: newPassword,
        confirm_new_password: newPassword
      }, { withCredentials: true }).pipe(
        tap(() => {
          this._mustChangePassword.next(false);
          localStorage.setItem('mustChangePassword', 'false');
        }),
        map(res => ({ success: true, message: res.message })),
        catchError(err => of({ success: false, message: err.error?.detail || 'Nie udało się zmienić hasła.' }))
      );
    }

    // Fallback dla kont lokalnych demo
    const account = this.accounts.find((candidate) => candidate.email === this._email.value);
    if (!account) {
      return of({ success: false, message: 'Nie znaleziono konta.' });
    }

    if (this.getEffectivePassword(account) !== currentPassword) {
      return of({ success: false, message: 'Aktualne hasło jest niepoprawne.' });
    }

    this.updateUserPreferences(this._email.value, {
      password: newPassword,
    });
    
    this._mustChangePassword.next(false);
    localStorage.setItem('mustChangePassword', 'false');

    return of({ success: true, message: 'Hasło zostało zmienione.' });
  }

  getCurrentTheme(): AppTheme {
    if (!this.ensureActiveSession()) {
      return 'light';
    }

    const preferences = this.getUserPreferences(this._email.value);
    return preferences?.theme === 'dark' ? 'dark' : 'light';
  }

  updateCurrentTheme(theme: AppTheme): void {
    if (!this.ensureActiveSession()) {
      return;
    }

    this.updateUserPreferences(this._email.value, {
      theme,
    });
    this.applyTheme(theme);
  }

  private ensureActiveSession(): boolean {
    if (!this._authenticated.value) {
      return false;
    }

    const sessionStartedAtRaw = localStorage.getItem(this.sessionStorageKey);
    const sessionStartedAt = sessionStartedAtRaw ? Number(sessionStartedAtRaw) : NaN;
    if (!Number.isFinite(sessionStartedAt)) {
      this.clearSessionState(true);
      return false;
    }

    if (Date.now() - sessionStartedAt >= this.sessionDurationMs) {
      this.clearSessionState(true);
      return false;
    }

    return true;
  }

  private scheduleSessionExpiry(delayMs: number) {
    if (this.sessionTimeoutId !== null) {
      clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }

    const safeDelay = Math.max(0, delayMs);
    this.sessionTimeoutId = window.setTimeout(() => {
      this.clearSessionState(true);
    }, safeDelay);
  }

  private clearSessionState(redirectToLogin: boolean) {
    if (this.sessionTimeoutId !== null) {
      clearTimeout(this.sessionTimeoutId);
      this.sessionTimeoutId = null;
    }

    this._authenticated.next(false);
    this._userRole.next(null);
    this._displayName.next('');
    this._email.next('');
    this._mustChangePassword.next(false);
    localStorage.removeItem('authenticated');
    localStorage.removeItem('userRole');
    localStorage.removeItem('displayName');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('mustChangePassword');
    localStorage.removeItem(this.sessionStorageKey);
    this.accessTokenService.clear();

    if (redirectToLogin) {
      this.applyTheme('light');
      this.router.navigateByUrl('/login');
    }
  }

  private getEffectivePassword(account: UserAccount): string {
    const preferences = this.getUserPreferences(account.email);
    return preferences?.password || account.password;
  }

  private mapBackendRoleToAppRole(backendRole: string, email: string): UserRole {
    const localAccount = this.accounts.find((account) => account.email === email);
    if (localAccount) {
      return localAccount.role;
    }

    switch (backendRole) {
      case 'wykladowca':
      case 'cwiczenia':
      case 'laboratorium':
      case 'seminarium':
        return 'lecturer';
      case 'student':
        return 'planner';
      default:
        return 'admin';
    }
  }

  private resolveDisplayName(email: string, backendLogin: string): string {
    const localAccount = this.accounts.find((account) => account.email === email);
    return localAccount?.displayName || backendLogin;
  }

  private getUserPreferences(email: string): UserPreferences | null {
    const allPreferences = this.loadAllUserPreferences();
    return allPreferences[email] || null;
  }

  private updateUserPreferences(email: string, partial: Partial<UserPreferences>): void {
    const allPreferences = this.loadAllUserPreferences();
    const current = allPreferences[email] || {};
    allPreferences[email] = {
      ...current,
      ...partial,
    };

    localStorage.setItem(this.userPreferencesStorageKey, JSON.stringify(allPreferences));
  }

  private loadAllUserPreferences(): Record<string, UserPreferences> {
    const raw = localStorage.getItem(this.userPreferencesStorageKey);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as Record<string, UserPreferences>;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  private applyCurrentTheme(): void {
    const preferences = this.getUserPreferences(this._email.value);
    const theme: AppTheme = preferences?.theme === 'dark' ? 'dark' : 'light';
    this.applyTheme(theme);
  }

  private applyTheme(theme: AppTheme): void {
    const root = document.documentElement;
    root.classList.toggle('ion-palette-dark', theme === 'dark');
  }
}
