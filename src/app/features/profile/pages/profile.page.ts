import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, AppTheme } from '../../../core/services/auth.service';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { lockClosedOutline } from 'ionicons/icons';
import {
  calcPasswordStrength,
  passwordMatchValidator,
  passwordNotContainsNameValidator,
  passwordStrengthValidator,
} from '../../../core/validators/form-validators';

@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class ProfilePage {
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;
  selectedTheme: AppTheme = 'light';

  readonly form = this.fb.group(
    {
      currentPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, passwordStrengthValidator()]],
      confirmPassword: ['', [Validators.required]],
    },
    { validators: passwordMatchValidator('newPassword', 'confirmPassword') }
  );

  error = '';
  success = '';

  get passwordStrength(): number {
    return calcPasswordStrength(this.form.controls.newPassword.value ?? '');
  }

  get passwordStrengthLabel(): string {
    return ['', 'Słabe', 'Średnie', 'Mocne', 'Bardzo mocne'][this.passwordStrength] ?? '';
  }

  get passwordStrengthClass(): string {
    return ['', 'strength-weak', 'strength-fair', 'strength-strong', 'strength-very-strong'][this.passwordStrength] ?? '';
  }

  constructor(
    public auth: AuthService,
    private readonly router: Router,
    private readonly fb: FormBuilder
  ) {
    addIcons({ lockClosedOutline });

    this.form.controls.newPassword.addValidators(
      passwordNotContainsNameValidator(this.auth.firstName, this.auth.lastName)
    );
    this.form.controls.newPassword.updateValueAndValidity();
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  get userDisplayName(): string {
    return this.auth.displayName;
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
    this.auth.updateProfileAvatar(dataUrl).subscribe();
    input.value = '';
  }

  onThemeChange(isDark: boolean) {
    this.selectedTheme = isDark ? 'dark' : 'light';
    this.auth.updateCurrentTheme(this.selectedTheme);
  }

  submitPasswordChange() {
    this.error = '';
    this.success = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.errors?.['passwordMismatch']) {
        this.error = 'Nowe hasła nie są takie same.';
      } else {
        this.error = 'Uzupełnij poprawnie wszystkie pola.';
      }
      return;
    }

    const currentPassword = this.form.controls.currentPassword.value!;
    const newPassword = this.form.controls.newPassword.value!;

    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: (result) => {
        if (result.success) {
          this.success = 'Hasło zmienione pomyślnie.';
          this.form.reset();
        } else {
          this.error = result.message || 'Błąd przy zmianie hasła';
        }
      },
      error: () => {
        this.error = 'Wystąpił nieoczekiwany błąd';
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

