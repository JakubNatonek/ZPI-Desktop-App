export interface ChatUser {
  user_id: number;
  first_name: string;
  last_name: string;
  public_key?: string | null;
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
  first_name: string;
  last_name: string;
}

export interface PublicKeyResponse {
  user_id: number;
  public_key: string | null;
}

export interface AuthMeResponse {
  user_id: number;
  login: string;
  email: string;
  role: string;
  department: string;
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
  conversation_id?: number;
  content: string | null;
  ciphertext?: string | null;
  iv?: string | null;
  wrapped_key?: string | null;
  encrypted_message?: string | null;
  encrypted_aes_key?: string | null;
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
  public_key: string | null;
}

export interface CreateGroupResponse {
  conversation_id: number;
  name: string;
  members: number[];
}

export type ActiveTab = 'messages' | 'rooms';

export type ChatView = 'contacts' | 'conversation' | 'rooms' | 'room-chat' | 'create-room';
