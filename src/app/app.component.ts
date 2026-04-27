import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { MenuController, ToastController } from '@ionic/angular';
import { IonApp, IonRouterOutlet, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonButtons, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { ChatComponent } from './features/chat/chat.component';
import { NotificationsApiService, NotificationDto } from './core/services/notifications-api.service';
import { filter, Subscription, interval } from 'rxjs';

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
  private notificationCheckSub!: Subscription;
  private lastNotificationIds: Set<number> = new Set();

  constructor(
    public auth: AuthService,
    private router: Router,
    public menu: MenuController,
    private notificationsService: NotificationsApiService,
    private toastController: ToastController,
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

    // Uruchom system powiadomień jeśli użytkownik jest zalogowany
    if (this.auth.isLoggedIn) {
      this.initNotificationPolling();
    }
  }

  ngOnDestroy() {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
    if (this.notificationCheckSub) {
      this.notificationCheckSub.unsubscribe();
    }
  }

  private checkRoute() {
    if (this.auth.isRestoringSession) {
      return;
    }

    if (!this.auth.isLoggedIn && this.router.url !== '/login') {
      this.router.navigateByUrl('/login');
    } else if (this.auth.isLoggedIn && this.auth.mustChangePassword && this.router.url !== '/change-password') {
      this.router.navigateByUrl('/change-password');
    }
  }

  /**
   * Inicjalizuje sondowanie nowych powiadomień
   * Sonduje co 10 sekund, wyświetla toast dla nowych powiadomień
   */
  private initNotificationPolling(): void {
    // Pobierz powiadomienia na starcie
    this.checkForNewNotifications();

    // Ustaw interval - sonduj co 10 sekund
    this.notificationCheckSub = interval(10000).subscribe(() => {
      if (this.auth.isLoggedIn) {
        this.checkForNewNotifications();
      }
    });
  }

  /**
   * Pobiera nieprzeczytane powiadomienia i wyświetla toast dla nowych
   */
  private checkForNewNotifications(): void {
    this.notificationsService.getUnreadNotifications().subscribe({
      next: (data) => {
        // Filtruj tylko nowe powiadomienia (których jeszcze nie widzieliśmy)
        const newNotifications = data.items.filter(
          (notification) => !this.lastNotificationIds.has(notification.id)
        );

        // Dla każdego nowego powiadomienia pokaż toast
        newNotifications.forEach((notification) => {
          this.lastNotificationIds.add(notification.id);
          this.displayNotificationToast(notification);
        });
      },
      error: (error) => {
        console.error('Error checking notifications:', error);
        // Nie pokazuj errora użytkownikowi - po prostu ticho zawiodło
      },
    });
  }

  /**
   * Wyświetla powiadomienie jako toast
   */
  private async displayNotificationToast(notification: NotificationDto): Promise<void> {
    const toast = await this.toastController.create({
      message: notification.message,
      duration: 0, // Nie auto-zamyka, użytkownik musi kliknąć OK
      position: 'top',
      color: 'primary',
      buttons: [
        {
          text: 'OK',
          role: 'cancel',
          handler: async () => {
            // Oznacz jako przeczytane
            await this.markNotificationAsRead(notification.id);
          },
        },
      ],
      cssClass: 'notification-toast',
    });

    await toast.present();
  }

  /**
   * Oznacza powiadomienie jako przeczytane
   */
  private markNotificationAsRead(notificationId: number): void {
    this.notificationsService.markAsRead(notificationId).subscribe({
      error: (error) => {
        console.error('Error marking notification as read:', error);
      },
    });
  }
}

