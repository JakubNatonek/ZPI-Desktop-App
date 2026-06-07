import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircle, closeCircle, funnelOutline, pencilOutline, timeOutline } from 'ionicons/icons';
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
  GroupOption,
} from '../../core/services/teaching-loads-api.service';
import { ActivityOption, SubjectDto } from '../../core/services/subjects-api.service';
import { DezyderataService, Semestr } from '../../core/services/dezyderata.service';
import { RoomDto, RoomsApiService } from '../../core/services/rooms-api.service';

type TeachingLoadFilterState = {
  teacher_id?: number | null;
  subject_id?: number | null;
  activity_id?: number | null;
  room_id?: number | null;
  semester_id?: number | null;
  group_id?: number | null;
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
  rooms: RoomDto[] = [];
  groups: GroupOption[] = [];
  groupsForEdit: GroupOption[] = [];
  fieldsOfStudy: FieldOfStudyOption[] = [];

  filters: TeachingLoadFilterState = {
    teacher_id: null,
    subject_id: null,
    activity_id: null,
    room_id: null,
    semester_id: null,
    group_id: null,
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
  /** Frozen at page entry — used to determine highlights for the whole session */
  private sessionViewedAt: string | null = null;
  changedFieldGroupsByAssignment: Record<number, Set<string>> = {};
  historyModalRowId: number | null = null;
  historyModalFieldGroup: string | null = null;

  private readonly fieldGroupKeys: Record<string, string[]> = {
    teacher: ['teacher', 'teacher_id', 'teacher_first_name', 'teacher_last_name', 'teacher_title'],
    subject: ['subject_id', 'subject_name'],
    activity: ['activity_id', 'activity_name'],
    room: ['room_id', 'room_number'],
    semester: ['semester_id', 'semester_name'],
    hours: ['hours'],
    group: ['group_id', 'group_label'],
    field_of_study: ['field_of_study_id', 'field_of_study_label'],
  };

  constructor(
    public readonly auth: AuthService,
    private readonly router: Router,
    private readonly teachingLoadsApi: TeachingLoadsApiService,
    private readonly dezyderataService: DezyderataService,
    private readonly roomsApi: RoomsApiService,
    private readonly auditApi: AuditApiService,
  ) {
    addIcons({ alertCircleOutline, checkmarkCircle, closeCircle, funnelOutline, pencilOutline, timeOutline });
  }

  ngOnInit(): void {
    if (this.auth.role !== 'admin' && this.auth.role !== 'rapla_editor' && this.auth.role !== 'lecturer_rapla_editor') {
      this.router.navigateByUrl('/home');
      return;
    }
  }

  ionViewWillEnter(): void {
    if (this.auth.role !== 'admin' && this.auth.role !== 'rapla_editor' && this.auth.role !== 'lecturer_rapla_editor') {
      return;
    }

    this.loadData();
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

  reload(): void {
    this.loadData();
  }

  clearFilters(): void {
    this.filters = {
      teacher_id: null,
      subject_id: null,
      activity_id: null,
      room_id: null,
      semester_id: null,
      group_id: null,
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
    const roomId = this.toNumber(this.filters.room_id);
    const semesterId = this.toNumber(this.filters.semester_id);
    const groupId = this.toNumber(this.filters.group_id);
    const hoursMin = this.toNumber(this.filters.hours_min);
    const hoursMax = this.toNumber(this.filters.hours_max);
    const query = this.normalizeSearch(this.searchQuery);

    const filtered = this.assignments.filter((item) => {
      if (teacherId !== null && item.teacher_id !== teacherId) { return false; }
      if (subjectId !== null && item.subject_id !== subjectId) { return false; }
      if (activityId !== null && item.activity_id !== activityId) { return false; }
      if (roomId !== null && item.room_id !== roomId) { return false; }
      if (semesterId !== null && item.semester_id !== semesterId) { return false; }
      if (groupId !== null && item.group_id !== groupId) { return false; }
      if (hoursMin !== null && item.hours < hoursMin) { return false; }
      if (hoursMax !== null && item.hours > hoursMax) { return false; }
      if (query && !this.buildRowSearchText(item).includes(query)) { return false; }
      return true;
    });

    // wiersze ze zmianami od ostatniego logowania na górze
    this.filteredAssignments = [...filtered].sort((a, b) => {
      const aNew = this.newHistoryIds.has(a.id) ? 0 : 1;
      const bNew = this.newHistoryIds.has(b.id) ? 0 : 1;
      return aNew - bNew;
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

    if (this.draftRow.field_of_study_id) {
      this.teachingLoadsApi.getGroupsByFieldOfStudy(this.draftRow.field_of_study_id).subscribe({
        next: (groups) => {
          this.groupsForEdit = groups;
        },
        error: () => {
          this.groupsForEdit = [];
        }
      });
    } else {
      this.groupsForEdit = [];
    }
  }

  cancelEditing(): void {
    this.editingRowId = null;
    this.draftRow = null;
    this.originalRow = null;
    this.rowErrorMessage = '';
    this.groupsForEdit = [];
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

  isFieldChanged(rowId: number, fieldGroup: string): boolean {
    return this.changedFieldGroupsByAssignment[rowId]?.has(fieldGroup) ?? false;
  }

  onCellClick(row: TeachingLoadAssignmentDto, fieldGroup: string, event: Event): void {
    event.stopPropagation();
    if (this.editingRowId === row.id) {
      return;
    }
    this.historyModalRowId = row.id;
    this.historyModalFieldGroup = fieldGroup;
  }

  openHistoryModal(row: TeachingLoadAssignmentDto, event: Event): void {
    event.stopPropagation();
    this.historyModalRowId = row.id;
    this.historyModalFieldGroup = null;
  }

  closeHistoryModal(): void {
    this.historyModalRowId = null;
    this.historyModalFieldGroup = null;
  }

  startEditingFromModal(): void {
    const rowId = this.historyModalRowId;
    this.historyModalRowId = null;
    this.historyModalFieldGroup = null;
    if (rowId === null) {
      return;
    }
    const row = this.assignments.find((a) => a.id === rowId);
    if (row) {
      this.startEditing(row);
    }
  }

  getModalHistory(): AuditLogDto[] {
    if (this.historyModalRowId === null) {
      return [];
    }
    const logs = this.historyByAssignment[this.historyModalRowId] ?? [];

    if (!this.historyModalFieldGroup) {
      // Clock button — show full history, all changes
      return logs;
    }

    // Cell click — show all changes for this field group (full history)
    const relevantKeys = this.fieldGroupKeys[this.historyModalFieldGroup] ?? [];

    return logs.filter((log) => {
      // For UPDATE: only if a relevant key actually changed
      if (log.action === 'UPDATE') {
        return relevantKeys.some(
          (key) => (log.old_values?.[key] ?? null) !== (log.new_values?.[key] ?? null),
        );
      }
      // CREATE / DELETE: include them all
      return true;
    });
  }

  getModalFieldLabel(): string | null {
    if (!this.historyModalFieldGroup) {
      return null;
    }
    const map: Record<string, string> = {
      teacher: 'Dydaktyk',
      subject: 'Przedmiot',
      activity: 'Typ zajęć',
      room: 'Sala',
      semester: 'Semestr',
      hours: 'Godziny',
      group: 'Grupa',
      field_of_study: 'Kierunek',
    };
    return map[this.historyModalFieldGroup] ?? null;
  }

  clearModalFieldFilter(event: Event): void {
    event.stopPropagation();
    this.historyModalFieldGroup = null;
  }

  getModalRowLabel(): string {
    if (this.historyModalRowId === null) {
      return '';
    }
    const row =
      this.filteredAssignments.find((a) => a.id === this.historyModalRowId) ??
      this.assignments.find((a) => a.id === this.historyModalRowId);
    if (!row) {
      return '';
    }
    return `${this.getTeacherLabel(row)} – ${this.getSubjectLabel(row)}`;
  }

  getDiffFields(log: AuditLogDto): Array<{ label: string; oldVal: string; newVal: string }> {
    const oldVals = (log.old_values ?? null) as Record<string, unknown> | null;
    const newVals = (log.new_values ?? null) as Record<string, unknown> | null;
    if (log.action === 'CREATE') {
      return this.buildDiffRows(null, newVals);
    }
    if (log.action === 'DELETE') {
      return this.buildDiffRows(oldVals, null);
    }
    if (log.action === 'UPDATE') {
      return this.buildDiffRows(oldVals, newVals);
    }
    return [];
  }

  getDisplayedDiffFields(log: AuditLogDto): Array<{ label: string; oldVal: string; newVal: string }> {
    const all = this.getDiffFields(log);
    if (!this.historyModalFieldGroup || log.action !== 'UPDATE') {
      return all;
    }
    const relevantKeys = this.fieldGroupKeys[this.historyModalFieldGroup] ?? [];
    const relevantLabels = new Set(relevantKeys.map((k) => this.translateAuditKey(k)));
    const filtered = all.filter((f) => relevantLabels.has(f.label));
    return filtered.length > 0 ? filtered : all;
  }

  toggleHistory(row: TeachingLoadAssignmentDto, event?: Event): void {
    this.openHistoryModal(row, event ?? new Event('click'));
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

  private resolveRoomForRow(row: TeachingLoadAssignmentDto): RoomDto | null {
    if (typeof row.room_id === 'number') {
      return this.rooms.find((room) => room.id === row.room_id) ?? null;
    }
    if (row.room_number) {
      return this.rooms.find((room) => room.room_number === row.room_number) ?? null;
    }
    return null;
  }

  getRoomLabel(row: TeachingLoadAssignmentDto): string {
    const room = this.resolveRoomForRow(row);
    const number = row.room_number || room?.room_number || null;
    if (number) {
      return number;
    }
    if (typeof row.room_id === 'number') {
      return `#${row.room_id}`;
    }
    return '—';
  }

  getRoomDepartmentLabel(row: TeachingLoadAssignmentDto): string | null {
    const room = this.resolveRoomForRow(row);
    const departments = room?.department_names ?? [];
    return departments.length > 0 ? departments.join(', ') : null;
  }

  getRoomOptionLabel(room: RoomDto): string {
    return room.room_number || `#${room.id}`;
  }

  getGroupLabel(row: TeachingLoadAssignmentDto): string {
    if (row.group_label) {
      return row.group_label;
    }
    if (row.group_id) {
      const fallback = this.groups.find((g) => g.id === row.group_id);
      return fallback?.code ?? `#${row.group_id}`;
    }
    return '—';
  }

  getFieldOfStudyLabel(row: TeachingLoadAssignmentDto): string {
    if (row.field_of_study_label) {
      return row.field_of_study_label;
    }
    if (row.field_of_study_id) {
      const fallback = this.fieldsOfStudy.find((f) => f.id === row.field_of_study_id);
      return fallback?.label ?? `#${row.field_of_study_id}`;
    }
    return '—';
  }

  getGroupOptionLabel(group: GroupOption): string {
    return group.code || `#${group.id}`;
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
    // Reset frozen session baseline so it is re-captured from server on each page entry
    this.sessionViewedAt = null;

    forkJoin({
      assignments: this.teachingLoadsApi.getTeachingLoads(),
      teachers: this.teachingLoadsApi.getTeachers(),
      subjects: this.teachingLoadsApi.getSubjects(),
      activities: this.teachingLoadsApi.getActivities(),
      rooms: this.roomsApi.getRooms(),
      semesters: this.dezyderataService.getSemestry(),
      groups: this.teachingLoadsApi.getGroups().pipe(catchError(() => of([]))),
      fieldsOfStudy: this.teachingLoadsApi.getFieldOfStudies().pipe(catchError(() => of([]))),
      audit: this.auditApi.getLogs().pipe(
        catchError(() => of({ last_changes_viewed_at: null, logs: [] })),
      ),
    })
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: ({ assignments, teachers, subjects, activities, rooms, semesters, groups, fieldsOfStudy, audit }) => {
          this.assignments = assignments;
          this.filteredAssignments = assignments;
          this.teachers = teachers;
          this.subjects = subjects;
          this.activities = activities;
          this.rooms = rooms;
          this.semesters = semesters.items ?? [];
          this.groups = groups;
          this.fieldsOfStudy = fieldsOfStudy;
          this.buildAuditIndex(audit.last_changes_viewed_at, audit.logs ?? [], true);
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
        // Pass sessionViewedAt (frozen at login) so highlights are not reset mid-session
        this.buildAuditIndex(audit.last_changes_viewed_at, audit.logs ?? [], false);
      },
      error: () => {
        this.historyErrorMessage = 'Nie udało się pobrać historii zmian.';
      },
    });
  }

  private buildAuditIndex(lastViewedAt: string | null, logs: AuditLogDto[], freezeSession = false): void {
    this.lastViewedAt = lastViewedAt;
    // On first load freeze sessionViewedAt; on refresh keep the frozen value
    if (freezeSession || this.sessionViewedAt === null) {
      this.sessionViewedAt = lastViewedAt;
    }
    this.historyByAssignment = {};
    this.newHistoryIds.clear();
    this.changedFieldGroupsByAssignment = {};

    const viewedAtMs = this.sessionViewedAt ? new Date(this.sessionViewedAt).getTime() : 0;

    const fieldGroupMap: Record<string, string> = {
      teacher: 'teacher',
      teacher_id: 'teacher', teacher_first_name: 'teacher',
      teacher_last_name: 'teacher', teacher_title: 'teacher',
      subject_id: 'subject', subject_name: 'subject',
      activity_id: 'activity', activity_name: 'activity',
      room_id: 'room', room_number: 'room',
      semester_id: 'semester', semester_name: 'semester',
      hours: 'hours',
      group_id: 'group', group_label: 'group',
      field_of_study_id: 'field_of_study', field_of_study_label: 'field_of_study',
    };

    logs
      .filter((log) => log.entity_name === 'TeachingLoadAssignment')
      .forEach((log) => {
        // Normalize action to uppercase so all comparisons work regardless of backend casing
        log.action = log.action.toUpperCase();

        const assignmentId = Number(log.entity_id);
        if (!this.historyByAssignment[assignmentId]) {
          this.historyByAssignment[assignmentId] = [];
        }
        this.historyByAssignment[assignmentId].push(log);

        if (new Date(log.timestamp).getTime() > viewedAtMs) {
          this.newHistoryIds.add(assignmentId);

          if (!this.changedFieldGroupsByAssignment[assignmentId]) {
            this.changedFieldGroupsByAssignment[assignmentId] = new Set();
          }

          if (log.action === 'UPDATE' && log.new_values) {
            Object.keys(log.new_values).forEach((key) => {
              if ((log.old_values?.[key] ?? null) !== (log.new_values?.[key] ?? null)) {
                const group = fieldGroupMap[key];
                if (group) {
                  this.changedFieldGroupsByAssignment[assignmentId].add(group);
                }
              }
            });
          } else if (log.action === 'CREATE' || log.action === 'DELETE') {
            ['teacher', 'subject', 'activity', 'room', 'hours', 'semester', 'group', 'field_of_study'].forEach((g) =>
              this.changedFieldGroupsByAssignment[assignmentId].add(g),
            );
          }
        }
      });

    // Newest first
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
    if (normalizedDraft.room_id !== normalizedOriginal.room_id) {
      payload.room_id = normalizedDraft.room_id;
    }
    if (normalizedDraft.semester_id !== normalizedOriginal.semester_id) {
      payload.semester_id = normalizedDraft.semester_id;
    }
    if (normalizedDraft.hours !== normalizedOriginal.hours) {
      payload.hours = normalizedDraft.hours;
    }
    if ((normalizedDraft.group_id ?? null) !== (normalizedOriginal.group_id ?? null)) {
      payload.group_id = normalizedDraft.group_id ?? null;
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
    if (payload.room_id !== undefined && payload.room_id !== null && payload.room_id <= 0) {
      return 'Wybierz poprawną salę.';
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
      room_id: draft.room_id ?? null,
      semester_id: Number(draft.semester_id),
      hours: Number(draft.hours),
      field_of_study_id: draft.field_of_study_id ?? null,
      group_id: draft.group_id ?? null,
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
    if (payload.room_id !== null && payload.room_id !== undefined && payload.room_id <= 0) {
      return 'Wybierz poprawną salę.';
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
      room_id: row.room_id === null || row.room_id === undefined ? null : Number(row.room_id),
      semester_id: Number(row.semester_id),
      hours: Number(row.hours),
    };
  }

  private translateAuditKey(key: string): string {
    const map: Record<string, string> = {
      teacher: 'Dydaktyk',
      teacher_id: 'Dydaktyk',
      teacher_first_name: 'Imię dydaktyka',
      teacher_last_name: 'Nazwisko dydaktyka',
      teacher_title: 'Tytuł dydaktyka',
      subject_id: 'Przedmiot',
      subject_name: 'Przedmiot',
      activity_id: 'Typ zajęć',
      activity_name: 'Typ zajęć',
      room_id: 'Sala',
      room_number: 'Numer sali',
      semester_id: 'Semestr',
      semester_name: 'Semestr',
      hours: 'Godziny',
      group_id: 'Grupa',
      group_label: 'Grupa',
      field_of_study_id: 'Kierunek',
      field_of_study_label: 'Kierunek',
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
      room_id: null,
      room_number: null,
      group_id: null,
      group_label: null,
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
    const roomLabel = this.getRoomLabel(item);
    const roomDepartment = this.getRoomDepartmentLabel(item);
    const parts = [
      this.getTeacherLabel(item),
      this.getSubjectLabel(item),
      this.getActivityLabel(item),
      roomLabel !== '—' ? roomLabel : '',
      roomDepartment ?? '',
      this.getSemesterLabel(item),
      String(item.hours),
      this.getGroupLabel(item),
      this.getFieldOfStudyLabel(item),
    ].filter(Boolean);
    return this.normalizeSearch(parts.join(' '));
  }

  private buildDiffRows(
    oldVals: Record<string, unknown> | null,
    newVals: Record<string, unknown> | null,
  ): Array<{ label: string; oldVal: string; newVal: string }> {
    const combined = { ...(oldVals ?? {}), ...(newVals ?? {}) };
    const allKeys = Object.keys(combined);

    // Detect presence of human-readable name fields
    const teacherNameKeys = ['teacher_first_name', 'teacher_last_name', 'teacher_title'];
    const hasTeacherNames = teacherNameKeys.some((k) => allKeys.includes(k));
    const hasSubjectName = allKeys.includes('subject_name');
    const hasActivityName = allKeys.includes('activity_name');
    const hasRoomNumber = allKeys.includes('room_number');
    const hasSemesterName = allKeys.includes('semester_name');

    // Keys to skip — replaced by human-readable alternatives
    const skipKeys = new Set<string>();
    if (hasTeacherNames) {
      skipKeys.add('teacher_id');
      teacherNameKeys.forEach((k) => skipKeys.add(k)); // merged into one entry below
    }
    if (hasSubjectName) { skipKeys.add('subject_id'); }
    if (hasActivityName) { skipKeys.add('activity_id'); }
    if (hasRoomNumber) { skipKeys.add('room_id'); }
    if (hasSemesterName) { skipKeys.add('semester_id'); }
    if (hasRoomNumber) { skipKeys.add('room_number'); }

    const result: Array<{ label: string; oldVal: string; newVal: string }> = [];

    // Merged teacher name entry
    if (hasTeacherNames) {
      const oldName = this.buildTeacherFullName(oldVals);
      const newName = this.buildTeacherFullName(newVals);
      if (oldName !== newName) {
        result.push({ label: 'Dydaktyk', oldVal: oldName, newVal: newName });
      }
    }

    if (hasRoomNumber) {
      const oldRoom = this.resolveDisplayValue('room_number', oldVals?.['room_number'] ?? null);
      const newRoom = this.resolveDisplayValue('room_number', newVals?.['room_number'] ?? null);
      if (oldRoom !== newRoom) {
        result.push({ label: 'Sala', oldVal: oldRoom, newVal: newRoom });
      }
    }

    for (const key of allKeys) {
      if (skipKeys.has(key)) { continue; }
      const oldVal = oldVals?.[key] ?? null;
      const newVal = newVals?.[key] ?? null;
      if (oldVal !== newVal) {
        result.push({
          label: this.translateAuditKey(key),
          oldVal: this.resolveDisplayValue(key, oldVal),
          newVal: this.resolveDisplayValue(key, newVal),
        });
      }
    }
    return result;
  }

  private buildTeacherFullName(vals: Record<string, unknown> | null): string {
    if (!vals) { return '—'; }
    const parts = [
      vals['teacher_title'],
      vals['teacher_first_name'],
      vals['teacher_last_name'],
    ]
      .map((v) => (v !== null && v !== undefined ? String(v) : ''))
      .filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : '—';
  }

  private resolveDisplayValue(key: string, value: unknown): string {
    if (value === null || value === undefined) { return '—'; }
    if (key === 'teacher_id') {
      const id = Number(value);
      const t = this.teachers.find((x) => x.user_id === id);
      return t
        ? [t.title || t.titles?.[0], `${t.first_name} ${t.last_name}`.trim()].filter(Boolean).join(' ')
        : String(value);
    }
    if (key === 'subject_id') {
      return this.subjects.find((x) => x.id === Number(value))?.name ?? String(value);
    }
    if (key === 'activity_id') {
      return this.activities.find((x) => x.id === Number(value))?.name ?? String(value);
    }
    if (key === 'room_id') {
      return this.rooms.find((x) => x.id === Number(value))?.room_number ?? String(value);
    }
    if (key === 'room_number') {
      return String(value);
    }
    if (key === 'semester_id') {
      return this.semesters.find((x) => x.id === Number(value))?.nazwa ?? String(value);
    }
    if (key === 'hours') {
      return `${value} godz.`;
    }
    if (key === 'group_id') {
      const id = Number(value);
      return this.groups.find((x) => x.id === id)?.code ?? String(value);
    }
    if (key === 'group_label') {
      return String(value);
    }
    if (key === 'field_of_study_id') {
      const id = Number(value);
      return this.fieldsOfStudy.find((x) => x.id === id)?.label ?? String(value);
    }
    if (key === 'field_of_study_label') {
      return String(value);
    }
    return this.formatAuditValue(value);
  }
}
