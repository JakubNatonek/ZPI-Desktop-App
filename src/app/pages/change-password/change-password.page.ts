import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { addIcons } from 'ionicons';
import { lockClosedOutline } from 'ionicons/icons';
import { calcPasswordStrength, passwordMatchValidator, passwordNotContainsNameValidator, passwordStrengthValidator } from '../../core/validators/form-validators';

@Component({
  selector: 'app-change-password',
  templateUrl: 'change-password.page.html',
  styleUrls: ['change-password.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class ChangePasswordPage {
  readonly form = this.fb.group(
    {
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

  constructor(private readonly fb: FormBuilder, private readonly auth: AuthService, private readonly router: Router) {
    addIcons({ lockClosedOutline });

    // Walidator imię/nazwisko jest tworzony po zalogowaniu – w tym momencie auth.firstName/lastName są już dostępne.
    this.form.controls.newPassword.addValidators(
      passwordNotContainsNameValidator(this.auth.firstName, this.auth.lastName)
    );
    this.form.controls.newPassword.updateValueAndValidity();
  }

  changePassword() {
    this.error = '';
    this.success = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.errors?.['passwordMismatch']) {
        this.error = 'Hasła nie pasują do siebie.';
      } else {
        this.error = 'Uzupełnij poprawnie wszystkie pola.';
      }
      return;
    }

    const newPassword = this.form.controls.newPassword.value!;

    this.auth.changePassword('', newPassword).subscribe({
      next: (res) => {
        if (res.success) {
          this.success = 'Hasło zostało zmienione. Przekierowuję...';
          setTimeout(() => {
            this.router.navigateByUrl('/home');
          }, 1500);
        } else {
          this.error = res.message || 'Błąd przy zmianie hasła';
        }
      },
      error: () => {
        this.error = 'Wystąpił nieoczekiwany błąd';
      }
    });
  }
}
