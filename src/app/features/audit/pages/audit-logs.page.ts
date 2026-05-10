import { Component, OnInit } from '@angular/core';
import { ViewWillEnter } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonMenuButton, IonButton, IonIcon,
  IonSelect, IonSelectOption, IonSearchbar, IonAvatar, IonChip, IonLabel, IonPopover, IonList, IonItem
} from '@ionic/angular/standalone';
import { AuthService } from '../../../core/services/auth.service';
import { AuditApiService, AuditLogDto } from '../../../core/services/audit-api.service';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { checkmarkDone, documentTextOutline, personOutline, timeOutline, funnelOutline, closeCircleOutline } from 'ionicons/icons';

interface LogBatch {
  key: string;
  userName: string;
  timeLabel: string;
  logs: AuditLogDto[];
  hasNew: boolean;
}

interface LogGroup {
  date: string;
  batches: LogBatch[];
}

@Component({
  selector: 'app-audit-logs',
  templateUrl: './audit-logs.page.html',
  styleUrls: ['./audit-logs.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonMenuButton, IonButton, IonIcon,
    IonSelect, IonSelectOption, IonSearchbar,
    IonAvatar, IonChip, IonLabel, IonPopover, IonList, IonItem
  ]
})
export class AuditLogsPage implements OnInit, ViewWillEnter {
  logs: AuditLogDto[] = [];
  groupedLogs: LogGroup[] = [];
  lastViewedAt: string | null = null;
  hasNew: boolean = false;
  newCount: number = 0;

  filterSearch: string = '';
  filterEntity: string = '';
  filterAction: string = '';

  readonly entityMap: Record<string, string> = {
    'Subject': 'Przedmiot',
    'SubjectActivity': 'Typ zajęć przedmiotu',
    'Room': 'Sala',
    'RoomType': 'Typ sali',
    'Activity': 'Typ aktywności',
    'UnavailabilityNote': 'Notatka o niedostępności',
    'User': 'Użytkownik',
    'TeachingLoadAssignment': 'Przydział godzin',
    'Dezyderata': 'Dezyderata',
    'Role': 'Rola',
    'Department': 'Wydział',
    'Title': 'Tytuł naukowy',
    'Semestr': 'Semestr',
    'SpecialEquipment': 'Sprzęt specjalny',
    'Notification': 'Powiadomienie',
  };

  readonly translateMap: Record<string, string> = {
    // === Identyfikatory ===
    id: 'ID rekordu',
    user_id: 'Użytkownik (ID)',
    teacher_id: 'Wykładowca (ID)',
    subject_id: 'Przedmiot (ID)',
    activity_id: 'Typ zajęć (ID)',
    activity_name: 'Typ zajęć',
    semester_id: 'Semestr (ID)',
    semestr_id: 'Semestr (ID)',
    semester_name: 'Semestr',
    department_id: 'Wydział (ID)',
    room_type_id: 'Typ sali (ID)',
    type_id: 'Typ (ID)',
    role_id: 'Rola (ID)',
    title_id: 'Tytuł naukowy (ID)',
    lecturer_id: 'Wykładowca (ID)',
    student_id: 'Student (ID)',
    group_id: 'Grupa (ID)',
    author_id: 'Autor (ID)',
    announcement_id: 'Ogłoszenie (ID)',

    // === Dane osobowe ===
    first_name: 'Imię',
    last_name: 'Nazwisko',
    email: 'Adres e-mail',
    login: 'Login',
    avatar: 'Zdjęcie profilowe',
    must_change_password: 'Wymagana zmiana hasła',
    password: 'Hasło (zaszyfrowane)',
    password_hash: 'Hasło (zaszyfrowane)',

    // === Przedmiot / plan zajęć ===
    name: 'Nazwa',
    short_name: 'Nazwa skrócona',
    abbreviation: 'Skrót',
    type_display: 'Skrót typu zajęć',
    room_properties: 'Wymagania dotyczące sali',
    blocked: 'Zablokowany',
    periodic: 'Cykliczny',
    subject: 'Przedmiot',
    subject_name: 'Nazwa przedmiotu',

    // === Przydział godzin ===
    hours: 'Liczba godzin',
    teacher_first_name: 'Imię wykładowcy',
    teacher_last_name: 'Nazwisko wykładowcy',
    teacher_title: 'Tytuł wykładowcy',

    // === Sala ===
    number: 'Numer sali',
    room_number: 'Numer sali',
    seats: 'Liczba miejsc',
    seats_count: 'Liczba miejsc',
    description: 'Opis',
    room_type: 'Typ sali',
    capacity: 'Pojemność',
    building: 'Budynek',
    properties: 'Właściwości sali',
    special_equipment: 'Sprzęt specjalny',
    special_equipment_names: 'Sprzęt specjalny',
    activities: 'Obsługiwane typy zajęć',
    activity_names: 'Obsługiwane typy zajęć',
    departments: 'Wydziały',
    department_names: 'Wydziały',

    // === Dezyderata / dostępność ===
    start_date: 'Data od',
    end_date: 'Data do',
    from_hour: 'Godzina od',
    to_hour: 'Godzina do',
    day_id: 'Dzień tygodnia (ID)',
    is_available: 'Dostępność',
    note_type: 'Typ notatki',
    status: 'Status',
    justification: 'Uzasadnienie',
    submitted_at: 'Data złożenia',
    reviewed_at: 'Data rozpatrzenia',

    // === Semestr ===
    nazwa: 'Nazwa semestru',
    semester: 'Semestr',
    sort_order: 'Kolejność',
    tab_visible_from: 'Widoczny od',
    tab_visible_to: 'Widoczny do',

    // === Ogólne ===
    role: 'Rola systemowa',
    title: 'Tytuł naukowy',
    color: 'Kolor',
    amount: 'Wartość',
    number_field: 'Numer',
    is_active: 'Aktywny',
    is_read: 'Odczytano',
    is_final: 'Finalny',
    prop: 'Właściwość',
    type: 'Typ',
    topic: 'Temat',
    content: 'Treść',
    message: 'Wiadomość',
    created_at: 'Data utworzenia',
    updated_at: 'Data aktualizacji',
    last_seen_at: 'Ostatnio aktywny',
    seen_at: 'Data odczytu',
  };

