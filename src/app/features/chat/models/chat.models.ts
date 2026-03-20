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
  isRead: boolean;
}

export interface SearchUserResponse {
  user_id: number;
  imie: string;
  nazwisko: string;
}

export interface AuthMeResponse {
  user_id: number;
  login: string;
  email: string;
  role: string;
  dzial: string;
}

export interface ConversationListResponse {
  id: number;
  type: 'direct' | 'group' | string;
  name?: string | null;
  created_at: string;
  member_ids: number[];
}

export interface MessageApiResponse {
  id: number;
  sender_id: number;
  content: string;
  created_at: string;
  delivered_at: string | null;
  is_read: boolean;
  read_at: string | null;
}

export interface MessageStatusApiResponse {
  message_id: number;
  sent: boolean;
  delivered: boolean;
  read: boolean;
  sent_at: string;
  delivered_at: string | null;
  read_at: string | null;
}

export interface StartConversationResponse {
  conversation_id: number;
  user_a_id: number;
  user_b_id: number;
}

export interface CreateGroupResponse {
  conversation_id: number;
  name: string;
  members: number[];
}

export type ActiveTab = 'messages' | 'rooms';

export type ChatView = 'contacts' | 'conversation' | 'rooms' | 'room-chat' | 'create-room';
