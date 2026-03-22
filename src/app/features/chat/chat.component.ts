import {
  Component,
  signal,
  inject,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
  OnDestroy,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, catchError, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService } from '../../core/services/websocket.service';
import {
  ActiveTab,
  ChatMessage,
  ChatRoom,
  ChatUser,
  ChatView,
  MessageApiResponse,
  SearchUserResponse,
} from './models/chat.models';
import { ChatApiService } from './services/chat-api.service';
import { ChatPanelHeaderComponent } from './components/chat-panel-header/chat-panel-header.component';
import { ChatPanelTabsComponent } from './components/chat-panel-tabs/chat-panel-tabs.component';
import { ChatContactsViewComponent } from './components/chat-contacts-view/chat-contacts-view.component';
import { ChatRoomsViewComponent } from './components/chat-rooms-view/chat-rooms-view.component';
import { ChatCreateRoomViewComponent } from './components/chat-create-room-view/chat-create-room-view.component';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  imports: [
    CommonModule,
    FormsModule,
    ChatPanelHeaderComponent,
    ChatPanelTabsComponent,
    ChatContactsViewComponent,
    ChatRoomsViewComponent,
    ChatCreateRoomViewComponent,
  ],
})
export class ChatComponent implements AfterViewChecked, OnInit, OnDestroy {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;

  private auth = inject(AuthService);
  private chatApi = inject(ChatApiService);
  private websocket = inject(WebSocketService);

  isOpen = signal(false);
  activeTab = signal<ActiveTab>('messages');
  view = signal<ChatView>('contacts');
  selectedUser = signal<ChatUser | null>(null);
  selectedRoom = signal<ChatRoom | null>(null);
  newRoomMembers = signal<number[]>([]);

  messageInput = '';
  newRoomName = '';
  private shouldScrollToBottom = false;
  private currentUserId: number | null = null;
  private refreshTimerId: ReturnType<typeof setInterval> | null = null;
  private unreadToastTimerId: ReturnType<typeof setTimeout> | null = null;
  private usersById: Record<number, ChatUser> = {};
  private directConversationIdByUserId: Record<number, number> = {};
  private resolvingUserIds = new Set<number>();
  private joinedConversationIds = new Set<number>();
  private wsSubscriptions: Subscription[] = [];

  // Wyszukiwanie
  searchQuery = '';
  searchResults = signal<ChatUser[]>([]);
  isSearching = signal(false);
  hasUnreadMessages = signal(false);
  showUnreadToast = signal(false);
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;
  directContacts: ChatUser[] = [];
  availableUsers: ChatUser[] = [];
  rooms: ChatRoom[] = [];
  conversations: Record<number, ChatMessage[]> = {};
  roomMessages: Record<number, ChatMessage[]> = {};

  get currentUserName(): string {
    const user = this.selectedUser();
    if (user) {
      return `${user.first_name} ${user.last_name}`;
    }
    return 'Ja';
  }

