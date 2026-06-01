import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { HttpErrorResponse } from '@angular/common/http';
import { finalize, forkJoin } from 'rxjs';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline } from 'ionicons/icons';

import { AuthService } from '../../core/services/auth.service';
import {
  RoomActivityOption,
  RoomDepartmentOption,
  RoomDto,
  RoomPayload,
  RoomsApiService,
  RoomSpecialEquipmentOption,
  RoomTypeOption,
} from '../../core/services/rooms-api.service';

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
  isUpdatingDictionary = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  roomNumber = '';
  seatsCount: number | null = null;
  roomTypeId: number | null = null;
  selectedActivityIds: number[] = [];
  selectedSpecialEquipmentIds: number[] = [];
  selectedDepartmentIds: number[] = [];

  submitMessage = '';
  errorMessage = '';
  dictionaryErrorMessage = '';

  roomTypeOptions: RoomTypeOption[] = [];
  activityOptions: RoomActivityOption[] = [];
  specialEquipmentOptions: RoomSpecialEquipmentOption[] = [];
  departmentOptions: RoomDepartmentOption[] = [];

  constructor(
    public auth: AuthService,
    private router: Router,
    private route: ActivatedRoute,
    private roomsApi: RoomsApiService,
    private alertController: AlertController,
  ) {
    addIcons({ alertCircleOutline, checkmarkCircleOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin' && this.auth.role !== 'rapla_editor' && this.auth.role !== 'lecturer_rapla_editor') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadInitialData();
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  get userDisplayName(): string {
    return this.auth.displayName;
  }

  onSubmit(form: NgForm): void {
    this.submitMessage = '';
    this.errorMessage = '';

    if (!form.valid) {
      this.errorMessage = 'Uzupelnij wszystkie wymagane pola formularza.';
      return;
    }

    const roomTypeId = Number(this.roomTypeId);
    if (!Number.isInteger(roomTypeId) || roomTypeId <= 0) {
      this.errorMessage = 'Wybierz typ sali.';
      return;
    }

    const selectedActivityIds = this.parseIdArray(this.selectedActivityIds);
    if (selectedActivityIds.length === 0) {
      this.errorMessage = 'Wybierz przynajmniej jeden rodzaj zajec dla sali.';
      return;
    }

    const selectedDepartmentIds = this.parseIdArray(this.selectedDepartmentIds);
    if (selectedDepartmentIds.length === 0) {
      this.errorMessage = 'Wybierz przynajmniej jeden wydzial dla sali.';
      return;
    }

    const payload: RoomPayload = {
      room_number: this.roomNumber.trim(),
      seats_count: Number(this.seatsCount),
      room_type_id: roomTypeId,
      special_equipment: this.parseIdArray(this.selectedSpecialEquipmentIds),
      activities: selectedActivityIds,
      departments: selectedDepartmentIds,
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

  async createRoomType(): Promise<void> {
    const name = await this.promptForValue('Nowy typ sali', 'Podaj nazwe typu sali');
    if (!name) {
      return;
    }

    const abbreviation = await this.promptForValue('Skrot typu sali', 'Podaj skrot (np. LAB)');
    if (!abbreviation) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .createRoomType({ name, abbreviation })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (created) => {
          this.roomTypeOptions = [...this.roomTypeOptions, created].sort((a, b) => a.name.localeCompare(b.name));
          this.roomTypeId = created.id;
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async editRoomType(roomType: RoomTypeOption): Promise<void> {
    const name = await this.promptForValue('Edytuj typ sali', 'Nazwa typu sali', roomType.name);
    if (!name) {
      return;
    }

    const abbreviation = await this.promptForValue('Edytuj skrot typu sali', 'Skrot typu sali', roomType.abbreviation);
    if (!abbreviation) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .updateRoomType(roomType.id, { name, abbreviation })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (updated) => {
          this.roomTypeOptions = this.replaceById(this.roomTypeOptions, updated, (item) => item.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async deleteRoomType(roomType: RoomTypeOption): Promise<void> {
    const confirmed = await this.confirmAction('Usun typ sali', `Czy na pewno usunac typ: ${roomType.name}?`);
    if (!confirmed) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .deleteRoomType(roomType.id)
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: () => {
          this.roomTypeOptions = this.roomTypeOptions.filter((item) => item.id !== roomType.id);
          if (this.roomTypeId === roomType.id) {
            this.roomTypeId = this.getDefaultRoomTypeId();
          }
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async createActivity(): Promise<void> {
    const name = await this.promptForValue('Nowa aktywnosc', 'Podaj nazwe aktywnosci');
    if (!name) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .createActivity({ name })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (created) => {
          this.activityOptions = [...this.activityOptions, created].sort((a, b) => a.name.localeCompare(b.name));
          this.selectedActivityIds = Array.from(new Set([...this.selectedActivityIds, created.id]));
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async editActivity(activity: RoomActivityOption): Promise<void> {
    const name = await this.promptForValue('Edytuj aktywnosc', 'Nazwa aktywnosci', activity.name);
    if (!name) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .updateActivity(activity.id, { name })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (updated) => {
          this.activityOptions = this.replaceById(this.activityOptions, updated, (item) => item.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async deleteActivity(activity: RoomActivityOption): Promise<void> {
    const confirmed = await this.confirmAction('Usun aktywnosc', `Czy na pewno usunac aktywnosc: ${activity.name}?`);
    if (!confirmed) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .deleteActivity(activity.id)
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: () => {
          this.activityOptions = this.activityOptions.filter((item) => item.id !== activity.id);
          this.selectedActivityIds = this.selectedActivityIds.filter((id) => id !== activity.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async createSpecialEquipment(): Promise<void> {
    const name = await this.promptForValue('Nowe wyposazenie', 'Podaj nazwe wyposazenia');
    if (!name) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .createSpecialEquipment({ name })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (created) => {
          this.specialEquipmentOptions = [...this.specialEquipmentOptions, created].sort((a, b) => a.name.localeCompare(b.name));
          this.selectedSpecialEquipmentIds = Array.from(new Set([...this.selectedSpecialEquipmentIds, created.id]));
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async editSpecialEquipment(equipment: RoomSpecialEquipmentOption): Promise<void> {
    const name = await this.promptForValue('Edytuj wyposazenie', 'Nazwa wyposazenia', equipment.name);
    if (!name) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .updateSpecialEquipment(equipment.id, { name })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (updated) => {
          this.specialEquipmentOptions = this.replaceById(this.specialEquipmentOptions, updated, (item) => item.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async deleteSpecialEquipment(equipment: RoomSpecialEquipmentOption): Promise<void> {
    const confirmed = await this.confirmAction('Usun wyposazenie', `Czy na pewno usunac wyposazenie: ${equipment.name}?`);
    if (!confirmed) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .deleteSpecialEquipment(equipment.id)
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: () => {
          this.specialEquipmentOptions = this.specialEquipmentOptions.filter((item) => item.id !== equipment.id);
          this.selectedSpecialEquipmentIds = this.selectedSpecialEquipmentIds.filter((id) => id !== equipment.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async createDepartment(): Promise<void> {
    const name = await this.promptForValue('Nowy wydzial', 'Podaj nazwe wydzialu');
    if (!name) {
      return;
    }

    const abbreviation = await this.promptForValue('Skrot wydzialu', 'Podaj skrot wydzialu');
    if (!abbreviation) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .createDepartment({ name, abbreviation })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (created) => {
          this.departmentOptions = [...this.departmentOptions, created].sort((a, b) => a.name.localeCompare(b.name));
          this.selectedDepartmentIds = Array.from(new Set([...this.selectedDepartmentIds, created.id]));
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async editDepartment(department: RoomDepartmentOption): Promise<void> {
    const name = await this.promptForValue('Edytuj wydzial', 'Nazwa wydzialu', department.name);
    if (!name) {
      return;
    }

    const abbreviation = await this.promptForValue('Edytuj skrot wydzialu', 'Skrot wydzialu', department.abbreviation);
    if (!abbreviation) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .updateDepartment(department.id, { name, abbreviation })
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: (updated) => {
          this.departmentOptions = this.replaceById(this.departmentOptions, updated, (item) => item.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  async deleteDepartment(department: RoomDepartmentOption): Promise<void> {
    const confirmed = await this.confirmAction('Usun wydzial', `Czy na pewno usunac wydzial: ${department.name}?`);
    if (!confirmed) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.roomsApi
      .deleteDepartment(department.id)
      .pipe(finalize(() => (this.isUpdatingDictionary = false)))
      .subscribe({
        next: () => {
          this.departmentOptions = this.departmentOptions.filter((item) => item.id !== department.id);
          this.selectedDepartmentIds = this.selectedDepartmentIds.filter((id) => id !== department.id);
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
  }

  resetForm(form: NgForm): void {
    this.submitMessage = '';
    this.errorMessage = '';

    form.resetForm({
      roomNumber: '',
      seatsCount: null,
      roomTypeId: this.getDefaultRoomTypeId(),
    });

    this.roomTypeId = this.getDefaultRoomTypeId();
    this.selectedActivityIds = [];
    this.selectedSpecialEquipmentIds = [];
    this.selectedDepartmentIds = [];
    this.submitMessage = '';
  }

  navigateToList(): void {
    this.router.navigateByUrl('/sale');
  }

  navigateToDictionaries(): void {
    this.router.navigateByUrl('/sale/dictionaries');
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
      this.roomTypeId = this.getDefaultRoomTypeId();
      this.isLoading = false;
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

  private loadInitialData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      roomTypes: this.roomsApi.getRoomTypes(),
      activities: this.roomsApi.getActivities(),
      specialEquipment: this.roomsApi.getSpecialEquipment(),
      departments: this.roomsApi.getDepartments(),
    }).subscribe({
      next: ({ roomTypes, activities, specialEquipment, departments }) => {
        this.roomTypeOptions = roomTypes;
        this.activityOptions = activities;
        this.specialEquipmentOptions = specialEquipment;
        this.departmentOptions = departments;
        this.resolvePageMode();
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Nie udalo sie pobrac slownikow sal. Sprobuj ponownie.';
      },
    });
  }

  private loadRoom(roomId: number): void {
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
    this.roomTypeId = this.resolveRoomTypeId(room);
    this.selectedActivityIds = [...(room.activities ?? [])];
    this.selectedSpecialEquipmentIds = [...(room.special_equipment ?? [])];
    this.selectedDepartmentIds = [...(room.departments ?? [])];
  }

  private resolveRoomTypeId(room: RoomDto): number | null {
    if (typeof room.room_type_id === 'number' && room.room_type_id > 0) {
      return room.room_type_id;
    }

    const normalizedRoomType = room.room_type.trim().toLowerCase();
    const option = this.roomTypeOptions.find((candidate) => candidate.name.trim().toLowerCase() === normalizedRoomType);
    return option?.id ?? this.getDefaultRoomTypeId();
  }

  private getDefaultRoomTypeId(): number | null {
    return this.roomTypeOptions.length > 0 ? this.roomTypeOptions[0].id : null;
  }

  private parseIdArray(values: unknown): number[] {
    if (!Array.isArray(values)) {
      return [];
    }

    const ids = values
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0);

    return Array.from(new Set(ids));
  }

  private handleSaveError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.errorMessage = 'Sala o tym numerze juz istnieje.';
      return;
    }

    if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 422)) {
      this.errorMessage = error.error?.detail || 'Dane sali sa niepoprawne.';
      return;
    }

    this.errorMessage = 'Nie udalo sie zapisac sali. Sprobuj ponownie.';
  }

  private mapDictionaryError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        return error.error?.detail || 'Nie mozna wykonac operacji: konflikt danych.';
      }
      if (error.status === 400 || error.status === 422) {
        return error.error?.detail || 'Niepoprawne dane slownika.';
      }
      if (error.status === 404) {
        return error.error?.detail || 'Element nie zostal znaleziony.';
      }
      if (error.status === 403) {
        return 'Brak uprawnien do zarzadzania slownikami.';
      }
    }

    return 'Nie udalo sie zaktualizowac slownika.';
  }

  private replaceById<T>(items: T[], updatedItem: T, getId: (item: T) => number): T[] {
    const updatedId = getId(updatedItem);
    return items.map((item) => (getId(item) === updatedId ? updatedItem : item));
  }

  private async promptForValue(
    header: string,
    placeholder: string,
    value: string = '',
  ): Promise<string | null> {
    const alert = await this.alertController.create({
      header,
      inputs: [
        {
          name: 'value',
          type: 'text',
          placeholder,
          value,
        },
      ],
      buttons: [
        { text: 'Anuluj', role: 'cancel' },
        { text: 'Zapisz', role: 'confirm' },
      ],
    });

    await alert.present();
    const { role, data } = await alert.onDidDismiss();
    if (role !== 'confirm') {
      return null;
    }

    const nextValue = String(data?.values?.value ?? '').trim();
    return nextValue || null;
  }

  private async confirmAction(header: string, message: string): Promise<boolean> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: [
        { text: 'Anuluj', role: 'cancel' },
        { text: 'Usun', role: 'confirm' },
      ],
    });

    await alert.present();
    const result = await alert.onDidDismiss();
    return result.role === 'confirm';
  }
}
