import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ChatRoom, ChatUser, ChatView } from '../../models/chat.models';

@Component({
  selector: 'app-chat-panel-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-panel-header.component.html',
})
export class ChatPanelHeaderComponent {
  @Input({ required: true }) view!: ChatView;
  @Input() selectedUser: ChatUser | null = null;
  @Input() selectedRoom: ChatRoom | null = null;
  @Input({ required: true }) getInitials!: (name: string) => string;

  @Output() back = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();
}
