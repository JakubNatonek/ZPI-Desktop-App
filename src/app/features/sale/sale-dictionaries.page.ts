import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { finalize, forkJoin } from 'rxjs';
import { addIcons } from 'ionicons';
import { createOutline, trashOutline, alertCircleOutline } from 'ionicons/icons';

import { AuthService } from '../../core/services/auth.service';
import {
  RoomActivityOption,
  RoomDepartmentOption,
  RoomsApiService,
  RoomSpecialEquipmentOption,
  RoomTypeOption,
} from '../../core/services/rooms-api.service';

@Component({
  selector: 'app-sale-dictionaries',
  templateUrl: './sale-dictionaries.page.html',
  styleUrls: ['./sale-dictionaries.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SaleDictionariesPage implements OnInit {
  isLoading = false;
  isUpdatingDictionary = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  errorMessage = '';
  dictionaryErrorMessage = '';

  roomTypeOptions: RoomTypeOption[] = [];
  activityOptions: RoomActivityOption[] = [];
  specialEquipmentOptions: RoomSpecialEquipmentOption[] = [];
  departmentOptions: RoomDepartmentOption[] = [];

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly roomsApi: RoomsApiService,
    private readonly alertController: AlertController,
  ) {
    addIcons({ createOutline, trashOutline, alertCircleOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadDictionaryData();
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  get userDisplayName(): string {
    return this.auth.displayName;
  }

  navigateToList(): void {
    this.router.navigateByUrl('/sale');
  }

  navigateToCreateRoom(): void {
    this.router.navigateByUrl('/sale/new');
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
        },
        error: (error) => {
          this.dictionaryErrorMessage = this.mapDictionaryError(error);
        },
      });
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

  private loadDictionaryData(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.dictionaryErrorMessage = '';

    forkJoin({
      roomTypes: this.roomsApi.getRoomTypes(),
      activities: this.roomsApi.getActivities(),
      specialEquipment: this.roomsApi.getSpecialEquipment(),
      departments: this.roomsApi.getDepartments(),
    })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: ({ roomTypes, activities, specialEquipment, departments }) => {
          this.roomTypeOptions = roomTypes;
          this.activityOptions = activities;
          this.specialEquipmentOptions = specialEquipment;
          this.departmentOptions = departments;
        },
        error: () => {
          this.errorMessage = 'Nie udalo sie pobrac slownikow sal. Sprobuj ponownie.';
        },
      });
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
