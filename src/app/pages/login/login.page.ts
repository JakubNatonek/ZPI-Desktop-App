import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { addIcons } from 'ionicons';
import { mailOutline, lockClosedOutline, eyeOutline, eyeOffOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class LoginPage implements OnInit {
  login = '';
  password = '';
  error = '';
  showPassword = false;
  isLoading = false;

  constructor(private auth: AuthService, private router: Router) {
    addIcons({ mailOutline, lockClosedOutline, eyeOutline, eyeOffOutline });
  }

  ngOnInit() {
    if (this.auth.isLoggedIn) {
      this.router.navigateByUrl('/home');
    }
  }

  submit() {
    if (!this.login || !this.password) {
      this.error = 'Wypełnij wszystkie pola';
      return;
    }
    this.error = '';
    this.isLoading = true;
    this.auth.login(this.login, this.password).subscribe({
      next: (res: { success: boolean; mustChangePassword?: boolean }) => {
        this.isLoading = false;
        if (res.success) {
          if (res.mustChangePassword) {
            this.router.navigateByUrl('/change-password');
          } else {
            this.router.navigateByUrl('/home');
          }
          return;
        }
        this.error = 'Nieprawidłowe dane logowania';
      },
      error: () => {
        this.isLoading = false;
        this.error = 'Nieprawidłowe dane logowania';
      },
    });
  }

  togglePassword() {
    this.showPassword = !this.showPassword;
  }
}
