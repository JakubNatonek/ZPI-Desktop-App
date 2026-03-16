import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MenuController } from '@ionic/angular';
import { IonApp, IonRouterOutlet, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonButtons, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  standalone: true,
  imports: [
    IonApp,
    IonRouterOutlet,
    IonMenu,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonItem,
    IonButtons,
    IonButton,
    IonIcon,
    CommonModule
  ],
})
export class AppComponent implements OnInit {
  constructor(
    public auth: AuthService,
    private router: Router,
    public menu: MenuController
  ) {}

  
  async navigate(path: string) {
    await this.router.navigate([path]);
    await this.menu.close('mainMenu');
  }

  openMenu() {
    this.menu.open('mainMenu');
  }

  closeMenu() {
    this.menu.close('mainMenu');
  }

  logout() {
    this.menu.close('mainMenu');
    this.auth.logout();
  }

  ngOnInit() {
    if (!this.auth.isLoggedIn && this.router.url !== '/login') {
      this.router.navigateByUrl('/login');
    }
  }
}

