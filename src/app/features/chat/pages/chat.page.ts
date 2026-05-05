import { Component } from '@angular/core';
import {
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonMenuButton,
    IonChip,
    IonLabel,
    IonAvatar,
    IonPopover,
    IonList,
    IonItem,
} from '@ionic/angular/standalone';
import { ChatComponent } from '../chat.component';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

@Component({
    selector: 'app-chat-page',
    templateUrl: './chat.page.html',
    styleUrls: ['./chat.page.scss'],
    standalone: true,
    imports: [
        IonHeader,
        IonToolbar,
        IonTitle,
        IonButtons,
        IonMenuButton,
        IonChip,
        IonLabel,
        IonAvatar,
        IonPopover,
        IonList,
        IonItem,
        ChatComponent,
    ],
})
export class ChatPage {
    isProfileMenuOpen = false;
    profileMenuEvent?: Event;

    constructor(
        public readonly auth: AuthService,
        private readonly router: Router,
    ) { }

    get userRoleLabel(): string {
        return this.auth.roleLabel;
    }

    get userDisplayName(): string {
        return this.auth.displayName;
    }

    toggleProfileMenu(event: Event): void {
        this.profileMenuEvent = event;
        this.isProfileMenuOpen = !this.isProfileMenuOpen;
    }

    closeProfileMenu(): void {
        this.isProfileMenuOpen = false;
    }

    openSettings(): void {
        this.closeProfileMenu();
        this.router.navigateByUrl('/profile');
    }

    logout(): void {
        this.closeProfileMenu();
        this.auth.logout();
    }
}
