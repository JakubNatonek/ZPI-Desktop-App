import { Component, OnInit, HostListener, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { addIcons } from 'ionicons';
import { 
  chevronBackOutline, chevronForwardOutline, cloudDownloadOutline, 
  cloudUploadOutline, addOutline, peopleOutline, menuOutline 
} from 'ionicons/icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HomePage implements OnInit {
  private readonly minSidebarWidth = 64;
  private readonly maxSidebarWidth = 500;
  private readonly collapsedThreshold = 160;

  sidebarWidth = signal(280); 
  isResizing = false;
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  hours24 = Array.from({ length: 16 }, (_, i) => i + 6);
  selectedDate: Date = new Date();
  currentMonthName = '';
  currentYear = 0;
  weekDays: any[] = [];
  
  teachers = [
    { name: 'Dr Isabella Storm', progress: 0.9 },
    { name: 'Prof. Adam Nowak', progress: 0.4 }
  ];

  constructor(private router: Router, private auth: AuthService) {
    addIcons({ chevronBackOutline, chevronForwardOutline, cloudDownloadOutline, cloudUploadOutline, addOutline, peopleOutline, menuOutline });
  }

  ngOnInit() {
    this.updateView();
  }

  startResizing(event: MouseEvent | TouchEvent) {
    this.isResizing = true;
    event.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  @HostListener('window:touchmove', ['$event'])
  onMouseMove(event: MouseEvent | TouchEvent) {
    if (!this.isResizing) return;
    const clientX = event instanceof TouchEvent
      ? event.touches[0]?.clientX
      : (event as MouseEvent).clientX;

    if (clientX == null) return;

    // Sidebar is on the right, so width is measured from right edge of viewport.
    const calculatedWidth = window.innerWidth - clientX;
    const clampedWidth = Math.max(this.minSidebarWidth, Math.min(this.maxSidebarWidth, calculatedWidth));
    this.sidebarWidth.set(clampedWidth);
  }

  @HostListener('window:mouseup')
  @HostListener('window:touchend')
  onMouseUp() {
    this.isResizing = false;
  }

  expandSidebar() {
    if (this.sidebarWidth() < this.collapsedThreshold) {
      this.sidebarWidth.set(280);
    }
  }

  
  onDateSelect(event: any) {
    this.selectedDate = new Date(event.detail.value);
    this.updateView();
  }

  goToToday() {
    this.selectedDate = new Date();
    this.updateView();
  }

  updateView() {
    this.generateWeek(this.selectedDate);
    const months = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];
    this.currentMonthName = months[this.selectedDate.getMonth()];
    this.currentYear = this.selectedDate.getFullYear();
  }

  generateWeek(baseDate: Date) {
    const curr = new Date(baseDate);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(curr.setDate(diff));
    const names = ['PN', 'WT', 'ŚR', 'CZ', 'PT', 'SO', 'ND'];
    this.weekDays = [];
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
      this.weekDays.push({
        name: names[i],
        date: nextDay.getDate(),
        isToday: nextDay.toDateString() === new Date().toDateString()
      });
    }
  }

  prevWeek() { this.selectedDate.setDate(this.selectedDate.getDate() - 7); this.updateView(); }
  nextWeek() { this.selectedDate.setDate(this.selectedDate.getDate() + 7); this.updateView(); }

  toggleProfileMenu(event: Event) {
    this.profileMenuEvent = event;
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu() {
    this.isProfileMenuOpen = false;
  }

  async openSettings() {
    this.closeProfileMenu();
    await this.router.navigateByUrl('/profile');
  }

  async logout() {
    this.closeProfileMenu();
    this.auth.logout();
  }

  exportRaply() { console.log('Export...'); }
  importRaply() { console.log('Import...'); }
}
