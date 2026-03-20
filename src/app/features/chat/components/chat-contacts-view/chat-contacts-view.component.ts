import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ChatUser } from '../../models/chat.models';

@Component({
  selector: 'app-chat-contacts-view',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-contacts-view.component.html',
})
export class ChatContactsViewComponent {
  @Input({ required: true }) searchQuery = '';
  @Input({ required: true }) searchResults: ChatUser[] = [];
  @Input({ required: true }) isSearching = false;
  @Input({ required: true }) directContacts: ChatUser[] = [];
  @Input({ required: true }) getInitials!: (name: string) => string;
  @Input({ required: true }) getLastMessage!: (userId: number) => string;
  @Input({ required: true }) isLastMessageUnread!: (userId: number) => boolean;

  @Output() searchQueryChange = new EventEmitter<string>();
  @Output() search = new EventEmitter<string>();
  @Output() openConversation = new EventEmitter<ChatUser>();

  onSearchChange(value: string): void {
    this.searchQueryChange.emit(value);
    this.search.emit(value);
  }
}
