import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuditApiService, AuditLogDto } from './audit-api.service';
import { SubjectsApiService, SubjectDto, ActivityOption } from './subjects-api.service';
import { AdminUserRow, UsersAdminApiService } from './users-admin-api.service';

export interface TeachingLoadAssignmentDto {
  id: number;
  teacher_id: number;
  teacher_title: string | null;
  teacher_first_name: string | null;
  teacher_last_name: string | null;
  subject_id: number;
  subject_name: string | null;
  activity_id: number;
  activity_name: string | null;
  semester_id: number;
  semester_name: string | null;
  hours: number;
}

export interface TeachingLoadAssignmentPatchPayload {
  teacher_id?: number;
  subject_id?: number;
  activity_id?: number;
  semester_id?: number;
  hours?: number;
}

export interface TeachingLoadAssignmentCreatePayload {
  teacher_id: number;
  subject_id: number;
  activity_id: number;
  semester_id: number;
  hours: number;
}

export interface TeachingLoadFilters {
  teacher_id?: number;
  subject_id?: number;
  activity_id?: number;
  semester_id?: number;
  hours?: number;
  hours_min?: number;
  hours_max?: number;
}

export interface TeacherOption {
  user_id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  titles: string[];
}

interface TeachingLoadListResponse {
  items?: TeachingLoadAssignmentDto[];
}

@Injectable({ providedIn: 'root' })
export class TeachingLoadsApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/teaching-loads`;

  constructor(
    private readonly http: HttpClient,
    private readonly auditApi: AuditApiService,
    private readonly subjectsApi: SubjectsApiService,
    private readonly usersAdminApi: UsersAdminApiService,
  ) {}

  getTeachingLoads(filters?: TeachingLoadFilters): Observable<TeachingLoadAssignmentDto[]> {
    return this.http
      .get<TeachingLoadListResponse | TeachingLoadAssignmentDto[]>(`${this.baseUrl}/list`)
      .pipe(
        map((response) => {
          const items = Array.isArray(response) ? response : (response.items ?? []);
          return items.map((item) => this.normalizeTeachingLoad(item));
        }),
        map((items) => this.applyFilters(items, filters)),
        catchError((error: HttpErrorResponse) => this.handleError(error)),
      );
  }

  patchTeachingLoad(
    assignmentId: number,
    payload: TeachingLoadAssignmentPatchPayload,
  ): Observable<TeachingLoadAssignmentDto> {
    return this.http
      .patch<TeachingLoadAssignmentDto>(`${this.baseUrl}/${assignmentId}`, payload)
      .pipe(
        map((item) => this.normalizeTeachingLoad(item)),
        catchError((error: HttpErrorResponse) => this.handleError(error)),
      );
  }

  createTeachingLoad(payload: TeachingLoadAssignmentCreatePayload): Observable<TeachingLoadAssignmentDto> {
    return this.http
      .post<TeachingLoadAssignmentDto>(this.baseUrl, payload)
      .pipe(
        map((item) => this.normalizeTeachingLoad(item)),
        catchError((error: HttpErrorResponse) => this.handleError(error)),
      );
  }

  getTeachingLoadHistory(assignmentId: number): Observable<AuditLogDto[]> {
    return this.auditApi.getLogs().pipe(
      map((response) => response.logs ?? []),
      map((logs) =>
        logs.filter(
          (log) => log.entity_name === 'TeachingLoadAssignment' && Number(log.entity_id) === assignmentId,
        ),
      ),
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  getTeachers(): Observable<TeacherOption[]> {
    return this.usersAdminApi.getUsersForAdmin().pipe(
      map((users) => users.filter((user) => this.isTeacherUser(user)).map((user) => this.mapTeacher(user))),
      catchError((error: HttpErrorResponse) => this.handleError(error)),
    );
  }

  getSubjects(): Observable<SubjectDto[]> {
    return this.subjectsApi.getSubjects().pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  getActivities(): Observable<ActivityOption[]> {
    return this.subjectsApi.getActivities().pipe(catchError((error: HttpErrorResponse) => this.handleError(error)));
  }

  private normalizeTeachingLoad(item: Partial<TeachingLoadAssignmentDto>): TeachingLoadAssignmentDto {
    return {
      id: Number(item.id),
      teacher_id: Number(item.teacher_id),
      teacher_title: item.teacher_title ? String(item.teacher_title) : null,
      teacher_first_name: item.teacher_first_name ? String(item.teacher_first_name) : null,
      teacher_last_name: item.teacher_last_name ? String(item.teacher_last_name) : null,
      subject_id: Number(item.subject_id),
      subject_name: item.subject_name ? String(item.subject_name) : null,
      activity_id: Number(item.activity_id),
      activity_name: item.activity_name ? String(item.activity_name) : null,
      semester_id: Number(item.semester_id),
      semester_name: item.semester_name ? String(item.semester_name) : null,
      hours: Number(item.hours),
    };
  }

  private applyFilters(
    items: TeachingLoadAssignmentDto[],
    filters?: TeachingLoadFilters,
  ): TeachingLoadAssignmentDto[] {
    if (!filters) {
      return items;
    }

    return items.filter((item) => {
      if (filters.teacher_id !== undefined && item.teacher_id !== filters.teacher_id) {
        return false;
      }
      if (filters.subject_id !== undefined && item.subject_id !== filters.subject_id) {
        return false;
      }
      if (filters.activity_id !== undefined && item.activity_id !== filters.activity_id) {
        return false;
      }
      if (filters.semester_id !== undefined && item.semester_id !== filters.semester_id) {
        return false;
      }
      if (filters.hours !== undefined && item.hours !== filters.hours) {
        return false;
      }
      if (filters.hours_min !== undefined && item.hours < filters.hours_min) {
        return false;
      }
      if (filters.hours_max !== undefined && item.hours > filters.hours_max) {
        return false;
      }
      return true;
    });
  }

  private isTeacherUser(user: AdminUserRow): boolean {
    const roles = (user.roles ?? []).map((role) => String(role).toLowerCase());
    return roles.some((role) => ['wykladowca', 'lecturer', 'cwiczenia', 'laboratorium', 'seminarium'].includes(role));
  }

  private mapTeacher(user: AdminUserRow): TeacherOption {
    const titles = Array.isArray(user.titles) ? user.titles.map((title) => String(title)) : [];
    return {
      user_id: Number(user.user_id),
      first_name: String(user.first_name ?? ''),
      last_name: String(user.last_name ?? ''),
      title: titles.length ? titles[0] : null,
      titles,
    };
  }

  private handleError(error: HttpErrorResponse): Observable<never> {
    return throwError(() => error);
  }
}
