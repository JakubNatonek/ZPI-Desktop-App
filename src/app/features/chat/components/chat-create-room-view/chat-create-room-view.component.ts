import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ChatUser } from '../../models/chat.models';

@Component({
  selector: 'app-chat-create-room-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-create-room-view.component.html',
})
export class ChatCreateRoomViewComponent {
  @Input({ required: true }) newRoomName = '';
  @Input({ required: true }) newRoomMembers: number[] = [];
  @Input({ required: true }) availableUsers: ChatUser[] = [];
  @Input({ required: true }) isMemberSelected!: (userId: number) => boolean;
  @Input({ required: true }) getInitials!: (user: ChatUser) => string;

  @Output() newRoomNameChange = new EventEmitter<string>();
  @Output() toggleRoomMember = new EventEmitter<number>();
  @Output() createRoom = new EventEmitter<void>();
}
