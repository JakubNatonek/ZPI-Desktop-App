import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface SubjectDto {
  id: number;
  name: string;
  type_id: number | null;
  activity_id: number | null;
  activity_name: string | null;
  type_display: string | null;
  room_properties: string | null;
  blocked: boolean;
  periodic: boolean;
}

export interface SubjectPayload {
  name: string;
  activity_id: number;
  type_display?: string | null;
  room_properties?: string | null;
  blocked: boolean;
  periodic: boolean;
}

export interface ActivityOption {
  id: number;
  name: string;
}

export interface DictionaryNamePayload {
  name: string;
}

interface SubjectListResponse {
  items?: SubjectDto[];
}

@Injectable({ providedIn: 'root' })
export class SubjectsApiService {
  private readonly subjectsBaseUrl = `${environment.apiBaseUrl}/subjects`;
  private readonly activitiesUrl = `${environment.apiBaseUrl}/activities/list`;

  constructor(private readonly http: HttpClient) {}

  getSubjects(): Observable<SubjectDto[]> {
    return this.http
      .get<SubjectListResponse | SubjectDto[]>(`${this.subjectsBaseUrl}/list`)
      .pipe(
        map((response) => {
          const source = Array.isArray(response) ? response : (response.items ?? []);
          return source.map((subject) => this.normalizeSubject(subject));
        })
      );
  }

  getSubjectsPublic(): Observable<SubjectDto[]> {
    return this.http
      .get<SubjectListResponse | SubjectDto[]>(`${this.subjectsBaseUrl}/public/list`)
      .pipe(
        map((response) => {
          const source = Array.isArray(response) ? response : (response.items ?? []);
          return source.map((subject) => this.normalizeSubject(subject));
        })
      );
  }

  getSubjectById(subjectId: number): Observable<SubjectDto> {
    return this.http
      .get<SubjectDto>(`${this.subjectsBaseUrl}/${subjectId}`)
      .pipe(map((subject) => this.normalizeSubject(subject)));
  }

  createSubject(payload: SubjectPayload): Observable<SubjectDto> {
    return this.http
      .post<SubjectDto>(this.subjectsBaseUrl, payload)
      .pipe(map((subject) => this.normalizeSubject(subject)));
  }

  updateSubject(subjectId: number, payload: SubjectPayload): Observable<SubjectDto> {
    return this.http
      .put<SubjectDto>(`${this.subjectsBaseUrl}/${subjectId}`, payload)
      .pipe(map((subject) => this.normalizeSubject(subject)));
  }

  deleteSubject(subjectId: number): Observable<void> {
    return this.http.delete<void>(`${this.subjectsBaseUrl}/${subjectId}`);
  }

  getActivities(): Observable<ActivityOption[]> {
    return this.http.get<ActivityOption[]>(this.activitiesUrl).pipe(
      map((items) => items.map((item) => ({ id: Number(item.id), name: String(item.name) })))
    );
  }

  createActivity(payload: DictionaryNamePayload): Observable<ActivityOption> {
    return this.http
      .post<ActivityOption>(`${environment.apiBaseUrl}/activities`, payload)
      .pipe(map((item) => ({ id: Number(item.id), name: String(item.name) })));
  }

  updateActivity(activityId: number, payload: DictionaryNamePayload): Observable<ActivityOption> {
    return this.http
      .put<ActivityOption>(`${environment.apiBaseUrl}/activities/${activityId}`, payload)
      .pipe(map((item) => ({ id: Number(item.id), name: String(item.name) })));
  }

  deleteActivity(activityId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/activities/${activityId}`);
  }

  private normalizeSubject(subject: Partial<SubjectDto>): SubjectDto {
    return {
      id: Number(subject.id),
      name: String(subject.name ?? ''),
      type_id: typeof subject.type_id === 'number' ? subject.type_id : null,
      activity_id: typeof subject.activity_id === 'number' ? subject.activity_id : null,
      activity_name: subject.activity_name ? String(subject.activity_name) : null,
      type_display: subject.type_display ? String(subject.type_display) : null,
      room_properties: subject.room_properties ? String(subject.room_properties) : null,
      blocked: Boolean(subject.blocked),
      periodic: Boolean(subject.periodic),
    };
  }
}
