import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { addIcons } from 'ionicons';
import { mailOutline, lockClosedOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: 'login.page.html',
  styleUrls: ['login.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class LoginPage implements OnInit {
  email = '';
  password = '';
  error = '';

  demoAccounts = this.auth.availableAccounts;

  constructor(private auth: AuthService, private router: Router) {
    addIcons({ mailOutline, lockClosedOutline });
  }

  ngOnInit() {
    if (this.auth.isLoggedIn) {
      this.router.navigateByUrl('/home');
    }
  }

  login() {
    this.error = '';
    this.auth.login(this.email, this.password).subscribe({
      next: (success: boolean) => {
        if (success) {
          this.router.navigateByUrl('/home');
          return;
        }

        this.error = 'Nieprawidłowe dane logowania';
      },
      error: () => {
        this.error = 'Nieprawidłowe dane logowania';
      },
    });
  }

  fillDemo(email: string, password: string) {
    this.email = email;
    this.password = password;
  }

  copyDemo() {
    const text = this.demoAccounts
      .map((account: { displayName: string; email: string; password: string }) => `${account.displayName}: ${account.email} / ${account.password}`)
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      console.log('skopiowano dane');
    });
  }
}
