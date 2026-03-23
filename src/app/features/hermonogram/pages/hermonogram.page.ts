import { Component, OnInit } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { chevronBackOutline, chevronForwardOutline } from 'ionicons/icons';
import { AuthService } from '../../../core/services/auth.service';
import { Router } from '@angular/router';

interface WeekDay {
  name: string;
  iso: string;
  isToday: boolean;
}

interface ImportedPlanEntry {
  id: string;
  weekStartIso: string;
  selectedSlots: string[];
  events: ImportedPlanEvent[];
  timestamp: string;
}

interface ImportedPlanEvent {
  subject: string;
  startIso: string;
  endIso: string;
  location: string;
  instructor: string;
  description: string;
}

interface RaplyImportedFileInfo {
  name: string;
  size: number;
  importedAt: string;
}

type Delimiter = ',' | ';' | '\t' | '|';

@Component({
  selector: 'app-hermonogram',
  templateUrl: 'hermonogram.page.html',
  styleUrls: ['hermonogram.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HermonogramPage implements OnInit {
  private readonly importedPlansStorageKey = 'harmonogramImportedPlans';
  private readonly legacySubmissionsStorageKey = 'lecturerAvailabilitySubmissions';
  private readonly raplyImportsStorageKey = 'raplyImportedFiles';
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  hours24 = Array.from({ length: 14 }, (_, i) => i + 7);
  selectedDate: Date = new Date();
  currentMonthName = '';
  currentYear = 0;
  weekDays: WeekDay[] = [];

  importedPlans: ImportedPlanEntry[] = [];
  activePlanId: string | null = null;
  importedRaplyFiles: RaplyImportedFileInfo[] = [];
  raplyImportMessage = '';

  constructor(private auth: AuthService, private router: Router) {
    addIcons({ chevronBackOutline, chevronForwardOutline });
  }

  get canAccessHarmonogram(): boolean {
    return this.auth.role === 'admin' || this.auth.role === 'planner';
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  get activePlan(): ImportedPlanEntry | null {
    if (!this.activePlanId) {
      return null;
    }
    return this.importedPlans.find((entry) => entry.id === this.activePlanId) ?? null;
  }

  get activePlanSummary(): string {
    const plan = this.activePlan;
    if (!plan) {
      return 'Brak planu';
    }

    const week = plan.weekStartIso || 'brak daty';
    const eventsCount = plan.events?.length ?? 0;
    return `Plan: ${week} • zajęć: ${eventsCount}`;
  }

  ngOnInit() {
    if (!this.canAccessHarmonogram) {
      this.router.navigateByUrl('/home');
      return;
    }

    this.updateView();
    this.reloadData();
  }

  ionViewWillEnter() {
    if (!this.canAccessHarmonogram) {
      return;
    }

    this.reloadData();
  }

  prevWeek() {
    this.selectedDate.setDate(this.selectedDate.getDate() - 7);
    this.updateView();
  }

  nextWeek() {
    this.selectedDate.setDate(this.selectedDate.getDate() + 7);
    this.updateView();
  }

  goToToday() {
    this.selectedDate = new Date();
    this.updateView();
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
        iso: this.formatLocalIsoDate(nextDay),
        isToday: nextDay.toDateString() === new Date().toDateString(),
      });
    }
  }

  isPlanSlotImported(day: WeekDay, hour: number): boolean {
    const plan = this.activePlan;
    if (!plan) {
      return false;
    }

    const key = `${day.iso}-${hour}`;
    return plan.selectedSlots.includes(key);
  }

  getCellScheduleItems(day: WeekDay, hour: number): ImportedPlanEvent[] {
    const plan = this.activePlan;
    if (!plan || !Array.isArray(plan.events) || plan.events.length === 0) {
      return [];
    }

    const slotStart = new Date(`${day.iso}T${String(hour).padStart(2, '0')}:00:00`);
    const slotEnd = new Date(slotStart);
    slotEnd.setHours(slotEnd.getHours() + 1);

    return plan.events.filter((event) => {
      const eventStart = new Date(event.startIso);
      const eventEnd = new Date(event.endIso);
      return eventStart.getTime() < slotEnd.getTime() && eventEnd.getTime() > slotStart.getTime();
    });
  }

  togglePlanSlot(day: WeekDay, hour: number) {
    let plan = this.activePlan;
    if (!plan) {
      const weekStartIso = this.weekDays[0]?.iso ?? '';
      plan = {
        id: `${weekStartIso || 'week'}-${new Date().toISOString()}`,
        weekStartIso,
        selectedSlots: [],
        events: [],
        timestamp: new Date().toISOString(),
      };
      this.upsertPlan(plan);
      this.activePlanId = plan.id;
    }

    const key = `${day.iso}-${hour}`;
    const hasKey = plan.selectedSlots.includes(key);
    const selectedSlots = hasKey
      ? plan.selectedSlots.filter((slot) => slot !== key)
      : [...plan.selectedSlots, key];

    const updated: ImportedPlanEntry = {
      ...plan,
      selectedSlots,
      timestamp: new Date().toISOString(),
    };

    this.upsertPlan(updated);
  }

  importRaply(fileInput: HTMLInputElement) {
    fileInput.click();
  }

  async onRaplyFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = input.files;

    if (!files || files.length === 0) {
      this.raplyImportMessage = 'Nie wybrano pliku do importu.';
      return;
    }

    const importedInfos: RaplyImportedFileInfo[] = [];
    let importedEntriesCount = 0;
    let latestImportedPlanId: string | null = null;

    for (const file of Array.from(files)) {
      const extension = file.name.split('.').pop()?.toLowerCase();
      const canRead = extension === 'json' || extension === 'csv' || extension === 'raply';

      if (!canRead) {
        continue;
      }

      const text = await this.readFileText(file);
      const entries = this.tryParseImportedEntries(text, extension ?? '');

      for (const entry of entries) {
        this.upsertPlan(entry);
        importedEntriesCount += 1;
        latestImportedPlanId = entry.id;
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
    this.reloadData();

    if (importedEntriesCount > 0) {
      const importedPlan = latestImportedPlanId
        ? this.importedPlans.find((plan) => plan.id === latestImportedPlanId) ?? null
        : null;

      const planToActivate = importedPlan ?? [...this.importedPlans].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0] ?? null;

      if (planToActivate) {
        this.activePlanId = planToActivate.id;
        if (planToActivate.weekStartIso) {
          this.selectedDate = new Date(`${planToActivate.weekStartIso}T00:00:00`);
          this.updateView();
        }
      }
      const visibleSlots = planToActivate?.selectedSlots.length ?? 0;
      this.raplyImportMessage = `Zaimportowano ${importedEntriesCount} wpisów planu. Widoczne pola: ${visibleSlots}.`;
    } else {
      this.raplyImportMessage = 'Plik zaimportowany, ale nie znaleziono rozpoznanych godzin.';
    }
    input.value = '';
  }

  private reloadData() {
    this.importedPlans = this.loadImportedPlans();
    const importsRaw = localStorage.getItem(this.raplyImportsStorageKey);
    this.importedRaplyFiles = importsRaw ? JSON.parse(importsRaw) as RaplyImportedFileInfo[] : [];

    const hasActive = this.activePlanId
      ? this.importedPlans.some((entry) => entry.id === this.activePlanId)
      : false;
    if (!hasActive) {
      const newest = [...this.importedPlans].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
      this.activePlanId = newest?.id ?? null;
      if (newest?.weekStartIso) {
        this.selectedDate = new Date(`${newest.weekStartIso}T00:00:00`);
        this.updateView();
      }
    }
  }

  private loadImportedPlans(): ImportedPlanEntry[] {
    const raw = localStorage.getItem(this.importedPlansStorageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ImportedPlanEntry[];
        if (Array.isArray(parsed)) {
          return parsed
            .map((entry) => this.normalizeImportedPlanEntry(entry))
            .filter((entry): entry is ImportedPlanEntry => !!entry);
        }
      } catch {
        // Continue to legacy fallback.
      }
    }

    const legacyRaw = localStorage.getItem(this.legacySubmissionsStorageKey);
    if (!legacyRaw) {
      return [];
    }

    try {
      const parsed = JSON.parse(legacyRaw) as unknown[];
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((entry) => this.normalizeImportedPlanEntry(entry))
        .filter((entry): entry is ImportedPlanEntry => !!entry);
    } catch {
      return [];
    }
  }

  private normalizeImportedPlanEntry(entry: unknown): ImportedPlanEntry | null {
    if (!entry || typeof entry !== 'object') {
      return null;
    }

    const candidate = entry as Partial<ImportedPlanEntry> & {
      slots?: string[];
      weekStart?: string;
      week?: string;
      events?: unknown[];
    };
    const selectedSlots = Array.isArray(candidate.selectedSlots)
      ? candidate.selectedSlots
      : (Array.isArray(candidate.slots) ? candidate.slots : []);
    const timestamp = candidate.timestamp || new Date().toISOString();
    const weekStartIso = candidate.weekStartIso || candidate.weekStart || candidate.week || this.resolveWeekStartFromSlots(selectedSlots);
    const uniqueSlots = Array.from(new Set(selectedSlots.filter((slot) => /\d{4}-\d{2}-\d{2}-\d{1,2}/.test(slot))));
    const events = Array.isArray(candidate.events)
      ? candidate.events.map((event) => this.normalizeImportedEvent(event)).filter((event): event is ImportedPlanEvent => !!event)
      : [];

    return {
      id: candidate.id || `${weekStartIso || 'week'}-${timestamp}`,
      weekStartIso,
      selectedSlots: uniqueSlots,
      events,
      timestamp,
    };
  }

  private normalizeImportedEvent(event: unknown): ImportedPlanEvent | null {
    if (!event || typeof event !== 'object') {
      return null;
    }

    const candidate = event as Partial<ImportedPlanEvent>;
    if (!candidate.startIso || !candidate.endIso) {
      return null;
    }

    return {
      subject: candidate.subject || 'Zajęcia',
      startIso: candidate.startIso,
      endIso: candidate.endIso,
      location: candidate.location || '',
      instructor: candidate.instructor || '',
      description: candidate.description || '',
    };
  }

  private tryParseImportedEntries(text: string, extension: string): ImportedPlanEntry[] {
    const jsonEntries = this.tryParseImportedJson(text);
    if (jsonEntries.length > 0) {
      return jsonEntries;
    }

    if (extension === 'csv' || extension === 'raply') {
      return this.tryParseDelimitedImport(text);
    }

    return [];
  }

  private tryParseImportedJson(text: string): ImportedPlanEntry[] {
    try {
      const data = JSON.parse(text) as unknown;
      const rawEntries = Array.isArray(data)
        ? data
        : (data && typeof data === 'object'
          ? (Array.isArray((data as { plans?: unknown[] }).plans)
            ? (data as { plans: unknown[] }).plans
            : (Array.isArray((data as { submissions?: unknown[] }).submissions)
              ? (data as { submissions: unknown[] }).submissions
              : []))
          : []);

      return rawEntries
        .map((entry) => this.normalizeImportedPlanEntry(entry))
        .filter((entry): entry is ImportedPlanEntry => !!entry);
    } catch {
      return [];
    }
  }

  private tryParseDelimitedImport(text: string): ImportedPlanEntry[] {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    if (lines.length < 2) {
      return [];
    }

    const delimiter = this.detectDelimiter(lines[0]);
    const headers = lines[0].split(delimiter).map((header) => this.normalizeHeader(header));
    const grouped = new Map<string, {
      id: string;
      weekStartIso: string;
      selectedSlots: string[];
      events: ImportedPlanEvent[];
      timestamp: string;
    }>();
    const importTimestamp = new Date().toISOString();

    for (const line of lines.slice(1)) {
      const cols = line.split(delimiter).map((value) => value.trim());
      const row: Record<string, string> = {};

      headers.forEach((header, index) => {
        row[header] = cols[index] ?? '';
      });

      const weekStartIso = row['weekstartiso'] || row['weekstart'] || row['week'] || row['weekstartdate'] || '';
      const timestamp = row['timestamp'] || row['importedat'] || importTimestamp;
      const rowSlots = this.extractSlotsFromRow(row);
      const rowEvent = this.extractEventFromRow(row);
      const normalizedWeekStart = weekStartIso || this.resolveWeekStartFromSlots(rowSlots);
      const groupKey = `${normalizedWeekStart}|${timestamp}`;

      const current = grouped.get(groupKey) ?? {
        id: `${normalizedWeekStart || 'week'}-${timestamp}`,
        weekStartIso: normalizedWeekStart,
        timestamp,
        selectedSlots: [],
        events: [],
      };

      current.weekStartIso = normalizedWeekStart;
      current.timestamp = timestamp;

      for (const slot of rowSlots) {
        if (!current.selectedSlots.includes(slot)) {
          current.selectedSlots.push(slot);
        }
      }

      if (rowEvent) {
        const exists = current.events.some((event) =>
          event.subject === rowEvent.subject
          && event.startIso === rowEvent.startIso
          && event.endIso === rowEvent.endIso
          && event.location === rowEvent.location
        );

        if (!exists) {
          current.events.push(rowEvent);
        }
      }

      grouped.set(groupKey, current);
    }

    return Array.from(grouped.values())
      .map((entry) => this.normalizeImportedPlanEntry(entry))
      .filter((entry): entry is ImportedPlanEntry => !!entry);
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

  private extractSlotsFromRow(row: Record<string, string>): string[] {
    const slotsRaw = row['selectedslots'] || row['slots'] || row['hours'] || row['godziny'];
    if (slotsRaw) {
      return slotsRaw
        .split(/[;|,\s]+/)
        .map((slot) => slot.trim())
        .filter((slot) => /\d{4}-\d{2}-\d{2}-\d{1,2}/.test(slot));
    }

    const rangeSlots = this.extractSlotsFromDateRange(row);
    if (rangeSlots.length > 0) {
      return rangeSlots;
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

  private extractSlotsFromDateRange(row: Record<string, string>): string[] {
    const range = this.extractDateRangeFromRow(row);
    if (!range) {
      return [];
    }

    const { start, end } = range;

    if (!start || !end || end.getTime() <= start.getTime()) {
      return [];
    }

    const slots: string[] = [];
    const cursor = new Date(start);
    cursor.setMinutes(0, 0, 0);

    while (cursor.getTime() < end.getTime()) {
      const hourStart = new Date(cursor);
      const hourEnd = new Date(cursor);
      hourEnd.setHours(hourEnd.getHours() + 1);

      if (start.getTime() < hourEnd.getTime() && end.getTime() > hourStart.getTime()) {
        const isoDate = this.formatLocalIsoDate(hourStart);
        slots.push(`${isoDate}-${hourStart.getHours()}`);
      }

      cursor.setHours(cursor.getHours() + 1);
    }

    return Array.from(new Set(slots));
  }

  private extractEventFromRow(row: Record<string, string>): ImportedPlanEvent | null {
    const range = this.extractDateRangeFromRow(row);
    if (!range) {
      return null;
    }

    const subject = row['subject'] || row['name'] || 'Zajęcia';
    const location = row['location'] || row['room'] || row['sala'] || '';
    const instructor = row['instructor'] || row['lecturer'] || row['teacher'] || '';
    const description = row['description'] || row['desc'] || '';

    return {
      subject,
      startIso: this.toLocalDateTimeIso(range.start),
      endIso: this.toLocalDateTimeIso(range.end),
      location,
      instructor,
      description,
    };
  }

  private extractDateRangeFromRow(row: Record<string, string>): { start: Date; end: Date } | null {
    const startDateRaw = row['startdate'] || row['start_date'];
    const startTimeRaw = row['starttime'];
    const endDateRaw = row['enddate'] || row['end_date'];
    const endTimeRaw = row['endtime'];

    const startRaw = (startDateRaw && startTimeRaw)
      ? `${startDateRaw} ${startTimeRaw}`
      : (row['startdatetime'] || row['start_date'] || row['startdate']);
    const endRaw = (endDateRaw && endTimeRaw)
      ? `${endDateRaw} ${endTimeRaw}`
      : (row['enddatetime'] || row['end_date'] || row['enddate']);

    if (!startRaw || !endRaw) {
      return null;
    }

    const start = this.parseDateTimeValue(startRaw);
    const end = this.parseDateTimeValue(endRaw);

    if (!start || !end || end.getTime() <= start.getTime()) {
      return null;
    }

    return { start, end };
  }

  private parseDateTimeValue(rawValue: string): Date | null {
    const normalized = rawValue.trim().replace(' ', 'T');
    const withSeconds = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized)
      ? `${normalized}:00`
      : normalized;
    const parsed = new Date(withSeconds);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatLocalIsoDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private toLocalDateTimeIso(date: Date): string {
    const isoDate = this.formatLocalIsoDate(date);
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const second = String(date.getSeconds()).padStart(2, '0');
    return `${isoDate}T${hour}:${minute}:${second}`;
  }

  private upsertPlan(plan: ImportedPlanEntry) {
    const index = this.importedPlans.findIndex((entry) => entry.id === plan.id);
    if (index >= 0) {
      this.importedPlans[index] = plan;
    } else {
      this.importedPlans.push(plan);
    }

    localStorage.setItem(this.importedPlansStorageKey, JSON.stringify(this.importedPlans));
  }

  private resolveWeekStartFromSlots(slots: string[]): string {
    const firstSlot = slots[0];
    if (!firstSlot) {
      return '';
    }

    const datePart = firstSlot.split('-').slice(0, 3).join('-');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
      return '';
    }

    const current = new Date(`${datePart}T00:00:00`);
    const day = current.getDay();
    const diff = current.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(current.setDate(diff));
    return this.formatLocalIsoDate(monday);
  }

  private readFileText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(new Error('Nie udało się odczytać pliku.'));
      reader.readAsText(file);
    });
  }

}
