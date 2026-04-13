import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { finalize, forkJoin } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import {
  AdminCreateUserPayload,
  AdminUpdateUserPayload,
  AdminUserRow,
  UsersAdminApiService,
  UserDepartmentOption,
  UserRoleOption,
  UserTitleOption,
} from '../../../core/services/users-admin-api.service';

interface SharedCredentials {
  login: string;
  one_time_password: string;
}

@Component({
  selector: 'app-admin-user-create',
  templateUrl: './user-create.page.html',
  styleUrls: ['./user-create.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule, ReactiveFormsModule],
})
export class UserCreatePage implements OnInit {
  readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    oneTimePassword: ['', [Validators.required, Validators.minLength(8)]],
    roleIds: this.fb.control<number[]>([], { nonNullable: true, validators: [Validators.required] }),
    departmentIds: this.fb.control<number[]>([], { nonNullable: true, validators: [Validators.required] }),
    titleId: this.fb.control<number | null>(null),
  });

  readonly editForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    login: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-z0-9._-]+$')]],
    email: ['', [Validators.required, Validators.email]],
    roleIds: this.fb.control<number[]>([], { nonNullable: true, validators: [Validators.required] }),
    departmentIds: this.fb.control<number[]>([], { nonNullable: true, validators: [Validators.required] }),
  });

  roles: UserRoleOption[] = [];
  departments: UserDepartmentOption[] = [];
  titles: UserTitleOption[] = [];
  users: AdminUserRow[] = [];

  readonly pageSizeOptions = [5, 10, 25, 50];
  searchQuery = '';
  pageSize = 10;
  currentPage = 1;

  isLoadingOptions = false;
  isLoadingUsers = false;
  isSaving = false;
  isSavingEdit = false;
  isResettingPassword = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  errorMessage = '';
  successMessage = '';
  createdCredentials: SharedCredentials | null = null;
  resetCredentials: SharedCredentials | null = null;

  selectedUser: AdminUserRow | null = null;
  isEditModalOpen = false;
  isResetPasswordModalOpen = false;
  resetOneTimePassword = '';

  get filteredUsers(): AdminUserRow[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.users;
    }

    return this.users.filter((user) => {
      const haystack = [
        user.titles.join(' '),
        user.first_name,
        user.last_name,
        user.login,
        user.email,
        user.roles.join(' '),
        user.departments.join(' '),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredUsers.length / this.pageSize));
  }

  get paginatedUsers(): AdminUserRow[] {
    const startIndex = (this.currentPage - 1) * this.pageSize;
    const endIndex = startIndex + this.pageSize;
    return this.filteredUsers.slice(startIndex, endIndex);
  }

  get pageRangeLabel(): string {
    const total = this.filteredUsers.length;
    if (total === 0) {
      return '0 z 0';
    }

    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(start + this.pageSize - 1, total);
    return `${start}-${end} z ${total}`;
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  getUserDisplayName(user: AdminUserRow): string {
    const titlePrefix = Array.isArray(user.titles) && user.titles.length > 0 ? `${user.titles.join(' ')} ` : '';
    return `${titlePrefix}${user.first_name} ${user.last_name}`.trim();
  }

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly usersAdminApi: UsersAdminApiService,
    private readonly alertController: AlertController
  ) {}

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadInitialData();
  }

  generateOneTimePassword(target: 'create' | 'reset' = 'create'): void {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const generated = Array.from({ length: 12 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join('');

    if (target === 'reset') {
      this.resetOneTimePassword = generated;
      return;
    }

    this.form.patchValue({ oneTimePassword: generated });
    this.form.controls.oneTimePassword.markAsDirty();
  }

  submit(): void {
    this.errorMessage = '';
    this.successMessage = '';
    this.createdCredentials = null;

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Uzupełnij poprawnie wszystkie wymagane pola.';
      return;
    }

    const value = this.form.getRawValue();
    const roleIds = this.parseIdArray(value.roleIds);
    const departmentIds = this.parseIdArray(value.departmentIds);
    const titleIds = this.parseOptionalSingleIdArray(value.titleId);
    if (roleIds.length === 0 || departmentIds.length === 0) {
      this.errorMessage = 'Wybierz poprawnie role i wydziały.';
      return;
    }

    const oneTimePassword = value.oneTimePassword!;
    const payload: AdminCreateUserPayload = {
      first_name: value.firstName!.trim(),
      last_name: value.lastName!.trim(),
      email: value.email!.trim().toLowerCase(),
      password: oneTimePassword,
      role_ids: roleIds,
      department_ids: departmentIds,
      title_ids: titleIds,
    };

    this.isSaving = true;
    this.usersAdminApi
      .createUser(payload)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (created) => {
          this.createdCredentials = {
            login: created.login,
            one_time_password: oneTimePassword,
          };
          this.successMessage = 'Użytkownik został utworzony. Przekaż login i hasło jednorazowe użytkownikowi.';
          this.reloadUsers();
        },
        error: (error) => {
          this.errorMessage = this.mapCreateError(error);
        },
      });
  }

  resetForm(): void {
    this.form.reset({
      firstName: '',
      lastName: '',
      email: '',
      oneTimePassword: '',
      roleIds: [],
      departmentIds: [],
      titleId: null,
    });
    this.errorMessage = '';
    this.successMessage = '';
    this.createdCredentials = null;
  }

  onSearchChange(value: string | null | undefined): void {
    this.searchQuery = (value ?? '').toString();
    this.currentPage = 1;
  }

  onPageSizeChange(value: number | string | null | undefined): void {
    const parsed = Number(value);
    this.pageSize = this.pageSizeOptions.includes(parsed) ? parsed : 10;
    this.currentPage = 1;
  }

  goToPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage -= 1;
    }
  }

  goToNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage += 1;
    }
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

  openEditModal(user: AdminUserRow): void {
    this.selectedUser = user;
    const selectedRoles = this.findRoleIdsByNames(user.roles);
    const selectedDepartments = this.findDepartmentIdsByNames(user.departments);

    this.editForm.setValue({
      firstName: user.first_name,
      lastName: user.last_name,
      login: user.login,
      email: user.email,
      roleIds: selectedRoles,
      departmentIds: selectedDepartments,
    });
    this.errorMessage = '';
    this.successMessage = '';
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
    this.selectedUser = null;
  }

  saveUserEdit(): void {
    if (!this.selectedUser) {
      return;
    }

    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      this.errorMessage = 'Popraw dane użytkownika przed zapisem.';
      return;
    }

    const value = this.editForm.getRawValue();
    const roleIds = this.parseIdArray(value.roleIds);
    const departmentIds = this.parseIdArray(value.departmentIds);
    if (roleIds.length === 0 || departmentIds.length === 0) {
      this.errorMessage = 'Wybierz poprawnie role i wydziały przed zapisem.';
      return;
    }

    const payload: AdminUpdateUserPayload = {
      first_name: value.firstName!.trim(),
      last_name: value.lastName!.trim(),
      login: value.login!.trim().toLowerCase(),
      email: value.email!.trim().toLowerCase(),
      role_ids: roleIds,
      department_ids: departmentIds,
    };

    this.isSavingEdit = true;
    this.usersAdminApi
      .updateUser(this.selectedUser.user_id, payload)
      .pipe(finalize(() => (this.isSavingEdit = false)))
      .subscribe({
        next: () => {
          this.successMessage = 'Dane użytkownika zostały zaktualizowane.';
          this.closeEditModal();
          this.reloadUsers();
        },
        error: (error) => {
          this.errorMessage = this.mapCreateError(error);
        },
      });
  }

  async confirmDeleteUser(user: AdminUserRow): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Usuń użytkownika',
      message: `Czy na pewno chcesz usunąć konto ${user.first_name} ${user.last_name}?`,
      buttons: [
        {
          text: 'Anuluj',
          role: 'cancel',
        },
        {
          text: 'Usuń',
          role: 'destructive',
          handler: () => {
            this.deleteUser(user.user_id);
          },
        },
      ],
    });

    await alert.present();
  }

  openResetPasswordModal(user: AdminUserRow): void {
    this.selectedUser = user;
    this.resetOneTimePassword = '';
    this.resetCredentials = null;
    this.errorMessage = '';
    this.successMessage = '';
    this.isResetPasswordModalOpen = true;
  }

  closeResetPasswordModal(): void {
    this.isResetPasswordModalOpen = false;
    this.selectedUser = null;
    this.resetOneTimePassword = '';
  }

  submitResetPassword(): void {
    const selectedUser = this.selectedUser;
    if (!selectedUser) {
      return;
    }

    const normalizedPassword = this.resetOneTimePassword.trim();
    if (normalizedPassword.length < 8) {
      this.errorMessage = 'Hasło jednorazowe musi mieć minimum 8 znaków.';
      return;
    }

    this.isResettingPassword = true;
    this.usersAdminApi
      .resetPassword(selectedUser.user_id, normalizedPassword)
      .pipe(finalize(() => (this.isResettingPassword = false)))
      .subscribe({
        next: () => {
          this.resetCredentials = {
            login: selectedUser.login,
            one_time_password: normalizedPassword,
          };
          this.successMessage = 'Hasło użytkownika zostało ustawione jako jednorazowe.';
          this.reloadUsers();
        },
        error: (error) => {
          this.errorMessage = this.mapCreateError(error);
        },
      });
  }

  private deleteUser(userId: number): void {
    this.usersAdminApi.deleteUser(userId).subscribe({
      next: () => {
        this.successMessage = 'Użytkownik został usunięty.';
        this.reloadUsers();
      },
      error: (error) => {
        this.errorMessage = this.mapCreateError(error);
      },
    });
  }

  private loadInitialData(): void {
    this.isLoadingOptions = true;
    this.isLoadingUsers = true;
    this.errorMessage = '';

    forkJoin({
      roles: this.usersAdminApi.getRoles(),
      departments: this.usersAdminApi.getDepartments(),
      titles: this.usersAdminApi.getTitles(),
      users: this.usersAdminApi.getUsersForAdmin(),
    })
      .pipe(
        finalize(() => {
          this.isLoadingOptions = false;
          this.isLoadingUsers = false;
        })
      )
      .subscribe({
        next: ({ roles, departments, titles, users }) => {
          this.roles = roles;
          this.departments = departments;
          this.titles = titles;
          this.users = users;
          this.ensureValidPage();
        },
        error: () => {
          this.errorMessage = 'Nie udało się pobrać danych administratora. Odśwież stronę i spróbuj ponownie.';
        },
      });
  }

  private reloadUsers(): void {
    this.isLoadingUsers = true;
    this.usersAdminApi
      .getUsersForAdmin()
      .pipe(finalize(() => (this.isLoadingUsers = false)))
      .subscribe({
        next: (users) => {
          this.users = users;
          this.ensureValidPage();
        },
        error: () => {
          this.errorMessage = 'Nie udało się odświeżyć listy użytkowników.';
        },
      });
  }

  private mapCreateError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 409) {
        return error.error?.detail || 'Użytkownik o takim loginie lub emailu już istnieje.';
      }

      if (error.status === 400 || error.status === 422) {
        return error.error?.detail || 'Dane formularza są niepoprawne.';
      }

      if (error.status === 404) {
        return error.error?.detail || 'Użytkownik nie został znaleziony.';
      }

      if (error.status === 403) {
        return 'Nie masz uprawnień do tworzenia kont użytkowników.';
      }

      if (error.status === 405) {
        return 'Nieprawidłowa metoda HTTP dla tego endpointu.';
      }
    }

    return 'Nie udało się utworzyć użytkownika. Spróbuj ponownie.';
  }

  private ensureValidPage(): void {
    const maxPage = this.totalPages;
    if (this.currentPage > maxPage) {
      this.currentPage = maxPage;
    }
    if (this.currentPage < 1) {
      this.currentPage = 1;
    }
  }

  private findRoleIdsByNames(roleNames: string[]): number[] {
    if (!Array.isArray(roleNames) || roleNames.length === 0) {
      return [];
    }

    const roleIndex = new Map(this.roles.map((role) => [role.name.trim().toLowerCase(), role.id]));
    const ids = roleNames
      .map((roleName) => roleIndex.get(roleName.trim().toLowerCase()))
      .filter((roleId): roleId is number => typeof roleId === 'number');

    return Array.from(new Set(ids));
  }

  private findDepartmentIdsByNames(departmentNames: string[]): number[] {
    if (!Array.isArray(departmentNames) || departmentNames.length === 0) {
      return [];
    }

    const departmentIndex = new Map(this.departments.map((department) => [department.name.trim().toLowerCase(), department.id]));
    const ids = departmentNames
      .map((departmentName) => departmentIndex.get(departmentName.trim().toLowerCase()))
      .filter((departmentId): departmentId is number => typeof departmentId === 'number');

    return Array.from(new Set(ids));
  }

  private parseIdArray(rawValue: unknown): number[] {
    if (!Array.isArray(rawValue)) {
      return [];
    }

    const ids = rawValue
      .map((value) => Number(value))
      .filter((id) => Number.isInteger(id) && id > 0);

    return Array.from(new Set(ids));
  }

  private parseOptionalSingleIdArray(rawValue: unknown): number[] {
    const id = Number(rawValue);
    if (!Number.isInteger(id) || id <= 0) {
      return [];
    }

    return [id];
  }
}
