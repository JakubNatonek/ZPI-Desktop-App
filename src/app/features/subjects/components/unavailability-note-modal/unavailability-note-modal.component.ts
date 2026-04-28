import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalController, IonButton, IonContent, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner, IonIcon, IonList } from '@ionic/angular/standalone';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { CreateUnavailabilityNoteRequest, NoteType, UnavailabilityNotesApiService } from '../../../../core/services/unavailability-notes-api.service';

@Component({
  selector: 'app-unavailability-note-modal',
  templateUrl: './unavailability-note-modal.component.html',
  styleUrls: ['./unavailability-note-modal.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    IonButton,
    IonContent,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonSpinner,
    IonIcon,
    IonList,
  ],
})
export class UnavailabilityNoteModalComponent implements OnInit {
  form!: FormGroup;
  isLoading = false;
  isDateRange = false;
  submitErrorMessage = '';

  constructor(
    private modalController: ModalController,
    private fb: FormBuilder,
    private unavailabilityService: UnavailabilityNotesApiService,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.form = this.fb.group({
      noteType: ['request', Validators.required],
      startDate: ['', Validators.required],
      endDate: [''],
      description: ['', Validators.maxLength(1000)],
    });
  }

  /**
   * Zmienia typ notatki i resetuje pola dat
   */
  onNoteTypeChange(event: any): void {
    const selectedType = event.detail.value;
    this.isDateRange = false; // Reset na jednodniową
    this.submitErrorMessage = '';
    this.form.patchValue({
      startDate: '',
      endDate: '',
    });
  }

  /**
   * Toggle między datą jednodniową a zakresem dat
   */
  toggleDateType(): void {
    this.isDateRange = !this.isDateRange;
    this.submitErrorMessage = '';
    if (!this.isDateRange) {
      this.form.patchValue({ endDate: '' });
    }
  }

  /**
   * Zapisuje formę i wysyła do API
   */
  async onSubmit(): Promise<void> {
    this.submitErrorMessage = '';

    if (this.form.invalid) {
      this.submitErrorMessage = 'Proszę poprawnie wypełnić wszystkie wymagane pola';
      this.form.markAllAsTouched();
      return;
    }

    try {
      const formValue = this.form.value;

      if (this.isDateInThePast(formValue.startDate)) {
        this.submitErrorMessage = 'Nie można zgłosić niedostępności z datą wsteczną';
        return;
      }

      // Przygotuj payload
      const payload: CreateUnavailabilityNoteRequest = {
        start_date: this.formatDateForAPI(formValue.startDate),
        end_date: this.isDateRange && formValue.endDate ? this.formatDateForAPI(formValue.endDate) : null,
        description: formValue.description || null,
        note_type: formValue.noteType as NoteType,
      };

      // Walidacja: end_date nie może być przed start_date
      if (payload.end_date && payload.start_date > payload.end_date) {
        this.submitErrorMessage = 'Data końcowa nie może być przed datą początkową';
        return;
      }

      this.isLoading = true;

      // Wyślij do API
      console.debug('Creating unavailability note payload:', payload);
      await this.unavailabilityService.createNote(payload).toPromise();

      await this.modalController.dismiss({
        dismissed: true,
        success: true,
      });
    } catch (error: any) {
      console.error('Error creating unavailability note:', error);
      this.submitErrorMessage = error?.error?.detail || 'Błąd podczas tworzenia notatki';
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Zamyka modal
   */
  dismiss(): void {
    this.modalController.dismiss({
      dismissed: true,
      success: false,
    });
  }

  /**
   * Formatuje datę z Ionic Datetime na YYYY-MM-DD
   */
  private formatDateForAPI(dateString: string): string {
    if (!dateString) return '';
    // Ionic DateTime zwraca format: YYYY-MM-DDTHH:mm:ss.sssZ
    // My potrzebujemy: YYYY-MM-DD
    const date = new Date(dateString);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /**
   * Getter dla typu notatki (dla szablonu)
   */
  get noteType(): string {
    return this.form.get('noteType')?.value || 'request';
  }

  /**
   * Getter dla informacyjnego tekstu
   */
  get dateRangeLabel(): string {
    return this.isDateRange ? 'Tryb: zakres dat' : 'Tryb: jednodniowy';
  }

  /**
   * Sprawdza, czy wybrana data jest wcześniejsza niż dziś.
   */
  private isDateInThePast(dateString: string): boolean {
    if (!dateString) {
      return false;
    }

    return dateString < this.getTodayDateString();
  }

  /**
   * Zwraca dzisiejszą datę w formacie YYYY-MM-DD.
   */
  private getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