  ngOnInit(): void {
    this.searchSubscription = this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query.trim()) {
            this.searchResults.set([]);
            this.isSearching.set(false);
            return of([]);
          }
          this.isSearching.set(true);
          return this.chatApi.searchUsers(query).pipe(
            catchError((err) => {
              console.error('Błąd podczas wyszukiwania:', err);
              return of([]);
            })
          );
        })
      )
      .subscribe((users) => {
        const mappedUsers: ChatUser[] = users.map((u) => this.toChatUser(u));
        this.upsertUsers(mappedUsers);
        this.searchResults.set(mappedUsers);
        this.isSearching.set(false);
      });

    this.loadCurrentUserAndData();
    this.startAutoRefresh();

    this.websocket.connect();
    this.setupWebSocketListeners();
  }

  ngOnDestroy(): void {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
    }
    if (this.refreshTimerId) {
      clearInterval(this.refreshTimerId);
      this.refreshTimerId = null;
    }
    if (this.unreadToastTimerId) {
      clearTimeout(this.unreadToastTimerId);
      this.unreadToastTimerId = null;
    }

    this.wsSubscriptions.forEach((sub) => sub.unsubscribe());
    this.wsSubscriptions = [];

    this.joinedConversationIds.forEach((conversationId) => {
      this.websocket.leaveConversation(conversationId);
    });
    this.joinedConversationIds.clear();
    this.websocket.disconnect();
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  onSearch(query: string): void {
    this.searchSubject.next(query);
  }

  private scrollToBottom(): void {
    if (this.messagesContainer?.nativeElement) {
      const el = this.messagesContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  toggle(): void {
    this.isOpen.update(v => !v);
    if (this.isOpen()) {
      this.shouldScrollToBottom = true;
      this.syncConversationState();
    }
  }

  close(): void {
    this.isOpen.set(false);
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    this.view.set(tab === 'messages' ? 'contacts' : 'rooms');
    this.selectedUser.set(null);
    this.selectedRoom.set(null);
    this.messageInput = '';
  }

  openConversation(user: ChatUser): void {
    this.searchQuery = '';
    this.searchResults.set([]);
    this.upsertUsers([user]);
    this.ensureUsersLoaded([user.user_id]);
    this.selectedUser.set(user);
    this.view.set('conversation');
    if (!this.conversations[user.user_id]) {
      this.conversations[user.user_id] = [];
    }
    this.getOrCreateDirectConversation(user.user_id, (conversationId) => {
      this.ensureConversationJoined(conversationId);
      this.fetchConversationMessages(conversationId, 'direct', user.user_id);
    });
  }

  openRoom(room: ChatRoom): void {
    this.selectedRoom.set(room);
    this.view.set('room-chat');
    if (!this.roomMessages[room.id]) {
      this.roomMessages[room.id] = [];
    }
    this.ensureConversationJoined(room.id);
    this.fetchConversationMessages(room.id, 'room', room.id);
  }

  goBack(): void {
    if (this.view() === 'conversation') {
      this.view.set('contacts');
      this.selectedUser.set(null);
    } else if (this.view() === 'room-chat') {
      this.view.set('rooms');
      this.selectedRoom.set(null);
    } else if (this.view() === 'create-room') {
      this.view.set('rooms');
      this.newRoomName = '';
      this.newRoomMembers.set([]);
    }
  }

  sendMessage(): void {
    const content = this.messageInput.trim();
    if (!content) return;

    if (this.view() === 'conversation' && this.selectedUser()) {
      const user = this.selectedUser();
      if (!user) return;
      this.getOrCreateDirectConversation(user.user_id, (conversationId) => {
        this.sendMessageToConversation(conversationId, content, 'direct', user.user_id);
      });
      return;
    }

    if (this.view() === 'room-chat' && this.selectedRoom()) {
      const room = this.selectedRoom();
      if (!room) return;
      this.sendMessageToConversation(room.id, content, 'room', room.id);
    }
  }

  showCreateRoom(): void {
    this.view.set('create-room');
    this.newRoomName = '';
    this.newRoomMembers.set([]);
  }

  toggleRoomMember(userId: number): void {
    const current = this.newRoomMembers();
    if (current.includes(userId)) {
      this.newRoomMembers.set(current.filter(id => id !== userId));
    } else {
      this.newRoomMembers.set([...current, userId]);
    }
  }

  isMemberSelected(userId: number): boolean {
    return this.newRoomMembers().includes(userId);
  }

  createRoom(): void {
    const name = this.newRoomName.trim();
    if (!name || this.newRoomMembers().length === 0) return;

    this.chatApi
      .createGroup(name, this.newRoomMembers())
      .pipe(
        catchError((err) => {
          console.error('Nie udało się utworzyć grupy:', err);
          return of(null);
        })
      )
      .subscribe((created) => {
        if (!created) return;

        const room: ChatRoom = {
          id: created.conversation_id,
          name: created.name,
          members: created.members,
          createdAt: new Date(),
        };

        this.rooms = [room, ...this.rooms.filter((r) => r.id !== room.id)];
        if (!this.roomMessages[room.id]) {
          this.roomMessages[room.id] = [];
        }
        this.view.set('rooms');
        this.newRoomName = '';
        this.newRoomMembers.set([]);
      });
  }

  getLastMessage(userId: number): string {
    const msgs = this.conversations[userId];
    if (!msgs || msgs.length === 0) return 'Brak wiadomości';
    const last = msgs[msgs.length - 1];
    return last.content.length > 35 ? last.content.slice(0, 35) + '…' : last.content;
  }

  isLastMessageUnread(userId: number): boolean {
    const msgs = this.conversations[userId];
    if (!msgs || msgs.length === 0) return false;
    const last = msgs[msgs.length - 1];
    return !last.isOwn && !last.isRead;
  }

  getLastRoomMessage(roomId: number): string {
    const msgs = this.roomMessages[roomId];
    if (!msgs || msgs.length === 0) return 'Brak wiadomości';
    const last = msgs[msgs.length - 1];
    return last.content.length > 35 ? last.content.slice(0, 35) + '…' : last.content;
  }

  formatTime(date: Date): string {
    return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
  }

  formatDate(date: Date): string {
    const today = new Date();
    const isToday = date.toDateString() === today.toDateString();
    if (isToday) return this.formatTime(date);
    return date.toLocaleDateString('pl-PL', { day: '2-digit', month: '2-digit' });
  }

  getInitials(user: ChatUser): string {
    const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`;
    return initials.toUpperCase();
  }

  handleKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  getRoomMemberNames(room: ChatRoom): string {
    if (room.members.length === 0) return 'Brak członków';
    const names = room.members
      .map(id => {
        const u = this.usersById[id];
        return u ? `${u.first_name} ${u.last_name}`.trim() : '';
      })
      .filter(Boolean)
      .slice(0, 3);
    const suffix = room.members.length > 3 ? ` +${room.members.length - 3}` : '';
    return names.join(', ') + suffix;
  }

  private loadCurrentUserAndData(): void {
    this.chatApi
      .getCurrentUser()
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać danych użytkownika:', err);
          return of(null);
        })
      )
      .subscribe((me) => {
        this.currentUserId = me?.user_id ?? null;
        this.loadAvailableUsers();
        this.loadConversations();
      });
  }

  private loadAvailableUsers(): void {
    this.chatApi
      .getAvailableUsers(100)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać listy użytkowników czatu:', err);
          return of([]);
        })
      )
      .subscribe((users) => {
        const mapped = users.map((u) => this.toChatUser(u));
        this.upsertUsers(mapped);
        this.availableUsers = mapped;
      });
  }

  private loadConversations(): void {
    this.chatApi
      .getConversations()
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać konwersacji:', err);
          return of([]);
        })
      )
      .subscribe((items) => {
        const nextRooms: ChatRoom[] = [];
        const contacts: ChatUser[] = [];
        const idsToResolve = new Set<number>();
        const directConversationsToRefresh: Array<{ conversationId: number; userId: number }> = [];
        const roomConversationsToRefresh: Array<{ conversationId: number; roomId: number }> = [];

        items.forEach((item) => {
          this.ensureConversationJoined(item.id);

          if (item.type === 'group') {
            const room: ChatRoom = {
              id: item.id,
              name: item.name?.trim() ? item.name : `Pokój #${item.id}`,
              members: item.member_ids,
              createdAt: new Date(item.created_at),
            };
            nextRooms.push(room);
            if (!this.roomMessages[item.id]) {
              this.roomMessages[item.id] = [];
            }
            roomConversationsToRefresh.push({
              conversationId: item.id,
              roomId: item.id,
            });
            item.member_ids.forEach((id) => {
              if (this.currentUserId !== id && !this.usersById[id]) {
                idsToResolve.add(id);
              }
            });
            return;
          }

          const otherUserId = item.member_ids.find((id) => id !== this.currentUserId);
          if (!otherUserId) return;

          this.directConversationIdByUserId[otherUserId] = item.id;
          if (!this.conversations[otherUserId]) {
            this.conversations[otherUserId] = [];
          }
          if (!this.usersById[otherUserId]) {
            idsToResolve.add(otherUserId);
          }
          directConversationsToRefresh.push({
            conversationId: item.id,
            userId: otherUserId,
          });

          contacts.push(this.getOrBuildUser(otherUserId));
        });

        this.rooms = nextRooms;
        this.directContacts = contacts;
        this.ensureUsersLoaded(Array.from(idsToResolve));

        directConversationsToRefresh.forEach(({ conversationId, userId }) => {
          this.fetchConversationMessages(conversationId, 'direct', userId, {
            markAsRead: false,
            scrollToBottom: false,
          });
        });
        roomConversationsToRefresh.forEach(({ conversationId, roomId }) => {
          this.fetchConversationMessages(conversationId, 'room', roomId, {
            markAsRead: false,
            scrollToBottom: false,
          });
        });

        this.refreshActiveConversationMessages();
      });
  }

  private getOrCreateDirectConversation(userId: number, onReady: (conversationId: number) => void): void {
    const existingConversationId = this.directConversationIdByUserId[userId];
    if (existingConversationId) {
      onReady(existingConversationId);
      return;
    }

    this.chatApi
      .startConversation(userId)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się rozpocząć konwersacji:', err);
          return of(null);
        })
      )
      .subscribe((response) => {
        if (!response) return;
        this.directConversationIdByUserId[userId] = response.conversation_id;

        const user = this.getOrBuildUser(userId);
        if (!this.directContacts.some((contact) => contact.user_id === userId)) {
          this.directContacts = [user, ...this.directContacts];
        }
        onReady(response.conversation_id);
      });
  }

  private fetchConversationMessages(
    conversationId: number,
    target: 'direct' | 'room',
    targetId: number,
    options?: { markAsRead?: boolean; scrollToBottom?: boolean },
  ): void {
    this.chatApi
      .getConversationMessages(conversationId)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać wiadomości:', err);
          return of([]);
        })
      )
      .subscribe((messages) => {
        const mapped = messages.map((message) => this.mapMessage(message));
        if (target === 'direct') {
          this.conversations[targetId] = mapped;
        } else {
          this.roomMessages[targetId] = mapped;
        }
        this.updateUnreadIndicators();

        this.refreshLastMessageStatus(target, targetId);

        this.ensureUsersLoaded(
          messages
            .map((message) => message.sender_id)
            .filter((id) => this.currentUserId !== id),
        );
        if (options?.markAsRead ?? true) {
          this.markIncomingMessagesAsRead(messages);
        }
        if (options?.scrollToBottom ?? true) {
          this.shouldScrollToBottom = true;
        }
      });
  }

  private startAutoRefresh(): void {
    if (this.refreshTimerId) {
      clearInterval(this.refreshTimerId);
    }

    this.refreshTimerId = setInterval(() => {
      if (!this.isOpen()) {
        return;
      }
      this.syncConversationState();
    }, 5000);
  }

  private syncConversationState(): void {
    this.loadConversations();
  }

  private refreshActiveConversationMessages(): void {
    if (this.view() === 'conversation') {
      const selectedUser = this.selectedUser();
      if (!selectedUser) return;

      const conversationId = this.directConversationIdByUserId[selectedUser.user_id];
      if (!conversationId) return;

      this.fetchConversationMessages(conversationId, 'direct', selectedUser.user_id, {
        markAsRead: true,
        scrollToBottom: true,
      });
      return;
    }

    if (this.view() === 'room-chat') {
      const selectedRoom = this.selectedRoom();
      if (!selectedRoom) return;

      this.fetchConversationMessages(selectedRoom.id, 'room', selectedRoom.id, {
        markAsRead: true,
        scrollToBottom: true,
      });
    }
  }

  private sendMessageToConversation(
    conversationId: number,
    content: string,
    target: 'direct' | 'room',
    targetId: number,
  ): void {
    this.chatApi
      .sendMessage(conversationId, content)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się wysłać wiadomości:', err);
          return of(null);
        })
      )
      .subscribe((message) => {
        if (!message) return;

        const mapped = this.mapMessage(message);
        if (target === 'direct') {
          if (!this.conversations[targetId]) this.conversations[targetId] = [];
          this.conversations[targetId] = [...this.conversations[targetId], mapped];
        } else {
          if (!this.roomMessages[targetId]) this.roomMessages[targetId] = [];
          this.roomMessages[targetId] = [...this.roomMessages[targetId], mapped];
        }
        this.updateUnreadIndicators();

        this.refreshLastMessageStatus(target, targetId);

        this.websocket.sendMessage(
          conversationId,
          message.id,
          message.sender_id,
          message.content,
          message.created_at,
        );

        this.messageInput = '';
        this.shouldScrollToBottom = true;
      });
  }

  private setupWebSocketListeners(): void {
    this.wsSubscriptions.push(
      this.websocket.messageReceived$.subscribe((event) => {
        const ownMessage = this.currentUserId !== null && event.sender_id === this.currentUserId;
        this.mergeSocketMessage(event.conversation_id, event, ownMessage);
      }),
    );

    this.wsSubscriptions.push(
      this.websocket.userTyping$.subscribe((event) => {
        // Placeholder for typing UI state.
        void event;
      }),
    );
  }

  private ensureConversationJoined(conversationId: number): void {
    if (this.joinedConversationIds.has(conversationId)) {
      return;
    }

    this.websocket.joinConversation(conversationId);
    this.joinedConversationIds.add(conversationId);
  }

  private mergeSocketMessage(
    conversationId: number,
    message: {
      message_id: number;
      sender_id: number;
      content: string;
      created_at: string;
    },
    isOwn: boolean,
  ): void {
    const directUserId = Object.entries(this.directConversationIdByUserId)
      .find(([, id]) => id === conversationId)?.[0];

    const sender = this.usersById[message.sender_id];
    const mapped: ChatMessage = {
      id: message.message_id,
      senderId: isOwn ? 'me' : message.sender_id,
      senderName: isOwn ? this.currentUserName : (sender ? `${sender.first_name} ${sender.last_name}`.trim() : `Użytkownik #${message.sender_id}`),
      content: message.content,
      timestamp: new Date(message.created_at),
      isOwn,
      isRead: false,
    };

    if (directUserId) {
      const targetId = Number(directUserId);
      const existing = this.conversations[targetId] || [];
      if (existing.some((item) => item.id === mapped.id)) {
        return;
      }
      this.conversations[targetId] = [...existing, mapped];
      this.refreshLastMessageStatus('direct', targetId);
    } else {
      const existing = this.roomMessages[conversationId] || [];
      if (existing.some((item) => item.id === mapped.id)) {
        return;
      }
      this.roomMessages[conversationId] = [...existing, mapped];
      this.refreshLastMessageStatus('room', conversationId);
    }

    this.updateUnreadIndicators();
    this.shouldScrollToBottom = true;
  }

  private refreshLastMessageStatus(target: 'direct' | 'room', targetId: number): void {
    const messages = target === 'direct' ? this.conversations[targetId] : this.roomMessages[targetId];
    if (!messages || messages.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];
    if (lastMessage.isOwn) {
      return;
    }

    this.chatApi
      .getMessageStatus(lastMessage.id)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać statusu wiadomości:', err);
          return of(null);
        })
      )
      .subscribe((status) => {
        if (!status) return;

        const currentMessages = target === 'direct' ? this.conversations[targetId] : this.roomMessages[targetId];
        if (!currentMessages || currentMessages.length === 0) return;
        const currentLastMessage = currentMessages[currentMessages.length - 1];

        if (currentLastMessage.id !== status.message_id || currentLastMessage.isRead === status.read) {
          return;
        }

        const updatedMessages = [
          ...currentMessages.slice(0, -1),
          {
            ...currentLastMessage,
            isRead: status.read,
          },
        ];

        if (target === 'direct') {
          this.conversations[targetId] = updatedMessages;
        } else {
          this.roomMessages[targetId] = updatedMessages;
        }
        this.updateUnreadIndicators();
      });
  }

  private updateUnreadIndicators(): void {
    const hadUnread = this.hasUnreadMessages();
    const hasUnread = this.collectionHasUnread(this.conversations) || this.collectionHasUnread(this.roomMessages);

    this.hasUnreadMessages.set(hasUnread);
    if (!hasUnread) {
      this.showUnreadToast.set(false);
      if (this.unreadToastTimerId) {
        clearTimeout(this.unreadToastTimerId);
        this.unreadToastTimerId = null;
      }
      return;
    }

    if (!hadUnread && hasUnread) {
      this.showUnreadToast.set(true);
      if (this.unreadToastTimerId) {
        clearTimeout(this.unreadToastTimerId);
      }
      this.unreadToastTimerId = setTimeout(() => {
        this.showUnreadToast.set(false);
        this.unreadToastTimerId = null;
      }, 3000);
    }
  }

  private collectionHasUnread(messagesByConversation: Record<number, ChatMessage[]>): boolean {
    return Object.values(messagesByConversation).some((messages) =>
      messages.some((message) => !message.isOwn && !message.isRead),
    );
  }

  private markIncomingMessagesAsRead(messages: MessageApiResponse[]): void {
    const unreadIncoming = messages.filter(
      (message) =>
        this.currentUserId !== null &&
        message.sender_id !== this.currentUserId &&
        !message.is_read,
    );

    unreadIncoming.forEach((message) => {
      this.chatApi
        .markMessageAsRead(message.id)
        .pipe(
          catchError((err) => {
            console.error('Nie udało się oznaczyć wiadomości jako przeczytanej:', err);
            return of(null);
          })
        )
        .subscribe();
    });
  }

  private mapMessage(message: MessageApiResponse): ChatMessage {
    const isOwn = this.currentUserId !== null && message.sender_id === this.currentUserId;
    const sender = this.usersById[message.sender_id];
    return {
      id: message.id,
      senderId: isOwn ? 'me' : message.sender_id,
      senderName: isOwn ? this.currentUserName : (sender ? `${sender.first_name} ${sender.last_name}`.trim() : `Użytkownik #${message.sender_id}`),
      content: message.content,
      timestamp: new Date(message.created_at),
      isOwn,
      isRead: message.is_read,
    };
  }

  private toChatUser(user: SearchUserResponse): ChatUser {
    return {
      user_id: user.user_id,
      first_name: user.first_name,
      last_name: user.last_name,
    };
  }

  private upsertUsers(users: ChatUser[]): void {
    users.forEach((user) => {
      this.usersById[user.user_id] = user;
    });

    this.directContacts = this.directContacts.map((contact) => this.usersById[contact.user_id] || contact);
    this.availableUsers = this.availableUsers.map((user) => this.usersById[user.user_id] || user);
    const selected = this.selectedUser();
    if (selected && this.usersById[selected.user_id]) {
      this.selectedUser.set(this.usersById[selected.user_id]);
    }

    this.conversations = this.updateMessageSenderNames(this.conversations);
    this.roomMessages = this.updateMessageSenderNames(this.roomMessages);
  }

  private getOrBuildUser(userId: number): ChatUser {
    const existing = this.usersById[userId];
    if (existing) return existing;
    const fallback: ChatUser = {
      user_id: userId,
      first_name: 'Użytkownik',
      last_name: `#${userId}`,
    };
    this.usersById[userId] = fallback;
    return fallback;
  }

  private ensureUsersLoaded(userIds: number[]): void {
    const uniqueIds = Array.from(new Set(userIds));
    uniqueIds.forEach((userId) => {
      if (
        !userId ||
        this.currentUserId === userId ||
        this.hasResolvedUserName(userId) ||
        this.resolvingUserIds.has(userId)
      ) {
        return;
      }

      this.resolvingUserIds.add(userId);
      this.chatApi
        .getUserNameById(userId)
        .pipe(
          catchError((err) => {
            console.error(`Nie udało się pobrać danych użytkownika ${userId}:`, err);
            return of(null);
          })
        )
        .subscribe((user) => {
          this.resolvingUserIds.delete(userId);
          if (!user) return;
          this.upsertUsers([this.toChatUser(user)]);
        });
    });
  }

  private hasResolvedUserName(userId: number): boolean {
    const user = this.usersById[userId];
    if (!user) {
      return false;
    }
    return !(user.first_name === 'Użytkownik' && user.last_name.startsWith('#'));
  }

  private updateMessageSenderNames(
    messagesByConversation: Record<number, ChatMessage[]>,
  ): Record<number, ChatMessage[]> {
    const updated: Record<number, ChatMessage[]> = {};

    Object.entries(messagesByConversation).forEach(([key, messages]) => {
      updated[Number(key)] = messages.map((message) => {
        if (message.isOwn || message.senderId === 'me') {
          return message;
        }

        const sender = this.usersById[message.senderId];
        if (!sender) {
          return message;
        }

        const senderName = `${sender.first_name} ${sender.last_name}`.trim();
        if (message.senderName === senderName) {
          return message;
        }

        return {
          ...message,
          senderName,
        };
      });
    });

    return updated;
  }
}