  /** Internal FK ID fields that should not be shown in the diff when a readable label already exists. */
  private readonly hiddenIdFields = new Set([
    'id', 'type_id', 'room_type_id', 'activity_id', 'subject_id',
    'teacher_id', 'semester_id', 'semestr_id', 'department_id',
    'title_id', 'role_id', 'user_id', 'lecturer_id', 'student_id',
    'group_id', 'author_id', 'announcement_id',
  ]);

  /** Also always hide these noisy / irrelevant technical fields. */
  private readonly alwaysHiddenFields = new Set([
    'password', 'password_hash', 'jti', 'public_key',
    'created_at', 'updated_at', 'last_viewed_at', 'last_seen_at', 'seen_at',
    'expires_at', 'revoked_at', 'reviewed_at', 'submitted_at',
    'modified_by', 'modified_by_name',
  ]);

  get entityTypes(): string[] {
    const seen = new Set<string>();
    for (const log of this.logs) seen.add(log.entity_name);
    return Array.from(seen).sort();
  }

  get filteredGroups(): LogGroup[] {
    const search = this.filterSearch.toLowerCase().trim();
    const filtered = this.logs.filter(log => {
      if (this.filterEntity && log.entity_name !== this.filterEntity) return false;
      if (this.filterAction && log.action !== this.filterAction) return false;
      if (search) {
        const name = (log.modified_by_name || '').toLowerCase();
        const entity = this.getTranslatedEntity(log.entity_name).toLowerCase();
        if (!name.includes(search) && !entity.includes(search)) return false;
      }
      return true;
    });
    return this._buildGroups(filtered);
  }

  get isFiltered(): boolean {
    return !!this.filterSearch || !!this.filterEntity || !!this.filterAction;
  }

  get filteredCount(): number {
    return this.filteredGroups.reduce(
      (sum, group) => sum + group.batches.reduce((inner, batch) => inner + batch.logs.length, 0),
      0,
    );
  }

  clearFilters(): void {
    this.filterSearch = '';
    this.filterEntity = '';
    this.filterAction = '';
  }

  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  constructor(private auditApi: AuditApiService, public auth: AuthService, private router: Router) {
    addIcons({ checkmarkDone, documentTextOutline, personOutline, timeOutline, funnelOutline, closeCircleOutline });
  }

  get userRoleLabel(): string { return this.auth.roleLabel; }

