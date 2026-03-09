import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
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

  demoEmail = 'test@gmail.com';
  demoPassword = '12345';

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
    if (this.auth.login(this.email, this.password)) {
      this.router.navigateByUrl('/home');
    } else {
      this.error = 'NieprawidĹ‚owe dane logowania';
    }
  }

  copyDemo() {
    const text = `${this.demoEmail}\n`;
    navigator.clipboard.writeText(text).then(() => {
      console.log('skopiowano dane');
    });
  }
}
