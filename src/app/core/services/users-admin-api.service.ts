import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface UserRoleOption {
  id: number;
  name: string;
}

export interface UserDepartmentOption {
  id: number;
  name: string;
}

export interface AdminCreateUserPayload {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role_ids: number[];
  department_ids: number[];
}

export interface AdminCreatedUserResponse {
  user_id: number;
  album_number: string;
  login: string;
  email: string;
  first_name: string;
  last_name: string;
  roles: string[];
  departments: string[];
}

export interface AdminUserRow {
  user_id: number;
  album_number: string;
  first_name: string;
  last_name: string;
  login: string;
  email: string;
  roles: string[];
  departments: string[];
  must_change_password: boolean;
}

export interface AdminUpdateUserPayload {
  first_name: string;
  last_name: string;
  login: string;
  email: string;
  role_ids: number[];
  department_ids: number[];
}

export interface ChangePasswordResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class UsersAdminApiService {
  private readonly usersBaseUrl = `${environment.apiBaseUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  getRoles(): Observable<UserRoleOption[]> {
    return this.http.get<UserRoleOption[]>(`${environment.apiBaseUrl}/roles/list`);
  }

  getDepartments(): Observable<UserDepartmentOption[]> {
    return this.http.get<UserDepartmentOption[]>(`${environment.apiBaseUrl}/departments/list`);
  }

  createUser(payload: AdminCreateUserPayload): Observable<AdminCreatedUserResponse> {
    return this.http.post<AdminCreatedUserResponse>(`${this.usersBaseUrl}/create`, payload);
  }

  getUsersForAdmin(): Observable<AdminUserRow[]> {
    return this.http.get<AdminUserRow[]>(`${this.usersBaseUrl}/admin-list`);
  }

  updateUser(userId: number, payload: AdminUpdateUserPayload): Observable<AdminUserRow> {
    return this.http.put<AdminUserRow>(`${this.usersBaseUrl}/${userId}`, payload);
  }

  deleteUser(userId: number): Observable<void> {
    return this.http.delete<void>(`${this.usersBaseUrl}/${userId}`);
  }

  resetPassword(userId: number, password: string): Observable<ChangePasswordResponse> {
    return this.http.post<ChangePasswordResponse>(`${this.usersBaseUrl}/${userId}/reset-password`, {
      password,
    });
  }
}
