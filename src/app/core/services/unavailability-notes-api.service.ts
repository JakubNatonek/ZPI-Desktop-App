import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Typ notatki */
export type NoteType = 'request' | 'forced';

/** Status notatki */
export type NoteStatus = 'pending' | 'accepted' | 'rejected' | 'acknowledged';

/** DTO modelu UnavailabilityNote do tworzenia */
export interface CreateUnavailabilityNoteRequest {
  start_date: string; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD lub null
  description?: string | null;
  note_type: NoteType;
}

/** DTO modelu UnavailabilityNote do aktualizacji statusu */
export interface UpdateUnavailabilityNoteStatusRequest {
  status: NoteStatus;
}

/** DTO odpowiedzi dla notatki */
export interface UnavailabilityNoteDto {
  id: number;
  user_id: number;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD
  description: string | null;
  note_type: NoteType;
  status: NoteStatus;
  created_at: string; // ISO DateTime
  updated_at: string; // ISO DateTime
}

/** DTO odpowiedzi dla listy notatek (z informacją o autorze) */
export interface UnavailabilityNoteListDto extends UnavailabilityNoteDto {
  first_name: string;
  last_name: string;
}

@Injectable({
  providedIn: 'root',
})
export class UnavailabilityNotesApiService {
  private readonly apiUrl = `${environment.apiBaseUrl}/unavailability-notes`;

  constructor(private http: HttpClient) { }

  /**
   * Tworzy nową notatkę o niedostępności
   * POST /unavailability-notes/
   */
  createNote(payload: CreateUnavailabilityNoteRequest): Observable<UnavailabilityNoteDto> {
    return this.http.post<UnavailabilityNoteDto>(this.apiUrl, payload, { withCredentials: true });
  }

  /**
   * Pobiera notatki zalogowanego użytkownika
   * GET /unavailability-notes/me
   */
  getMyNotes(): Observable<UnavailabilityNoteDto[]> {
    return this.http.get<UnavailabilityNoteDto[]>(`${this.apiUrl}/me`);
  }

  /**
   * Pobiera wszystkie notatki (dostęp: Admin)
   * GET /unavailability-notes/all
   */
  getAllNotes(): Observable<UnavailabilityNoteListDto[]> {
    return this.http.get<UnavailabilityNoteListDto[]>(`${this.apiUrl}/all`, { withCredentials: true });
  }

  /**
   * Pobiera notatki oczekujące (dostęp: Admin)
   * GET /unavailability-notes/all/pending
   */
  getPendingNotes(): Observable<UnavailabilityNoteListDto[]> {
    return this.http.get<UnavailabilityNoteListDto[]>(`${this.apiUrl}/all/pending`, { withCredentials: true });
  }

  /**
   * Zmienia status notatki (dostęp: Admin)
   * PUT /unavailability-notes/{note_id}/status
   */
  updateNoteStatus(noteId: number, payload: UpdateUnavailabilityNoteStatusRequest): Observable<UnavailabilityNoteDto> {
    return this.http.put<UnavailabilityNoteDto>(`${this.apiUrl}/${noteId}/status`, payload, { withCredentials: true });
  }

  /**
   * Pobiera szczegóły konkretnej notatki
   * GET /unavailability-notes/{note_id}
   */
  getNoteDetail(noteId: number): Observable<UnavailabilityNoteDto> {
    return this.http.get<UnavailabilityNoteDto>(`${this.apiUrl}/${noteId}`, { withCredentials: true });
  }
}
