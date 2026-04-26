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
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, catchError, of, lastValueFrom, finalize } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { WebSocketService } from '../../core/services/websocket.service';
import { CryptoService } from '../../core/services/crypto.service';
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
  private cryptoSvc = inject(CryptoService);

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
  private unreadToastTimerId: ReturnType<typeof setTimeout> | null = null;
  private aesKey: CryptoKey | null = null;
  private exportedAesKeyBase64: string | null = null;
  private usersById: Record<number, ChatUser> = {};
  private directConversationIdByUserId: Record<number, number> = {};
  private resolvingUserIds = new Set<number>();
  private joinedConversationIds = new Set<number>();
  private wsSubscriptions: Subscription[] = [];

  // Wyszukiwanie
  searchQuery = '';
  searchResults = signal<ChatUser[]>([]);
  isSearching = signal(false);
  isEncrypting = signal(false);
  hasUnreadMessages = signal(false);
  showUnreadToast = signal(false);
  private searchSubject = new Subject<string>();
  private searchSubscription!: Subscription;
  directContacts: ChatUser[] = [];
  availableUsers: ChatUser[] = [];
  rooms: ChatRoom[] = [];
  conversations: Record<number, ChatMessage[]> = {};
  roomMessages: Record<number, ChatMessage[]> = {};
  isLoadingMore = false;

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

    this.websocket.connect();
    this.setupWebSocketListeners();
    void this.initCryptoKey();
  }

  ngOnDestroy(): void {
    if (this.searchSubscription) {
      this.searchSubscription.unsubscribe();
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

  private async initCryptoKey(): Promise<void> {
    try {
      this.aesKey = await this.cryptoSvc.generateAesKey();
      this.exportedAesKeyBase64 = await this.cryptoSvc.exportKeyToBase64(this.aesKey);
      console.log('AES key generated (base64):', this.exportedAesKeyBase64);
    } catch (err) {
      console.error('Błąd podczas generowania klucza AES:', err);
    }
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
        // Fetch all messages initially or after load
        if (this.currentUserId) {
          this.fetchAllMessages();
        }
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
      // ensure we have recipient's public key cached even when conversation already exists
      const user = this.getOrBuildUser(userId);
      if (!user.public_key) {
        this.chatApi
          .getUserPublicKeyById(userId)
          .pipe(
            catchError((err) => {
              console.error(`Nie udało się pobrać klucza publicznego użytkownika ${userId}:`, err);
              return of(null);
            })
          )
          .subscribe((res) => {
            if (!res) return;
            if (res.public_key) {
              user.public_key = res.public_key;
              console.log(`Public key for user ${userId}:`, res.public_key);
            } else {
              console.log(`No public key available for user ${userId}`);
            }
          });
      }
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
        // cache public key returned from startConversation
        if (response.public_key) {
          user.public_key = response.public_key;
          console.log(`Public key for user ${userId}:`, response.public_key);
        }

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
    options?: { markAsRead?: boolean; scrollToBottom?: boolean; beforeId?: number },
  ): void {
    this.chatApi
      .getConversationMessages(conversationId, options?.beforeId)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać wiadomości:', err);
          return of([]);
        }),
        finalize(() => {
          if (options?.beforeId) {
            this.isLoadingMore = false;
          }
        })
      )
      .subscribe((messages) => {
        console.log('Raw messages from backend (conversation):', messages);

        const container = this.messagesContainer?.nativeElement;
        const previousScrollHeight = container ? container.scrollHeight : 0;
        const previousScrollTop = container ? container.scrollTop : 0;

        // Asynchronously decrypt any encrypted messages, then map
        (async () => {
          const mappedPromises = messages.map(async (message) => {
            const decrypted = await this.decryptApiMessageContent(message);
            const msgCopy = { ...message, content: decrypted } as MessageApiResponse;
            return this.mapMessage(msgCopy);
          });

          const mapped = await Promise.all(mappedPromises);
          if (target === 'direct') {
            if (options?.beforeId) {
              this.conversations[targetId] = [...mapped, ...(this.conversations[targetId] || [])];
              // Restore scroll position
              setTimeout(() => {
                if (this.messagesContainer?.nativeElement) {
                  const el = this.messagesContainer.nativeElement;
                  el.scrollTop = el.scrollHeight - previousScrollHeight + previousScrollTop;
                }
              }, 0);
            } else {
              this.conversations[targetId] = mapped;
            }
          } else {
            if (options?.beforeId) {
              this.roomMessages[targetId] = [...mapped, ...(this.roomMessages[targetId] || [])];
              // Restore scroll position
              setTimeout(() => {
                if (this.messagesContainer?.nativeElement) {
                  const el = this.messagesContainer.nativeElement;
                  el.scrollTop = el.scrollHeight - previousScrollHeight + previousScrollTop;
                }
              }, 0);
            } else {
              this.roomMessages[targetId] = mapped;
            }
          }

          this.updateUnreadIndicators();
          this.refreshLastMessageStatus(target, targetId);
        })();

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

  onScroll(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.scrollTop <= 50) {
      this.loadMoreMessages();
    }
  }

  private loadMoreMessages(): void {
    if (this.isLoadingMore) return;
    
    let conversationId: number | null = null;
    let targetId: number | null = null;
    let target: 'direct' | 'room' | null = null;

    if (this.view() === 'conversation') {
      const selectedUser = this.selectedUser();
      if (!selectedUser) return;
      conversationId = this.directConversationIdByUserId[selectedUser.user_id];
      targetId = selectedUser.user_id;
      target = 'direct';
    } else if (this.view() === 'room-chat') {
      const selectedRoom = this.selectedRoom();
      if (!selectedRoom) return;
      conversationId = selectedRoom.id;
      targetId = selectedRoom.id;
      target = 'room';
    }

    if (!conversationId || !targetId || !target) return;

    const messages = target === 'direct' ? this.conversations[targetId] : this.roomMessages[targetId];
    if (!messages || messages.length === 0) return;

    const oldestMessageId = messages[0].id;
    this.isLoadingMore = true;

    this.fetchConversationMessages(conversationId, target, targetId, {
      markAsRead: false,
      scrollToBottom: false,
      beforeId: oldestMessageId
    });
  }



  private async decryptApiMessageContent(message: MessageApiResponse): Promise<string> {
    // Try multiple field names from backend / payload formats
    try {
      let encryptedB64: string | undefined | null = (message as any).encrypted_message ?? (message as any).ciphertext ?? null;
      let wrappedB64: string | undefined | null = (message as any).encrypted_aes_key ?? (message as any).wrapped_key ?? null;
      let ivB64: string | undefined | null = (message as any).iv ?? null;

      // If not present on top-level fields, try parsing content as JSON
      if ((!encryptedB64 || !wrappedB64 || !ivB64) && message.content) {
        try {
          const parsed = JSON.parse(message.content as string);
          if (parsed && typeof parsed === 'object') {
            encryptedB64 = encryptedB64 ?? parsed.encrypted_message ?? parsed.ciphertext ?? parsed.ciphertext;
            wrappedB64 = wrappedB64 ?? parsed.encrypted_aes_key ?? parsed.wrapped_key ?? parsed.wrappedKey ?? null;
            ivB64 = ivB64 ?? parsed.iv ?? null;
          }
        } catch (e) {
          // not JSON — ignore
        }
      }

      if (encryptedB64 && wrappedB64 && ivB64) {
        try {
          // Build list of wrapped-key candidates. wrappedB64 may be:
          // - a base64 string
          // - a JSON string containing a map { userId: wrappedB64, ... }
          // - already an object map
          const candidates: string[] = [];

          const tryParseWrapped = (w: any) => {
            if (!w) return;
            if (typeof w === 'string') {
              const s = w.trim();
              if ((s.startsWith('{') || s.startsWith('['))) {
                try {
                  const parsed = JSON.parse(s);
                  if (parsed && typeof parsed === 'object') return parsed;
                } catch (e) {
                  // not JSON
                }
              }
              return null;
            }
            if (typeof w === 'object') return w;
            return null;
          };

          const parsedWrapped = tryParseWrapped(wrappedB64) as any | null;
          if (parsedWrapped && typeof parsedWrapped === 'object') {
            // Prefer wrapped key for current user if present
            if (this.currentUserId != null) {
              const v = parsedWrapped[String(this.currentUserId)] ?? parsedWrapped[this.currentUserId];
              if (typeof v === 'string') candidates.push(v);
            }
            // push any string values as fallback
            for (const v of Object.values(parsedWrapped)) {
              if (typeof v === 'string') candidates.push(v);
            }
          } else if (typeof wrappedB64 === 'string') {
            candidates.push(wrappedB64 as string);
          }

          // Deduplicate candidates
          const uniq = [...new Set(candidates)];

          for (const cand of uniq) {
            try {
              const aesKey = await this.cryptoSvc.unwrapAESKey(cand);
              const plain = await this.cryptoSvc.decryptText(aesKey, ivB64 as string, encryptedB64 as string);
              return plain;
            } catch (e) {
              // try next candidate
              console.warn('Candidate unwrap/decrypt failed, trying next:', e);
              continue;
            }
          }

          console.warn('Failed to decrypt with any wrapped_key candidate');
        } catch (e) {
          console.warn('Failed to decrypt message payload:', e);
        }
      }
    } catch (e) {
      console.warn('Error while attempting to decrypt message:', e);
    }

    // Fallback to raw content (may be string or null)
    return message.content ?? '';
  }



  private fetchAllMessages(): void {
    if (!this.currentUserId) return;
    this.chatApi
      .getMessagesForUser(this.currentUserId)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się pobrać zbiorczo wiadomości:', err);
          return of([]);
        })
      )
      .subscribe((messages) => {
        console.log('Raw messages from backend (all):', messages);

        // Temporary auto-test: unwrap/decrypt first message and log outputs
        if (Array.isArray(messages) && messages.length > 0) {
          (async () => {
            try {
              const m0 = messages[0] as MessageApiResponse;
              console.log('=== AUTO DECRYPT TEST START ===');
              console.log('message.iv (base64):', m0.iv);
              // log wrapped key length and stored key presence to avoid regenerating keys
              const wrappedB64 = m0.encrypted_aes_key ?? m0.wrapped_key ?? '';
              const wrappedLen = await this.cryptoSvc.getWrappedKeyByteLength(wrappedB64);
              console.log('wrapped bytes:', wrappedLen);
              const hasJwk = await this.cryptoSvc.hasPrivateJwk();
              const hasEnc = await this.cryptoSvc.hasEncryptedPrivate();
              console.log('private JWK present in IndexedDB?', hasJwk, 'encrypted private present?', hasEnc);
              console.log('stored public JWK (localStorage)?', this.cryptoSvc.getStoredPublicJwk());
              try {
                const cbytes = new Uint8Array(this.cryptoSvc.base64ToArrayBuffer(m0.encrypted_message ?? (m0.ciphertext as any) ?? ''));
                console.log('ciphertext bytes:', cbytes.byteLength);
              } catch (e) {
                console.log('ciphertext bytes: <invalid base64>');
              }
              try {
                const ivbytes = new Uint8Array(this.cryptoSvc.base64ToArrayBuffer(m0.iv ?? ''));
                console.log('iv bytes:', ivbytes.byteLength);
              } catch (e) {
                console.log('iv bytes: <invalid base64>');
              }

              // If private JWK is present, use it; if only encrypted private exists we cannot decrypt here.
              let priv: CryptoKey | null = null;
              if (hasJwk) {
                const kp = await this.cryptoSvc.ensureRSAKeyPair();
                priv = kp.privateKey;
              } else if (hasEnc) {
                console.warn('Private key is stored encrypted (rsa_private_encrypted); cannot unwrap without local AES key. Skipping unwrap.');
              } else {
                console.warn('No stored private key found; ensure client has the correct private key before attempting unwrap. Skipping unwrap.');
              }

              if (priv) {
                // RSA unwrap test (logs separator, TEST and raw AES length)
                const wrappedTop = m0.encrypted_aes_key ?? m0.wrapped_key ?? '';
                const candidates: string[] = [];
                try {
                  if (typeof wrappedTop === 'string') {
                    const s = wrappedTop.trim();
                    if (s.startsWith('{') || s.startsWith('[')) {
                      try {
                        const parsed = JSON.parse(s);
                        if (parsed && typeof parsed === 'object') {
                          if (this.currentUserId != null) {
                            const v = parsed[String(this.currentUserId)] ?? parsed[this.currentUserId];
                            if (typeof v === 'string') candidates.push(v);
                          }
                          for (const v of Object.values(parsed)) if (typeof v === 'string') candidates.push(v);
                        }
                      } catch (e) {
                        // not JSON
                      }
                    } else {
                      candidates.push(wrappedTop);
                    }
                  } else if (typeof wrappedTop === 'object' && wrappedTop !== null) {
                    const obj = wrappedTop as any;
                    if (this.currentUserId != null) {
                      const v = obj[String(this.currentUserId)] ?? obj[this.currentUserId];
                      if (typeof v === 'string') candidates.push(v);
                    }
                    for (const v of Object.values(obj)) if (typeof v === 'string') candidates.push(v);
                  }
                } catch (e) {
                  console.warn('Error while parsing wrapped key candidates:', e);
                }

                let rawAes: ArrayBuffer | null = null;
                for (const cand of [...new Set(candidates)]) {
                  try {
                    rawAes = await this.cryptoSvc.rsaDecryptWrappedAesKeyForTest(cand, priv);
                    break;
                  } catch (e) {
                    console.warn('rsa unwrap candidate failed, trying next:', e);
                    continue;
                  }
                }

                if (rawAes) {
                  const aesKey = await window.crypto.subtle.importKey('raw', rawAes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
                  await this.cryptoSvc.aesDecryptForTest(m0.encrypted_message ?? (m0.ciphertext as any) ?? '', m0.iv ?? '', aesKey);
                } else {
                  console.warn('Auto unwrap test: no wrapped_key candidate decrypted successfully');
                }
              }

              console.log('=== AUTO DECRYPT TEST END ===');
            } catch (e) {
              console.error('Auto decrypt test failed:', e);
            }
          })();
        }
        // Group by conversation_id
        const byConv: Record<number, MessageApiResponse[]> = {};
        messages.forEach((m) => {
          const convId = (m as any).conversation_id;
          if (convId == null) return;
          if (!byConv[convId]) byConv[convId] = [];
          byConv[convId].push(m);
        });

        (async () => {
          for (const [convIdStr, msgs] of Object.entries(byConv)) {
            const convId = Number(convIdStr);
            const mapped = await Promise.all(
              msgs.map(async (msg) => {
                const dec = await this.decryptApiMessageContent(msg);
                return this.mapMessage({ ...msg, content: dec } as MessageApiResponse);
              }),
            );
            mapped.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

            const directEntry = Object.entries(this.directConversationIdByUserId).find(([, id]) => id === convId);
            if (directEntry) {
              const targetId = Number(directEntry[0]);
              this.conversations[targetId] = mapped;
            } else {
              this.roomMessages[convId] = mapped;
            }
          }

          this.updateUnreadIndicators();
        })();
      });
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

  private async sendMessageToConversation(
    conversationId: number,
    content: string,
    target: 'direct' | 'room',
    targetId: number,
  ): Promise<void> {
    this.isEncrypting.set(true);
    // Default: plaintext payload
        let payloadStr = content.trim();

    if (this.aesKey && target === 'direct') {
      const recipientId = targetId;
      try {
        // 1) Encrypt message with AES
        const { iv, ciphertext } = await this.cryptoSvc.encryptText(this.aesKey, content);
        console.log('Zaszyfrowana wiadomość (base64):', ciphertext);
        console.log('IV (base64):', iv);

        // 2) Ensure we have recipient public key (cached or fetch)
        let recipientPubPem: string | null = this.usersById[recipientId]?.public_key ?? null;
        if (!recipientPubPem) {
          console.log('No recipient public key cached; fetching from API.');
          const res = await lastValueFrom(
            this.chatApi.getUserPublicKeyById(recipientId).pipe(
              catchError((err) => {
                console.error('Błąd pobierania publicznego klucza odbiorcy:', err);
                return of(null as any);
              }),
            ),
          );
          if (res && res.public_key) {
            recipientPubPem = res.public_key;
            if (!this.usersById[recipientId]) {
              this.usersById[recipientId] = { user_id: recipientId, first_name: 'Użytkownik', last_name: `#${recipientId}` };
            }
            this.usersById[recipientId].public_key = recipientPubPem;
            console.log('Fetched recipient public key; attempting to wrap AES key.');
          }
        } else {
          console.log('Recipient public key found in cache, wrapping AES key.');
        }

        if (!recipientPubPem) {
          console.warn('No recipient public key available; sending plaintext instead.');
        } else {
          // 3) Export raw AES key and wrap it with recipient RSA key
          const raw = await this.cryptoSvc.exportRawKey(this.aesKey as CryptoKey);
          try {
            const rawB64 = this.cryptoSvc.arrayBufferToBase64(raw);
            console.log('Exported AES raw key (base64):', rawB64);
          } catch (e) {
            console.log('Exported AES raw (ArrayBuffer) length:', raw.byteLength);
          }

          const wrappedB64 = await this.cryptoSvc.wrapAESKeyForRecipient(raw, recipientPubPem);
          console.log('Wrapped AES key for recipient (base64):', wrappedB64);

          // Also wrap AES key for sender (so sender can decrypt their own message)
          let wrappedForSender: string | null = null;
          try {
            if (this.currentUserId != null) {
              const myPubPem = await this.cryptoSvc.getPublicPem();
              if (myPubPem) {
                wrappedForSender = await this.cryptoSvc.wrapAESKeyForRecipient(raw, myPubPem);
                console.log('Wrapped AES key for sender (base64):', wrappedForSender);
              }
            }
          } catch (e) {
            console.warn('Failed to wrap AES key for sender:', e);
            wrappedForSender = null;
          }

          // 4) Build encrypted payload and send as JSON string in `content` field
          // Store wrapped keys as a JSON string mapping userId -> wrappedKey (base64)
          const wrappedMap: Record<string, string> = {};
          wrappedMap[String(recipientId)] = wrappedB64;
          if (wrappedForSender) wrappedMap[String(this.currentUserId)] = wrappedForSender;

          const payloadObj = {
            encrypted: true,
            algo: 'AES-GCM',
            iv,
            ciphertext,
            // store JSON string so backend saves it as string in wrapped_key column
            wrapped_key: JSON.stringify(wrappedMap),
            wrap_algo: 'RSA-OAEP',
          } as const;

          payloadStr = JSON.stringify(payloadObj);
          console.log('Sending encrypted payload to backend (object):', payloadObj);
          console.log('Sending encrypted payload to backend (string):', payloadStr);
        }
      } catch (err) {
        console.error('Błąd podczas szyfrowania/owijania klucza; wyślę plaintext:', err);
        payloadStr = content;
      }
    }

    this.chatApi
      .sendMessage(conversationId, payloadStr)
      .pipe(
        catchError((err) => {
          console.error('Nie udało się wysłać wiadomości:', err);
          return of(null);
        }),
        finalize(() => this.isEncrypting.set(false)),
      )
      .subscribe((message) => {
        if (!message) return;

        let mapped = this.mapMessage(message);
        // If this is our own message, prefer showing the original plaintext
        if (mapped.isOwn && content) {
          mapped = { ...mapped, content };
        }

        if (target === 'direct') {
          if (!this.conversations[targetId]) this.conversations[targetId] = [];
          const idx = this.conversations[targetId].findIndex((m) => m.id === mapped.id);
          if (idx !== -1) {
            const current = this.conversations[targetId];
            this.conversations[targetId] = [...current.slice(0, idx), mapped, ...current.slice(idx + 1)];
          } else {
            this.conversations[targetId] = [...this.conversations[targetId], mapped];
          }
        } else {
          if (!this.roomMessages[targetId]) this.roomMessages[targetId] = [];
          const idx = this.roomMessages[targetId].findIndex((m) => m.id === mapped.id);
          if (idx !== -1) {
            const current = this.roomMessages[targetId];
            this.roomMessages[targetId] = [...current.slice(0, idx), mapped, ...current.slice(idx + 1)];
          } else {
            this.roomMessages[targetId] = [...this.roomMessages[targetId], mapped];
          }
        }
        this.updateUnreadIndicators();

        this.refreshLastMessageStatus(target, targetId);

        this.websocket.sendMessage(
          conversationId,
          message.id,
          message.sender_id,
          payloadStr,
          message.created_at,
        );

        this.messageInput = '';
        this.shouldScrollToBottom = true;
      });
  }

  private setupWebSocketListeners(): void {
    this.wsSubscriptions.push(
      this.websocket.isConnected$.subscribe((connected) => {
        if (connected) {
          console.log('[Chat] WebSocket connected/reconnected, fetching fallback data...');
          this.syncConversationState();
          if (this.currentUserId) {
            this.fetchAllMessages();
          }
        }
      })
    );

    this.wsSubscriptions.push(
      this.websocket.messageReceived$.subscribe((event) => {
        const ownMessage = this.currentUserId !== null && event.sender_id === this.currentUserId;
        void this.mergeSocketMessage(event.conversation_id, event, ownMessage);
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

  private async mergeSocketMessage(
    conversationId: number,
    message: {
      message_id: number;
      sender_id: number;
      content: string;
      created_at: string;
    },
    isOwn: boolean,
  ): Promise<void> {
    const directUserId = Object.entries(this.directConversationIdByUserId)
      .find(([, id]) => id === conversationId)?.[0];

    const sender = this.usersById[message.sender_id];
    const displayContent = await this.decryptApiMessageContent({
      id: message.message_id,
      sender_id: message.sender_id,
      conversation_id: conversationId,
      content: message.content,
      ciphertext: undefined,
      iv: undefined,
      wrapped_key: undefined,
      encrypted_message: undefined,
      encrypted_aes_key: undefined,
      created_at: message.created_at,
      delivered_at: null,
      is_read: false,
      read_at: null,
    } as MessageApiResponse);

    const mapped: ChatMessage = {
      id: message.message_id,
      senderId: isOwn ? 'me' : message.sender_id,
      senderName: isOwn ? this.currentUserName : (sender ? `${sender.first_name} ${sender.last_name}`.trim() : `Użytkownik #${message.sender_id}`),
      content: displayContent ?? '',
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
    // If content is empty but encrypted fields are present, show a placeholder.
    let displayContent = message.content ?? '';
    try {
      if (!displayContent) {
        const hasEncrypted = !!(
          (message as any).encrypted_message ||
          (message as any).ciphertext ||
          (message as any).wrapped_key ||
          (message as any).encrypted_aes_key
        );
        if (hasEncrypted) displayContent = '[zaszyfrowana wiadomość]';
      } else if (typeof displayContent === 'string' && displayContent.trim().startsWith('{')) {
        const lc = displayContent.toLowerCase();
        if (lc.includes('"ciphertext"') || lc.includes('"encrypted"') || lc.includes('"wrapped_key"') || lc.includes('"encrypted_aes_key"')) {
          displayContent = '[zaszyfrowana wiadomość]';
        }
      }
    } catch (e) {
      void e;
    }

    return {
      id: message.id,
      senderId: isOwn ? 'me' : message.sender_id,
      senderName: isOwn ? this.currentUserName : (sender ? `${sender.first_name} ${sender.last_name}`.trim() : `Użytkownik #${message.sender_id}`),
      content: displayContent,
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
