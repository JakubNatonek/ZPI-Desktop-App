import { Component, signal, inject, ElementRef, ViewChild, AfterViewChecked } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';

export interface ChatUser {
  id: number;
  displayName: string;
  email: string;
}

export interface ChatRoom {
  id: number;
  name: string;
  members: number[];
  createdAt: Date;
}

export interface ChatMessage {
  id: number;
  senderId: number | 'me';
  senderName: string;
  content: string;
  timestamp: Date;
  isOwn: boolean;
}

type ActiveTab = 'messages' | 'rooms';
type ChatView = 'contacts' | 'conversation' | 'rooms' | 'room-chat' | 'create-room';

@Component({
  selector: 'app-chat',
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss'],
  standalone: true,
  imports: [CommonModule, FormsModule],
})
export class ChatComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef<HTMLDivElement>;

  private auth = inject(AuthService);

  isOpen = signal(false);
  activeTab = signal<ActiveTab>('messages');
  view = signal<ChatView>('contacts');
  selectedUser = signal<ChatUser | null>(null);
  selectedRoom = signal<ChatRoom | null>(null);
  newRoomMembers = signal<number[]>([]);

  messageInput = '';
  newRoomName = '';
  private shouldScrollToBottom = false;

  readonly mockUsers: ChatUser[] = [
    { id: 1, displayName: 'Dr. Anna Kowalska', email: 'a.kowalska@ans.local' },
    { id: 2, displayName: 'Prof. Jan Nowak', email: 'j.nowak@ans.local' },
    { id: 3, displayName: 'Dr. Maria Wiśniewska', email: 'm.wisniewska@ans.local' },
    { id: 4, displayName: 'Mgr. Piotr Zając', email: 'p.zajac@ans.local' },
    { id: 5, displayName: 'Dr. hab. Katarzyna Lis', email: 'k.lis@ans.local' },
  ];

  rooms: ChatRoom[] = [
    { id: 1, name: 'Ogólny', members: [1, 2, 3, 4, 5], createdAt: new Date('2026-01-01') },
    { id: 2, name: 'Organizacja zajęć', members: [1, 3], createdAt: new Date('2026-02-10') },
  ];

  conversations: Record<number, ChatMessage[]> = {
    1: [],
    2: [],
    3: [],
    4: [],
    5: [],
  };

  roomMessages: Record<number, ChatMessage[]> = {
    1: [],
    2: [],
    3: [],
  };

  get currentUserName(): string {
    return this.auth.displayName || 'Ja';
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
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
  }

  openConversation(user: ChatUser): void {
    this.selectedUser.set(user);
    this.view.set('conversation');
    if (!this.conversations[user.id]) {
      this.conversations[user.id] = [];
    }
    this.shouldScrollToBottom = true;
  }

  openRoom(room: ChatRoom): void {
    this.selectedRoom.set(room);
    this.view.set('room-chat');
    if (!this.roomMessages[room.id]) {
      this.roomMessages[room.id] = [];
    }
    this.shouldScrollToBottom = true;
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

    const msg: ChatMessage = {
      id: Date.now(),
      senderId: 'me',
      senderName: this.currentUserName,
      content,
      timestamp: new Date(),
      isOwn: true,
    };

    if (this.view() === 'conversation' && this.selectedUser()) {
      const uid = this.selectedUser()!.id;
      if (!this.conversations[uid]) this.conversations[uid] = [];
      this.conversations[uid] = [...this.conversations[uid], msg];
    } else if (this.view() === 'room-chat' && this.selectedRoom()) {
      const rid = this.selectedRoom()!.id;
      if (!this.roomMessages[rid]) this.roomMessages[rid] = [];
      this.roomMessages[rid] = [...this.roomMessages[rid], msg];
    }

    this.messageInput = '';
    this.shouldScrollToBottom = true;
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
    if (!name) return;

    const newRoom: ChatRoom = {
      id: Date.now(),
      name,
      members: [...this.newRoomMembers()],
      createdAt: new Date(),
    };

    this.rooms = [...this.rooms, newRoom];
    this.roomMessages[newRoom.id] = [];
    this.view.set('rooms');
    this.newRoomName = '';
    this.newRoomMembers.set([]);
  }

  getLastMessage(userId: number): string {
    const msgs = this.conversations[userId];
    if (!msgs || msgs.length === 0) return 'Brak wiadomości';
    const last = msgs[msgs.length - 1];
    return last.content.length > 35 ? last.content.slice(0, 35) + '…' : last.content;
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

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
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
      .map(id => this.mockUsers.find(u => u.id === id)?.displayName ?? '')
      .filter(Boolean)
      .slice(0, 3);
    const suffix = room.members.length > 3 ? ` +${room.members.length - 3}` : '';
    return names.join(', ') + suffix;
  }
}
