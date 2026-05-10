import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RaplaReservationDto {
    id: number;
    uuid: string;
    name: string | null;
    color: string | null;
    start_date: string | null;  // 'YYYY-MM-DD'
    start_time: string | null;  // 'HH:MM:SS'
    end_date: string | null;
    end_time: string | null;
    repeating_type: string | null;
    repeating_end_date: string | null;
    allocate: string[] | null;
    room_names: string[] | null;
    teacher_names: string[] | null;
    semester_names: string[] | null;
}

@Injectable({ providedIn: 'root' })
export class RaplaApiService {
    private base = `${environment.apiBaseUrl}/rapla`;

    constructor(private http: HttpClient) { }

    getReservations(): Observable<RaplaReservationDto[]> {
        return this.http.get<RaplaReservationDto[]>(`${this.base}/reservations`, { withCredentials: true });
    }

    importFile(file: File): Observable<{ status: string; summary: { created: number; updated: number; unchanged: number; deleted?: number } }> {
        const fd = new FormData();
        fd.append('file', file, file.name);
        return this.http.post<{ status: string; summary: { created: number; updated: number; unchanged: number; deleted?: number } }>(
            `${this.base}/file/import`,
            fd,
            { withCredentials: true }
        );
    }
}
