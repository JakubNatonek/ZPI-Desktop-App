import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class AccessTokenService {
  private readonly storageKey = 'auth.accessToken';
  private accessToken: string | null = this.loadToken();

  setToken(token: string | null): void {
    this.accessToken = token;

    if (token) {
      this.saveToken(token);
      return;
    }

    this.removeToken();
  }

  getToken(): string | null {
    return this.accessToken;
  }

  clear(): void {
    this.accessToken = null;
    this.removeToken();
  }

  private loadToken(): string | null {
    try {
      return localStorage.getItem(this.storageKey);
    } catch {
      return null;
    }
  }

  private saveToken(token: string): void {
    try {
      localStorage.setItem(this.storageKey, token);
    } catch {
      // Ignore storage errors and keep token in memory.
    }
  }

  private removeToken(): void {
    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore storage errors.
    }
  }
}
