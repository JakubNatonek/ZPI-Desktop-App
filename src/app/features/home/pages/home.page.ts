import { Component, OnInit, HostListener, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import {
  chevronBackOutline, chevronForwardOutline, cloudDownloadOutline,
  cloudUploadOutline, addOutline, peopleOutline, menuOutline,
  checkmarkDoneOutline, createOutline, swapHorizontalOutline
} from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';

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
  weekType: 'A' | 'B';
  strategy: AvailabilityMode;
  selectedSlots: string[];
  markedHours: number;
  plannerAvailabilityHours: number;
  requiredHours: number;
  timestamp: string;
}

interface RaplyImportedFileInfo {
  name: string;
  size: number;
  importedAt: string;
}

interface TutorialStep {
  target: 'mode-selector' | 'calendar-cell' | 'confirm-button' | 'edit-button' | 'clear-button';
  title: string;
  description: string;
}

type Delimiter = ',' | ';' | '\t' | '|';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HomePage implements OnInit {
  private readonly submissionsStorageKey = 'lecturerAvailabilitySubmissions';
  private readonly raplyImportsStorageKey = 'raplyImportedFiles';
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
  importedRaplyFiles: RaplyImportedFileInfo[] = [];
  raplyImportMessage = '';
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
  currentWeekType: 'A' | 'B' = 'A';
  weekDays: WeekDay[] = [];

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

  constructor(private router: Router, private auth: AuthService) {
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
    });
  }

  ngOnInit() {
    this.updateView();
    this.reloadSubmissionsState();
    this.maybeStartLecturerTutorial();
  }

  ionViewWillEnter() {
    this.reloadSubmissionsState();
    this.maybeStartLecturerTutorial();
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
    this.currentWeekType = this.resolveWeekType(this.selectedDate);
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

    this.isHoursConfirmed = true;
    const weekStartIso = this.weekDays[0]?.iso ?? '';
    const submission: LecturerSubmission = {
      id: `${this.currentLecturerEmail}-${weekStartIso}`,
      lecturerDisplayName: this.currentLecturerName,
      lecturerEmail: this.currentLecturerEmail,
      weekStartIso,
      weekType: this.currentWeekType,
      strategy: this.selectionStrategy,
      selectedSlots: Array.from(this.slotSelections.keys()),
      markedHours: this.markedHours,
      plannerAvailabilityHours: isTutorialConfirmStep ? this.requiredAvailabilityHours : this.plannerAvailabilityHours,
      requiredHours: this.requiredAvailabilityHours,
      timestamp: new Date().toISOString(),
    };

    this.upsertSubmission(submission);
    this.lecturerMessage = `Godziny zatwierdzone. Planista widzi ${this.plannerAvailabilityHours} h do dyspozycji.`;

    if (isTutorialConfirmStep) {
      this.nextTutorialStep();
    }
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

  private loadSubmissions(): LecturerSubmission[] {
    const raw = localStorage.getItem(this.submissionsStorageKey);
    if (!raw) {
      return [];
    }

    try {
      const parsed = JSON.parse(raw) as LecturerSubmission[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      // Backward compatibility: normalize older/incomplete entries.
      return parsed
        .map((entry) => this.normalizeSubmission(entry))
        .filter((entry): entry is LecturerSubmission => !!entry);
    } catch {
      return [];
    }
  }

  private normalizeSubmission(entry: unknown): LecturerSubmission | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const candidate = entry as Partial<LecturerSubmission>;
    const lecturerEmail = candidate.lecturerEmail || 'unknown@local';
    const lecturerDisplayName = candidate.lecturerDisplayName || lecturerEmail;
    const weekStartIso = candidate.weekStartIso || '';
    const strategy: AvailabilityMode = candidate.strategy === 'unavailable' ? 'unavailable' : 'available';
    const selectedSlots = Array.isArray(candidate.selectedSlots) ? candidate.selectedSlots : [];
    const markedHours = typeof candidate.markedHours === 'number' ? candidate.markedHours : selectedSlots.length;
    const plannerAvailabilityHours = typeof candidate.plannerAvailabilityHours === 'number'
      ? candidate.plannerAvailabilityHours
      : markedHours;
    const requiredHours = typeof candidate.requiredHours === 'number' ? candidate.requiredHours : this.requiredAvailabilityHours;
    const timestamp = candidate.timestamp || new Date().toISOString();

    return {
      id: candidate.id || `${lecturerEmail}-${weekStartIso}`,
      lecturerDisplayName,
      lecturerEmail,
      weekStartIso,
      weekType: 'A',
      strategy,
      selectedSlots,
      markedHours,
      plannerAvailabilityHours,
      requiredHours,
      timestamp,
    };
  }

  private upsertSubmission(submission: LecturerSubmission) {
    const index = this.allSubmissions.findIndex((entry) => entry.id === submission.id);
    if (index >= 0) {
      this.allSubmissions[index] = submission;
    } else {
      this.allSubmissions.push(submission);
    }

    localStorage.setItem(this.submissionsStorageKey, JSON.stringify(this.allSubmissions));
  }

  private reloadSubmissionsState() {
    this.allSubmissions = this.loadSubmissions();
    const importsRaw = localStorage.getItem(this.raplyImportsStorageKey);
    this.importedRaplyFiles = importsRaw ? JSON.parse(importsRaw) as RaplyImportedFileInfo[] : [];

    const hasActiveSubmission = this.activePlannerSubmissionId
      ? this.allSubmissions.some((entry) => entry.id === this.activePlannerSubmissionId)
      : false;
    if (!hasActiveSubmission) {
      const newest = [...this.allSubmissions].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      this.activePlannerSubmissionId = newest?.id ?? null;
    }

    this.restoreLecturerSelectionForCurrentWeek();
  }

  private restoreLecturerSelectionForCurrentWeek() {
    if (!this.isLecturer) {
      return;
    }

    const weekStartIso = this.weekDays[0]?.iso;
    if (!weekStartIso) {
      return;
    }

    const submission = this.allSubmissions.find(
      (entry) => entry.lecturerEmail === this.currentLecturerEmail && entry.weekStartIso === weekStartIso
    );

    if (!submission) {
      this.slotSelections.clear();
      this.selectionStrategy = null;
      this.isHoursConfirmed = false;
      return;
    }

    this.selectionStrategy = submission.strategy;
    this.selectionMode = submission.strategy;
    this.isHoursConfirmed = true;
    this.slotSelections = new Map(submission.selectedSlots.map((key) => [key, submission.strategy]));
    this.lecturerMessage = 'Wczytano wcześniej zatwierdzone godziny dla bieżącego tygodnia.';
  }

  private resolveWeekType(baseDate: Date): 'A' | 'B' {
    return 'A';
  }

  private getIsoWeekNumber(date: Date): number {
    const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = normalized.getUTCDay() || 7;
    normalized.setUTCDate(normalized.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1));
    return Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
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

  exportRaply() { console.log('Export...'); }

  importRaply(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  async onRaplyFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
      return;
    }

    const importedInfos: RaplyImportedFileInfo[] = [];
    let importedEntriesCount = 0;

    for (const file of Array.from(files)) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const canRead = extension === 'json' || extension === 'csv' || extension === 'raply';

      if (!canRead) {
        continue;
      }

      const text = await this.readFileText(file);
      const entries = this.tryParseImportedEntries(text, extension ?? '');

      for (const entry of entries) {
        this.upsertSubmission(entry);
        importedEntriesCount += 1;
      }

      importedInfos.push({
        name: file.name,
        size: file.size,
        importedAt: new Date().toISOString(),
      });
    }

    if (importedInfos.length === 0) {
      this.raplyImportMessage = 'Nie udało się zaimportować plików. Użyj .json, .csv lub .raply.';
      input.value = '';
      return;
    }

    this.importedRaplyFiles = [...importedInfos, ...this.importedRaplyFiles].slice(0, 10);
    localStorage.setItem(this.raplyImportsStorageKey, JSON.stringify(this.importedRaplyFiles));
    this.reloadSubmissionsState();

    if (importedEntriesCount > 0) {
      const newest = [...this.allSubmissions].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      if (newest) {
        this.selectPlannerSubmission(newest);
      }
    }

    this.raplyImportMessage = importedEntriesCount > 0
      ? `Zaimportowano ${importedInfos.length} plik(ów), dodano/odświeżono ${importedEntriesCount} wpisów. Plan jest widoczny w siatce.`
      : `Zaimportowano ${importedInfos.length} plik(ów). Brak rozpoznanych wpisów harmonogramu w JSON.`;
    input.value = '';
  }

  private tryParseImportedEntries(text: string, extension: string): LecturerSubmission[] {
    const jsonEntries = this.tryParseImportedJson(text);
    if (jsonEntries.length > 0) {
      return jsonEntries;
    }

    if (extension === 'csv' || extension === 'raply') {
      return this.tryParseDelimitedImport(text);
    }

    return [];
  }

  private tryParseImportedJson(text: string): LecturerSubmission[] {
    try {
      const data = JSON.parse(text) as unknown;
      const rawEntries = Array.isArray(data)
        ? data
        : (data && typeof data === 'object' && Array.isArray((data as { submissions?: unknown[] }).submissions)
          ? (data as { submissions: unknown[] }).submissions
          : []);

      return rawEntries
        .map((entry) => this.normalizeSubmission(entry))
        .filter((entry): entry is LecturerSubmission => !!entry);
    } catch {
      return [];
    }
  }

  private tryParseDelimitedImport(text: string): LecturerSubmission[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return [];
    }

    const delimiter = this.detectDelimiter(lines[0]);
    const headers = lines[0].split(delimiter).map((header) => this.normalizeHeader(header));
    const grouped = new Map<string, Partial<LecturerSubmission> & { selectedSlots: string[] }>();

    for (const line of lines.slice(1)) {
      const cols = line.split(delimiter).map((value) => value.trim());
      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = cols[index] ?? '';
      });

      const lecturerEmail = row['lectureremail'] || row['email'] || row['mail'] || 'unknown@local';
      const lecturerDisplayName = row['lecturerdisplayname'] || row['lecturer'] || row['name'] || lecturerEmail;
      const weekStartIso = row['weekstartiso'] || row['weekstart'] || row['week'] || row['weekstartdate'] || '';
      const strategy = this.parseStrategy(row['strategy'] || row['mode'] || row['typ'] || row['type']);
      const weekType: 'A' | 'B' = (row['weektype'] || row['tydzien'] || 'A').toUpperCase() === 'B' ? 'B' : 'A';
      const requiredHours = Number(row['requiredhours'] || row['required'] || this.requiredAvailabilityHours);
      const timestamp = row['timestamp'] || row['importedat'] || new Date().toISOString();
      const rowSlots = this.extractSlotsFromRow(row);
      const groupKey = `${lecturerEmail}|${weekStartIso}|${strategy}`;

      const current = grouped.get(groupKey) ?? {
        id: `${lecturerEmail}-${weekStartIso}`,
        lecturerDisplayName,
        lecturerEmail,
        weekStartIso,
        weekType,
        strategy,
        requiredHours,
        timestamp,
        selectedSlots: [],
      };

      current.lecturerDisplayName = lecturerDisplayName;
      current.lecturerEmail = lecturerEmail;
      current.weekStartIso = weekStartIso;
      current.weekType = weekType;
      current.strategy = strategy;
      current.requiredHours = Number.isFinite(requiredHours) ? requiredHours : this.requiredAvailabilityHours;
      current.timestamp = timestamp;

      for (const slot of rowSlots) {
        if (!current.selectedSlots.includes(slot)) {
          current.selectedSlots.push(slot);
        }
      }

      grouped.set(groupKey, current);
    }

    return Array.from(grouped.values())
      .map((entry) => {
        const selectedSlots = entry.selectedSlots ?? [];
        const markedHours = selectedSlots.length;
        const plannerAvailabilityHours = entry.strategy === 'unavailable'
          ? this.totalWeekHours - markedHours
          : markedHours;

        return this.normalizeSubmission({
          ...entry,
          selectedSlots,
          markedHours,
          plannerAvailabilityHours,
        });
      })
      .filter((entry): entry is LecturerSubmission => !!entry);
  }

  private detectDelimiter(headerLine: string): Delimiter {
    const candidates: Delimiter[] = [';', ',', '\t', '|'];
    let best: Delimiter = ';';
    let bestScore = -1;

    for (const delimiter of candidates) {
      const score = headerLine.split(delimiter).length;
      if (score > bestScore) {
        best = delimiter;
        bestScore = score;
      }
    }

    return best;
  }

  private normalizeHeader(header: string): string {
    return header
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private parseStrategy(rawValue: string): AvailabilityMode {
    const value = String(rawValue || '').toLowerCase();
    return value.includes('niedost') || value.includes('unavailable') || value === '0'
      ? 'unavailable'
      : 'available';
  }

  private extractSlotsFromRow(row: Record<string, string>): string[] {
    const slotsRaw = row['selectedslots'] || row['slots'] || row['hours'] || row['godziny'];
    if (slotsRaw) {
      return slotsRaw
        .split(/[;|,\s]+/)
        .map((slot) => slot.trim())
        .filter((slot) => /\d{4}-\d{2}-\d{2}-\d{1,2}/.test(slot));
    }

    const isoDate = row['dayiso'] || row['date'] || row['day'] || row['data'];
    const hourValue = row['hour'] || row['godzina'];

    if (isoDate && hourValue) {
      const hour = Number(hourValue);
      if (Number.isFinite(hour)) {
        return [`${isoDate}-${hour}`];
      }
    }

    const startHourValue = row['starthour'] || row['start'];
    const endHourValue = row['endhour'] || row['end'];
    if (isoDate && startHourValue && endHourValue) {
      const startHour = Number(startHourValue);
      const endHour = Number(endHourValue);
      if (Number.isFinite(startHour) && Number.isFinite(endHour) && endHour >= startHour) {
        const generated: string[] = [];
        for (let hour = startHour; hour <= endHour; hour++) {
          generated.push(`${isoDate}-${hour}`);
        }
        return generated;
      }
    }

    return [];
  }

  private readFileText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
      reader.readAsText(file);
    });
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
