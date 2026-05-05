import { Component, OnInit } from '@angular/core';
import { ViewWillEnter } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonMenuButton, IonButton, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonBadge, IonIcon } from '@ionic/angular/standalone';
import { AuditApiService, AuditLogDto } from '../../../core/services/audit-api.service';
import { addIcons } from 'ionicons';
import { checkmarkDone } from 'ionicons/icons';

@Component({
  selector: 'app-audit-logs',
  templateUrl: './audit-logs.page.html',
  styleUrls: ['./audit-logs.page.scss'],
  standalone: true,
  imports: [
    CommonModule, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonMenuButton, IonButton,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonItem, IonLabel, IonBadge, IonIcon
  ]
})
export class AuditLogsPage implements OnInit, ViewWillEnter {
  logs: AuditLogDto[] = [];
  lastViewedAt: string | null = null;
  hasNew: boolean = false;

  readonly entityMap: Record<string, string> = {
    'Subject': 'Przedmiot',
    'Room': 'Sala',
    'UnavailabilityNote': 'Notatka o niedostępności',
    'User': 'Użytkownik',
    'Activity': 'Aktywność',
    'Dezyderata': 'Dezyderata',
    'Role': 'Rola',
    'Department': 'Wydział',
    'Title': 'Tytuł'
  };

  readonly translateMap: Record<string, string> = {
    id: 'ID',
    name: 'Nazwa',
    type_id: 'ID Typu',
    activity_id: 'ID Aktywności',
    activity_name: 'Nazwa Aktywności',
    type_display: 'Skrót typu',
    room_properties: 'Wymagania sali',
    blocked: 'Zablokowane',
    periodic: 'Cykliczne',
    first_name: 'Imię',
    last_name: 'Nazwisko',
    email: 'Email',
    role: 'Rola',
    start_date: 'Data od',
    end_date: 'Data do',
    description: 'Opis',
    status: 'Status',
    note_type: 'Typ notatki',
    short_name: 'Nazwa skrócona',
    capacity: 'Pojemność',
    building: 'Budynek',
    room_type: 'Typ sali',
    room_type_id: 'ID Typu sali',
    properties: 'Właściwości',
    abbreviation: 'Skrót',
    semester: 'Semestr',
    amount: 'Ilość',
    color: 'Kolor',
    is_active: 'Aktywny',
    created_at: 'Utworzono',
    updated_at: 'Zaktualizowano',
    user_id: 'ID Użytkownika',
    department_id: 'ID Wydziału',
    title_id: 'ID Tytułu',
    password: 'Hasło (zakodowane)',
    password_hash: 'Hasło (zakodowane)',
    room_number: 'Numer sali',
    seats_count: 'Liczba miejsc',
    special_equipment: 'Sprzęt specjalny (ID)',
    activities: 'Aktywności (ID)',
    departments: 'Wydziały (ID)',
    special_equipment_names: 'Sprzęt specjalny',
    activity_names: 'Aktywności',
    department_names: 'Wydziały',
    title: 'Tytuł'
  };

  constructor(private auditApi: AuditApiService) {
    addIcons({ checkmarkDone });
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
      
      const lastViewTime = this.lastViewedAt ? new Date(this.lastViewedAt).getTime() : 0;
      
      for (const log of this.logs) {
        if (new Date(log.timestamp).getTime() > lastViewTime) {
          log.isNew = true;
          this.hasNew = true;
        } else {
          log.isNew = false;
        }
      }
    });
  }

  acknowledgeChanges() {
    this.auditApi.acknowledgeChanges().subscribe(() => {
      this.loadLogs();
    });
  }

  isObject(val: any): boolean {
    return val !== null && typeof val === 'object' && !Array.isArray(val);
  }

  getParsedKeys(val: any): string[] {
    if (!this.isObject(val)) return [];
    return Object.keys(val);
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
    if (val === null || val === undefined) return 'Brak';
    if (typeof val === 'boolean') {
      return val ? 'Tak' : 'Nie';
    }
    if (typeof val === 'object') {
      if (Array.isArray(val)) {
        return val.length > 0 ? val.join(', ') : 'Brak danych';
      }
      return JSON.stringify(val);
    }
    // Specjalne mapowanie dla statusów dezyderat
    if (val === 'pending') return 'Oczekujące';
    if (val === 'accepted') return 'Zaakceptowane';
    if (val === 'rejected') return 'Odrzucone';
    if (val === 'acknowledged') return 'Zapoznano się';
    if (val === 'request') return 'Wniosek';
    if (val === 'forced') return 'Przymus';
    
    return String(val);
  }
}