  toggleProfileMenu(event: Event): void {
    this.profileMenuEvent = event;
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu(): void { this.isProfileMenuOpen = false; }

  openSettings(): void {
    this.closeProfileMenu();
    this.router.navigateByUrl('/profile');
  }

  logout(): void {
    this.closeProfileMenu();
    this.auth.logout();
  }

  ngOnInit(): void {
    this.loadLogs();
  }

  ionViewWillEnter(): void {
    this.loadLogs();
  }

  loadLogs() {
    this.auditApi.getLogs().subscribe(res => {
      this.lastViewedAt = res.last_changes_viewed_at;
      this.logs = res.logs;
      this.hasNew = false;
      this.newCount = 0;

      const lastViewTime = this.lastViewedAt ? new Date(this.lastViewedAt).getTime() : 0;

      for (const log of this.logs) {
        if (new Date(log.timestamp).getTime() > lastViewTime) {
          log.isNew = true;
          this.hasNew = true;
          this.newCount++;
        } else {
          log.isNew = false;
        }
      }

      this.groupedLogs = this._buildGroups(this.logs);
    });
  }

  private _buildGroups(logs: AuditLogDto[]): LogGroup[] {
    const dateMap = new Map<string, Map<string, LogBatch>>();

    for (const log of logs) {
      const d = new Date(log.timestamp);
      const dateKey = d.toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const timeLabel = d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      const userName = log.modified_by_name || 'System';
      const timeKey = `${d.getHours()}-${d.getMinutes()}`;
      const batchKey = `${userName}__${timeKey}`;

      if (!dateMap.has(dateKey)) dateMap.set(dateKey, new Map());
      const batchMap = dateMap.get(dateKey)!;

      if (!batchMap.has(batchKey)) {
        batchMap.set(batchKey, {
          key: batchKey,
          userName,
          timeLabel,
          logs: [],
          hasNew: false,
        });
      }

      const batch = batchMap.get(batchKey)!;
      batch.logs.push(log);
      if (log.isNew) batch.hasNew = true;
    }

    return Array.from(dateMap.entries()).map(([date, batches]) => ({
      date,
      batches: Array.from(batches.values()),
    }));
  }

  actionLabel(action: string): string {
    const map: Record<string, string> = { create: 'Utworzono', update: 'Zaktualizowano', delete: 'Usunięto' };
    return map[action] ?? action;
  }

  acknowledgeChanges() {
    this.auditApi.acknowledgeChanges().subscribe(() => {
      this.loadLogs();
    });
  }

  markRead(log: AuditLogDto): void {
    if (!log.isNew) return;
    log.isNew = false;
    this.newCount = Math.max(0, this.newCount - 1);
    if (this.newCount === 0) {
      this.hasNew = false;
      this.auditApi.acknowledgeChanges().subscribe();
    }
  }

  isObject(val: any): boolean {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  }

  /** Deep equality — handles arrays and primitives so array fields compare by content, not reference. */
  hasChanged(a: any, b: any): boolean {
    return JSON.stringify(a) !== JSON.stringify(b);
  }

  getParsedKeys(val: any): string[] {
    if (!this.isObject(val)) return [];
    return Object.keys(val).filter(k => !this.hiddenIdFields.has(k) && !this.alwaysHiddenFields.has(k));
  }

  getTranslatedKey(key: string): string {
    return this.translateMap[key] || key;
  }

  getTranslatedEntity(entity: string): string {
    return this.entityMap[entity] || entity;
  }

  getEntityDisplayName(log: AuditLogDto): string {
    const values = log.new_values || log.old_values;
    if (!values) return `#${log.entity_id}`;

    // Potencjalne klucze przechowujące nazwę
    const nameKeys = ['name', 'short_name', 'email', 'title', 'room_number', 'description', 'activity_name'];
    for (const key of nameKeys) {
      if (values[key]) {
        let val = values[key];
        // Obcinaj jeśli za długa
        if (typeof val === 'string' && val.length > 30) {
          val = val.substring(0, 30) + '...';
        }
        return `#${log.entity_id} (${val})`;
      }
    }

    return `#${log.entity_id}`;
  }

  getDisplayValue(val: any): string {
    if (val === null || val === undefined) return '—';
    if (typeof val === 'boolean') return val ? 'Tak' : 'Nie';
    if (Array.isArray(val)) return val.length > 0 ? val.join(', ') : '—';
    if (typeof val === 'object') return JSON.stringify(val);

    const enumMap: Record<string, string> = {
      // Statusy notatek o niedostępności
      pending: 'Oczekuje na rozpatrzenie',
      accepted: 'Zaakceptowana',
      rejected: 'Odrzucona',
      acknowledged: 'Zapoznano się',
      // Typy notatek
      request: 'Wniosek (prośba o wolne)',
      forced: 'Przymusowa nieobecność',
      // Statusy dezyderat
      approved: 'Zatwierdzona',
      submitted: 'Złożona',
      draft: 'Szkic',
      // Dostępność
      available: 'Dostępny',
      unavailable: 'Niedostępny',
      // Dni tygodnia (jeśli przechowywane jako string)
      monday: 'Poniedziałek',
      tuesday: 'Wtorek',
      wednesday: 'Środa',
      thursday: 'Czwartek',
      friday: 'Piątek',
      saturday: 'Sobota',
      sunday: 'Niedziela',
    };

    if (typeof val === 'string' && enumMap[val]) return enumMap[val];
    return String(val);
  }
}
