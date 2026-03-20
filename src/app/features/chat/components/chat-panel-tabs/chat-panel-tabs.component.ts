import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

import { ActiveTab, ChatView } from '../../models/chat.models';

@Component({
  selector: 'app-chat-panel-tabs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './chat-panel-tabs.component.html',
})
export class ChatPanelTabsComponent {
  @Input({ required: true }) view!: ChatView;
  @Input({ required: true }) activeTab!: ActiveTab;

  @Output() tabChange = new EventEmitter<ActiveTab>();
}
