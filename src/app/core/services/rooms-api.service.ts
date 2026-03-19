import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export type RoomType =
  | 'informatyczna'
  | 'wykladowa'
  | 'mechatroniczna'
  | 'elektrotechniczna'
  | 'laboratoryjna'
  | 'inna';

export interface RoomDto {
  id: number;
  building: string;
  room_number: string;
  seats_count: number;
  room_type: RoomType;
  special_equipment: string;
  activities: string[];
}

export interface RoomPayload {
  room_number: string;
  seats_count: number;
  room_type: RoomType;
  special_equipment: string;
  activities: string[];
}

interface RoomsListResponse {
  items: RoomDto[];
}

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  private readonly roomsUrl = `${environment.apiBaseUrl}/rooms`;

  constructor(private readonly http: HttpClient) {}

  getRooms(): Observable<RoomDto[]> {
    return this.http
      .get<RoomsListResponse>(this.roomsUrl)
      .pipe(map((response) => response.items ?? []));
  }

  getRoomById(roomId: number): Observable<RoomDto> {
    return this.http.get<RoomDto>(`${this.roomsUrl}/${roomId}`);
  }

  createRoom(payload: RoomPayload): Observable<RoomDto> {
    return this.http.post<RoomDto>(this.roomsUrl, payload);
  }

  updateRoom(roomId: number, payload: RoomPayload): Observable<RoomDto> {
    return this.http.put<RoomDto>(`${this.roomsUrl}/${roomId}`, payload);
  }

  deleteRoom(roomId: number): Observable<void> {
    return this.http.delete<void>(`${this.roomsUrl}/${roomId}`);
  }
}
