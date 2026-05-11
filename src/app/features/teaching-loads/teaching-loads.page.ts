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
  FieldOfStudyOption,
} from '../../core/services/teaching-loads-api.service';
import { ActivityOption, SubjectDto } from '../../core/services/subjects-api.service';
import { SubjectPreferencesApiService, SubjectPreferenceResponse } from '../../core/services/subject-preferences-api.service';
import { DezyderataService, Semestr } from '../../core/services/dezyderata.service';

type TeachingLoadFilterState = {
  teacher_id?: number | null;
  subject_id?: number | null;
  activity_id?: number | null;
  semester_id?: number | null;
  field_of_study_id?: number | null;
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
  private subjectGroups: Map<string, SubjectDto[]> = new Map();
  activities: ActivityOption[] = [];
  semesters: Semestr[] = [];
  fieldOfStudies: FieldOfStudyOption[] = [];
  
  // Subject preferences for filtering
  teacherPreferences: Map<number, Set<number>> = new Map();
  selectedTeacherPreferredSubjectIds: Set<number> = new Set();

  filters: TeachingLoadFilterState = {
    teacher_id: null,
    subject_id: null,
    activity_id: null,
    semester_id: null,
    field_of_study_id: null,
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
    private readonly subjectPreferencesApi: SubjectPreferencesApiService,
  ) {
    addIcons({ alertCircleOutline, checkmarkCircle, closeCircle, timeOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin' && this.auth.role !== 'rapla_editor') {
      this.router.navigateByUrl('/home');
      return;
    }
  }

  ionViewWillEnter(): void {
    if (this.auth.role !== 'admin' && this.auth.role !== 'rapla_editor') {
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
      field_of_study_id: null,
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
    const fieldOfStudyId = this.toNumber(this.filters.field_of_study_id);
    const hoursMin = this.toNumber(this.filters.hours_min);
    const hoursMax = this.toNumber(this.filters.hours_max);
    const query = this.normalizeSearch(this.searchQuery);

    const filtered = this.assignments.filter((item) => {
      if (teacherId !== null && item.teacher_id !== teacherId) {
        return false;
      }
      if (subjectId !== null) {
        const allowed = this.getSubjectEntriesById(subjectId).map((s) => s.id);
        if (!allowed.includes(item.subject_id)) {
          return false;
        }
      }
      if (activityId !== null && item.activity_id !== activityId) {
        return false;
      }
      if (semesterId !== null && item.semester_id !== semesterId) {
        return false;
      }
      if (fieldOfStudyId !== null && item.field_of_study_id !== fieldOfStudyId) {
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

    filtered.sort((a, b) => {
      const subjectA = this.normalizeSearch(this.getSubjectLabel(a));
      const subjectB = this.normalizeSearch(this.getSubjectLabel(b));
      if (subjectA < subjectB) return -1;
      if (subjectA > subjectB) return 1;

      const activityA = this.normalizeSearch(this.getActivityLabel(a));
      const activityB = this.normalizeSearch(this.getActivityLabel(b));
      if (activityA < activityB) return -1;
      if (activityA > activityB) return 1;

      return 0;
    });

    this.filteredAssignments = filtered;
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
          const enriched = this.enrichAssignment(created);
          this.assignments = [enriched, ...this.assignments];
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
    const editableRow = {
      ...row,
      subject_id: this.getRepresentativeSubjectId(row.subject_id) ?? row.subject_id,
    };
    this.originalRow = { ...editableRow };
    this.draftRow = { ...editableRow };
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
          const enriched = this.enrichAssignment(updated);
          this.assignments = this.replaceById(this.assignments, enriched, (item) => item.id);
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

  getFieldOfStudyOptionLabel(fieldOfStudy: FieldOfStudyOption): string {
    return fieldOfStudy.label ?? `${fieldOfStudy.name} / ${fieldOfStudy.abbreviation} / ${fieldOfStudy.year}`;
  }

  getFieldOfStudyLabel(row: TeachingLoadAssignmentDto): string {
    if (row.field_of_study_label) {
      return row.field_of_study_label;
    }
    if (!row.field_of_study_id) {
      return '-';
    }
    const fallback = this.fieldOfStudies.find((item) => item.id === row.field_of_study_id);
    return fallback ? this.getFieldOfStudyOptionLabel(fallback) : `#${row.field_of_study_id}`;
  }

  getTeacherOptionLabel(teacher: TeacherOption): string {
    return [teacher.title || teacher.titles[0], `${teacher.first_name} ${teacher.last_name}`.trim()]
      .filter(Boolean)
      .join(' ');
  }

  getActivityOptionsForSubject(subjectId: number | null | undefined): ActivityOption[] {
    if (!subjectId) {
      return this.activities;
    }

    const entries = this.getSubjectEntriesById(subjectId);
    const activityIds = Array.from(new Set(entries.map((e) => Number(e.activity_id)).filter(Boolean)));
    if (!activityIds.length) {
      return this.activities;
    }

    return this.activities.filter((a) => activityIds.includes(a.id));
  }

  onNewSubjectChange(): void {
    const draft = this.newRowDraft;
    if (!draft) {
      return;
    }
    const options = this.getActivityOptionsForSubject(draft.subject_id);
    if (options.length && !options.some((o) => o.id === draft.activity_id)) {
      draft.activity_id = options[0].id;
    }
  }

  onNewActivityChange(): void {
    const draft = this.newRowDraft;
    if (!draft) {
      return;
    }
  }

  onEditSubjectChange(): void {
    const draft = this.draftRow;
    if (!draft) {
      return;
    }
    const options = this.getActivityOptionsForSubject(draft.subject_id);
    if (options.length && !options.some((o) => o.id === draft.activity_id)) {
      draft.activity_id = options[0].id;
    }
  }

  onEditActivityChange(): void {
    const draft = this.draftRow;
    if (!draft) {
      return;
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

  private buildSubjectGroups(): void {
    this.subjectGroups = new Map();
    for (const s of this.subjects) {
      const name = s.name ?? `#${s.id}`;
      const list = this.subjectGroups.get(name) ?? [];
      list.push(s);
      this.subjectGroups.set(name, list);
    }
  }

  getSubjectOptions(): { id: number; name: string; entries: SubjectDto[] }[] {
    const out: { id: number; name: string; entries: SubjectDto[] }[] = [];
    for (const [name, entries] of this.subjectGroups.entries()) {
      out.push({ id: entries[0].id, name, entries });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }

  private getSubjectEntriesById(subjectId: number | null | undefined): SubjectDto[] {
    if (!subjectId) return [];
    const subject = this.subjects.find((s) => s.id === subjectId);
    if (!subject) return [];
    const name = subject.name ?? `#${subject.id}`;
    return this.subjectGroups.get(name) ?? [subject];
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
      fieldOfStudies: this.teachingLoadsApi.getFieldOfStudies(),
      semesters: this.dezyderataService.getSemestry(),
      audit: this.auditApi.getLogs().pipe(
        catchError(() => of({ last_changes_viewed_at: null, logs: [] })),
      ),
    })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: ({ assignments, teachers, subjects, activities, fieldOfStudies, semesters, audit }) => {
          this.assignments = assignments;
          this.teachers = teachers;
          this.subjects = subjects;
          this.buildSubjectGroups();
          this.activities = activities;
          this.fieldOfStudies = fieldOfStudies;
          this.semesters = semesters.items ?? [];
          // Prefill resolved labels so sorting is stable on first render
          this.assignments = this.assignments.map((a) => ({
            ...a,
            subject_name: this.getSubjectLabel(a),
            activity_name: this.getActivityLabel(a),
            field_of_study_label: this.getFieldOfStudyLabel(a),
          }));
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

    // Resolve subject ids taking activity into account so switching between
    // subject variants (same name, different activity) is detected.
    const resolvedOriginalSubject = this.resolveSubjectIdForActivity(
      normalizedOriginal.subject_id,
      normalizedOriginal.activity_id,
    );
    const resolvedDraftSubject = this.resolveSubjectIdForActivity(
      normalizedDraft.subject_id,
      normalizedDraft.activity_id,
    );

    const payload: TeachingLoadAssignmentPatchPayload = {};

    if (normalizedDraft.teacher_id !== normalizedOriginal.teacher_id) {
      payload.teacher_id = normalizedDraft.teacher_id;
    }
    if (resolvedDraftSubject !== resolvedOriginalSubject) {
      payload.subject_id = Number(resolvedDraftSubject ?? normalizedDraft.subject_id);
    }
    if (normalizedDraft.activity_id !== normalizedOriginal.activity_id) {
      payload.activity_id = normalizedDraft.activity_id;
    }
    if (normalizedDraft.semester_id !== normalizedOriginal.semester_id) {
      payload.semester_id = normalizedDraft.semester_id;
    }
    if (normalizedDraft.field_of_study_id !== normalizedOriginal.field_of_study_id) {
      payload.field_of_study_id = normalizedDraft.field_of_study_id;
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
    if (payload.field_of_study_id != null && payload.field_of_study_id <= 0) {
      return 'Wybierz poprawny rocznik.';
    }
    if (payload.hours !== undefined && (!Number.isFinite(payload.hours) || payload.hours <= 0)) {
      return 'Podaj poprawną liczbę godzin.';
    }

    return null;
  }

  private buildCreatePayload(draft: TeachingLoadAssignmentDto): TeachingLoadAssignmentCreatePayload {
    const subjectId = this.resolveSubjectIdForActivity(draft.subject_id, draft.activity_id);
    return {
      teacher_id: Number(draft.teacher_id),
      subject_id: Number(subjectId ?? draft.subject_id),
      activity_id: Number(draft.activity_id),
      semester_id: Number(draft.semester_id),
      field_of_study_id: Number(draft.field_of_study_id),
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
    if (!payload.field_of_study_id || payload.field_of_study_id <= 0) {
      return 'Wybierz poprawny rocznik.';
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
      subject_id: Number(this.getRepresentativeSubjectId(row.subject_id) ?? row.subject_id),
      activity_id: Number(row.activity_id),
      semester_id: Number(row.semester_id),
      field_of_study_id: row.field_of_study_id ? Number(row.field_of_study_id) : null,
      hours: Number(row.hours),
    };
  }

  private getRepresentativeSubjectId(subjectId: number | null | undefined): number | null {
    if (!subjectId) {
      return null;
    }

    const subject = this.subjects.find((item) => item.id === subjectId);
    if (!subject) {
      return subjectId;
    }

    const groupName = subject.name ?? `#${subject.id}`;
    const candidates = this.subjectGroups.get(groupName) ?? [subject];
    return candidates[0]?.id ?? subjectId;
  }

  private resolveSubjectIdForActivity(
    subjectId: number | null | undefined,
    activityId: number | null | undefined,
  ): number | null {
    const representativeSubjectId = this.getRepresentativeSubjectId(subjectId);
    if (!representativeSubjectId || !activityId) {
      return representativeSubjectId;
    }

    const subject = this.subjects.find((item) => item.id === representativeSubjectId);
    if (!subject) {
      return representativeSubjectId;
    }

    const groupName = subject.name ?? `#${subject.id}`;
    const candidates = this.subjectGroups.get(groupName) ?? [subject];
    const exact = candidates.find((item) => Number(item.activity_id) === Number(activityId));
    return exact?.id ?? representativeSubjectId;
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
      group_id: 'Grupa (legacy)',
      field_of_study_id: 'Rocznik',
      field_of_study_label: 'Rocznik',
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
      const errBody = error.error ?? {};
      const detail = errBody.detail ?? errBody.message ?? (errBody.detail?.message ?? null);
      if (typeof detail === 'string' && detail.trim()) {
        return detail;
      }
    }

    return fallback;
  }

  private ensureDictionariesReady(): boolean {
    if (
      !this.teachers.length ||
      !this.subjects.length ||
      !this.activities.length ||
      !this.semesters.length ||
      !this.fieldOfStudies.length
    ) {
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
      field_of_study_id: this.fieldOfStudies[0]?.id ?? 0,
      field_of_study_label: this.fieldOfStudies[0]?.label ?? null,
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
      this.getFieldOfStudyLabel(item),
      String(item.hours),
    ];
    return this.normalizeSearch(parts.join(' '));
  }

  private enrichAssignment(a: TeachingLoadAssignmentDto): TeachingLoadAssignmentDto {
    return {
      ...a,
      subject_name: this.getSubjectLabel(a),
      activity_name: this.getActivityLabel(a),
      field_of_study_label: this.getFieldOfStudyLabel(a),
    };
  }

  onNewTeacherChange(): void {
    const draft = this.newRowDraft;
    if (!draft) {
      return;
    }

    const teacherId = draft.teacher_id;
    if (!teacherId || teacherId <= 0) {
      this.selectedTeacherPreferredSubjectIds.clear();
      return;
    }

    this.loadTeacherPreferences(teacherId);
  }

  onEditTeacherChange(): void {
    const draft = this.draftRow;
    if (!draft) {
      return;
    }

    const teacherId = draft.teacher_id;
    if (!teacherId || teacherId <= 0) {
      this.selectedTeacherPreferredSubjectIds.clear();
      return;
    }

    this.loadTeacherPreferences(teacherId);
  }

  private loadTeacherPreferences(teacherId: number): void {
    if (this.teacherPreferences.has(teacherId)) {
      this.selectedTeacherPreferredSubjectIds = new Set(this.teacherPreferences.get(teacherId)!);
      return;
    }

    this.subjectPreferencesApi.getPreferencesForUser(teacherId).subscribe({
      next: (preferences: SubjectPreferenceResponse[]) => {
        const subjectIds = new Set(preferences.map((p) => p.subject_id));
        this.teacherPreferences.set(teacherId, subjectIds);
        this.selectedTeacherPreferredSubjectIds = subjectIds;
      },
      error: (error) => {
        console.error(`Failed to load preferences for teacher ${teacherId}:`, error);
        this.selectedTeacherPreferredSubjectIds.clear();
      },
    });
  }

  getPreferredSubjectOptions(teacherId: number | null | undefined): { id: number; name: string; entries: SubjectDto[] }[] {
    if (!teacherId || teacherId <= 0 || this.selectedTeacherPreferredSubjectIds.size === 0) {
      return this.getSubjectOptions();
    }

    // Filter subjects to only those in teacher's preferences
    const all = this.getSubjectOptions();
    return all.filter((option) => this.selectedTeacherPreferredSubjectIds.has(option.id));
  }

  isTeacherSelected(teacherId: number | null | undefined): boolean {
    return teacherId != null && teacherId > 0;
  }
}
