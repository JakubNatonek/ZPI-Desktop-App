import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { finalize } from 'rxjs';

import { AuthService } from '../../../core/services/auth.service';
import {
  AdminCreatedUserResponse,
  UsersAdminApiService,
  UserDepartmentOption,
  UserRoleOption,
} from '../../../core/services/users-admin-api.service';

@Component({
  selector: 'app-admin-user-create',
  templateUrl: './user-create.page.html',
  styleUrls: ['./user-create.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class UserCreatePage implements OnInit {
  readonly form = this.fb.group({
    firstName: ['', [Validators.required, Validators.minLength(2)]],
    lastName: ['', [Validators.required, Validators.minLength(2)]],
    login: ['', [Validators.required, Validators.minLength(3), Validators.pattern('^[a-z0-9._-]+$')]],
    email: ['', [Validators.required, Validators.email]],
    oneTimePassword: ['', [Validators.required, Validators.minLength(8)]],
    role: ['', [Validators.required]],
    department: ['', [Validators.required]],
  });

  roles: UserRoleOption[] = [];
  departments: UserDepartmentOption[] = [];

  isLoadingOptions = false;
  isSaving = false;

  errorMessage = '';
  successMessage = '';
  createdCredentials: AdminCreatedUserResponse | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly usersAdminApi: UsersAdminApiService
  ) {}

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadSelectOptions();
  }

  generateOneTimePassword(): void {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const generated = Array.from({ length: 12 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join('');

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
      login: value.login!.trim().toLowerCase(),
      email: value.email!.trim().toLowerCase(),
      one_time_password: value.oneTimePassword!,
      role: value.role!,
      department: value.department!,
    };

    this.isSaving = true;
    this.usersAdminApi
      .createUser(payload)
      .pipe(finalize(() => (this.isSaving = false)))
      .subscribe({
        next: (created) => {
          this.createdCredentials = created;
          this.successMessage = 'Użytkownik został utworzony. Przekaż login i hasło jednorazowe użytkownikowi.';
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

  private loadSelectOptions(): void {
    this.isLoadingOptions = true;
    this.errorMessage = '';

    this.usersAdminApi
      .getRoles()
      .pipe(finalize(() => (this.isLoadingOptions = false)))
      .subscribe({
        next: (roles) => {
          this.roles = roles;
          this.loadDepartments();
        },
        error: () => {
          this.errorMessage = 'Nie udało się pobrać listy ról. Odśwież stronę i spróbuj ponownie.';
        },
      });
  }

  private loadDepartments(): void {
    this.isLoadingOptions = true;
    this.usersAdminApi
      .getDepartments()
      .pipe(finalize(() => (this.isLoadingOptions = false)))
      .subscribe({
        next: (departments) => {
          this.departments = departments;
        },
        error: () => {
          this.errorMessage = 'Nie udało się pobrać listy wydziałów. Odśwież stronę i spróbuj ponownie.';
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

      if (error.status === 403) {
        return 'Nie masz uprawnień do tworzenia kont użytkowników.';
      }
    }

    return 'Nie udało się utworzyć użytkownika. Spróbuj ponownie.';
  }
}
