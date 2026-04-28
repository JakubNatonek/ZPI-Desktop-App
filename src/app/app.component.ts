import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { MenuController, AlertController } from '@ionic/angular';
import { IonApp, IonRouterOutlet, IonMenu, IonHeader, IonToolbar, IonTitle, IonContent, IonList, IonItem, IonButtons, IonButton, IonIcon } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { AuthService } from './core/services/auth.service';
import { WebSocketService } from './core/services/websocket.service';
import { ChatComponent } from './features/chat/chat.component';
import { NotificationsApiService, NotificationDto } from './core/services/notifications-api.service';
import { filter, Subscription, interval, distinctUntilChanged } from 'rxjs';

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
  private authStateSub?: Subscription;
  private notificationCheckSub?: Subscription;
  private lastNotificationIds: Set<number> = new Set();

  constructor(
    public auth: AuthService,
    private router: Router,
    public menu: MenuController,
    private notificationsService: NotificationsApiService,
    private alertController: AlertController,
    private websocket: WebSocketService,
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

    this.authStateSub = this.auth.isAuthenticated$
      .pipe(distinctUntilChanged())
      .subscribe(() => this.syncNotificationPollingState());

    // Subscribe to live socket notifications
    this.websocket.notification$.subscribe((data) => {
      try {
        const notification: NotificationDto = data as NotificationDto;
        // Ensure we haven't shown it already
        if (!this.lastNotificationIds.has(notification.id)) {
          this.lastNotificationIds.add(notification.id);
          void this.displayBlockingNotification(notification);
        }
      } catch (e) {
        console.error('Error handling live notification:', e);
      }
    });

    this.syncNotificationPollingState();
  }

  ngOnDestroy() {
    if (this.routerSub) {
      this.routerSub.unsubscribe();
    }
    if (this.authStateSub) {
      this.authStateSub.unsubscribe();
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
   * Sonduje co 10 sekund, wyświetla blokujący alert dla nowych powiadomień
   */
  private initNotificationPolling(): void {
    if (this.notificationCheckSub) {
      return;
    }

    // Pobierz powiadomienia na starcie
    this.checkForNewNotifications();

    // Ustaw interval - sonduj co 10 sekund
    this.notificationCheckSub = interval(10000).subscribe(() => {
      if (this.auth.isLoggedIn) {
        this.checkForNewNotifications();
      }
    });
  }

  private stopNotificationPolling(): void {
    if (this.notificationCheckSub) {
      this.notificationCheckSub.unsubscribe();
      this.notificationCheckSub = undefined;
    }

    this.lastNotificationIds.clear();
  }

  private syncNotificationPollingState(): void {
    if (this.auth.isLoggedIn && this.auth.isBackendSessionActive()) {
      this.websocket.connect();
      this.initNotificationPolling();
      return;
    }

    this.websocket.disconnect();

    this.stopNotificationPolling();
  }

  /**
   * Pobiera nieprzeczytane powiadomienia i wyświetla alert dla nowych
   */
  private checkForNewNotifications(): void {
    this.notificationsService.getUnreadNotifications().subscribe({
      next: (data) => {
        // Filtruj tylko nowe powiadomienia (których jeszcze nie widzieliśmy)
        const newNotifications = data.items.filter(
          (notification) => !this.lastNotificationIds.has(notification.id)
        );

        // Dla każdego nowego powiadomienia pokaż alert po kolei
        void (async () => {
          for (const notification of newNotifications) {
            this.lastNotificationIds.add(notification.id);
            await this.displayBlockingNotification(notification);
          }
        })();
      },
      error: (error) => {
        console.error('Error checking notifications:', error);
        // Nie pokazuj errora użytkownikowi - po prostu ticho zawiodło
      },
    });
  }

  /**
   * Wyświetla powiadomienie jako blokujący alert modalny
   */
  private async displayBlockingNotification(notification: NotificationDto): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Nowa notatka o niedostępności',
      message: notification.message,
      backdropDismiss: false,
      keyboardClose: false,
      cssClass: 'notification-alert',
      buttons: [
        {
          text: 'OK',
          role: 'confirm',
          handler: async () => {
            // Oznacz jako przeczytane
            await this.markNotificationAsRead(notification.id);
          },
        },
      ],
    });

    await alert.present();
    await alert.onDidDismiss();
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

