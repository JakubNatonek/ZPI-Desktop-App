import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

/** DTO modelu Notification */
export interface NotificationDto {
  id: number;
  user_id: number;
  message: string;
  is_read: boolean;
  created_at: string; // ISO DateTime
}

/** DTO do oznaczenia powiadomienia jako przeczytanego */
export interface MarkAsReadRequest {
  is_read: boolean;
}

/** DTO listy powiadomień */
export interface NotificationListDto {
  items: NotificationDto[];
  unread_count: number;
}

/** DTO dla licznika nieprzeczytanych */
export interface UnreadCountDto {
  unread_count: number;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationsApiService {
  private readonly apiUrl = `${environment.apiBaseUrl}/notifications`;

  constructor(private http: HttpClient) {}

  /**
   * Pobiera powiadomienia zalogowanego użytkownika
   * GET /notifications/?limit=50&offset=0&unread_only=false
   */
  getNotifications(
    limit: number = 50,
    offset: number = 0,
    unreadOnly: boolean = false,
  ): Observable<NotificationListDto> {
    const params = { limit: limit.toString(), offset: offset.toString(), unread_only: unreadOnly.toString() };
    return this.http.get<NotificationListDto>(this.apiUrl, { params });
  }

  /**
   * Pobiera tylko nieprzeczytane powiadomienia
   * GET /notifications/?unread_only=true
   */
  getUnreadNotifications(): Observable<NotificationListDto> {
    return this.getNotifications(200, 0, true);
  }

  /**
   * Pobiera liczbę nieprzeczytanych powiadomień
   * GET /notifications/unread/count
   */
  getUnreadCount(): Observable<UnreadCountDto> {
    return this.http.get<UnreadCountDto>(`${this.apiUrl}/unread/count`);
  }

  /**
   * Pobiera szczegóły konkretnego powiadomienia
   * GET /notifications/{notification_id}
   */
  getNotificationDetail(notificationId: number): Observable<NotificationDto> {
    return this.http.get<NotificationDto>(`${this.apiUrl}/${notificationId}`);
  }

  /**
   * Oznacza powiadomienie jako przeczytane
   * PUT /notifications/{notification_id}/read
   */
  markAsRead(notificationId: number): Observable<NotificationDto> {
    return this.http.put<NotificationDto>(`${this.apiUrl}/${notificationId}/read`, { is_read: true });
  }

  /**
   * Oznacza wszystkie powiadomienia jako przeczytane
   * POST /notifications/read-all
   */
  markAllAsRead(): Observable<{ message: string; updated_count: number }> {
    return this.http.post<{ message: string; updated_count: number }>(`${this.apiUrl}/read-all`, {});
  }
}
