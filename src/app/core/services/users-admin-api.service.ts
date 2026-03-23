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
  login: string;
  email: string;
  one_time_password: string;
  role: string;
  department: string;
}

export interface AdminCreatedUserResponse {
  user_id: number;
  login: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  department: string;
  one_time_password: string;
}

@Injectable({ providedIn: 'root' })
export class UsersAdminApiService {
  private readonly usersBaseUrl = `${environment.apiBaseUrl}/users`;

  constructor(private readonly http: HttpClient) {}

  getRoles(): Observable<UserRoleOption[]> {
    return this.http.get<UserRoleOption[]>(`${this.usersBaseUrl}/roles`);
  }

  getDepartments(): Observable<UserDepartmentOption[]> {
    return this.http.get<UserDepartmentOption[]>(`${this.usersBaseUrl}/departments`);
  }

  createUser(payload: AdminCreateUserPayload): Observable<AdminCreatedUserResponse> {
    return this.http.post<AdminCreatedUserResponse>(`${this.usersBaseUrl}/admin-create`, payload);
  }
}
