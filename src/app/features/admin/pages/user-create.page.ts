import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AlertController, IonicModule } from '@ionic/angular';
import { finalize, forkJoin } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import {
  AdminUpdateUserPayload,
  AdminCreatedUserResponse,
  AdminUserRow,
  UserCredentialsResponse,
  UsersAdminApiService,
  UserDepartmentOption,
  UserRoleOption,
} from '../../../core/services/users-admin-api.service';

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
    role: ['', [Validators.required]],
    department: ['', [Validators.required]],
  });

  readonly editForm = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    login: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-z0-9._-]+$')]],
    email: ['', [Validators.required, Validators.email]],
    role: ['', [Validators.required]],
    department: ['', [Validators.required]],
  });

  roles: UserRoleOption[] = [];
  departments: UserDepartmentOption[] = [];
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
  createdCredentials: AdminCreatedUserResponse | null = null;
  resetCredentials: UserCredentialsResponse | null = null;

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
        user.first_name,
        user.last_name,
        user.login,
        user.email,
        user.role,
        user.department,
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
    const payload = {
      first_name: value.firstName!.trim(),
      last_name: value.lastName!.trim(),
      email: value.email!.trim().toLowerCase(),
      one_time_password: value.oneTimePassword!,
      role_id: Number(value.role!),
      department_id: Number(value.department!),
    };

    this.isSaving = true;
    this.usersAdminApi
      .createUser(payload)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (created) => {
          this.createdCredentials = created;
          this.successMessage = 'Użytkownik został utworzony. Przekaż login i hasło jednorazowe użytkownikowi.';
          this.reloadUsers();
        },
        error: (error) => {
          this.errorMessage = this.mapCreateError(error);
        },
      });
  }

  resetForm(): void {
    this.form.reset();
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
    this.editForm.setValue({
      firstName: user.first_name,
      lastName: user.last_name,
      login: user.login,
      email: user.email,
      role: user.role,
      department: user.department,
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
    const payload: AdminUpdateUserPayload = {
      first_name: value.firstName!.trim(),
      last_name: value.lastName!.trim(),
      login: value.login!.trim().toLowerCase(),
      email: value.email!.trim().toLowerCase(),
      role_id: Number(value.role!),
      department_id: Number(value.department!),
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
    if (!this.selectedUser) {
      return;
    }

    const normalizedPassword = this.resetOneTimePassword.trim();
    if (normalizedPassword.length < 8) {
      this.errorMessage = 'Hasło jednorazowe musi mieć minimum 8 znaków.';
      return;
    }

    this.isResettingPassword = true;
    this.usersAdminApi
      .resetOneTimePassword(this.selectedUser.user_id, normalizedPassword)
      .pipe(finalize(() => (this.isResettingPassword = false)))
      .subscribe({
        next: (credentials) => {
          this.resetCredentials = credentials;
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
      users: this.usersAdminApi.getUsersForAdmin(),
    })
      .pipe(
        finalize(() => {
          this.isLoadingOptions = false;
          this.isLoadingUsers = false;
        })
      )
      .subscribe({
        next: ({ roles, departments, users }) => {
          this.roles = roles;
          this.departments = departments;
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
}
