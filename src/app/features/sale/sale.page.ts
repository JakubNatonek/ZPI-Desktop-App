import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { RoomDto, RoomPayload, RoomsApiService, RoomType } from '../../core/services/rooms-api.service';


interface RoomTypeOption {
  value: RoomType;
  label: string;
}

@Component({
  selector: 'app-sale',
  templateUrl: './sale.page.html',
  styleUrls: ['./sale.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SalePage implements OnInit {
  roomId: number | null = null;
  isEditMode = false;
  isLoading = false;
  isSaving = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  roomNumber = '';
  seatsCount: number | null = null;
  roomType: RoomType = 'informatyczna';
  specialEquipment = '';

  submitMessage = '';
  errorMessage = '';

  readonly roomTypeOptions: RoomTypeOption[] = [
    { value: 'informatyczna', label: 'Sala informatyczna' },
    { value: 'wykladowa', label: 'Sala wykładowa' },
    { value: 'mechatroniczna', label: 'Sala mechatroniczna' },
    { value: 'elektrotechniczna', label: 'Sala elektrotechniczna' },
    { value: 'laboratoryjna', label: 'Sala laboratoryjna' },
    { value: 'inna', label: 'Inny typ sali' },
  ];

  readonly activitiesByRoomType: Record<RoomType, string[]> = {
    informatyczna: [
      'Programowanie',
      'Bazy danych',
      'Sieci komputerowe',
      'Systemy operacyjne',
      'Cyberbezpieczenstwo',
    ],
    wykladowa: [
      'Wyklady ogolne',
      'Seminaria',
      'Prezentacje projektow',
      'Egzaminy pisemne',
    ],
    mechatroniczna: [
      'Podstawy mechatroniki',
      'Automatyka i robotyka',
      'Programowanie sterownikow PLC',
      'Diagnostyka ukladow',
    ],
    elektrotechniczna: [
      'Elektrotechnika',
      'Maszyny elektryczne',
      'Pomiary elektryczne',
      'Uklady energoelektroniczne',
    ],
    laboratoryjna: [
      'Laboratoria projektowe',
      'Zajecia praktyczne',
      'Warsztaty zespolowe',
      'Prototypowanie',
    ],
    inna: [
      'Zajecia specjalistyczne',
      'Konsultacje',
      'Warsztaty',
    ],
  };

  selectedActivities: Record<string, boolean> = {};

  constructor(
    private auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private roomsApi: RoomsApiService
  ) {}

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.resolvePageMode();
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  get activityOptions(): string[] {
    return this.activitiesByRoomType[this.roomType] ?? [];
  }

  onRoomTypeChange(): void {
    this.resetSelectedActivities();
  }

  onSubmit(form: NgForm): void {
    this.submitMessage = '';
    this.errorMessage = '';

    if (!form.valid) {
      this.errorMessage = 'Uzupelnij wszystkie wymagane pola formularza.';
      return;
    }

    const chosenActivities = this.getChosenActivities();

    if (chosenActivities.length === 0) {
      this.errorMessage = 'Wybierz przynajmniej jeden rodzaj zajec dla sali.';
      return;
    }

    const payload: RoomPayload = {
      room_number: this.roomNumber.trim(),
      seats_count: Number(this.seatsCount),
      room_type: this.roomType,
      special_equipment: this.specialEquipment.trim(),
      activities: chosenActivities,
    };

    this.isSaving = true;
    const request$ = this.isEditMode && this.roomId !== null
      ? this.roomsApi.updateRoom(this.roomId, payload)
      : this.roomsApi.createRoom(payload);

    request$
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: () => {
          this.submitMessage = this.isEditMode
            ? 'Sala zostala zaktualizowana.'
            : 'Sala zostala utworzona.';

          this.router.navigateByUrl('/sale');
        },
        error: (error) => this.handleSaveError(error),
      });
  }

  resetForm(form: NgForm): void {
    this.submitMessage = '';
    this.errorMessage = '';

    form.resetForm({
      roomNumber: '',
      seatsCount: null,
      roomType: 'informatyczna',
      specialEquipment: '',
    });

    this.roomType = 'informatyczna';
    this.submitMessage = '';
    this.resetSelectedActivities();
  }

  private resetSelectedActivities(): void {
    const nextSelectionState: Record<string, boolean> = {};

    for (const activity of this.activityOptions) {
      nextSelectionState[activity] = false;
    }

    this.selectedActivities = nextSelectionState;
  }

  navigateToList(): void {
    this.router.navigateByUrl('/sale');
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

  private resolvePageMode(): void {
    const roomIdParam = this.route.snapshot.paramMap.get('id');

    if (!roomIdParam) {
      this.isEditMode = false;
      this.roomId = null;
      this.resetSelectedActivities();
      return;
    }

    const parsedId = Number(roomIdParam);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      this.router.navigateByUrl('/sale');
      return;
    }

    this.isEditMode = true;
    this.roomId = parsedId;
    this.loadRoom(parsedId);
  }

  private loadRoom(roomId: number): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.roomsApi
      .getRoomById(roomId)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (room) => this.patchFormFromRoom(room),
        error: () => {
          this.errorMessage = 'Nie udalo sie pobrac danych sali.';
        },
      });
  }

  private patchFormFromRoom(room: RoomDto): void {
    this.roomNumber = room.room_number;
    this.seatsCount = room.seats_count;
    this.roomType = this.roomTypeOptions.some((option) => option.value === room.room_type)
      ? room.room_type
      : 'inna';
    this.specialEquipment = room.special_equipment ?? '';

    this.resetSelectedActivities();
    for (const activity of room.activities ?? []) {
      if (activity in this.selectedActivities) {
        this.selectedActivities[activity] = true;
      }
    }
  }

  private getChosenActivities(): string[] {
    return this.activityOptions.filter((activity) => !!this.selectedActivities[activity]);
  }

  private handleSaveError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.errorMessage = 'Sala o tym numerze juz istnieje.';
      return;
    }

    this.errorMessage = 'Nie udalo sie zapisac sali. Sprobuj ponownie.';
  }
}
