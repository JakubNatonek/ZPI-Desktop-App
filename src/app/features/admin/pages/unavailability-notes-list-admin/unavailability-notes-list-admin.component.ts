import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonButtons,
  IonMenuButton,
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
  IonIcon,
  IonChip,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  IonAvatar,
  IonPopover,
  IonList,
  IonItem,
  IonSearchbar,
  IonBadge,
  IonToast,
} from '@ionic/angular/standalone';
import { ViewWillEnter } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkCircle, closeCircle, checkmark, close, refresh, documentOutline, chevronUp, chevronDown, swapVerticalOutline } from 'ionicons/icons';
import { UnavailabilityNotesApiService, UnavailabilityNoteListDto, NoteStatus } from '../../../../core/services/unavailability-notes-api.service';
import { AuthService } from '../../../../core/services/auth.service';
import { Router } from '@angular/router';

type FilterType = 'all' | 'pending' | 'accepted' | 'rejected' | 'acknowledged';

@Component({
  selector: 'app-unavailability-notes-list-admin',
  templateUrl: './unavailability-notes-list-admin.component.html',
  styleUrls: ['./unavailability-notes-list-admin.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    IonButtons,
    IonMenuButton,
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
    IonIcon,
    IonChip,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonAvatar,
    IonPopover,
    IonList,
    IonItem,
    IonSearchbar,
    IonBadge,
    IonToast,
  ],
})
export class UnavailabilityNotesListAdminComponent implements ViewWillEnter {
  notes: UnavailabilityNoteListDto[] = [];
  isLoading = false;
  isProcessing: { [noteId: number]: boolean } = {};
  filterType: FilterType = 'all';
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;
  searchQuery = '';
  sortField: 'name' | 'date' | 'status' = 'date';
  sortAsc = false;
  isToastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' = 'success';

  constructor(
    private unavailabilityService: UnavailabilityNotesApiService,
    public auth: AuthService,
    private router: Router,
  ) {
    addIcons({ documentOutline, checkmarkCircle, closeCircle, checkmark, close, refresh, chevronUp, chevronDown, swapVerticalOutline });
  }

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

  /**
   * Ładuje notatki z API
   */
  loadNotes(): void {
    this.isLoading = true;
    this.isProcessing = {};

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

  onSearch(event: any): void {
    this.searchQuery = (event.detail.value ?? '').toLowerCase();
  }

  toggleSort(field: 'name' | 'date' | 'status'): void {
    if (this.sortField === field) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortField = field;
      this.sortAsc = true;
    }
  }

  get filteredNotes(): UnavailabilityNoteListDto[] {
    let result = this.notes;
    if (this.searchQuery) {
      result = result.filter(
        (n) =>
          `${n.first_name} ${n.last_name}`.toLowerCase().includes(this.searchQuery) ||
          (n.description ?? '').toLowerCase().includes(this.searchQuery),
      );
    }
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (this.sortField === 'name') {
        cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, 'pl');
      } else if (this.sortField === 'date') {
        cmp = a.start_date.localeCompare(b.start_date);
      } else if (this.sortField === 'status') {
        cmp = a.status.localeCompare(b.status);
      }
      return this.sortAsc ? cmp : -cmp;
    });
    return result;
  }

  ionViewWillEnter(): void {
    this.isProcessing = {};
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
    const previousStatus = note.status;
    const previousIndex = this.notes.findIndex((item) => item.id === note.id);
    const shouldRemoveFromList = this.filterType === 'pending' && newStatus !== 'pending';
    const shouldShowSuccessToast = newStatus !== 'acknowledged';

    this.isProcessing[note.id] = true;
    note.status = newStatus;

    if (shouldRemoveFromList) {
      this.notes = this.notes.filter((item) => item.id !== note.id);
    }

    this.unavailabilityService.updateNoteStatus(note.id, { status: newStatus }).subscribe({
      next: async () => {
        this.isProcessing[note.id] = false;
        this.showToast(this.getStatusMessage(newStatus), 'success');
      },
      error: async (error: any) => {
        console.error('Error updating note status:', error);
        note.status = previousStatus;

        if (shouldRemoveFromList && previousIndex >= 0 && !this.notes.some((item) => item.id === note.id)) {
          const restoredNotes = [...this.notes];
          restoredNotes.splice(previousIndex, 0, note);
          this.notes = restoredNotes;
        }

        this.isProcessing[note.id] = false;
        const errorMsg = error?.error?.detail ?? `Błąd ${error?.status ?? ''}`.trim();
        this.showToast(`Nie udało się zmienić statusu: ${errorMsg}`, 'danger');
      },
    });
  }

  /**
   * Sprawdza, czy powinien wyświetlić przyciski akcji
   */
  shouldShowActions(note: UnavailabilityNoteListDto): boolean {
    return note.status === 'pending' && this.auth.role === 'admin';
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
      accepted: 'Zaakceptowana',
      rejected: 'Odrzucona',
      acknowledged: 'Zapoznano się',
      pending: 'Oczekująca',
    };
    return messages[status];
  }

  showToast(message: string, color: 'success' | 'danger') {
    this.toastMessage = message;
    this.toastColor = color;
    this.isToastOpen = true;
  }

  closeToast() {
    this.isToastOpen = false;
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
   * Getter dla pustej listy
   */
  get hasNoNotes(): boolean {
    return this.notes.length === 0 && !this.isLoading;
  }
}
