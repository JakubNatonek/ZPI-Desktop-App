import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class JwtService {
  decodePayload(token: string): Record<string, unknown> | null {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    try {
      const payload = parts[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      const paddedPayload = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const decoded = atob(paddedPayload);
      return JSON.parse(decoded) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  getExpirationDate(token: string): Date | null {
    const payload = this.decodePayload(token);
    if (!payload) {
      return null;
    }

    const exp = payload['exp'];
    if (typeof exp !== 'number') {
      return null;
    }

    return new Date(exp * 1000);
  }

  isExpired(token: string | null | undefined, skewSeconds = 0): boolean {
    if (!token) {
      return true;
    }

    const expiresAt = this.getExpirationDate(token);
    if (!expiresAt) {
      return true;
    }

    const now = Date.now() + skewSeconds * 1000;
    return expiresAt.getTime() <= now;
  }

  getUserId(token: string): number | null {
    const payload = this.decodePayload(token);
    if (!payload) {
      return null;
    }

    const userId = payload['user_id'];
    if (typeof userId === 'number') {
      return userId;
    }

    if (typeof userId === 'string') {
      const parsed = Number(userId);
      return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
  }

  getRole(token: string): string | null {
    const payload = this.decodePayload(token);
    if (!payload) {
      return null;
    }

    const role = payload['role'];
    return typeof role === 'string' ? role : null;
  }
}
