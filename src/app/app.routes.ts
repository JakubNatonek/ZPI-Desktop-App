import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'change-password',
    loadComponent: () => import('./pages/change-password/change-password.page').then((m) => m.ChangePasswordPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./features/home/pages/home.page').then((m) => m.HomePage),
  },
  {
    path: 'hermonogram',
    loadComponent: () => import('./features/hermonogram/pages/hermonogram.page').then((m) => m.HermonogramPage),
  },
  {
    path: 'konflikty',
    loadComponent: () => import('./features/konflikty/pages/konflikty.page').then((m) => m.KonfliktyPage),
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/pages/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'sale',
    loadComponent: () => import('./features/sale/sale-list.page').then((m) => m.SaleListPage),
  },
  {
    path: 'sale/new',
    loadComponent: () => import('./features/sale/sale.page').then((m) => m.SalePage),
  },
  {
    path: 'sale/dictionaries',
    loadComponent: () => import('./features/sale/sale-dictionaries').then((m) => m.SaleDictionariesPage),
  },
  {
    path: 'sale/:id/edit',
    loadComponent: () => import('./features/sale/sale.page').then((m) => m.SalePage),
  },
  {
    path: 'subjects',
    loadComponent: () => import('./features/subjects/subject-list.page').then((m) => m.SubjectListPage),
  },
  {
    path: 'subjects/new',
    loadComponent: () => import('./features/subjects/subject.page').then((m) => m.SubjectPage),
  },
  {
    path: 'subjects/dictionaries',
    loadComponent: () => import('./features/subjects/subject-dictionaries.page').then((m) => m.SubjectDictionariesPage),
  },
  {
    path: 'subjects/:id/edit',
    loadComponent: () => import('./features/subjects/subject.page').then((m) => m.SubjectPage),
  },
  {
    path: 'admin/users/new',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/pages/user-create.page').then((m) => m.UserCreatePage),
  },
  {
    path: 'admin/unavailability-notes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/admin/pages/unavailability-notes-list-admin/unavailability-notes-list-admin.component').then((m) => m.UnavailabilityNotesListAdminComponent),
  },
  {
    path: 'audit-logs',
    canActivate: [authGuard],
    loadComponent: () => import('./features/audit/pages/audit-logs.page').then((m) => m.AuditLogsPage),
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];

