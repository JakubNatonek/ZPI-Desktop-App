import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { finalize, forkJoin } from 'rxjs';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline } from 'ionicons/icons';

import { AuthService } from '../../core/services/auth.service';
import { ActivityOption, SubjectPayload, SubjectsApiService } from '../../core/services/subjects-api.service';

@Component({
  selector: 'app-subject',
  templateUrl: './subject.page.html',
  styleUrls: ['./subject.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SubjectPage implements OnInit {
  subjectId: number | null = null;
  isEditMode = false;
  isLoading = false;
  isSaving = false;
  isUpdatingDictionary = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  name = '';
  activityId: number | null = null;
  typeDisplay = '';
  roomProperties = '';
  blocked = false;
  periodic = true;

  submitMessage = '';
  errorMessage = '';
  dictionaryErrorMessage = '';

  activityOptions: ActivityOption[] = [];

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
    private readonly subjectsApi: SubjectsApiService,
    private readonly alertController: AlertController,
  ) {
    addIcons({ alertCircleOutline, checkmarkCircleOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
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

    const selectedActivityId = Number(this.activityId);
    if (!Number.isInteger(selectedActivityId) || selectedActivityId <= 0) {
      this.errorMessage = 'Wybierz typ zajec.';
      return;
    }

    const payload: SubjectPayload = {
      name: this.name.trim(),
      activity_id: selectedActivityId,
      type_display: this.normalizeOptional(this.typeDisplay),
      room_properties: this.normalizeOptional(this.roomProperties),
      blocked: this.blocked,
      periodic: this.periodic,
    };

    this.isSaving = true;
    const request$ = this.isEditMode && this.subjectId !== null
      ? this.subjectsApi.updateSubject(this.subjectId, payload)
      : this.subjectsApi.createSubject(payload);

    request$
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: () => {
          this.submitMessage = this.isEditMode
            ? 'Przedmiot zostal zaktualizowany.'
            : 'Przedmiot zostal utworzony.';
          this.router.navigateByUrl('/subjects');
        },
        error: (error) => this.handleSaveError(error),
      });
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
          this.activityId = created.id;
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
          if (this.activityId === activity.id) {
            this.activityId = this.getDefaultActivityId();
          }
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
      name: '',
      activityId: this.getDefaultActivityId(),
      typeDisplay: '',
      roomProperties: '',
      blocked: false,
      periodic: true,
    });

    this.name = '';
    this.activityId = this.getDefaultActivityId();
    this.typeDisplay = '';
    this.roomProperties = '';
    this.blocked = false;
    this.periodic = true;
  }

  navigateToList(): void {
    this.router.navigateByUrl('/subjects');
  }

  navigateToDictionaries(): void {
    this.router.navigateByUrl('/subjects/dictionaries');
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

  private loadInitialData(): void {
    this.isLoading = true;
    this.errorMessage = '';

    forkJoin({
      activities: this.subjectsApi.getActivities(),
    }).subscribe({
      next: ({ activities }) => {
        this.activityOptions = activities;
        this.resolvePageMode();
      },
      error: () => {
        this.isLoading = false;
        this.errorMessage = 'Nie udalo sie pobrac slownika typow zajec.';
      },
    });
  }

  private resolvePageMode(): void {
    const subjectIdParam = this.route.snapshot.paramMap.get('id');

    if (!subjectIdParam) {
      this.isEditMode = false;
      this.subjectId = null;
      this.activityId = this.getDefaultActivityId();
      this.isLoading = false;
      return;
    }

    const parsedId = Number(subjectIdParam);
    if (!Number.isInteger(parsedId) || parsedId <= 0) {
      this.router.navigateByUrl('/subjects');
      return;
    }

    this.isEditMode = true;
    this.subjectId = parsedId;
    this.loadSubject(parsedId);
  }

  private loadSubject(subjectId: number): void {
    this.errorMessage = '';

    this.subjectsApi
      .getSubjectById(subjectId)
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (subject) => {
          this.name = subject.name;
          this.activityId = this.resolveActivityId(subject.activity_id);
          this.typeDisplay = subject.type_display ?? '';
          this.roomProperties = subject.room_properties ?? '';
          this.blocked = subject.blocked;
          this.periodic = subject.periodic;
        },
        error: () => {
          this.errorMessage = 'Nie udalo sie pobrac danych przedmiotu.';
        },
      });
  }

  private resolveActivityId(activityId: number | null): number | null {
    if (typeof activityId === 'number' && activityId > 0) {
      return activityId;
    }

    return this.getDefaultActivityId();
  }

  private getDefaultActivityId(): number | null {
    return this.activityOptions.length > 0 ? this.activityOptions[0].id : null;
  }

  private handleSaveError(error: unknown): void {
    if (error instanceof HttpErrorResponse && error.status === 409) {
      this.errorMessage = 'Przedmiot o tej nazwie i typie zajec juz istnieje.';
      return;
    }

    if (error instanceof HttpErrorResponse && (error.status === 400 || error.status === 422)) {
      this.errorMessage = error.error?.detail || 'Dane przedmiotu sa niepoprawne.';
      return;
    }

    this.errorMessage = 'Nie udalo sie zapisac przedmiotu. Sprobuj ponownie.';
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

  private normalizeOptional(value: string): string | null {
    const cleaned = value.trim();
    return cleaned ? cleaned : null;
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
