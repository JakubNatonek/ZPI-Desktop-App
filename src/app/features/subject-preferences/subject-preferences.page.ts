import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule, LoadingController } from '@ionic/angular';
import { Subject, finalize, filter, take, takeUntil } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { SubjectsApiService, SubjectDto, ActivityOption } from '../../core/services/subjects-api.service';
import { SubjectPreferencesApiService, SubjectPreferenceResponse } from '../../core/services/subject-preferences-api.service';
import { UsersAdminApiService, AdminUserRow } from '../../core/services/users-admin-api.service';

@Component({
  selector: 'app-subject-preferences',
  templateUrl: './subject-preferences.page.html',
  styleUrls: ['./subject-preferences.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SubjectPreferencesPage implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  currentUserId: number | null = null;
  selectedUserId: number | null = null;

  allUsers: AdminUserRow[] = [];
  allSubjects: SubjectDto[] = [];
  userPreferences: SubjectPreferenceResponse[] = [];

  // Subject grouping
  private subjectGroups: Map<string, SubjectDto[]> = new Map();

  // Form state
  userSearchQuery = '';
  subjectSearchQuery = '';
  newSubjectId: number | null = null;
  newActivityId: number | null = null;
  isUserDropdownOpen = false;
  isSubjectDropdownOpen = false;

  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  isLoading = false;
  isSaving = false;
  errorMessage = '';

  get availableSubjects(): SubjectDto[] {
    const preferredIds = new Set(this.userPreferences.map((p) => p.subject_id));
    return this.allSubjects.filter((s) => !preferredIds.has(s.id));
  }

  get isAdmin(): boolean {
    return this.auth.role === 'admin' || this.auth.role === 'rapla_editor' || this.auth.role === 'lecturer_rapla_editor';
  }

  get filteredUsers(): AdminUserRow[] {
    const query = this.userSearchQuery.trim().toLowerCase();
    return [...this.allUsers]
      .filter((user) => {
        const roleList = (user.roles ?? []).map((role) => role.toLowerCase());
        if (roleList.includes('admin')) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        if (!query) {
          return `${left.first_name} ${left.last_name}`.localeCompare(`${right.first_name} ${right.last_name}`);
        }

        const leftScore = this.getUserSearchScore(left, query);
        const rightScore = this.getUserSearchScore(right, query);

        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }

        return `${left.first_name} ${left.last_name}`.localeCompare(`${right.first_name} ${right.last_name}`);
      });
  }

  get selectedUserDisplayValue(): string {
    return this.getUserLabel(this.selectedUserId);
  }

  get selectedSubjectDisplayValue(): string {
    return this.getSubjectLabel(this.newSubjectId);
  }

  get filteredAvailableSubjects(): { id: number; name: string; entries: SubjectDto[] }[] {
    const query = this.subjectSearchQuery.trim().toLowerCase();
    const available = this.availableSubjects;
    const groups: Map<string, SubjectDto[]> = new Map();

    for (const subject of available) {
      const name = subject.name ?? `#${subject.id}`;
      const list = groups.get(name) ?? [];
      list.push(subject);
      groups.set(name, list);
    }

    const out: { id: number; name: string; entries: SubjectDto[] }[] = [];
    for (const [name, entries] of groups.entries()) {
      out.push({ id: entries[0].id, name, entries });
    }

    out.sort((a, b) => {
      if (!query) {
        return a.name.localeCompare(b.name);
      }

      const scoreA = this.getSubjectSearchScore(a.name, query);
      const scoreB = this.getSubjectSearchScore(b.name, query);

      if (scoreA !== scoreB) {
        return scoreA - scoreB;
      }

      return a.name.localeCompare(b.name);
    });
    return out;
  }

  get enrichedPreferences() {
    return this.userPreferences.map((pref) => {
      const subjectDetails = this.allSubjects.find((s) => s.id === pref.subject_id);
      return {
        ...pref,
        activity_name: subjectDetails?.activity_name || null,
        type_display: subjectDetails?.type_display || null,
        room_properties: subjectDetails?.room_properties || null,
      };
    });
  }

  get selectedUserLabel(): string {
    if (!this.selectedUserId) return '';
    const user = this.allUsers.find((u) => u.user_id === this.selectedUserId);
    if (!user) return '';
    return `${user.first_name} ${user.last_name}`;
  }

  constructor(
    public auth: AuthService,
    private readonly router: Router,
    private readonly subjectsApi: SubjectsApiService,
    private readonly preferencesApi: SubjectPreferencesApiService,
    private readonly usersAdminApi: UsersAdminApiService,
    private readonly alertController: AlertController,
    private readonly loadingController: LoadingController,
  ) {
    this.currentUserId = this.auth.currentUserId;
  }

  ngOnInit(): void {
    this.auth.isRestoringSession$
      .pipe(
        takeUntil(this.destroy$),
        filter((isRestoring) => !isRestoring),
        take(1),
      )
      .subscribe(() => {
        if (
          this.auth.role !== 'admin' &&
          this.auth.role !== 'rapla_editor' &&
          this.auth.role !== 'lecturer_rapla_editor'
        ) {
          this.router.navigateByUrl('/home');
          return;
        }
        this.loadInitialData();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get userDisplayName(): string {
    return this.auth.displayName;
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

  private loadInitialData(): void {
    this.isLoading = true;

    // Load subjects and users (if admin)
    const requests: Array<Promise<void>> = [this.loadSubjects()];

    if (this.isAdmin) {
      requests.push(this.loadUsers());
    }

    Promise.all(requests)
      .then(() => {
        // Set initial user ID
        if (this.isAdmin) {
          // Admin: no auto-selection
          this.selectedUserId = null;
        } else {
          // Lecturer: always view own preferences
          this.selectedUserId = this.currentUserId;
        }

        this.userSearchQuery = this.getUserLabel(this.selectedUserId);

        if (this.selectedUserId !== null) {
          return this.loadPreferences(this.selectedUserId);
        }
        return Promise.resolve();
      })
      .catch((error) => {
        console.error('Error loading initial data:', error);
        this.errorMessage = 'Błąd przy ładowaniu danych.';
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  private loadSubjects(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.subjectsApi
        .getSubjectsPublic()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (subjects) => {
            this.allSubjects = subjects;
            this.buildSubjectGroups();
            resolve();
          },
          error: (error) => {
            console.error('Error loading subjects:', error);
            reject(error);
          },
        });
    });
  }

  private loadUsers(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.usersAdminApi
        .getUsersForAdmin()
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (users) => {
            this.allUsers = users;
            resolve();
          },
          error: (error) => {
            console.error('Error loading users:', error);
            reject(error);
          },
        });
    });
  }

  private loadPreferences(userId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.preferencesApi
        .getPreferencesForUser(userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (preferences) => {
            this.userPreferences = preferences;
            this.errorMessage = '';
            this.resetSubjectForm();
            resolve();
          },
          error: (error) => {
            console.error('Error loading preferences:', error);
            this.errorMessage = 'Błąd przy ładowaniu preferencji.';
            reject(error);
          },
        });
    });
  }

  onUserSelected(userId: number | null): void {
    if (!this.isAdmin) {
      return;
    }

    if (!userId || userId <= 0) {
      return;
    }

    this.selectedUserId = userId;
    this.userSearchQuery = this.getUserLabel(userId);
    this.isLoading = true;
    this.refreshSelectedUserData(userId)
      .catch((error) => {
        console.error('Error loading preferences for user:', error);
      })
      .finally(() => {
        this.isLoading = false;
      });
  }

  onUserSearchFocus(): void {
    if (!this.isAdmin) {
      return;
    }

    this.isUserDropdownOpen = true;
    this.userSearchQuery = this.selectedUserDisplayValue;
  }

  onUserSearchInput(value: string | null | undefined): void {
    if (!this.isAdmin) {
      return;
    }

    this.userSearchQuery = value ?? '';
    this.isUserDropdownOpen = true;
  }

  selectUser(user: AdminUserRow): void {
    if (!this.isAdmin) {
      return;
    }

    this.selectedUserId = user.user_id;
    this.userSearchQuery = this.getUserLabel(user.user_id);
    this.isUserDropdownOpen = false;
    this.onUserSelected(user.user_id);
  }

  closeUserDropdown(): void {
    if (!this.isAdmin) {
      return;
    }

    setTimeout(() => {
      this.isUserDropdownOpen = false;
      this.userSearchQuery = this.getUserLabel(this.selectedUserId);
    }, 120);
  }

  private refreshSelectedUserData(userId: number): Promise<void> {
    return Promise.all([this.loadSubjects(), this.loadPreferences(userId)]).then(() => undefined);
  }

  onSubjectSelected(subjectId: number | null): void {
    this.newSubjectId = subjectId;
    this.newActivityId = null; // Reset activity when subject changes
    this.subjectSearchQuery = this.getSubjectLabel(subjectId);
    this.isSubjectDropdownOpen = false;

    if (!subjectId) {
      return;
    }

    // Auto-select first activity for this subject if available
    const options = this.getActivityOptionsForSubject(subjectId);
    if (options.length > 0) {
      this.newActivityId = options[0].id;
    }
  }

  onSubjectSearchChange(value: string | null | undefined): void {
    this.subjectSearchQuery = value ?? '';
    this.isSubjectDropdownOpen = true;

    // Do NOT automatically select the exact match on input. 
    // It causes a bug where the user typing the exact phrase makes the system 
    // auto-select and close the dropdown, rendering the actual dropdown options unclickable.
  }

  onSubjectSearchFocus(): void {
    this.isSubjectDropdownOpen = true;
    this.subjectSearchQuery = this.getSubjectLabel(this.newSubjectId) || this.subjectSearchQuery;
  }

  selectSubject(subject: { id: number; name: string; entries: SubjectDto[] }): void {
    this.newSubjectId = subject.id;
    this.subjectSearchQuery = subject.name;
    this.isSubjectDropdownOpen = false;
    this.onSubjectSelected(subject.id);
  }

  closeSubjectDropdown(): void {
    setTimeout(() => {
      this.isSubjectDropdownOpen = false;
      this.subjectSearchQuery = this.getSubjectLabel(this.newSubjectId);
    }, 120);
  }

  getActivityOptionsForSubject(subjectId: number | null | undefined): ActivityOption[] {
    if (!subjectId) {
      return [];
    }

    const entries = this.getSubjectEntriesById(subjectId);
    const activityIds = Array.from(new Set(entries.map((e) => Number(e.activity_id)).filter(Boolean)));

    // Build unique activity list and skip incomplete values to satisfy strict typing.
    const activityMap = new Map<number, string>();
    for (const subject of this.allSubjects) {
      if (subject.activity_id === null || subject.activity_name === null) {
        continue;
      }
      if (!activityMap.has(subject.activity_id)) {
        activityMap.set(subject.activity_id, subject.activity_name);
      }
    }
    const allActivities: ActivityOption[] = Array.from(activityMap.entries()).map(([id, name]) => ({ id, name }));

    if (!activityIds.length) {
      return allActivities;
    }

    return allActivities.filter((a) => activityIds.includes(a.id));
  }

  onAddPreference(): void {
    if (!this.newSubjectId || !this.newActivityId || this.selectedUserId === null || this.isSaving) {
      return;
    }

    const selectedSubjectId = this.getSelectedSubjectIdForActivity(this.newSubjectId, this.newActivityId);
    if (!selectedSubjectId) {
      this.errorMessage = 'Nie udało się dopasować typu zajęć do wybranego przedmiotu.';
      return;
    }

    this.isSaving = true;
    this.preferencesApi
      .addPreference(this.selectedUserId, { subject_id: selectedSubjectId })
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: () => {
          this.loadPreferences(this.selectedUserId!).catch(() => { });
        },
        error: (error) => {
          console.error('Error adding preference:', error);
          this.errorMessage = 'Błąd przy dodawaniu przedmiotu.';
        },
      });
  }

  onRemovePreference(preference: SubjectPreferenceResponse): void {
    if (this.selectedUserId === null || this.isSaving) {
      return;
    }

    this.isSaving = true;
    this.preferencesApi
      .removePreference(this.selectedUserId, preference.subject_id)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: () => {
          this.loadPreferences(this.selectedUserId!).catch(() => { });
        },
        error: (error) => {
          console.error('Error removing preference:', error);
          this.errorMessage = 'Błąd przy usuwaniu przedmiotu.';
        },
      });
  }

  private buildSubjectGroups(): void {
    this.subjectGroups = new Map();
    for (const s of this.allSubjects) {
      const name = s.name ?? `#${s.id}`;
      const list = this.subjectGroups.get(name) ?? [];
      list.push(s);
      this.subjectGroups.set(name, list);
    }
  }

  private getSubjectEntriesById(subjectId: number | null | undefined): SubjectDto[] {
    if (!subjectId) return [];
    const subject = this.allSubjects.find((s) => s.id === subjectId);
    if (!subject) return [];
    const name = subject.name ?? `#${subject.id}`;
    return this.subjectGroups.get(name) ?? [subject];
  }

  private getUserLabel(userId: number | null): string {
    if (!userId) {
      return '';
    }
    const user = this.allUsers.find((u) => u.user_id === userId);
    if (!user) {
      return '';
    }
    return `${user.first_name} ${user.last_name}`.trim();
  }

  private getUserSearchScore(user: AdminUserRow, query: string): number {
    const haystack = [user.first_name, user.last_name, user.login, user.email]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (haystack === query) {
      return 0;
    }

    if (haystack.startsWith(query)) {
      return 1;
    }

    if (haystack.includes(query)) {
      return 2;
    }

    return 3;
  }

  private getSubjectSearchScore(subjectName: string, query: string): number {
    const haystack = subjectName.toLowerCase();

    if (haystack === query) {
      return 0;
    }

    if (haystack.startsWith(query)) {
      return 1;
    }

    if (haystack.includes(query)) {
      return 2;
    }

    return 3;
  }

  private getSubjectLabel(subjectId: number | null): string {
    if (!subjectId) {
      return '';
    }
    const subject = this.allSubjects.find((s) => s.id === subjectId);
    return subject?.name ?? '';
  }

  private getSelectedSubjectIdForActivity(subjectId: number, activityId: number): number | null {
    const entries = this.getSubjectEntriesById(subjectId);
    const match = entries.find((entry) => entry.activity_id === activityId);
    if (match) {
      return match.id;
    }

    return entries[0]?.id ?? null;
  }

  private resetForm(): void {
    this.resetSubjectForm();
    this.userSearchQuery = this.getUserLabel(this.selectedUserId);
  }

  private resetSubjectForm(): void {
    this.subjectSearchQuery = '';
    this.newSubjectId = null;
    this.newActivityId = null;
    this.isUserDropdownOpen = false;
    this.isSubjectDropdownOpen = false;
  }
}
