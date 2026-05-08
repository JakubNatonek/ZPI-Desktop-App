import { Component, OnInit, HostListener, signal } from '@angular/core';
import { IonicModule, ModalController } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline, chevronForwardOutline, cloudDownloadOutline,
  cloudUploadOutline, addOutline, peopleOutline, menuOutline,
  checkmarkDoneOutline, createOutline, swapHorizontalOutline,
  timeOutline, calendarOutline, warningOutline, alertCircleOutline, notificationsOutline
} from 'ionicons/icons';
import { forkJoin } from 'rxjs';
import { AuthService } from '../../../core/services/auth.service';
import { AuditApiService, AuditLogDto } from '../../../core/services/audit-api.service';
import { DezyderataService, Semestr, Dezyderata, DezyderataCreate, DezyderataCreateEntry } from '../../../core/services/dezyderata.service';
import { UsersAdminApiService, AdminUserRow } from '../../../core/services/users-admin-api.service';
import { UnavailabilityNotesApiService } from '../../../core/services/unavailability-notes-api.service';
import { environment } from '../../../../environments/environment';
import { UnavailabilityNoteModalComponent } from '../../subjects/components/unavailability-note-modal/unavailability-note-modal.component';

type AvailabilityMode = 'available' | 'unavailable';

interface WeekDay {
  name: string;
  iso: string;
  isToday: boolean;
}

interface LecturerSubmission {
  id: string;
  lecturerDisplayName: string;
  lecturerEmail: string;
  weekStartIso: string;
  strategy: AvailabilityMode;
  selectedSlots: string[];
  markedHours: number;
  plannerAvailabilityHours: number;
  requiredHours: number;
  timestamp: string;
  semestrId?: number;
  semestrNazwa?: string;
}

interface LecturerStatusItem {
  userId: number;
  lecturerDisplayName: string;
  lecturerEmail: string;
  departments: string[];
  isApproved: boolean;
  submission: LecturerSubmission | null;
  hasActiveUnavailability: boolean; // Czy ma aktywną notatkę o niedostępności
}

interface TutorialStep {
  target: 'mode-selector' | 'calendar-cell' | 'confirm-button' | 'edit-button' | 'clear-button';
  title: string;
  description: string;
}

