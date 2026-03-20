import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { RoomDto, RoomsApiService } from '../../core/services/rooms-api.service';

@Component({
  selector: 'app-sale-list',
  templateUrl: './sale-list.page.html',
  styleUrls: ['./sale-list.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SaleListPage implements OnInit {
  isLoading = false;
  isDeleting = false;
  errorMessage = '';
  rooms: RoomDto[] = [];

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly roomsApi: RoomsApiService
  ) {}

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadRooms();
  }

  createRoom(): void {
    this.router.navigateByUrl('/sale/new');
  }

  editRoom(roomId: number): void {
    this.router.navigateByUrl(`/sale/${roomId}/edit`);
  }

  deleteRoom(roomId: number): void {
    if (this.isDeleting) {
      return;
    }

    const accepted = window.confirm('Czy na pewno chcesz usunac te sale?');
    if (!accepted) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = '';

    this.roomsApi
      .deleteRoom(roomId)
      .pipe(finalize(() => (this.isDeleting = false)))
      .subscribe({
        next: () => this.loadRooms(),
        error: () => {
          this.errorMessage = 'Nie udalo sie usunac sali.';
        },
      });
  }

  trackByRoomId(_: number, room: RoomDto): number {
    return room.id;
  }

  private loadRooms(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.roomsApi
      .getRooms()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (rooms) => {
          this.rooms = rooms;
        },
        error: () => {
          this.errorMessage = 'Nie udalo sie pobrac listy sal.';
        },
      });
  }
}
