import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { MenuController } from '@ionic/angular';
import { IonApp, IonRouterOutlet, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonButtons, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { ChatComponent } from './features/chat/chat.component';
import { filter, Subscription } from 'rxjs';

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
    CommonModule,
    ChatComponent,
  ],
})
export class AppComponent implements OnInit, OnDestroy {
  private routerSub!: Subscription;

  constructor(
    public auth: AuthService,
    private router: Router,
    public menu: MenuController
  ) {}

  
  async navigate(path: string) {
    if (this.auth.isLoggedIn && this.auth.mustChangePassword && path !== '/change-password') {
      await this.router.navigate(['/change-password']);
      await this.menu.close('mainMenu');
      return;
    }
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
    this.checkRoute();

    this.routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.checkRoute();
    });
  }

  ngOnDestroy() {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
  }

  private checkRoute() {
    if (!this.auth.isLoggedIn && this.router.url !== '/login') {
      this.router.navigateByUrl('/login');
    } else if (this.auth.isLoggedIn && this.auth.mustChangePassword && this.router.url !== '/change-password') {
      this.router.navigateByUrl('/change-password');
    }
  }
}

