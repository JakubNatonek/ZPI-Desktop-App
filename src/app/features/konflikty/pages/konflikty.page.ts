import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-konflikty',
  templateUrl: 'konflikty.page.html',
  styleUrls: ['konflikty.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class KonfliktyPage {
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router
  ) {}

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  toggleProfileMenu(event: Event): void {
    this.profileMenuEvent = event;
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

  openSettings(): void {
    this.closeProfileMenu();
    this.router.navigateByUrl('/profile');
  }

  logout(): void {
    this.closeProfileMenu();
    this.auth.logout();
  }
}
