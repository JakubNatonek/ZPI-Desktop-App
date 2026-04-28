/**
 * WebSocket (Socket.IO) Service for real-time chat communication.
 * Manages connection, events, and real-time message updates.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { Optional } from '@angular/core';
import { AuthService as BackendAuthService } from '../auth/auth.service';

export interface ChatMessage {
  message_id: number;
  sender_id: number;
  conversation_id: number;
  content: string;
  created_at: string;
}

export interface TypingIndicator {
  user_id: number;
  conversation_id: number;
  is_typing: boolean;
}

export interface UserPresence {
  user_id: number;
  conversation_id: number;
}

export interface MessageStatus {
  message_id: number;
  conversation_id: number;
  read_by?: number;
}

@Injectable({
  providedIn: 'root',
})
export class WebSocketService {
  private socket: Socket | null = null;
  public isConnected$ = new BehaviorSubject<boolean>(false);
  
  // Observable streams for chat events
  public messageReceived$ = new Subject<ChatMessage>();
  public userTyping$ = new Subject<TypingIndicator>();
  public messageDelivered$ = new Subject<MessageStatus>();
  public messageRead$ = new Subject<MessageStatus>();
  public userOnline$ = new Subject<UserPresence>();
  public userOffline$ = new Subject<UserPresence>();
  public notification$ = new Subject<any>();

  constructor(
    private authService: AuthService,
    @Optional() private backendAuthService?: BackendAuthService,
  ) {}

  /**
   * Connect to WebSocket server
   */
  connect(): void {
    if (this.socket?.connected) {
      return;
    }

    const backendUrl = environment.apiBaseUrl || 'http://localhost:8000';
    const userId = this.authService.currentUserId;

    if (!userId) {
      return;
    }

    const token = this.backendAuthService?.getAccessToken?.() ?? null;

    this.socket = io(backendUrl, {
      withCredentials: true,
      auth: token ? { token } : undefined,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      transports: ['websocket', 'polling'],
    });

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected$.next(true);
    });

    this.socket.on('disconnect', () => {
      this.isConnected$.next(false);
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('✗ WebSocket connection error:', error);
    });

    // Chat events
    this.socket.on('message_received', (data: ChatMessage) => {
      this.messageReceived$.next(data);
    });

    this.socket.on('user_typing', (data: TypingIndicator) => {
      this.userTyping$.next(data);
    });

    this.socket.on('message_delivered', (data: MessageStatus) => {
      this.messageDelivered$.next(data);
    });

    this.socket.on('message_read', (data: MessageStatus) => {
      this.messageRead$.next(data);
    });

    this.socket.on('user_online', (data: UserPresence) => {
      this.userOnline$.next(data);
    });

    this.socket.on('user_offline', (data: UserPresence) => {
      this.userOffline$.next(data);
    });

    // Live notifications from backend
    this.socket.on('notification', (data: any) => {
      this.notification$.next(data);
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected$.next(false);
    }
  }

  /**
   * Check if WebSocket is connected
   */
  isConnected(): boolean {
    return this.isConnected$.getValue();
  }

  /**
   * Get connection status as observable
   */
  getConnectionStatus() {
    return this.isConnected$.asObservable();
  }

  /**
   * Join a conversation room to receive updates
   */
  joinConversation(conversationId: number): void {
    if (!this.socket) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    this.socket.emit('join_conversation', {
      conversation_id: conversationId,
    });
  }

  /**
   * Leave a conversation room
   */
  leaveConversation(conversationId: number): void {
    if (!this.socket) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    this.socket.emit('leave_conversation', {
      conversation_id: conversationId,
    });
  }

  /**
   * Send a new message (client-side emission)
   * Backend will broadcast this to all conversation members
   */
  sendMessage(
    conversationId: number,
    messageId: number,
    senderId: number,
    content: string,
    createdAt: string
  ): void {
    if (!this.socket) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    this.socket.emit('message_sent', {
      conversation_id: conversationId,
      message_id: messageId,
      sender_id: senderId,
      content: content,
      created_at: createdAt,
    });
  }

  /**
   * Send typing indicator
   */
  setTyping(conversationId: number, isTyping: boolean): void {
    if (!this.socket) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    this.socket.emit('typing', {
      conversation_id: conversationId,
      is_typing: isTyping,
      user_id: this.authService.currentUserId,
    });
  }

  /**
   * Mark message as delivered
   */
  markDelivered(conversationId: number, messageId: number): void {
    if (!this.socket) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    this.socket.emit('message_delivered', {
      conversation_id: conversationId,
      message_id: messageId,
    });
  }

  /**
   * Mark message as read
   */
  markRead(conversationId: number, messageId: number): void {
    if (!this.socket) {
      console.warn('⚠️ WebSocket not connected');
      return;
    }

    this.socket.emit('message_read', {
      conversation_id: conversationId,
      message_id: messageId,
    });
  }
}
