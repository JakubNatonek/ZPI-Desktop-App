import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';

import { AuthService } from '../services/auth.service';

type RoomType =
  | 'informatyczna'
  | 'wykladowa'
  | 'mechatroniczna'
  | 'elektrotechniczna'
  | 'laboratoryjna'
  | 'inna';

interface RoomTypeOption {
  value: RoomType;
  label: string;
}

@Component({
  selector: 'app-sale',
  templateUrl: './sale.page.html',
  styleUrls: ['./sale.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule, FormsModule],
})
export class SalePage implements OnInit {
  roomNumber = '';
  seatsCount: number | null = null;
  roomType: RoomType = 'informatyczna';
  specialEquipment = '';
  submitMessage = '';

  readonly roomTypeOptions: RoomTypeOption[] = [
    { value: 'informatyczna', label: 'Sala informatyczna' },
    { value: 'wykladowa', label: 'Sala wykładowa' },
    { value: 'mechatroniczna', label: 'Sala mechatroniczna' },
    { value: 'elektrotechniczna', label: 'Sala elektrotechniczna' },
    { value: 'laboratoryjna', label: 'Sala laboratoryjna' },
    { value: 'inna', label: 'Inny typ sali' },
  ];

  readonly activitiesByRoomType: Record<RoomType, string[]> = {
    informatyczna: [
      'Programowanie',
      'Bazy danych',
      'Sieci komputerowe',
      'Systemy operacyjne',
      'Cyberbezpieczenstwo',
    ],
    wykladowa: [
      'Wyklady ogolne',
      'Seminaria',
      'Prezentacje projektow',
      'Egzaminy pisemne',
    ],
    mechatroniczna: [
      'Podstawy mechatroniki',
      'Automatyka i robotyka',
      'Programowanie sterownikow PLC',
      'Diagnostyka ukladow',
    ],
    elektrotechniczna: [
      'Elektrotechnika',
      'Maszyny elektryczne',
      'Pomiary elektryczne',
      'Uklady energoelektroniczne',
    ],
    laboratoryjna: [
      'Laboratoria projektowe',
      'Zajecia praktyczne',
      'Warsztaty zespolowe',
      'Prototypowanie',
    ],
    inna: [
      'Zajecia specjalistyczne',
      'Konsultacje',
      'Warsztaty',
    ],
  };

  selectedActivities: Record<string, boolean> = {};

  constructor(
    private auth: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.resetSelectedActivities();
  }

  get activityOptions(): string[] {
    return this.activitiesByRoomType[this.roomType] ?? [];
  }

  onRoomTypeChange(): void {
    this.resetSelectedActivities();
  }

  onSubmit(form: NgForm): void {
    if (!form.valid) {
      this.submitMessage = 'Uzupelnij wszystkie wymagane pola formularza.';
      return;
    }

    const chosenActivities = this.getChosenActivities();

    if (chosenActivities.length === 0) {
      this.submitMessage = 'Wybierz przynajmniej jeden rodzaj zajęć dla sali.';
      return;
    }

    this.submitMessage = 'Gotowe! (przypomnienie o podłączenia do backendu)';
  }

  resetForm(form: NgForm): void {
    form.resetForm({
      roomNumber: '',
      seatsCount: null,
      roomType: 'informatyczna',
      specialEquipment: '',
    });

    this.roomType = 'informatyczna';
    this.submitMessage = '';
    this.resetSelectedActivities();
  }

  private resetSelectedActivities(): void {
    const nextSelectionState: Record<string, boolean> = {};

    for (const activity of this.activityOptions) {
      nextSelectionState[activity] = false;
    }

    this.selectedActivities = nextSelectionState;
  }

  private getChosenActivities(): string[] {
    return this.activityOptions.filter((activity) => !!this.selectedActivities[activity]);
  }
}
