import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { map, Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

export interface RoomTypeOption {
  id: number;
  name: string;
  abbreviation: string;
}

export interface RoomActivityOption {
  id: number;
  name: string;
}

export interface RoomSpecialEquipmentOption {
  id: number;
  name: string;
}

export interface RoomDepartmentOption {
  id: number;
  name: string;
  abbreviation: string;
}

export interface RoomTypePayload {
  name: string;
  abbreviation: string;
}

export interface RoomDepartmentPayload {
  name: string;
  abbreviation: string;
}

export interface DictionaryNamePayload {
  name: string;
}

export interface RoomDto {
  id: number;
  room_number: string;
  seats_count: number;
  room_type_id: number | null;
  room_type: string;
  special_equipment: number[];
  special_equipment_names: string[];
  activities: number[];
  activity_names: string[];
  departments: number[];
  department_names: string[];
}

export interface RoomPayload {
  room_number: string;
  seats_count: number;
  room_type_id: number;
  special_equipment: number[];
  activities: number[];
  departments: number[];
}

interface RoomsListResponse {
  items?: RoomDto[];
}

@Injectable({ providedIn: 'root' })
export class RoomsApiService {
  private readonly roomsBaseUrl = `${environment.apiBaseUrl}/rooms`;
  private readonly roomTypesUrl = `${environment.apiBaseUrl}/room-types/list`;
  private readonly activitiesUrl = `${environment.apiBaseUrl}/activities/list`;
  private readonly specialEquipmentUrl = `${environment.apiBaseUrl}/special-equipment/list`;
  private readonly departmentsUrl = `${environment.apiBaseUrl}/departments/list`;

  constructor(private readonly http: HttpClient) {}

  getRooms(): Observable<RoomDto[]> {
    return this.http
      .get<RoomsListResponse | RoomDto[]>(`${this.roomsBaseUrl}/list`)
      .pipe(
        map((response) => {
          const sourceRooms = Array.isArray(response) ? response : (response.items ?? []);
          return sourceRooms.map((room) => this.normalizeRoom(room));
        })
      );
  }

  getRoomById(roomId: number): Observable<RoomDto> {
    return this.http.get<RoomDto>(`${this.roomsBaseUrl}/${roomId}`).pipe(map((room) => this.normalizeRoom(room)));
  }

  createRoom(payload: RoomPayload): Observable<RoomDto> {
    return this.http.post<RoomDto>(this.roomsBaseUrl, payload).pipe(map((room) => this.normalizeRoom(room)));
  }

  updateRoom(roomId: number, payload: RoomPayload): Observable<RoomDto> {
    return this.http.put<RoomDto>(`${this.roomsBaseUrl}/${roomId}`, payload).pipe(map((room) => this.normalizeRoom(room)));
  }

  deleteRoom(roomId: number): Observable<void> {
    return this.http.delete<void>(`${this.roomsBaseUrl}/${roomId}`);
  }

  getRoomTypes(): Observable<RoomTypeOption[]> {
    return this.http.get<RoomTypeOption[]>(this.roomTypesUrl).pipe(
      map((items) => items.map((item) => ({
        id: item.id,
        name: item.name,
        abbreviation: item.abbreviation,
      })))
    );
  }

  getActivities(): Observable<RoomActivityOption[]> {
    return this.http.get<RoomActivityOption[]>(this.activitiesUrl).pipe(
      map((items) => items.map((item) => ({
        id: item.id,
        name: item.name,
      })))
    );
  }

  getSpecialEquipment(): Observable<RoomSpecialEquipmentOption[]> {
    return this.http.get<RoomSpecialEquipmentOption[]>(this.specialEquipmentUrl).pipe(
      map((items) => items.map((item) => ({
        id: item.id,
        name: item.name,
      })))
    );
  }

  getDepartments(): Observable<RoomDepartmentOption[]> {
    return this.http.get<RoomDepartmentOption[]>(this.departmentsUrl).pipe(
      map((items) => items.map((item) => ({
        id: item.id,
        name: item.name,
        abbreviation: item.abbreviation,
      })))
    );
  }

  createRoomType(payload: RoomTypePayload): Observable<RoomTypeOption> {
    return this.http.post<RoomTypeOption>(`${environment.apiBaseUrl}/room-types`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
        abbreviation: item.abbreviation,
      }))
    );
  }

  updateRoomType(roomTypeId: number, payload: RoomTypePayload): Observable<RoomTypeOption> {
    return this.http.put<RoomTypeOption>(`${environment.apiBaseUrl}/room-types/${roomTypeId}`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
        abbreviation: item.abbreviation,
      }))
    );
  }

  deleteRoomType(roomTypeId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/room-types/${roomTypeId}`);
  }

  createActivity(payload: DictionaryNamePayload): Observable<RoomActivityOption> {
    return this.http.post<RoomActivityOption>(`${environment.apiBaseUrl}/activities`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
      }))
    );
  }

  updateActivity(activityId: number, payload: DictionaryNamePayload): Observable<RoomActivityOption> {
    return this.http.put<RoomActivityOption>(`${environment.apiBaseUrl}/activities/${activityId}`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
      }))
    );
  }

  deleteActivity(activityId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/activities/${activityId}`);
  }

  createSpecialEquipment(payload: DictionaryNamePayload): Observable<RoomSpecialEquipmentOption> {
    return this.http.post<RoomSpecialEquipmentOption>(`${environment.apiBaseUrl}/special-equipment`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
      }))
    );
  }

  updateSpecialEquipment(
    specialEquipmentId: number,
    payload: DictionaryNamePayload,
  ): Observable<RoomSpecialEquipmentOption> {
    return this.http.put<RoomSpecialEquipmentOption>(`${environment.apiBaseUrl}/special-equipment/${specialEquipmentId}`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
      }))
    );
  }

  deleteSpecialEquipment(specialEquipmentId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/special-equipment/${specialEquipmentId}`);
  }

  createDepartment(payload: RoomDepartmentPayload): Observable<RoomDepartmentOption> {
    return this.http.post<RoomDepartmentOption>(`${environment.apiBaseUrl}/departments`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
        abbreviation: item.abbreviation,
      }))
    );
  }

  updateDepartment(departmentId: number, payload: RoomDepartmentPayload): Observable<RoomDepartmentOption> {
    return this.http.put<RoomDepartmentOption>(`${environment.apiBaseUrl}/departments/${departmentId}`, payload).pipe(
      map((item) => ({
        id: item.id,
        name: item.name,
        abbreviation: item.abbreviation,
      }))
    );
  }

  deleteDepartment(departmentId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiBaseUrl}/departments/${departmentId}`);
  }

  private normalizeRoom(room: Partial<RoomDto>): RoomDto {
    return {
      id: Number(room.id),
      room_number: String(room.room_number ?? ''),
      seats_count: Number(room.seats_count ?? 0),
      room_type_id: typeof room.room_type_id === 'number' ? room.room_type_id : null,
      room_type: String(room.room_type ?? 'inna'),
      special_equipment: Array.isArray(room.special_equipment)
        ? room.special_equipment.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [],
      special_equipment_names: Array.isArray(room.special_equipment_names)
        ? room.special_equipment_names.map((name) => String(name))
        : [],
      activities: Array.isArray(room.activities)
        ? room.activities.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [],
      activity_names: Array.isArray(room.activity_names)
        ? room.activity_names.map((name) => String(name))
        : [],
      departments: Array.isArray(room.departments)
        ? room.departments.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [],
      department_names: Array.isArray(room.department_names)
        ? room.department_names.map((name) => String(name))
        : [],
    };
  }
}
