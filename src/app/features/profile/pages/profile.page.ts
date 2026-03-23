import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService, AppTheme } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ProfilePage {
  avatarUrl = '';
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;
  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  passwordMessage = '';
  selectedTheme: AppTheme = 'light';

  constructor(
    public auth: AuthService,
    private readonly router: Router
  ) { }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  logout() {
    this.auth.logout();
  }

  toggleProfileMenu(event: Event) {
    this.profileMenuEvent = event;
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu() {
    this.isProfileMenuOpen = false;
  }

  openSettings() {
    this.closeProfileMenu();
    this.router.navigateByUrl('/profile');
  }

  ionViewWillEnter() {
    this.avatarUrl = this.auth.getProfileAvatarUrl();
    this.selectedTheme = this.auth.getCurrentTheme();
  }

  triggerAvatarUpload(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  async onAvatarFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    const dataUrl = await this.readFileAsDataUrl(file);
    this.auth.updateProfileAvatar(dataUrl);
    this.avatarUrl = this.auth.getProfileAvatarUrl();
    input.value = '';
  }

  onThemeChange(isDark: boolean) {
    this.selectedTheme = isDark ? 'dark' : 'light';
    this.auth.updateCurrentTheme(this.selectedTheme);
  }

  submitPasswordChange() {
    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.passwordMessage = 'Uzupełnij wszystkie pola hasła.';
      return;
    }

    if (this.newPassword.length < 4) {
      this.passwordMessage = 'Nowe hasło musi mieć minimum 4 znaki.';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.passwordMessage = 'Nowe hasła nie są takie same.';
      return;
    }

    this.auth.changePassword(this.currentPassword, this.newPassword).subscribe({
      next: (result) => {
        this.passwordMessage = result.message;

        if (result.success) {
          this.currentPassword = '';
          this.newPassword = '';
          this.confirmPassword = '';
        }
      },
      error: () => {
        this.passwordMessage = 'Wystąpił nieoczekiwany błąd';
      }
    });
  }

  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Nie udało się wczytać pliku obrazu.'));
      reader.readAsDataURL(file);
    });
  }
}

