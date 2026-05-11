import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface SubjectPreferenceResponse {
  id: number;
  user_id: number;
  subject_id: number;
  subject_name: string | null;
}

export interface SubjectPreferenceCreatePayload {
  subject_id: number;
  user_id?: number;
}

@Injectable({ providedIn: 'root' })
export class SubjectPreferencesApiService {
  private readonly preferencesBaseUrl = `${environment.apiBaseUrl}/subject-preferences`;

  constructor(private readonly http: HttpClient) {}

  getPreferencesForUser(userId: number): Observable<SubjectPreferenceResponse[]> {
    return this.http.get<SubjectPreferenceResponse[]>(`${this.preferencesBaseUrl}/${userId}`);
  }

  addPreference(userId: number, payload: SubjectPreferenceCreatePayload): Observable<SubjectPreferenceResponse> {
    return this.http.post<SubjectPreferenceResponse>(`${this.preferencesBaseUrl}/${userId}/add`, payload);
  }

  removePreference(userId: number, subjectId: number): Observable<void> {
    return this.http.delete<void>(`${this.preferencesBaseUrl}/${userId}/remove/${subjectId}`);
  }
}
