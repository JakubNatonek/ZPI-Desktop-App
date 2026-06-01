import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { finalize } from 'rxjs';
import { addIcons } from 'ionicons';
import { pencilOutline, trashOutline, alertCircleOutline } from 'ionicons/icons';

import { AuthService } from '../../core/services/auth.service';
import { ActivityOption, SubjectsApiService } from '../../core/services/subjects-api.service';

@Component({
  selector: 'app-subject-dictionaries',
  templateUrl: './subject-dictionaries.page.html',
  styleUrls: ['./subject-dictionaries.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SubjectDictionariesPage implements OnInit {
  isLoading = false;
  isUpdatingDictionary = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  errorMessage = '';
  dictionaryErrorMessage = '';
  activityOptions: ActivityOption[] = [];

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly subjectsApi: SubjectsApiService,
    private readonly alertController: AlertController,
  ) {
    addIcons({ pencilOutline, trashOutline, alertCircleOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin' && this.auth.role !== 'rapla_editor' && this.auth.role !== 'lecturer_rapla_editor') {
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
    this.router.navigateByUrl('/subjects');
  }

  navigateToCreateSubject(): void {
    this.router.navigateByUrl('/subjects/new');
  }

  async createActivity(): Promise<void> {
    const name = await this.promptForValue('Nowy typ zajec', 'Podaj nazwe typu zajec');
    if (!name) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.subjectsApi
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

  async editActivity(activity: ActivityOption): Promise<void> {
    const name = await this.promptForValue('Edytuj typ zajec', 'Nazwa typu zajec', activity.name);
    if (!name) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.subjectsApi
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

  async deleteActivity(activity: ActivityOption): Promise<void> {
    const confirmed = await this.confirmAction('Usun typ zajec', `Czy na pewno usunac typ zajec: ${activity.name}?`);
    if (!confirmed) {
      return;
    }

    this.isUpdatingDictionary = true;
    this.dictionaryErrorMessage = '';
    this.subjectsApi
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

    this.subjectsApi
      .getActivities()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (activities) => {
          this.activityOptions = activities;
        },
        error: () => {
          this.errorMessage = 'Nie udalo sie pobrac slownika typow zajec.';
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
        return 'Brak uprawnien do zarzadzania slownikiem.';
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
