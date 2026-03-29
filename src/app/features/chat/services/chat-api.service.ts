import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { environment } from '../../../../environments/environment';
import {
  AuthMeResponse,
  ConversationListResponse,
  CreateGroupResponse,
  MessageApiResponse,
  MessageStatusApiResponse,
  SearchUserResponse,
  PublicKeyResponse,
  StartConversationResponse,
} from '../models/chat.models';

@Injectable({
  providedIn: 'root',
})
export class ChatApiService {
  private http = inject(HttpClient);

  searchUsers(query: string) {
    return this.http.get<SearchUserResponse[]>(`${environment.apiBaseUrl}/api/chat/search-users`, {
      params: { q: query },
    });
  }

  getAvailableUsers(limit = 100) {
    return this.http.get<SearchUserResponse[]>(`${environment.apiBaseUrl}/api/chat/search-users`, {
      params: { limit: String(limit) },
    });
  }

  getCurrentUser() {
    return this.http.get<AuthMeResponse>(`${environment.apiBaseUrl}/auth/me`);
  }

  getConversations() {
    return this.http.get<ConversationListResponse[]>(`${environment.apiBaseUrl}/api/chat/conversations`);
  }

  startConversation(userId: number) {
    return this.http.post<StartConversationResponse>(`${environment.apiBaseUrl}/api/chat/start-conversation/${userId}`, {});
  }

  createGroup(name: string, userIds: number[]) {
    return this.http.post<CreateGroupResponse>(`${environment.apiBaseUrl}/api/chat/create-group`, {
      name,
      user_ids: userIds,
    });
  }

  getConversationMessages(conversationId: number) {
    return this.http.get<MessageApiResponse[]>(`${environment.apiBaseUrl}/api/chat/${conversationId}/messages`);
  }

  getMessagesForUser(userId: number) {
    return this.http.get<MessageApiResponse[]>(`${environment.apiBaseUrl}/messages`, {
      params: { user_id: String(userId) },
    });
  }

  sendMessage(conversationId: number, content: string) {
    return this.http.post<MessageApiResponse>(`${environment.apiBaseUrl}/api/chat/${conversationId}/send-message`, { content });
  }

  getMessageStatus(messageId: number) {
    return this.http.get<MessageStatusApiResponse>(`${environment.apiBaseUrl}/api/chat/messages/${messageId}/status`);
  }

  markMessageAsRead(messageId: number) {
    return this.http.post(`${environment.apiBaseUrl}/api/chat/messages/${messageId}/read`, {});
  }

  getUserNameById(userId: number) {
    return this.http.get<SearchUserResponse>(`${environment.apiBaseUrl}/users/${userId}/name`);
  }

  getUserPublicKeyById(userId: number) {
    return this.http.get<PublicKeyResponse>(`${environment.apiBaseUrl}/users/${userId}/public-key`);
  }
}
