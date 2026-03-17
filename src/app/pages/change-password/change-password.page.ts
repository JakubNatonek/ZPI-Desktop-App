import { Component } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { addIcons } from 'ionicons';
import { lockClosedOutline } from 'ionicons/icons';

@Component({
  selector: 'app-change-password',
  templateUrl: 'change-password.page.html',
  styleUrls: ['change-password.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class ChangePasswordPage {
  newPassword = '';
  confirmPassword = '';
  error = '';
  success = '';

  constructor(private auth: AuthService, private router: Router) {
    addIcons({ lockClosedOutline });
  }

  changePassword() {
    this.error = '';
    this.success = '';

    if (!this.newPassword || !this.confirmPassword) {
      this.error = 'Wypełnij oba pola';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'Hasła nie pasują do siebie';
      return;
    }

    // Since this is the initial one-time password change after login,
    // the backend requires new_password and confirm_new_password.
    // The currentPassword required by our old mock can be passed empty or dummy.
    this.auth.changePassword('', this.newPassword).subscribe({
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
