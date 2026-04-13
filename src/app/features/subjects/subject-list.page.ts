import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { SubjectDto, SubjectsApiService } from '../../core/services/subjects-api.service';

@Component({
  selector: 'app-subject-list',
  templateUrl: './subject-list.page.html',
  styleUrls: ['./subject-list.page.scss'],
  standalone: true,
  imports: [IonicModule, CommonModule],
})
export class SubjectListPage implements OnInit {
  isLoading = false;
  isDeleting = false;
  errorMessage = '';
  subjects: SubjectDto[] = [];
  isProfileMenuOpen = false;
  profileMenuEvent?: Event;

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly subjectsApi: SubjectsApiService,
  ) {}

  ngOnInit(): void {
    if (this.auth.role !== 'admin') {
      this.router.navigateByUrl('/home');
      return;
    }

    this.loadSubjects();
  }

  get userRoleLabel(): string {
    return this.auth.roleLabel;
  }

  createSubject(): void {
    this.router.navigateByUrl('/subjects/new');
  }

  editSubject(subjectId: number): void {
    this.router.navigateByUrl(`/subjects/${subjectId}/edit`);
  }

  deleteSubject(subjectId: number): void {
    if (this.isDeleting) {
      return;
    }

    const accepted = window.confirm('Czy na pewno chcesz usunac ten przedmiot?');
    if (!accepted) {
      return;
    }

    this.isDeleting = true;
    this.errorMessage = '';

    this.subjectsApi
      .deleteSubject(subjectId)
      .pipe(finalize(() => (this.isDeleting = false)))
      .subscribe({
        next: () => this.loadSubjects(),
        error: () => {
          this.errorMessage = 'Nie udalo sie usunac przedmiotu.';
        },
      });
  }

  trackBySubjectId(_: number, subject: SubjectDto): number {
    return subject.id;
  }

  toggleProfileMenu(event: Event): void {
    this.profileMenuEvent = event;
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  closeProfileMenu(): void {
    this.isProfileMenuOpen = false;
  }

  openSettings(): void {
    this.closeProfileMenu();
    this.router.navigateByUrl('/profile');
  }

  logout(): void {
    this.closeProfileMenu();
    this.auth.logout();
  }

  private loadSubjects(): void {
    this.isLoading = true;
    this.errorMessage = '';

    this.subjectsApi
      .getSubjects()
      .pipe(finalize(() => (this.isLoading = false)))
      .subscribe({
        next: (subjects) => {
          this.subjects = subjects;
        },
        error: () => {
          this.errorMessage = 'Nie udalo sie pobrac listy przedmiotow.';
        },
      });
  }
}
