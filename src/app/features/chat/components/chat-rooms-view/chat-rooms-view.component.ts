import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ChatRoom } from '../../models/chat.models';

@Component({
  selector: 'app-chat-rooms-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-rooms-view.component.html',
})
export class ChatRoomsViewComponent {
  @Input({ required: true }) rooms: ChatRoom[] = [];
  @Input({ required: true }) getLastRoomMessage!: (roomId: number) => string;

  @Output() showCreateRoom = new EventEmitter<void>();
  @Output() openRoom = new EventEmitter<ChatRoom>();
}
