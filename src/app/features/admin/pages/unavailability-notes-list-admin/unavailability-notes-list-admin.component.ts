import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonContent,
  IonHeader,
  IonTitle,
  IonToolbar,
  IonButton,
  IonCard,
  IonCardContent,
  IonCardHeader,
  IonCardTitle,
  IonGrid,
  IonRow,
  IonCol,
  IonSpinner,
  IonIcon,
  IonBadge,
  IonRefresher,
  IonRefresherContent,
  IonText,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  ToastController,
  AlertController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle, checkmark, close, refresh } from 'ionicons/icons';
import { UnavailabilityNotesApiService, UnavailabilityNoteListDto, NoteStatus } from '../../../../core/services/unavailability-notes-api.service';

type FilterType = 'all' | 'pending' | 'accepted' | 'rejected' | 'acknowledged';

@Component({
  selector: 'app-unavailability-notes-list-admin',
  templateUrl: './unavailability-notes-list-admin.component.html',
  styleUrls: ['./unavailability-notes-list-admin.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonContent,
    IonHeader,
    IonTitle,
    IonToolbar,
    IonButton,
    IonCard,
    IonCardContent,
    IonCardHeader,
    IonCardTitle,
    IonGrid,
    IonRow,
    IonCol,
    IonSpinner,
    IonIcon,
    IonBadge,
    IonRefresher,
    IonRefresherContent,
    IonText,
    IonSegment,
    IonSegmentButton,
    IonLabel,
  ],
})
export class UnavailabilityNotesListAdminComponent implements OnInit {
  notes: UnavailabilityNoteListDto[] = [];
  isLoading = false;
  isProcessing: { [noteId: number]: boolean } = {};
  filterType: FilterType = 'all';

  constructor(
    private unavailabilityService: UnavailabilityNotesApiService,
    private toastController: ToastController,
    private alertController: AlertController,
  ) {
    addIcons({ checkmarkCircle, closeCircle, checkmark, close, refresh });
  }

  ngOnInit(): void {
    this.loadNotes();
  }

  /**
   * Ładuje notatki z API
   */
  loadNotes(): void {
    this.isLoading = true;

    let request = this.filterType === 'pending'
      ? this.unavailabilityService.getPendingNotes()
      : this.unavailabilityService.getAllNotes();

    request.subscribe({
      next: (data: UnavailabilityNoteListDto[]) => {
        this.notes = this.filterNotes(data);
        this.isLoading = false;
      },
      error: (error: any) => {
        console.error('Error loading notes:', error);
        this.showToast('Błąd podczas ładowania notatek', 'danger');
        this.isLoading = false;
      },
    });
  }

  /**
   * Filtruje notatki na podstawie wybranego filtru
   */
  private filterNotes(data: UnavailabilityNoteListDto[]): UnavailabilityNoteListDto[] {
    if (this.filterType === 'all' || this.filterType === 'pending') {
      return data;
    }

    return data.filter((note) => note.status === this.filterType);
  }

  /**
   * Zmienia filtr i przeładowuje notatki
   */
  onFilterChange(event: any): void {
    this.filterType = event.detail.value;
    this.loadNotes();
  }

  /**
   * Odświeża listę
   */
  async onRefresh(event: any): Promise<void> {
    this.loadNotes();
    event.detail.complete();
  }

  /**
   * Zmienia status notatki (Accept/Reject/Acknowledge)
   */
  async updateNoteStatus(note: UnavailabilityNoteListDto, newStatus: NoteStatus): Promise<void> {
    if (this.isProcessing[note.id]) return;
    this.isProcessing[note.id] = true;

    try {
      await this.unavailabilityService.updateNoteStatus(note.id, { status: newStatus }).toPromise();

      const statusMessage = this.getStatusMessage(newStatus);
      await this.showToast(`Notatka zmieniona na: ${statusMessage}`, 'success');

      // Przeładuj notatki
      this.loadNotes();
    } catch (error: any) {
      console.error('Error updating note status:', error);
      const errorMessage = error?.error?.detail || 'Błąd podczas aktualizacji statusu';
      await this.showToast(errorMessage, 'danger');
    } finally {
      this.isProcessing[note.id] = false;
    }
  }

  /**
   * Tworzy alert potwierdzający zmianę statusu
   */
  async confirmStatusChange(note: UnavailabilityNoteListDto, newStatus: NoteStatus): Promise<void> {
    const statusMessage = this.getStatusMessage(newStatus);

    const alert = await this.alertController.create({
      header: 'Potwierdź zmianę statusu',
      message: `Zmienić status notatki od ${note.first_name} ${note.last_name} na "${statusMessage}"?`,
      buttons: [
        {
          text: 'Anuluj',
          role: 'cancel',
        },
        {
          text: 'Potwierdź',
          role: 'confirm',
          handler: () => {
            this.updateNoteStatus(note, newStatus);
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Sprawdza, czy powinien wyświetlić przyciski akcji
   */
  shouldShowActions(note: UnavailabilityNoteListDto): boolean {
    return note.status === 'pending';
  }

  /**
   * Pobiera tekst przycisków akcji na podstawie typu notatki
   */
  getActionButtonsForNote(note: UnavailabilityNoteListDto): Array<{ status: NoteStatus; label: string; color: string; icon: string }> {
    if (note.note_type === 'request') {
      // Dla prośby o wolne: Accept / Reject
      return [
        { status: 'accepted', label: 'Akceptuj', color: 'success', icon: 'checkmark-circle' },
        { status: 'rejected', label: 'Odrzuć', color: 'danger', icon: 'close-circle' },
      ];
    } else {
      // Dla przymusowej nieobecności: Acknowledge
      return [{ status: 'acknowledged', label: 'Zapoznano się', color: 'primary', icon: 'checkmark' }];
    }
  }

  /**
   * Tłumaczy status na polski
   */
  getStatusDisplay(status: string): string {
    const statusMap: { [key: string]: string } = {
      pending: 'Oczekująca',
      accepted: 'Zaakceptowana',
      rejected: 'Odrzucona',
      acknowledged: 'Zapoznano się',
    };
    return statusMap[status] || status;
  }

  /**
   * Tłumaczy typ notatki na polski
   */
  getNoteTypeDisplay(noteType: string): string {
    return noteType === 'request' ? 'Prośba o wolne' : 'Przymusowa nieobecność';
  }

  /**
   * Pobiera kolor badge'u dla statusu
   */
  getStatusColor(status: string): string {
    const colorMap: { [key: string]: string } = {
      pending: 'warning',
      accepted: 'success',
      rejected: 'danger',
      acknowledged: 'primary',
    };
    return colorMap[status] || 'medium';
  }

  /**
   * Tłumaczy status na wiadomość polską
   */
  private getStatusMessage(status: NoteStatus): string {
    const messages: { [key in NoteStatus]: string } = {
      accepted: 'zaakceptowana',
      rejected: 'odrzucona',
      acknowledged: 'zapoznano się',
      pending: 'oczekująca',
    };
    return messages[status];
  }

  /**
   * Formatuje datę na YYYY-MM-DD
   */
  formatDate(dateString: string): string {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pl-PL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  }

  /**
   * Tworzy zakres dat dla wyświetlenia
   */
  getDateRange(note: UnavailabilityNoteListDto): string {
    const startDate = this.formatDate(note.start_date);
    if (note.end_date) {
      const endDate = this.formatDate(note.end_date);
      return `${startDate} - ${endDate}`;
    }
    return startDate;
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
   * Getter dla pustej listy
   */
  get hasNoNotes(): boolean {
    return this.notes.length === 0 && !this.isLoading;
  }
}
