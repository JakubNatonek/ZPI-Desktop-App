import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _authenticated = new BehaviorSubject<boolean>(false);
  readonly isAuthenticated$ = this._authenticated.asObservable();

  constructor(private router: Router) {}

  login(email: string, password: string): boolean {
    if (email === 'test@gmail.com' && password === '12345') {
      this._authenticated.next(true);
      return true;
    }
    return false;
  }

  logout() {
    this._authenticated.next(false);
    localStorage.removeItem('authenticated');
    this.router.navigateByUrl('/login');
  }

  get isLoggedIn(): boolean {
    return this._authenticated.value;
  }
}
