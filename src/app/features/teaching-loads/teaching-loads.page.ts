import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircle, closeCircle, timeOutline } from 'ionicons/icons';
import { catchError, finalize, forkJoin, of } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { AuditApiService, AuditLogDto } from '../../core/services/audit-api.service';
import {
  TeachingLoadsApiService,
  TeachingLoadAssignmentDto,
  TeachingLoadAssignmentCreatePayload,
  TeachingLoadAssignmentPatchPayload,
  TeacherOption,
} from '../../core/services/teaching-loads-api.service';
import { ActivityOption, SubjectDto } from '../../core/services/subjects-api.service';
import { DezyderataService, Semestr } from '../../core/services/dezyderata.service';

type TeachingLoadFilterState = {
  teacher_id?: number | null;
  subject_id?: number | null;
  activity_id?: number | null;
  semester_id?: number | null;
  hours_min?: number | null;
  hours_max?: number | null;
};

@Component({
  selector: 'app-teaching-loads',
  templateUrl: './teaching-loads.page.html',
  styleUrls: ['./teaching-loads.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class TeachingLoadsPage implements OnInit {
  isLoading = false;
  isSaving = false;
  errorMessage = '';
  rowErrorMessage = '';
  historyErrorMessage = '';
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  assignments: TeachingLoadAssignmentDto[] = [];
  filteredAssignments: TeachingLoadAssignmentDto[] = [];
  teachers: TeacherOption[] = [];
  subjects: SubjectDto[] = [];
  activities: ActivityOption[] = [];
  semesters: Semestr[] = [];

  filters: TeachingLoadFilterState = {
    teacher_id: null,
    subject_id: null,
    activity_id: null,
    semester_id: null,
    hours_min: null,
    hours_max: null,
  };
  searchQuery = '';

  editingRowId: number | null = null;
  draftRow: TeachingLoadAssignmentDto | null = null;
  originalRow: TeachingLoadAssignmentDto | null = null;
  isCreating = false;
  newRowDraft: TeachingLoadAssignmentDto | null = null;

  historyOpenRowId: number | null = null;
  historyByAssignment: Record<number, AuditLogDto[]> = {};
  newHistoryIds = new Set<number>();
  lastViewedAt: string | null = null;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly teachingLoadsApi: TeachingLoadsApiService,
    private readonly dezyderataService: DezyderataService,
    private readonly auditApi: AuditApiService,
  ) {
    addIcons({ alertCircleOutline, checkmarkCircle, closeCircle, timeOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }
  }

  ionViewWillEnter(): void {
    if (this.auth.role !== 'admin') {
      return;
    }

    this.loadData();
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
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

  reload(): void {
    this.loadData();
  }

  clearFilters(): void {
    this.filters = {
      teacher_id: null,
      subject_id: null,
      activity_id: null,
      semester_id: null,
      hours_min: null,
      hours_max: null,
    };
    this.searchQuery = '';
    this.applyFilters();
  }

  applyFilters(): void {
    const teacherId = this.toNumber(this.filters.teacher_id);
    const subjectId = this.toNumber(this.filters.subject_id);
    const activityId = this.toNumber(this.filters.activity_id);
    const semesterId = this.toNumber(this.filters.semester_id);
    const hoursMin = this.toNumber(this.filters.hours_min);
    const hoursMax = this.toNumber(this.filters.hours_max);
    const query = this.normalizeSearch(this.searchQuery);

    this.filteredAssignments = this.assignments.filter((item) => {
      if (teacherId !== null && item.teacher_id !== teacherId) {
        return false;
      }
      if (subjectId !== null && item.subject_id !== subjectId) {
        return false;
      }
      if (activityId !== null && item.activity_id !== activityId) {
        return false;
      }
      if (semesterId !== null && item.semester_id !== semesterId) {
        return false;
      }
      if (hoursMin !== null && item.hours < hoursMin) {
        return false;
      }
      if (hoursMax !== null && item.hours > hoursMax) {
        return false;
      }
      if (query && !this.buildRowSearchText(item).includes(query)) {
        return false;
      }
      return true;
    });
  }

  startCreating(): void {
    if (this.isSaving) {
      return;
    }

    if (!this.ensureDictionariesReady()) {
      return;
    }

    if (this.editingRowId !== null) {
      this.cancelEditing();
    }

    this.isCreating = true;
    this.newRowDraft = this.buildDefaultRow();
    this.rowErrorMessage = '';
  }

  cancelCreating(): void {
    this.isCreating = false;
    this.newRowDraft = null;
    this.rowErrorMessage = '';
  }

  saveCreating(): void {
    if (!this.newRowDraft) {
      return;
    }

    const payload = this.buildCreatePayload(this.newRowDraft);
    const validationError = this.validateCreatePayload(payload);
    if (validationError) {
      this.rowErrorMessage = validationError;
      return;
    }

    this.isSaving = true;
    this.rowErrorMessage = '';

    this.teachingLoadsApi
      .createTeachingLoad(payload)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (created) => {
          this.assignments = [created, ...this.assignments];
          this.applyFilters();
          this.cancelCreating();
          this.refreshAuditIndex();
        },
        error: (error) => {
          this.rowErrorMessage = this.mapRowError(error, 'Nie udało się dodać przydziału.');
        },
      });
  }

  startEditing(row: TeachingLoadAssignmentDto, event?: Event): void {
    event?.stopPropagation();
    if (this.isSaving) {
      return;
    }

    if (this.isCreating) {
      this.rowErrorMessage = 'Najpierw zakończ dodawanie nowego przydziału.';
      return;
    }

    if (this.editingRowId === row.id) {
      return;
    }

    this.editingRowId = row.id;
    this.originalRow = { ...row };
    this.draftRow = { ...row };
    this.rowErrorMessage = '';
  }

  cancelEditing(): void {
    this.editingRowId = null;
    this.draftRow = null;
    this.originalRow = null;
    this.rowErrorMessage = '';
  }

  saveEditing(): void {
    if (!this.draftRow || !this.originalRow || this.editingRowId === null) {
      return;
    }

    const payload = this.buildPatchPayload(this.originalRow, this.draftRow);
    if (!payload) {
      this.cancelEditing();
      return;
    }

    const validationError = this.validatePayload(payload);
    if (validationError) {
      this.rowErrorMessage = validationError;
      return;
    }

    this.isSaving = true;
    this.rowErrorMessage = '';

    this.teachingLoadsApi
      .patchTeachingLoad(this.editingRowId, payload)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (updated) => {
          this.assignments = this.replaceById(this.assignments, updated, (item) => item.id);
          this.applyFilters();
          this.cancelEditing();
          this.refreshAuditIndex();
        },
        error: (error) => {
          this.rowErrorMessage = this.mapRowError(error, 'Nie udało się zapisać zmian.');
        },
      });
  }

  toggleHistory(row: TeachingLoadAssignmentDto, event?: Event): void {
    event?.stopPropagation();
    if (this.historyOpenRowId === row.id) {
      this.historyOpenRowId = null;
      return;
    }

    this.historyOpenRowId = row.id;
  }

  getHistoryCount(rowId: number): number {
    return this.historyByAssignment[rowId]?.length ?? 0;
  }

  isHistoryNew(rowId: number): boolean {
    return this.newHistoryIds.has(rowId);
  }

  getHistoryForRow(rowId: number): AuditLogDto[] {
    return this.historyByAssignment[rowId] ?? [];
  }

  getTeacherLabel(row: TeachingLoadAssignmentDto): string {
    if (row.teacher_first_name || row.teacher_last_name) {
      const name = `${row.teacher_first_name ?? ''} ${row.teacher_last_name ?? ''}`.trim();
      return [row.teacher_title, name].filter(Boolean).join(' ');
    }

    const fallback = this.teachers.find((teacher) => teacher.user_id === row.teacher_id);
    if (!fallback) {
      return `#${row.teacher_id}`;
    }
    return [fallback.title || fallback.titles[0], `${fallback.first_name} ${fallback.last_name}`.trim()]
      .filter(Boolean)
      .join(' ');
  }

  getSubjectLabel(row: TeachingLoadAssignmentDto): string {
    if (row.subject_name) {
      return row.subject_name;
    }

    const fallback = this.subjects.find((subject) => subject.id === row.subject_id);
    return fallback?.name ?? `#${row.subject_id}`;
  }

  getActivityLabel(row: TeachingLoadAssignmentDto): string {
    if (row.activity_name) {
      return row.activity_name;
    }

    const fallback = this.activities.find((activity) => activity.id === row.activity_id);
    return fallback?.name ?? `#${row.activity_id}`;
  }

  getSemesterLabel(row: TeachingLoadAssignmentDto): string {
    if (row.semester_name) {
      return row.semester_name;
    }

    const fallback = this.semesters.find((semester) => semester.id === row.semester_id);
    return fallback?.nazwa ?? `#${row.semester_id}`;
  }

  getTeacherOptionLabel(teacher: TeacherOption): string {
    return [teacher.title || teacher.titles[0], `${teacher.first_name} ${teacher.last_name}`.trim()]
      .filter(Boolean)
      .join(' ');
  }

  getActivityOptionsForSubject(subjectId: number | null | undefined): ActivityOption[] {
    const resolvedId = this.resolveSubjectActivityId(subjectId);
    if (!resolvedId) {
      return this.activities;
    }

    const match = this.activities.find((activity) => activity.id === resolvedId);
    return match ? [match] : this.activities;
  }

  onNewSubjectChange(): void {
    if (!this.newRowDraft) {
      return;
    }

    const resolvedId = this.resolveSubjectActivityId(this.newRowDraft.subject_id);
    if (resolvedId) {
      this.newRowDraft.activity_id = resolvedId;
    }
  }

  onEditSubjectChange(): void {
    if (!this.draftRow) {
      return;
    }

    const resolvedId = this.resolveSubjectActivityId(this.draftRow.subject_id);
    if (resolvedId) {
      this.draftRow.activity_id = resolvedId;
    }
  }

  getHistorySummary(log: AuditLogDto): string {
    if (!log.old_values || !log.new_values || log.action !== 'UPDATE') {
      return 'Brak szczegółów zmian.';
    }

    const changedKeys = Object.keys(log.new_values).filter(
      (key) => log.old_values?.[key] !== log.new_values?.[key],
    );

    if (changedKeys.length === 0) {
      return 'Brak szczegółów zmian.';
    }

    const previewKeys = changedKeys.slice(0, 3);
    const preview = previewKeys
      .map((key) => `${this.translateAuditKey(key)}: ${this.formatAuditValue(log.old_values?.[key])} -> ${this.formatAuditValue(log.new_values?.[key])}`)
      .join(' | ');

    if (changedKeys.length > previewKeys.length) {
      return `${preview} | +${changedKeys.length - previewKeys.length}`;
    }

    return preview;
  }

  getActionLabel(action: string): string {
    if (action === 'CREATE') {
      return 'Utworzono';
    }
    if (action === 'UPDATE') {
      return 'Zaktualizowano';
    }
    if (action === 'DELETE') {
      return 'Usunięto';
    }
    return action;
  }

  trackByAssignmentId(_: number, item: TeachingLoadAssignmentDto): number {
    return item.id;
  }

  private loadData(): void {
    this.isLoading = true;
    this.errorMessage = '';
    this.rowErrorMessage = '';
    this.historyErrorMessage = '';
    this.editingRowId = null;
    this.draftRow = null;
    this.originalRow = null;
    this.historyOpenRowId = null;
    this.isCreating = false;
    this.newRowDraft = null;

    forkJoin({
      assignments: this.teachingLoadsApi.getTeachingLoads(),
      teachers: this.teachingLoadsApi.getTeachers(),
      subjects: this.teachingLoadsApi.getSubjects(),
      activities: this.teachingLoadsApi.getActivities(),
      semesters: this.dezyderataService.getSemestry(),
      audit: this.auditApi.getLogs().pipe(
        catchError(() => of({ last_changes_viewed_at: null, logs: [] })),
      ),
    })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: ({ assignments, teachers, subjects, activities, semesters, audit }) => {
          this.assignments = assignments;
          this.filteredAssignments = assignments;
          this.teachers = teachers;
          this.subjects = subjects;
          this.activities = activities;
          this.semesters = semesters.items ?? [];
          this.buildAuditIndex(audit.last_changes_viewed_at, audit.logs ?? []);
          this.applyFilters();
        },
        error: () => {
          this.errorMessage = 'Nie udało się pobrać danych przydziałów.';
        },
      });
  }

  private refreshAuditIndex(): void {
    this.auditApi.getLogs().subscribe({
      next: (audit) => {
        this.buildAuditIndex(audit.last_changes_viewed_at, audit.logs ?? []);
      },
      error: () => {
        this.historyErrorMessage = 'Nie udało się pobrać historii zmian.';
      },
    });
  }

  private buildAuditIndex(lastViewedAt: string | null, logs: AuditLogDto[]): void {
    this.lastViewedAt = lastViewedAt;
    this.historyByAssignment = {};
    this.newHistoryIds.clear();

    const viewedAtMs = lastViewedAt ? new Date(lastViewedAt).getTime() : 0;

    logs
      .filter((log) => log.entity_name === 'TeachingLoadAssignment')
      .forEach((log) => {
        const assignmentId = Number(log.entity_id);
        if (!this.historyByAssignment[assignmentId]) {
          this.historyByAssignment[assignmentId] = [];
        }
        this.historyByAssignment[assignmentId].push(log);

        if (new Date(log.timestamp).getTime() > viewedAtMs) {
          this.newHistoryIds.add(assignmentId);
        }
      });

    Object.values(this.historyByAssignment).forEach((items) =>
      items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    );
  }

  private buildPatchPayload(
    original: TeachingLoadAssignmentDto,
    draft: TeachingLoadAssignmentDto,
  ): TeachingLoadAssignmentPatchPayload | null {
    const normalizedOriginal = this.normalizeRow(original);
    const normalizedDraft = this.normalizeRow(draft);

    const payload: TeachingLoadAssignmentPatchPayload = {};

    if (normalizedDraft.teacher_id !== normalizedOriginal.teacher_id) {
      payload.teacher_id = normalizedDraft.teacher_id;
    }
    if (normalizedDraft.subject_id !== normalizedOriginal.subject_id) {
      payload.subject_id = normalizedDraft.subject_id;
    }
    if (normalizedDraft.activity_id !== normalizedOriginal.activity_id) {
      payload.activity_id = normalizedDraft.activity_id;
    }
    if (normalizedDraft.semester_id !== normalizedOriginal.semester_id) {
      payload.semester_id = normalizedDraft.semester_id;
    }
    if (normalizedDraft.hours !== normalizedOriginal.hours) {
      payload.hours = normalizedDraft.hours;
    }

    return Object.keys(payload).length > 0 ? payload : null;
  }

  private validatePayload(payload: TeachingLoadAssignmentPatchPayload): string | null {
    if (payload.teacher_id !== undefined && payload.teacher_id <= 0) {
      return 'Wybierz poprawnego dydaktyka.';
    }
    if (payload.subject_id !== undefined && payload.subject_id <= 0) {
      return 'Wybierz poprawny przedmiot.';
    }
    if (payload.activity_id !== undefined && payload.activity_id <= 0) {
      return 'Wybierz poprawny typ zajęć.';
    }
    if (payload.semester_id !== undefined && payload.semester_id <= 0) {
      return 'Wybierz poprawny semestr.';
    }
    if (payload.hours !== undefined && (!Number.isFinite(payload.hours) || payload.hours <= 0)) {
      return 'Podaj poprawną liczbę godzin.';
    }

    return null;
  }

  private buildCreatePayload(draft: TeachingLoadAssignmentDto): TeachingLoadAssignmentCreatePayload {
    return {
      teacher_id: Number(draft.teacher_id),
      subject_id: Number(draft.subject_id),
      activity_id: Number(draft.activity_id),
      semester_id: Number(draft.semester_id),
      hours: Number(draft.hours),
    };
  }

  private validateCreatePayload(payload: TeachingLoadAssignmentCreatePayload): string | null {
    if (!payload.teacher_id || payload.teacher_id <= 0) {
      return 'Wybierz poprawnego dydaktyka.';
    }
    if (!payload.subject_id || payload.subject_id <= 0) {
      return 'Wybierz poprawny przedmiot.';
    }
    if (!payload.activity_id || payload.activity_id <= 0) {
      return 'Wybierz poprawny typ zajęć.';
    }
    if (!payload.semester_id || payload.semester_id <= 0) {
      return 'Wybierz poprawny semestr.';
    }
    if (!Number.isFinite(payload.hours) || payload.hours <= 0) {
      return 'Podaj poprawną liczbę godzin.';
    }

    return null;
  }

  private normalizeRow(row: TeachingLoadAssignmentDto): TeachingLoadAssignmentDto {
    return {
      ...row,
      teacher_id: Number(row.teacher_id),
      subject_id: Number(row.subject_id),
      activity_id: Number(row.activity_id),
      semester_id: Number(row.semester_id),
      hours: Number(row.hours),
    };
  }

  private translateAuditKey(key: string): string {
    const map: Record<string, string> = {
      teacher_id: 'Dydaktyk',
      teacher_first_name: 'Imię',
      teacher_last_name: 'Nazwisko',
      teacher_title: 'Tytuł',
      subject_id: 'Przedmiot',
      subject_name: 'Przedmiot',
      activity_id: 'Typ zajęć',
      activity_name: 'Typ zajęć',
      semester_id: 'Semestr',
      semester_name: 'Semestr',
      hours: 'Godziny',
    };

    return map[key] || key;
  }

  private formatAuditValue(value: unknown): string {
    if (value === null || value === undefined) {
      return '-';
    }
    if (typeof value === 'boolean') {
      return value ? 'Tak' : 'Nie';
    }
    if (typeof value === 'number') {
      return Number.isFinite(value) ? String(value) : '-';
    }
    if (typeof value === 'string') {
      return value;
    }
    return JSON.stringify(value);
  }

  private toNumber(value: unknown): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private replaceById<T>(items: T[], updatedItem: T, getId: (item: T) => number): T[] {
    const updatedId = getId(updatedItem);
    return items.map((item) => (getId(item) === updatedId ? updatedItem : item));
  }

  private mapRowError(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const detail = error.error?.detail;
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
    }

    return fallback;
  }

  private ensureDictionariesReady(): boolean {
    if (!this.teachers.length || !this.subjects.length || !this.activities.length || !this.semesters.length) {
      this.rowErrorMessage = 'Brak słowników do dodania przydziału.';
      return false;
    }
    return true;
  }

  private buildDefaultRow(): TeachingLoadAssignmentDto {
    const teacher = this.teachers[0];
    const subject = this.subjects[0];
    const activityId = this.resolveSubjectActivityId(subject?.id ?? null);
    const activity = this.activities.find((item) => item.id === activityId) ?? this.activities[0];
    const semester = this.semesters[0];

    return {
      id: 0,
      teacher_id: teacher?.user_id ?? 0,
      teacher_title: teacher?.title || teacher?.titles?.[0] || null,
      teacher_first_name: teacher?.first_name ?? null,
      teacher_last_name: teacher?.last_name ?? null,
      subject_id: subject?.id ?? 0,
      subject_name: subject?.name ?? null,
      activity_id: activity?.id ?? 0,
      activity_name: activity?.name ?? null,
      semester_id: semester?.id ?? 0,
      semester_name: semester?.nazwa ?? null,
      hours: 1,
    };
  }

  private resolveSubjectActivityId(subjectId: number | null | undefined): number | null {
    if (!subjectId) {
      return null;
    }

    const subject = this.subjects.find((item) => item.id === subjectId);
    if (!subject || subject.activity_id === null || subject.activity_id === undefined) {
      return null;
    }

    return Number(subject.activity_id);
  }

  private normalizeSearch(value: string | null | undefined): string {
    const source = value ?? '';
    return source
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  private buildRowSearchText(item: TeachingLoadAssignmentDto): string {
    const parts = [
      this.getTeacherLabel(item),
      this.getSubjectLabel(item),
      this.getActivityLabel(item),
      this.getSemesterLabel(item),
      String(item.hours),
    ];
    return this.normalizeSearch(parts.join(' '));
  }
}
