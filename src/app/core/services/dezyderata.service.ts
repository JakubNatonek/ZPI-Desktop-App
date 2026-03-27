import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable} from 'rxjs';
import { environment } from '../../../environments/environment';

export interface Semestr {
  id: number;
  data_rozpoczecia: string;
  data_zakonczenia: string;
  nazwa: string;
}

export interface SemestrListResponse {
  items: Semestr[];
}

export interface Dezyderata {
  id: number;
  user_id: number;
  data_od: string;
  data_do: string;
  godziny: string;
  semestr_id: number;
  semestr_nazwa?: string;
}

export interface DezyderataListResponse {
  items: Dezyderata[];
}

export interface DezyderataCreate {
  data_od: string;
  data_do: string;
  godziny: string;
  semestr_id: number;
}

@Injectable({ providedIn: 'root' })
export class DezyderataService {
  private readonly baseUrl = `${environment.apiBaseUrl}/dezyderaty`;

  constructor(private http: HttpClient) {}

  // ----- Semestry -----

  getSemestry(): Observable<SemestrListResponse> {
    return this.http.get<SemestrListResponse>(`${this.baseUrl}/semestry`, { withCredentials: true });
  }

  getCurrentSemestr(): Observable<Semestr> {
    return this.http.get<Semestr>(`${this.baseUrl}/semestry/current`, { withCredentials: true });
  }

  getSemestrById(id: number): Observable<Semestr> {
    return this.http.get<Semestr>(`${this.baseUrl}/semestry/${id}`, { withCredentials: true });
  }

  // ----- Dezyderaty -----

  getDezyderaty(semestrId?: number): Observable<DezyderataListResponse> {
    const params: Record<string, string> = {};
    if (semestrId !== undefined) {
      params['semestr_id'] = semestrId.toString();
    }
    return this.http.get<DezyderataListResponse>(this.baseUrl, { params, withCredentials: true });
  }

  getMyDezyderaty(semestrId?: number): Observable<DezyderataListResponse> {
    const params: Record<string, string> = {};
    if (semestrId !== undefined) {
      params['semestr_id'] = semestrId.toString();
    }
    return this.http.get<DezyderataListResponse>(`${this.baseUrl}/my`, { params, withCredentials: true });
  }

  getDezyderataById(id: number): Observable<Dezyderata> {
    return this.http.get<Dezyderata>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }

  createOrUpdateDezyderata(payload: DezyderataCreate): Observable<Dezyderata> {
    return this.http.post<Dezyderata>(this.baseUrl, payload, { withCredentials: true });
  }

  deleteDezyderata(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { withCredentials: true });
  }
}