interface HistoryWeekItem {
  data_od: string;
  data_do: string;
  semestr_id: number;
  is_available: boolean;
  entries: Dezyderata[];
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class HomePage implements OnInit {
  readonly raplaFileUrl = `${environment.apiBaseUrl}/rapla/file`;
  private readonly lecturerTutorialDisabledStorageKey = 'lecturerTutorialDisabled';
  private readonly tutorialCalendarRequiredTiles = 5;
  private readonly minSidebarWidth = 64;
  private readonly maxSidebarWidth = 500;
  private readonly collapsedThreshold = 160;
  private readonly lecturerWeeklyHours = 30;
  private readonly lecturerRoleNames = new Set(['wykladowca', 'wykładowca', 'lecturer', 'cwiczenia', 'laboratorium', 'seminarium']);

  sidebarWidth = signal(280);
  isResizing = false;
  isDragging = false;
  dragDayIso: string | null = null;
  dragAction: 'add' | 'remove' | null = null;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;
  selectionMode: AvailabilityMode = 'available';
  slotSelections = new Map<string, AvailabilityMode>();
  selectionStrategy: AvailabilityMode | null = null;
  isHoursConfirmed = false;
  lecturerMessage = '';
  adminPanelMessage = '';
  allSubmissions: LecturerSubmission[] = [];
  lecturerStatusList: LecturerStatusItem[] = [];
  lecturerSearchQuery: string = '';
  lecturerStatusFilter: 'all' | 'approved' | 'missing' = 'all';

  get filteredLecturerStatusList(): LecturerStatusItem[] {
    const q = this.lecturerSearchQuery.toLowerCase().trim();
    return this.lecturerStatusList.filter(l => {
      if (this.lecturerStatusFilter === 'approved' && !l.isApproved) return false;
      if (this.lecturerStatusFilter === 'missing' && l.isApproved) return false;
      if (q && !l.lecturerDisplayName.toLowerCase().includes(q) && !l.lecturerEmail.toLowerCase().includes(q)) return false;
      return true;
    });
  }
  expandedLecturerIds = new Set<number>();
  activePlannerSubmissionId: string | null = null;
  selectedSubmissionPreview: LecturerSubmission | null = null;
  isSubmissionModalOpen = false;
  submissionPreviewWeekDays: WeekDay[] = [];
  isLoadingLecturerStatuses = false;
  isTutorialActive = false;
  tutorialStepIndex = 0;
  tutorialShownThisSession = false;
  tutorialSpotlightStyle: Record<string, string> = {};
  tutorialSteps: TutorialStep[] = [
    {
      target: 'mode-selector',
      title: 'Krok 1: Wybierz tryb dostępności',
      description: 'Wybierz czy zaznaczasz godziny, w których jesteś dostępny lub niedostępny.',
    },
    {
      target: 'calendar-cell',
      title: 'Krok 2: Zaznacz godzinę w kalendarzu',
      description: 'Kliknij podświetlone pole godziny w siatce kalendarza, aby dodać zaznaczenie.',
    },
    {
      target: 'confirm-button',
      title: 'Krok 3: Zatwierdź godziny',
      description: 'Kliknij przycisk Zatwierdź godziny, aby zapisać wstępny plan.',
    },
    {
      target: 'edit-button',
      title: 'Krok 4: Popraw godziny',
      description: 'Kliknij przycisk Popraw godziny, aby przejść do ponownej edycji.',
    },
    {
      target: 'clear-button',
      title: 'Krok 5: Wyczyść zaznaczenia',
      description: 'Na koniec kliknij Wyczyść zaznaczenia, aby zresetować swój wybór.',
    },
  ];
  hours24 = Array.from({ length: 14 }, (_, i) => i + 7);
  selectedDate: Date = new Date();
  weekDays: WeekDay[] = [];

  // Semestry i historia
  semestry: Semestr[] = [];
  currentSemestr: Semestr | null = null;
  selectedSemestrId: number | null = null;
  historyDezyderaty: Dezyderata[] = [];
  historyWeeks: HistoryWeekItem[] = [];
  isHistoryModalOpen = false;
  isLoadingSemestry = false;
  isLoadingDezyderaty = false;
  isSaving = false;
  hasNewAuditLogs = false;

  get isLecturer(): boolean {
    return this.auth.role === 'lecturer';
  }

  get isAdminOrPlanner(): boolean {
    return this.auth.role === 'admin' || this.auth.role === 'planner';
  }

  get isAdmin(): boolean {
    return this.auth.role === 'admin';
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  get userDisplayName(): string {
    return this.auth.displayName;
  }

  get requiredAvailabilityHours(): number {
    return Math.ceil(this.lecturerWeeklyHours * 1.5);
  }

  get totalWeekHours(): number {
    return this.hours24.length * this.weekDays.length;
  }

  get markedHours(): number {
    return this.slotSelections.size;
  }

  get availableHours(): number {
    if (!this.selectionStrategy) {
      return 0;
    }

    if (this.selectionStrategy === 'available') {
      return this.markedHours;
    }

    return this.totalWeekHours - this.markedHours;
  }

  get unavailableHours(): number {
    return Math.max(0, this.totalWeekHours - this.availableHours);
  }

  get plannerAvailabilityHours(): number {
    // Dla kompatybilności z istniejącym kodem
    return this.availableHours;
  }

  get remainingAvailabilityHours(): number {
    return Math.max(0, this.requiredAvailabilityHours - this.availableHours);
  }

  get canConfirmHours(): boolean {
    return !!this.selectionStrategy && this.availableHours >= this.requiredAvailabilityHours;
  }

  get currentLecturerName(): string {
    return this.auth.displayName || 'Wykładowca';
  }

  get currentLecturerEmail(): string {
    return this.auth.email || '';
  }

  get activePlannerSubmission(): LecturerSubmission | null {
    if (!this.activePlannerSubmissionId) {
      return null;
    }

    return this.allSubmissions.find((entry) => entry.id === this.activePlannerSubmissionId) ?? null;
  }

  get activeTutorialStep(): TutorialStep | null {
    if (!this.isTutorialActive) {
      return null;
    }

    return this.tutorialSteps[this.tutorialStepIndex] ?? null;
  }

  get tutorialProgressLabel(): string {
    return `Krok ${this.tutorialStepIndex + 1}/${this.tutorialSteps.length}`;
  }

  get tutorialStepDescription(): string {
    const activeStep = this.activeTutorialStep;
    if (!activeStep) {
      return '';
    }

    if (activeStep.target !== 'calendar-cell') {
      return activeStep.description;
    }

    const remaining = Math.max(0, this.tutorialCalendarRequiredTiles - this.slotSelections.size);
    if (remaining === 0) {
      return `Świetnie. Zaznaczono ${this.tutorialCalendarRequiredTiles} pól — możesz przejść dalej.`;
    }

    return `Zaznacz minimum ${this.tutorialCalendarRequiredTiles} kafelków w kalendarzu. Pozostało: ${remaining}.`;
  }

  get isTutorialDisabledPermanently(): boolean {
    return localStorage.getItem(this.lecturerTutorialDisabledStorageKey) === '1';
  }

  get currentSemestrLabel(): string {
    return this.currentSemestr?.nazwa ?? 'Brak aktywnego semestru';
  }

  constructor(
    private router: Router,
    public auth: AuthService,
    private dezyderataService: DezyderataService,
    private usersAdminApi: UsersAdminApiService,
    private unavailabilityNotesApi: UnavailabilityNotesApiService,
    private auditApi: AuditApiService,
    private modalController: ModalController
  ) {
    addIcons({
      chevronBackOutline,
      chevronForwardOutline,
      cloudDownloadOutline,
      cloudUploadOutline,
      addOutline,
      peopleOutline,
      menuOutline,
      checkmarkDoneOutline,
      createOutline,
      swapHorizontalOutline,
      timeOutline,
      calendarOutline,
      warningOutline,
      alertCircleOutline,
      notificationsOutline
    });
  }

  ngOnInit() {
    this.updateView();
    this.loadSemestry();
    this.maybeStartLecturerTutorial();
    this.checkAuditLogs();
  }

  checkAuditLogs() {
    if (this.isAdminOrPlanner || this.auth.role === 'rapla_editor') {
      this.auditApi.getLogs().subscribe({
        next: (res) => {
          const lastViewed = res.last_changes_viewed_at ? new Date(res.last_changes_viewed_at).getTime() : 0;
          this.hasNewAuditLogs = res.logs.some(log => new Date(log.timestamp).getTime() > lastViewed);
        },
        error: (err) => console.error('Błąd pobierania logów autytu', err)
      });
    }
  }

  goToAuditLogs() {
    this.router.navigate(['/audit-logs']);
  }

  ionViewWillEnter() {
    this.loadSemestry();
    this.maybeStartLecturerTutorial();
  }

  private loadSemestry() {
    this.isLoadingSemestry = true;
    this.dezyderataService.getSemestry().subscribe({
      next: (response) => {
        this.semestry = response.items;
        this.isLoadingSemestry = false;
        this.loadCurrentSemestr();
      },
      error: () => {
        this.isLoadingSemestry = false;
        this.lecturerMessage = 'Nie udało się załadować semestrów.';
      }
    });
  }

  private loadCurrentSemestr() {
    this.dezyderataService.getCurrentSemestr().subscribe({
      next: (semestr) => {
        this.currentSemestr = semestr;
        this.selectedSemestrId = semestr.id;
        this.loadRoleScopedData();
      },
      error: () => {
        // Brak aktywnego semestru - użyj pierwszego dostępnego
        if (this.semestry.length > 0) {
          this.currentSemestr = this.semestry[0];
          this.selectedSemestrId = this.semestry[0].id;
          this.loadRoleScopedData();
        }
      }
    });
  }

  private loadCurrentDezyderata() {
    if (!this.isLecturer || !this.selectedSemestrId) {
      return;
    }

    this.isLoadingDezyderaty = true;
    this.dezyderataService.getMyDezyderaty(this.selectedSemestrId).subscribe({
      next: (response) => {
        this.isLoadingDezyderaty = false;
        this.restoreDezyderataFromApi(response.items);
      },
      error: () => {
        this.isLoadingDezyderaty = false;
      }
    });
  }

  private restoreDezyderataFromApi(dezyderaty: Dezyderata[]) {
    const weekStartIso = this.weekDays[0]?.iso;
    const weekEndIso = this.weekDays[6]?.iso;

    if (!weekStartIso || !weekEndIso) {
      return;
    }

    const matching = dezyderaty.filter(
      (d) => this.isMatchingWeekRange(d.data_od, d.data_do, weekStartIso, weekEndIso)
    );

    if (matching.length === 0) {
      this.slotSelections.clear();
      this.selectionStrategy = null;
      this.isHoursConfirmed = false;
      return;
    }

    // Rozpakuj wpisy na sloty i zbierz dni z wpisami
    const coveredSlots = new Set<string>();
    const daysWithEntries = new Set<number>();

    for (const entry of matching) {
      daysWithEntries.add(entry.day_id);
      const dayIso = this.dayIdToIso(entry.day_id);
      if (!dayIso) {
        continue;
      }

      const displayToHour = this.getDisplayToHour(entry);
      for (let hour = entry.from_hour; hour <= displayToHour; hour++) {
        coveredSlots.add(`${dayIso}-${hour}`);
      }
    }

    // Dedukuj strategię: jeśli wpisy są dla >= 5 dni, to prawie na pewno 'available'
    const strategy: AvailabilityMode = daysWithEntries.size >= 5 ? 'available' : 'unavailable';

    this.slotSelections.clear();
    this.selectionStrategy = strategy;
    this.selectionMode = strategy;

    // Zaznacz odpowiednie sloty w zależności od strategii
    if (strategy === 'available') {
      // Dla 'available': zaznacz NIEZAZNACZONE sloty (dostępne)
      for (const day of this.weekDays) {
        for (const hour of this.hours24) {
          const slotKey = this.getSlotKey(day, hour);
          if (!coveredSlots.has(slotKey)) {
            this.slotSelections.set(slotKey, 'available');
          }
        }
      }
    } else {
      // Dla 'unavailable': zaznacz ZAZNACZONE sloty (niedostępne)
      for (const slotKey of coveredSlots) {
        this.slotSelections.set(slotKey, 'unavailable');
      }
    }

    this.isHoursConfirmed = true;
    this.lecturerMessage = 'Wczytano wcześniej zatwierdzone godziny dla bieżącego tygodnia.';
  }

  onSemestrChange(event: CustomEvent) {
    const semestrId = Number(event.detail.value);
    if (!Number.isInteger(semestrId) || semestrId <= 0) {
      this.selectedSemestrId = null;
      this.currentSemestr = null;
      this.allSubmissions = [];
      this.lecturerStatusList = [];
      this.expandedLecturerIds.clear();
      this.activePlannerSubmissionId = null;
      return;
    }

    this.selectedSemestrId = semestrId;
    this.currentSemestr = this.semestry.find(s => s.id === semestrId) ?? null;
    this.loadRoleScopedData();
  }

  openHistoryModal() {
    if (!this.selectedSemestrId) {
      return;
    }

    this.isHistoryModalOpen = true;
    this.isLoadingDezyderaty = true;

    this.dezyderataService.getMyDezyderaty(this.selectedSemestrId).subscribe({
      next: (response) => {
        this.historyDezyderaty = response.items;
        this.historyWeeks = this.groupDezyderatyByWeek(response.items);
        this.isLoadingDezyderaty = false;
      },
      error: () => {
        this.historyDezyderaty = [];
        this.historyWeeks = [];
        this.isLoadingDezyderaty = false;
      }
    });
  }

  closeHistoryModal() {
    this.isHistoryModalOpen = false;
  }

  loadHistoryDezyderata(historyWeek: HistoryWeekItem) {
    // Przejdź do tygodnia z historii
    this.selectedDate = new Date(`${historyWeek.data_od}T00:00:00`);
    this.updateView();

    // Rozpakuj wpisy na sloty i zbierz dni z wpisami
    this.slotSelections.clear();

    const weekDays = this.buildWeekDaysFromIso(historyWeek.data_od);
    const coveredSlots = new Set<string>();
    const daysWithEntries = new Set<number>();

    for (const entry of historyWeek.entries) {
      daysWithEntries.add(entry.day_id);
      const dayIso = weekDays[entry.day_id - 1]?.iso ?? null;
      if (!dayIso) {
        continue;
      }

      const displayToHour = this.getDisplayToHour(entry);
      for (let hour = entry.from_hour; hour <= displayToHour; hour++) {
        coveredSlots.add(`${dayIso}-${hour}`);
      }
    }

    // Dedukuj strategię: jeśli wpisy są dla >= 5 dni, to prawie na pewno 'available'
    const strategy: AvailabilityMode = daysWithEntries.size >= 5 ? 'available' : 'unavailable';

    // Dla 'available': zaznacz NIEZAZNACZONE sloty (dostępne, które będę edytować)
    // Dla 'unavailable': zaznacz ZAZNACZONE sloty (niedostępne, które będę edytować)
    if (strategy === 'available') {
      // Zaznacz wszystkie niezaznaczone
      for (const day of weekDays) {
        for (const hour of this.hours24) {
          const slotKey = this.getSlotKey(day, hour);
          if (!coveredSlots.has(slotKey)) {
            this.slotSelections.set(slotKey, 'available');
          }
        }
      }
    } else {
      // Zaznacz zaznaczone (niedostępne)
      for (const slotKey of coveredSlots) {
        this.slotSelections.set(slotKey, 'unavailable');
      }
    }

    this.selectionStrategy = strategy;
    this.selectionMode = strategy;
    this.isHoursConfirmed = true;
    this.closeHistoryModal();
    this.lecturerMessage = `Wczytano dezyderatę z ${historyWeek.data_od} - ${historyWeek.data_do}`;
  }

  startResizing(event: MouseEvent | TouchEvent) {
    this.isResizing = true;
    event.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onMouseMove(event: MouseEvent | TouchEvent) {
    if (!this.isResizing) return;
    const clientX = event instanceof TouchEvent
      ? event.touches[0]?.clientX
      : (event as MouseEvent).clientX;

    if (clientX == null) return;

    const clampedWidth = Math.max(this.minSidebarWidth, Math.min(this.maxSidebarWidth, clientX));
    this.sidebarWidth.set(clampedWidth);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onPointerEnd() {
    this.isResizing = false;
    this.isDragging = false;
    this.dragDayIso = null;
    this.dragAction = null;
  }

  @HostListener('window:resize')
  onWindowResize() {
    if (!this.isTutorialActive) {
      return;
    }

    this.refreshTutorialSpotlight();
  }

  expandSidebar() {
    if (this.sidebarWidth() < this.collapsedThreshold) {
      this.sidebarWidth.set(280);
    }
  }

  toggleSidebar() {
    if (this.sidebarWidth() > this.collapsedThreshold) {
      this.sidebarWidth.set(this.minSidebarWidth);
    } else {
      this.sidebarWidth.set(280);
    }
  }


  goToToday() {
    if (this.isLecturer) {
      return;
    }
    this.selectedDate = new Date();
    this.updateView();
  }

  updateView() {
    this.generateWeek(this.selectedDate);

    if (this.isAdmin) {
      this.loadAdminLecturerStatuses();
    }
  }

  generateWeek(baseDate: Date) {
    const curr = new Date(baseDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diff));
    const names = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      this.weekDays.push({
        name: names[i],
        iso: this.formatLocalDateIso(nextDay),
        isToday: nextDay.toDateString() === new Date().toDateString(),
      });
    }
  }

  prevWeek() {
    if (this.isLecturer) {
      return;
    }
    this.selectedDate.setDate(this.selectedDate.getDate() - 7);
    this.updateView();
  }

  nextWeek() {
    if (this.isLecturer) {
      return;
    }
    this.selectedDate.setDate(this.selectedDate.getDate() + 7);
    this.updateView();
  }

  toggleProfileMenu(event: Event) {
    this.profileMenuEvent = event;
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu() {
    this.isProfileMenuOpen = false;
  }

  async openSettings() {
    this.closeProfileMenu();
    await this.router.navigateByUrl('/profile');
  }

  async logout() {
    this.closeProfileMenu();
    this.auth.logout();
  }

  onModeChange(event: CustomEvent) {
    const requestedMode = event.detail.value as AvailabilityMode;

    if (this.selectionStrategy && this.selectionStrategy !== requestedMode && this.slotSelections.size > 0) {
      this.lecturerMessage = 'Możesz zaznaczać tylko jeden typ godzin naraz. Wyczyść zaznaczenia albo popraw obecny typ.';
      this.selectionMode = this.selectionStrategy;
      return;
    }

    this.selectionMode = requestedMode;

    if (this.isTutorialStepTarget('mode-selector')) {
      this.nextTutorialStep();
    }
  }

  startCellSelection(day: WeekDay, hour: number, event: MouseEvent) {
    event.preventDefault();

    if (!this.isLecturer || this.isHoursConfirmed) {
      return;
    }

    if (this.selectionStrategy && this.selectionStrategy !== this.selectionMode && this.slotSelections.size > 0) {
      this.lecturerMessage = 'Tryb zaznaczania już aktywny dla innego typu godzin.';
      return;
    }

    if (!this.selectionStrategy) {
      this.selectionStrategy = this.selectionMode;
    }

    this.isDragging = true;
    this.dragDayIso = day.iso;
    this.applySelection(day, hour, true);
    this.handleTutorialCalendarProgress();
  }

  onCellHover(day: WeekDay, hour: number) {
    if (!this.isDragging || !this.dragDayIso || this.dragDayIso !== day.iso) {
      return;
    }

    this.applySelection(day, hour, false);
    this.handleTutorialCalendarProgress();
  }

  clearSelection() {
    this.slotSelections.clear();
    this.selectionStrategy = null;
    this.selectionMode = 'available';
    this.lecturerMessage = 'Wyczyszczono zaznaczenia.';

    if (this.isTutorialStepTarget('clear-button')) {
      this.completeTutorial();
    }
  }

  getSlotState(day: WeekDay, hour: number): AvailabilityMode | null {
    return this.slotSelections.get(this.getSlotKey(day, hour)) ?? null;
  }

  confirmHours() {
    const isTutorialConfirmStep = this.isTutorialStepTarget('confirm-button');

    if ((!this.canConfirmHours || !this.selectionStrategy) && !isTutorialConfirmStep) {
      this.lecturerMessage = `Brakuje jeszcze ${this.remainingAvailabilityHours} h do wymaganych ${this.requiredAvailabilityHours} h dla planisty.`;
      return;
    }

    if (!this.selectionStrategy) {
      this.selectionStrategy = this.selectionMode;
    }

    if (isTutorialConfirmStep && this.slotSelections.size === 0) {
      const firstDay = this.weekDays[0];
      const firstHour = this.hours24[0];
      if (firstDay && typeof firstHour === 'number' && this.selectionStrategy) {
        this.slotSelections.set(this.getSlotKey(firstDay, firstHour), this.selectionStrategy);
      }
    }

    // Zapisz do bazy danych
    this.saveDezyderataToApi();

    if (isTutorialConfirmStep) {
      this.nextTutorialStep();
    }
  }

  private saveDezyderataToApi() {
    if (!this.selectedSemestrId || this.weekDays.length < 7) {
      this.lecturerMessage = 'Brak wybranego semestru lub nieprawidłowy tydzień.';
      return;
    }

    const weekStartIso = this.weekDays[0].iso;
    const weekEndIso = this.weekDays[6].iso;
    const entries = this.buildEntriesFromSelection();

    if (entries.length === 0) {
      this.lecturerMessage = 'Brak poprawnych zakresów godzin do zapisania.';
      return;
    }

    const payload: DezyderataCreate = {
      data_od: weekStartIso,
      data_do: weekEndIso,
      semestr_id: this.selectedSemestrId,
      entries
    };

    this.isSaving = true;
    this.dezyderataService.createOrUpdateDezyderata(payload).subscribe({
      next: () => {
        this.isSaving = false;
        this.isHoursConfirmed = true;
        this.lecturerMessage = `Godziny zatwierdzone i zapisane. Planista widzi ${this.plannerAvailabilityHours} h do dyspozycji.`;
      },
      error: (err) => {
        this.isSaving = false;
        this.lecturerMessage = 'Nie udało się zapisać dezyderat. Spróbuj ponownie.';
        console.error('Błąd zapisu dezyderaty:', err);
      }
    });
  }

  editHours() {
    this.isHoursConfirmed = false;
    this.lecturerMessage = 'Tryb edycji aktywny. Możesz poprawić swoje godziny.';

    if (this.isTutorialStepTarget('edit-button')) {
      this.nextTutorialStep();
    }
  }

  disableTutorial() {
    localStorage.setItem(this.lecturerTutorialDisabledStorageKey, '1');
    this.isTutorialActive = false;
  }

  enableTutorial() {
    localStorage.removeItem(this.lecturerTutorialDisabledStorageKey);
    this.tutorialShownThisSession = false;
    this.startTutorial();
  }

  enableTutorialGuarded() {
    if (this.slotSelections.size > 0) {
      this.lecturerMessage = 'Samouczek wymaga pustego kalendarza. Wyczyść zaznaczenia przed włączeniem samouczka.';
      return;
    }
    this.enableTutorial();
  }

  isTutorialStepTarget(target: TutorialStep['target']): boolean {
    return this.activeTutorialStep?.target === target;
  }

  strategyLabel(strategy: AvailabilityMode): string {
    return strategy === 'available' ? 'Zaznaczone godziny dostępności' : 'Zaznaczone godziny niedostępności';
  }

  previewSubmission(entry: LecturerSubmission) {
    this.selectedSubmissionPreview = entry;
    this.submissionPreviewWeekDays = this.buildWeekDaysFromIso(entry.weekStartIso);
    this.isSubmissionModalOpen = true;
  }

  selectLecturerStatus(lecturer: LecturerStatusItem) {
    if (!lecturer.submission) {
      return;
    }

    this.activePlannerSubmissionId = lecturer.submission.id;

    const weekStartDate = this.parseIsoDate(lecturer.submission.weekStartIso);
    this.selectedDate = new Date(weekStartDate.getTime());
    this.generateWeek(weekStartDate);
  }

  isLecturerStatusActive(lecturer: LecturerStatusItem): boolean {
    if (!lecturer.submission) {
      return false;
    }

    return this.activePlannerSubmissionId === lecturer.submission.id;
  }

  toggleLecturerDetails(userId: number, event?: Event) {
    event?.stopPropagation();

    if (this.expandedLecturerIds.has(userId)) {
      this.expandedLecturerIds.delete(userId);
      return;
    }

    this.expandedLecturerIds.add(userId);
  }

  isLecturerDetailsExpanded(userId: number): boolean {
    return this.expandedLecturerIds.has(userId);
  }

  closeSubmissionPreview() {
    this.isSubmissionModalOpen = false;
  }

  getSubmissionSlotState(day: WeekDay, hour: number): AvailabilityMode | null {
    if (!this.selectedSubmissionPreview) {
      return null;
    }

    const key = this.getSlotKey(day, hour);
    return this.resolveSubmissionSlotState(this.selectedSubmissionPreview, key);
  }

  getPlannerSlotState(day: WeekDay, hour: number): AvailabilityMode | null {
    const activeSubmission = this.activePlannerSubmission;
    if (!activeSubmission) {
      return null;
    }

    const key = this.getSlotKey(day, hour);
    return this.resolveSubmissionSlotState(activeSubmission, key);
  }

  formatDateRange(dataOd: string, dataDo: string): string {
    const od = new Date(dataOd);
    const doDate = new Date(dataDo);
    const formatDate = (d: Date) => d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${formatDate(od)} - ${formatDate(doDate)}`;
  }

  countWeekHours(entries: Dezyderata[]): number {
    return entries.reduce((sum, entry) => {
      const displayToHour = this.getDisplayToHour(entry);
      return sum + (displayToHour - entry.from_hour + 1);
    }, 0);
  }

  private loadRoleScopedData() {
    if (this.isLecturer) {
      this.loadCurrentDezyderata();
      return;
    }

    if (this.isAdmin) {
      this.loadAdminLecturerStatuses();
    }
  }

  private loadAdminLecturerStatuses() {
    if (!this.isAdmin || !this.selectedSemestrId || this.weekDays.length < 7) {
      return;
    }

    this.isLoadingLecturerStatuses = true;
    this.adminPanelMessage = '';

    forkJoin({
      users: this.usersAdminApi.getUsersForAdmin(),
      dezyderaty: this.dezyderataService.getDezyderaty(this.selectedSemestrId),
    }).subscribe({
      next: ({ users, dezyderaty }) => {
        const lecturers = users
          .filter((user) => this.isLecturerAccount(user))
          .sort((a, b) => this.buildLecturerDisplayName(a).localeCompare(this.buildLecturerDisplayName(b), 'pl'));

        const lecturerIds = new Set(lecturers.map((lecturer) => lecturer.user_id));
        this.expandedLecturerIds = new Set(
          Array.from(this.expandedLecturerIds).filter((userId) => lecturerIds.has(userId)),
        );
        const entriesByLecturer = new Map<number, Dezyderata[]>();
        for (const entry of dezyderaty.items) {
          if (!entriesByLecturer.has(entry.user_id)) {
            entriesByLecturer.set(entry.user_id, []);
          }
          entriesByLecturer.get(entry.user_id)?.push(entry);
        }

        const submissionByLecturer = new Map<number, LecturerSubmission>();
        const submissions: LecturerSubmission[] = [];

        for (const lecturer of lecturers) {
          const submission = this.buildSubmissionForLecturer(lecturer, entriesByLecturer.get(lecturer.user_id) ?? []);
          if (!submission) {
            continue;
          }

          submissionByLecturer.set(lecturer.user_id, submission);
          submissions.push(submission);
        }

        this.allSubmissions = submissions;

        this.lecturerStatusList = lecturers.map((lecturer) => {
          const submission = submissionByLecturer.get(lecturer.user_id) ?? null;

          return {
            userId: lecturer.user_id,
            lecturerDisplayName: this.buildLecturerDisplayName(lecturer),
            lecturerEmail: lecturer.email,
            departments: this.normalizeDetailList(lecturer.departments),
            isApproved: submission !== null,
            submission,
            hasActiveUnavailability: false, // Inicjalnie false, będzie aktualizowane asynchronicznie
          };
        });

        // Asynchronicznie załaduj informacje o aktywnych notatkach dla każdego nauczyciela
        this.loadUnavailabilityInfoForLecturers();

        if (this.activePlannerSubmissionId && !this.allSubmissions.some((entry) => entry.id === this.activePlannerSubmissionId)) {
          const activeUserIdText = this.activePlannerSubmissionId.split('-')[0];
          const activeUserId = Number.parseInt(activeUserIdText, 10);
          const fallbackSubmission = Number.isNaN(activeUserId)
            ? null
            : submissionByLecturer.get(activeUserId) ?? null;
          this.activePlannerSubmissionId = fallbackSubmission?.id ?? null;
        }

        this.isLoadingLecturerStatuses = false;
      },
      error: () => {
        this.isLoadingLecturerStatuses = false;
        this.allSubmissions = [];
        this.lecturerStatusList = [];
        this.expandedLecturerIds.clear();
        this.activePlannerSubmissionId = null;
        this.adminPanelMessage = 'Nie udało się pobrać listy wykładowców i dezyderat.';
      },
    });
  }

  private isLecturerAccount(user: AdminUserRow): boolean {
    return user.roles.some((roleName) => this.lecturerRoleNames.has(this.normalizeRoleName(roleName)));
  }

  private normalizeRoleName(roleName: string): string {
    return roleName
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private normalizeDetailList(values: string[] | null | undefined): string[] {
    return (values ?? [])
      .map((value) => String(value ?? '').trim())
      .filter((value) => value.length > 0);
  }

  private buildLecturerDisplayName(user: AdminUserRow): string {
    const titles = this.normalizeDetailList(user.titles);
    const displayName = `${user.first_name} ${user.last_name}`.trim();
    const baseName = displayName || user.login;
    const titlePrefix = titles.length > 0 ? `${titles[0]} ` : '';
    return `${titlePrefix}${baseName}`.trim();
  }

  private buildSubmissionForLecturer(lecturer: AdminUserRow, entries: Dezyderata[]): LecturerSubmission | null {
    if (entries.length === 0) {
      return null;
    }

    const groupedByWeek = new Map<string, Dezyderata[]>();
    for (const entry of entries) {
      const key = `${entry.data_od}|${entry.data_do}`;
      if (!groupedByWeek.has(key)) {
        groupedByWeek.set(key, []);
      }

      groupedByWeek.get(key)?.push(entry);
    }

    let latestWeekEntries: Dezyderata[] | null = null;
    let latestWeekStartIso = '';
    let latestWeekEndIso = '';

    for (const [weekKey, weekEntries] of groupedByWeek.entries()) {
      const [weekStartIso, weekEndIso] = weekKey.split('|');
      if (!weekStartIso || !weekEndIso) {
        continue;
      }

      if (!latestWeekEntries || weekStartIso.localeCompare(latestWeekStartIso) > 0) {
        latestWeekEntries = weekEntries;
        latestWeekStartIso = weekStartIso;
        latestWeekEndIso = weekEndIso;
      }
    }

    if (!latestWeekEntries || !latestWeekStartIso || !latestWeekEndIso) {
      return null;
    }

    const weekDaysForSubmission = this.buildWeekDaysFromIso(latestWeekStartIso);

    // Rozpakuj wpisy na pojedyncze (day, hour) pary i zbierz dni z wpisami
    const allSlots = new Set<string>();
    const daysWithEntries = new Set<number>();

    for (const entry of latestWeekEntries) {
      daysWithEntries.add(entry.day_id);
      const dayIso = weekDaysForSubmission[entry.day_id - 1]?.iso ?? null;
      if (!dayIso) {
        continue;
      }

      const displayToHour = this.getDisplayToHour(entry);
      for (let hour = entry.from_hour; hour <= displayToHour; hour++) {
        allSlots.add(`${dayIso}-${hour}`);
      }
    }

    // Dedukuj strategię na podstawie liczby dni z wpisami:
    // - Dla 'available' zapisuję niezaznaczone z każdego dnia (prawie każdy dzień będzie miał wpis)
    // - Dla 'unavailable' mogę zapisywać tylko kilka dni
    // Jeśli wpisy są dla >= 5 dni, to prawie na pewno 'available'
    const strategy: AvailabilityMode = daysWithEntries.size >= 5 ? 'available' : 'unavailable';

    // Interpretacja markedHours: zawsze to total - covered
    const coveredSlotCount = allSlots.size;
    const availabilityHours = Math.max(0, this.totalWeekHours - coveredSlotCount);

    return {
      id: `${lecturer.user_id}-${latestWeekStartIso}`,
      lecturerDisplayName: this.buildLecturerDisplayName(lecturer),
      lecturerEmail: lecturer.email,
      weekStartIso: latestWeekStartIso,
      strategy,
      selectedSlots: Array.from(allSlots),
      markedHours: coveredSlotCount,
      plannerAvailabilityHours: availabilityHours,
      requiredHours: this.requiredAvailabilityHours,
      timestamp: `${latestWeekStartIso}T00:00:00`,
      semestrId: latestWeekEntries[0].semestr_id,
      semestrNazwa: latestWeekEntries[0].semestr_nazwa,
    };
  }

  private applySelection(day: WeekDay, hour: number, isStart: boolean) {
    if (!this.isLecturer || this.isHoursConfirmed) {
      return;
    }

    if (!this.selectionStrategy) {
      this.selectionStrategy = this.selectionMode;
    }

    if (this.selectionMode !== this.selectionStrategy) {
      return;
    }

    const key = this.getSlotKey(day, hour);
    const hasSlot = this.slotSelections.has(key);

    if (isStart) {
      this.dragAction = hasSlot ? 'remove' : 'add';
    }

    if (this.dragAction === 'remove') {
      this.slotSelections.delete(key);
    } else {
      this.slotSelections.set(key, this.selectionStrategy);
    }

    if (this.slotSelections.size === 0) {
      this.selectionStrategy = null;
    }
  }

  private getSlotKey(day: WeekDay, hour: number): string {
    return `${day.iso}-${hour}`;
  }

  private resolveSubmissionSlotState(submission: LecturerSubmission, slotKey: string): AvailabilityMode {
    const isInSelectedSlots = submission.selectedSlots?.includes(slotKey) ?? false;

    if (submission.strategy === 'available') {
      // Dla 'available': selectedSlots zawierają niezaznaczone (niedostępne)
      // Jeśli slot jest w selectedSlots, to jest niedostępny
      return isInSelectedSlots ? 'unavailable' : 'available';
    }

    // Dla 'unavailable': selectedSlots zawierają zaznaczone (niedostępne)
    return isInSelectedSlots ? 'unavailable' : 'available';
  }

  private getDisplayToHour(entry: Pick<Dezyderata, 'from_hour' | 'to_hour'>): number {
    // Backend persists to_hour with +1, so normalize only for UI rendering.
    return Math.max(entry.from_hour, entry.to_hour - 1);
  }

  private dayIdToIso(dayId: number): string | null {
    const day = this.weekDays[dayId - 1];
    return day?.iso ?? null;
  }

  private buildEntriesFromSelection(): DezyderataCreateEntry[] {
    if (!this.selectionStrategy) {
      return [];
    }

    // Dla trybu 'available': zwracamy NIEZAZNACZONE godziny (niedostępności)
    // Dla trymu 'unavailable': zwracamy ZAZNACZONE godziny (niedostępności)
    if (this.selectionStrategy === 'available') {
      return this.buildEntriesForAvailabilityMode();
    } else {
      return this.buildEntriesForUnavailabilityMode();
    }
  }

  private buildEntriesForAvailabilityMode(): DezyderataCreateEntry[] {
    // Dla trybu 'available', zapisujemy NIEZAZNACZONE godziny jako niedostępne (is_available=false)
    const hoursByDayIso = new Map<string, Set<number>>();

    // Najpierw zbierz wszystkie zaznaczone sloty
    const markedSlots = new Set<string>(this.slotSelections.keys());

    // Dla każdego dnia i godziny, jeśli NIEZNACZONE, dodaj do hoursByDayIso
    for (const day of this.weekDays) {
      const dayHours = new Set<number>();
      for (const hour of this.hours24) {
        const slotKey = this.getSlotKey(day, hour);
        if (!markedSlots.has(slotKey)) {
          // Nieznaczone godziny
          dayHours.add(hour);
        }
      }
      if (dayHours.size > 0) {
        hoursByDayIso.set(day.iso, dayHours);
      }
    }

    // Teraz zbuduj wpisy z niezaznaczonych godzin
    return this.buildEntriesFromHoursByDay(hoursByDayIso, false);
  }

  private buildEntriesForUnavailabilityMode(): DezyderataCreateEntry[] {
    // Dla trymu 'unavailable', zapisujemy ZAZNACZONE godziny jako niedostępne (is_available=false)
    // To działa jak stary system
    const hoursByDayIso = new Map<string, Set<number>>();

    for (const slotKey of this.slotSelections.keys()) {
      const [iso, hourText] = slotKey.split('-').length >= 4
        ? [slotKey.slice(0, 10), slotKey.slice(11)]
        : ['', ''];
      const hour = Number.parseInt(hourText, 10);

      if (!iso || Number.isNaN(hour)) {
        continue;
      }

      if (!hoursByDayIso.has(iso)) {
        hoursByDayIso.set(iso, new Set<number>());
      }

      hoursByDayIso.get(iso)?.add(hour);
    }

    return this.buildEntriesFromHoursByDay(hoursByDayIso, false);
  }

  private buildEntriesFromHoursByDay(hoursByDayIso: Map<string, Set<number>>, isAvailable: boolean): DezyderataCreateEntry[] {
    const entries: DezyderataCreateEntry[] = [];

    for (const [dayIso, hourSet] of hoursByDayIso.entries()) {
      const dayIndex = this.weekDays.findIndex((day) => day.iso === dayIso);
      if (dayIndex < 0) {
        continue;
      }

      const dayId = dayIndex + 1;
      const hours = Array.from(hourSet).sort((a, b) => a - b);

      let start = hours[0];
      let end = hours[0];

      for (let i = 1; i < hours.length; i++) {
        const current = hours[i];
        if (current === end + 1) {
          end = current;
          continue;
        }

        entries.push({
          day_id: dayId,
          from_hour: start,
          to_hour: end,
          is_available: isAvailable,
        });

        start = current;
        end = current;
      }

      entries.push({
        day_id: dayId,
        from_hour: start,
        to_hour: end,
        is_available: isAvailable,
      });
    }

    return entries;
  }

  private groupDezyderatyByWeek(entries: Dezyderata[]): HistoryWeekItem[] {
    const groups = new Map<string, HistoryWeekItem>();

    for (const entry of entries) {
      // Nie grupuj po is_available, bo teraz wszystkie wpisy mają is_available=false
      const key = `${entry.data_od}|${entry.data_do}|${entry.semestr_id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          data_od: entry.data_od,
          data_do: entry.data_do,
          semestr_id: entry.semestr_id,
          is_available: entry.is_available,
          entries: [],
        });
      }

      groups.get(key)?.entries.push(entry);
    }

    return Array.from(groups.values()).sort((a, b) => b.data_od.localeCompare(a.data_od));
  }

