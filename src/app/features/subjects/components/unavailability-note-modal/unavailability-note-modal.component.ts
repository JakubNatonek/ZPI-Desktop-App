import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ModalController, ToastController, IonButton, IonContent, IonDatetime, IonGrid, IonCol, IonRow, IonItem, IonLabel, IonInput, IonSelect, IonSelectOption, IonTextarea, IonSpinner, IonIcon } from '@ionic/angular/standalone';
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
    IonDatetime,
    IonGrid,
    IonCol,
    IonRow,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonSpinner,
    IonIcon,
  ],
})
export class UnavailabilityNoteModalComponent implements OnInit {
  form!: FormGroup;
  isLoading = false;
  isDateRange = false;

  constructor(
    private modalController: ModalController,
    private toastController: ToastController,
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
    if (!this.isDateRange) {
      this.form.patchValue({ endDate: '' });
    }
  }

  /**
   * Zapisuje formę i wysyła do API
   */
  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      await this.showToast('Proszę poprawnie wypełnić formularz', 'danger');
      return;
    }

    this.isLoading = true;

    try {
      const formValue = this.form.value;

      // Przygotuj payload
      const payload: CreateUnavailabilityNoteRequest = {
        start_date: this.formatDateForAPI(formValue.startDate),
        end_date: this.isDateRange && formValue.endDate ? this.formatDateForAPI(formValue.endDate) : null,
        description: formValue.description || null,
        note_type: formValue.noteType as NoteType,
      };

      // Walidacja: end_date nie może być przed start_date
      if (payload.end_date && payload.start_date > payload.end_date) {
        await this.showToast('Data końcowa nie może być przed datą początkową', 'danger');
        this.isLoading = false;
        return;
      }

      // Wyślij do API
      await this.unavailabilityService.createNote(payload).toPromise();

      await this.showToast('Notatka została dodana pomyślnie', 'success');
      await this.modalController.dismiss({
        dismissed: true,
        success: true,
      });
    } catch (error: any) {
      console.error('Error creating unavailability note:', error);
      const errorMessage = error?.error?.detail || 'Błąd podczas tworzenia notatki';
      await this.showToast(errorMessage, 'danger');
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
   * Wyświetla toast
   */
  private async showToast(message: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 3000,
      position: 'bottom',
      color,
    });
    await toast.present();
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
    return this.isDateRange ? 'Zakres dat' : 'Jednodniowa';
  }
}
