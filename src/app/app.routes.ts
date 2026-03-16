import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
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
    loadComponent: () => import('./features/sale/sale.page').then((m) => m.SalePage),
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