  private buildWeekDaysFromIso(weekStartIso: string): WeekDay[] {
    const monday = this.parseIsoDate(weekStartIso);
    const names = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
    const days: WeekDay[] = [];

    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      days.push({
        name: names[i],
        iso: this.formatLocalDateIso(nextDay),
        isToday: false,
      });
    }

    return days;
  }

  private isMatchingWeekRange(dataOd: string, dataDo: string, weekStartIso: string, weekEndIso: string): boolean {
    if (dataOd === weekStartIso && dataDo === weekEndIso) {
      return true;
    }

    // Compatibility for records saved before timezone fix (stored one day earlier).
    const legacyWeekStartIso = this.shiftIsoDateByDays(weekStartIso, -1);
    const legacyWeekEndIso = this.shiftIsoDateByDays(weekEndIso, -1);
    return dataOd === legacyWeekStartIso && dataDo === legacyWeekEndIso;
  }

  private shiftIsoDateByDays(isoDate: string, days: number): string {
    const date = this.parseIsoDate(isoDate);
    date.setDate(date.getDate() + days);
    return this.formatLocalDateIso(date);
  }

  private parseIsoDate(isoDate: string): Date {
    const [yearText, monthText, dayText] = String(isoDate).split('-');
    const year = Number.parseInt(yearText ?? '', 10);
    const month = Number.parseInt(monthText ?? '', 10);
    const day = Number.parseInt(dayText ?? '', 10);

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return new Date(isoDate);
    }

    return new Date(year, month - 1, day);
  }

  private formatLocalDateIso(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private maybeStartLecturerTutorial() {
    if (!this.isLecturer || this.isTutorialDisabledPermanently || this.tutorialShownThisSession) {
      return;
    }

    this.startTutorial();
  }

  private startTutorial() {
    this.isTutorialActive = true;
    this.tutorialStepIndex = 0;
    this.tutorialShownThisSession = true;
    this.lecturerMessage = '';
    setTimeout(() => this.refreshTutorialSpotlight(), 0);
  }

  private nextTutorialStep() {
    if (!this.isTutorialActive) {
      return;
    }

    if (this.tutorialStepIndex >= this.tutorialSteps.length - 1) {
      this.completeTutorial();
      return;
    }

    this.tutorialStepIndex += 1;
    setTimeout(() => this.refreshTutorialSpotlight(), 0);
  }

  private completeTutorial() {
    this.disableTutorial();
  }

  private refreshTutorialSpotlight() {
    const activeStep = this.activeTutorialStep;
    if (!activeStep) {
      this.tutorialSpotlightStyle = {};
      return;
    }

    const selector = `[data-tour-step="${activeStep.target}"]`;

    // Try standard DOM first, then search inside ion-content shadow roots
    let targetElement = document.querySelector(selector) as HTMLElement | null;
    if (!targetElement) {
      for (const ionContent of Array.from(document.querySelectorAll('ion-content'))) {
        const inner = (ionContent.shadowRoot?.querySelector('.inner-scroll') ?? ionContent) as HTMLElement;
        const found = inner.querySelector ? (inner.querySelector(selector) as HTMLElement | null) : null;
        if (found) { targetElement = found; break; }
      }
    }

    if (!targetElement) {
      this.tutorialSpotlightStyle = {};
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const padding = 8;

    this.tutorialSpotlightStyle = {
      top: `${Math.max(0, rect.top - padding)}px`,
      left: `${Math.max(0, rect.left - padding)}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
    };
  }

  private handleTutorialCalendarProgress() {
    if (!this.isTutorialStepTarget('calendar-cell')) {
      return;
    }

    if (this.slotSelections.size >= this.tutorialCalendarRequiredTiles) {
      this.nextTutorialStep();
      return;
    }

  }

  /**
   * Ładuje informacje o aktywnych notatkach o niedostępności dla każdego nauczyciela
   * Jeśli admin, pobiera wszystkie notatki i sprawdza które są aktywne na dzisiaj
   */
  private loadUnavailabilityInfoForLecturers(): void {
    // Pobierz wszystkie notatki
    this.unavailabilityNotesApi.getAllNotes().subscribe({
      next: (notes) => {
        const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // Dla każdego nauczyciela sprawdź czy ma aktywną notatkę
        this.lecturerStatusList.forEach((lecturer) => {
          const hasActive = notes.some((note) => {
            // Sprawdź czy notatka należy do tego nauczyciela
            if (note.user_id !== lecturer.userId) return false;

            // Ikona pokazuje się jeśli notatka jeszcze się nie skończyła
            const endDate = note.end_date || note.start_date;
            return today <= endDate;
          });

          lecturer.hasActiveUnavailability = hasActive;
        });
      },
      error: (error) => {
        console.error('Error loading unavailability info:', error);
      },
    });
  }

  /**
   * Naviguje do widoku admin notatek o niedostępności
   */
  goToUnavailabilityNotes(): void {
    this.router.navigate(['/admin/unavailability-notes']);
  }

  /**
   * Otwiera modal do zgłaszania niedostępności
   */
  async openUnavailabilityModal(): Promise<void> {
    const modal = await this.modalController.create({
      component: UnavailabilityNoteModalComponent,
      presentingElement: await this.modalController.getTop(),
    });

    await modal.present();

    // Po zamknięciu modalu, przeładuj notatki
    const { data, role } = await modal.onWillDismiss();

    if (role === 'confirm' || (data && data.success)) {
      // Przeładuj informacje o niedostępności (aby zaktualizować ikonkę w admin view)
      if (this.auth.role === 'admin') {
        this.loadUnavailabilityInfoForLecturers();
      } else {
        this.lecturerMessage = 'Zgłoszenie niedostępności zostało wysłane.';
      }
    }
  }
}