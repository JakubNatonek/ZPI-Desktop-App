import { Component, OnInit, HostListener, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline, chevronForwardOutline, cloudDownloadOutline,
  cloudUploadOutline, addOutline, peopleOutline, menuOutline,
  checkmarkDoneOutline, createOutline, swapHorizontalOutline,
  timeOutline, calendarOutline
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { DezyderataService, Semestr, Dezyderata, DezyderataCreate } from '../../../core/services/dezyderata.service';

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

interface TutorialStep {
  target: 'mode-selector' | 'calendar-cell' | 'confirm-button' | 'edit-button' | 'clear-button';
  title: string;
  description: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class HomePage implements OnInit {
  private readonly lecturerTutorialDisabledStorageKey = 'lecturerTutorialDisabled';
  private readonly tutorialCalendarRequiredTiles = 5;
  private readonly minSidebarWidth = 64;
  private readonly maxSidebarWidth = 500;
  private readonly collapsedThreshold = 160;
  private readonly lecturerWeeklyHours = 30;

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
  allSubmissions: LecturerSubmission[] = [];
  activePlannerSubmissionId: string | null = null;
  selectedSubmissionPreview: LecturerSubmission | null = null;
  isSubmissionModalOpen = false;
  submissionPreviewWeekDays: WeekDay[] = [];
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
  currentMonthName = '';
  currentYear = 0;
  weekDays: WeekDay[] = [];

  // Semestry i historia
  semestry: Semestr[] = [];
  currentSemestr: Semestr | null = null;
  selectedSemestrId: number | null = null;
  historyDezyderaty: Dezyderata[] = [];
  isHistoryModalOpen = false;
  isLoadingSemestry = false;
  isLoadingDezyderaty = false;
  isSaving = false;

  teachers = [
    { name: 'Dr Isabella Storm', progress: 0.9 },
    { name: 'Prof. Adam Nowak', progress: 0.4 }
  ];

  get isLecturer(): boolean {
    return this.auth.role === 'lecturer';
  }

  get isAdminOrPlanner(): boolean {
    return this.auth.role === 'admin' || this.auth.role === 'planner';
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
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

  get plannerAvailabilityHours(): number {
    if (!this.selectionStrategy) {
      return 0;
    }

    if (this.selectionStrategy === 'available') {
      return this.markedHours;
    }

    return this.totalWeekHours - this.markedHours;
  }

  get remainingAvailabilityHours(): number {
    return Math.max(0, this.requiredAvailabilityHours - this.plannerAvailabilityHours);
  }

  get canConfirmHours(): boolean {
    return !!this.selectionStrategy && this.plannerAvailabilityHours >= this.requiredAvailabilityHours;
  }

  get currentLecturerName(): string {
    return this.auth.displayName || 'Wykładowca';
  }

  get currentLecturerEmail(): string {
    return this.auth.email || '';
  }

  get lecturerSubmissions(): LecturerSubmission[] {
    return this.allSubmissions
      .filter((submission) => submission.lecturerEmail === this.currentLecturerEmail)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }

  get submissionsForAdminPlanner(): LecturerSubmission[] {
    const latestByLecturer = new Map<string, LecturerSubmission>();

    for (const submission of this.allSubmissions) {
      const lecturerKey = submission.lecturerEmail || submission.lecturerDisplayName || submission.id;
      const current = latestByLecturer.get(lecturerKey);

      if (!current || submission.timestamp.localeCompare(current.timestamp) > 0) {
        latestByLecturer.set(lecturerKey, submission);
      }
    }

    return Array.from(latestByLecturer.values())
      .sort((a, b) => a.lecturerDisplayName.localeCompare(b.lecturerDisplayName));
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
    private auth: AuthService,
    private dezyderataService: DezyderataService
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
    });
  }

  ngOnInit() {
    this.updateView();
    this.loadSemestry();
    this.maybeStartLecturerTutorial();
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
        this.loadCurrentDezyderata();
      },
      error: () => {
        // Brak aktywnego semestru - użyj pierwszego dostępnego
        if (this.semestry.length > 0) {
          this.currentSemestr = this.semestry[0];
          this.selectedSemestrId = this.semestry[0].id;
          this.loadCurrentDezyderata();
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

    // Szukaj dezyderaty dla bieżącego tygodnia
    const matching = dezyderaty.find(
      (d) => d.data_od === weekStartIso && d.data_do === weekEndIso
    );

    if (!matching) {
      this.slotSelections.clear();
      this.selectionStrategy = null;
      this.isHoursConfirmed = false;
      return;
    }

    // Przywróć zaznaczenia
    const slots = matching.godziny.split(',').filter(s => s.trim());
    this.slotSelections.clear();

    // Wykryj strategię na podstawie ilości slotów
    const isAvailable = slots.length <= this.totalWeekHours / 2;
    this.selectionStrategy = isAvailable ? 'available' : 'unavailable';
    this.selectionMode = this.selectionStrategy;

    for (const slot of slots) {
      this.slotSelections.set(slot.trim(), this.selectionStrategy);
    }

    this.isHoursConfirmed = true;
    this.lecturerMessage = 'Wczytano wcześniej zatwierdzone godziny dla bieżącego tygodnia.';
  }

  onSemestrChange(event: CustomEvent) {
    const semestrId = parseInt(event.detail.value, 10);
    this.selectedSemestrId = semestrId;
    this.currentSemestr = this.semestry.find(s => s.id === semestrId) ?? null;
    this.loadCurrentDezyderata();
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
        this.isLoadingDezyderaty = false;
      },
      error: () => {
        this.historyDezyderaty = [];
        this.isLoadingDezyderaty = false;
      }
    });
  }

  closeHistoryModal() {
    this.isHistoryModalOpen = false;
  }

  loadHistoryDezyderata(dezyderata: Dezyderata) {
    // Przejdź do tygodnia z historii
    this.selectedDate = new Date(`${dezyderata.data_od}T00:00:00`);
    this.updateView();

    // Przywróć zaznaczenia
    const slots = dezyderata.godziny.split(',').filter(s => s.trim());
    this.slotSelections.clear();

    const isAvailable = slots.length <= this.totalWeekHours / 2;
    this.selectionStrategy = isAvailable ? 'available' : 'unavailable';
    this.selectionMode = this.selectionStrategy;

    for (const slot of slots) {
      this.slotSelections.set(slot.trim(), this.selectionStrategy);
    }

    this.isHoursConfirmed = true;
    this.closeHistoryModal();
    this.lecturerMessage = `Wczytano dezyderatę z ${dezyderata.data_od} - ${dezyderata.data_do}`;
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

    const calculatedWidth = this.isLecturer ? window.innerWidth - clientX : clientX;
    const clampedWidth = Math.max(this.minSidebarWidth, Math.min(this.maxSidebarWidth, calculatedWidth));
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


  goToToday() {
    if (this.isLecturer) {
      return;
    }
    this.selectedDate = new Date();
    this.updateView();
  }

  updateView() {
    this.generateWeek(this.selectedDate);
    const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
    this.currentMonthName = months[this.selectedDate.getMonth()];
    this.currentYear = this.selectedDate.getFullYear();
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
        iso: nextDay.toISOString().slice(0, 10),
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
    const godziny = Array.from(this.slotSelections.keys()).join(',');

    const payload: DezyderataCreate = {
      data_od: weekStartIso,
      data_do: weekEndIso,
      godziny,
      semestr_id: this.selectedSemestrId
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

  selectPlannerSubmission(entry: LecturerSubmission) {
    this.activePlannerSubmissionId = entry.id;

    if (entry.weekStartIso) {
      this.selectedDate = new Date(`${entry.weekStartIso}T00:00:00`);
      this.updateView();
    }
  }

  isPlannerSubmissionActive(entry: LecturerSubmission): boolean {
    return this.activePlannerSubmissionId === entry.id;
  }

  closeSubmissionPreview() {
    this.isSubmissionModalOpen = false;
  }

  getSubmissionSlotState(day: WeekDay, hour: number): AvailabilityMode | null {
    if (!this.selectedSubmissionPreview) {
      return null;
    }

    const key = this.getSlotKey(day, hour);
    return this.selectedSubmissionPreview.selectedSlots?.includes(key)
      ? this.selectedSubmissionPreview.strategy
      : null;
  }

  getPlannerSlotState(day: WeekDay, hour: number): AvailabilityMode | null {
    const activeSubmission = this.activePlannerSubmission;
    if (!activeSubmission) {
      return null;
    }

    const key = this.getSlotKey(day, hour);
    return activeSubmission.selectedSlots?.includes(key)
      ? activeSubmission.strategy
      : null;
  }

  formatDateRange(dataOd: string, dataDo: string): string {
    const od = new Date(dataOd);
    const doDate = new Date(dataDo);
    const formatDate = (d: Date) => d.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit', year: 'numeric' });
    return `${formatDate(od)} - ${formatDate(doDate)}`;
  }

  countSlots(godziny: string): number {
    return godziny.split(',').filter(s => s.trim()).length;
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

  private buildWeekDaysFromIso(weekStartIso: string): WeekDay[] {
    const monday = new Date(`${weekStartIso}T00:00:00`);
    const names = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
    const days: WeekDay[] = [];

    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      days.push({
        name: names[i],
        iso: nextDay.toISOString().slice(0, 10),
        isToday: false,
      });
    }

    return days;
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
    this.isTutorialActive = false;
  }

  private refreshTutorialSpotlight() {
    const activeStep = this.activeTutorialStep;
    if (!activeStep) {
      this.tutorialSpotlightStyle = {};
      return;
    }

    const selector = `[data-tour-step="${activeStep.target}"]`;
    const targetElement = document.querySelector(selector) as HTMLElement | null;

    if (!targetElement) {
      this.tutorialSpotlightStyle = {};
      return;
    }

    const rect = targetElement.getBoundingClientRect();
    const padding = 6;

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

    const remaining = this.tutorialCalendarRequiredTiles - this.slotSelections.size;
    this.lecturerMessage = `Samouczek: zaznacz jeszcze ${remaining} kafelk${remaining === 1 ? 'ek' : 'i'}.`;
  }
}
