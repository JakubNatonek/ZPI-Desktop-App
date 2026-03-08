import { Component, OnInit, HostListener, signal } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { addIcons } from 'ionicons';
import { 
  chevronBackOutline, chevronForwardOutline, cloudDownloadOutline, 
  cloudUploadOutline, addOutline, peopleOutline, menuOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class HomePage implements OnInit {
  sidebarWidth = signal(280); 
  isResizing = false;

  hours24 = Array.from({ length: 24 }, (_, i) => i);
  selectedDate: Date = new Date();
  currentMonthName = '';
  currentYear = 0;
  weekDays: any[] = [];
  
  teachers = [
    { name: 'Dr Isabella Storm', progress: 0.9 },
    { name: 'Prof. Adam Nowak', progress: 0.4 }
  ];

  constructor() {
    addIcons({ chevronBackOutline, chevronForwardOutline, cloudDownloadOutline, cloudUploadOutline, addOutline, peopleOutline, menuOutline });
  }

  ngOnInit() {
    this.updateView();
  }

  startResizing(event: MouseEvent) {
    this.isResizing = true;
    event.preventDefault();
  }

  @HostListener('window:mousemove', ['$event'])
  onMouseMove(event: MouseEvent) {
    if (!this.isResizing) return;
    const newWidth = event.clientX;
    if (newWidth > 64 && newWidth < 500) {
      this.sidebarWidth.set(newWidth);
    }
  }

  @HostListener('window:mouseup')
  onMouseUp() {
    this.isResizing = false;
  }

  // KALENDARZ
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
  exportRaply() { console.log('Export...'); }
  importRaply() { console.log('Import...'); }
}