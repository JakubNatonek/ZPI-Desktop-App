import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuditLogDto {
  id: number;
  entity_name: string;
  entity_id: number;
  action: string;
  old_values: any;
  new_values: any;
  modified_by: number;
  modified_by_name: string;
  timestamp: string;
  isNew?: boolean;
}

export interface AuditLogResponseDto {
  last_changes_viewed_at: string | null;
  logs: AuditLogDto[];
}

@Injectable({
  providedIn: 'root'
})
export class AuditApiService {
  private url = `${environment.apiBaseUrl}/audit-logs`;

  constructor(private http: HttpClient) {}

  getLogs(): Observable<AuditLogResponseDto> {
    return this.http.get<AuditLogResponseDto>(this.url);
  }

  acknowledgeChanges(): Observable<{message: string}> {
    return this.http.post<{message: string}>(`${this.url}/acknowledge`, {});
  }
}
