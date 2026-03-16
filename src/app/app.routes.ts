import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'hermonogram',
    loadComponent: () => import('./hermonogram/hermonogram.page').then((m) => m.HermonogramPage),
  },
  {
    path: 'konflikty',
    loadComponent: () => import('./konflikty/konflikty.page').then((m) => m.KonfliktyPage),
  },
  {
    path: 'profile',
    loadComponent: () => import('./profile/profile.page').then((m) => m.ProfilePage),
  },
  {
    path: 'sale',
    loadComponent: () => import('./sale/sale.page').then((m) => m.SalePage),
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

