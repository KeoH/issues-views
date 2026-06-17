import { ApplicationConfig, provideBrowserGlobalErrorListeners, APP_INITIALIZER, inject } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './services/auth.interceptor';
import { authGuard } from './services/auth.guard';
import { AuthService } from './services/auth.service';
import { lastValueFrom } from 'rxjs';

const routes: Routes = [
  { 
    path: 'login', 
    loadComponent: () => import('./pages/login/login.component').then(m => m.LoginComponent) 
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      { 
        path: '', 
        loadComponent: () => import('./pages/timeline/timeline.component').then(m => m.TimelineComponent) 
      },
      { 
        path: 'mi-planificacion', 
        loadComponent: () => import('./pages/my-planning/my-planning.component').then(m => m.MyPlanningComponent) 
      },
      { 
        path: 'kanban', 
        loadComponent: () => import('./pages/kanban/kanban.component').then(m => m.KanbanComponent) 
      },
      { 
        path: 'proyecto/:id', 
        loadComponent: () => import('./pages/project-detail/project-detail.component').then(m => m.ProjectDetailComponent) 
      },
      { 
        path: 'usuario/:id', 
        loadComponent: () => import('./pages/user-detail/user-detail.component').then(m => m.UserDetailComponent) 
      },
      { 
        path: 'usuarios', 
        loadComponent: () => import('./pages/user-management/user-management.component').then(m => m.UserManagementComponent) 
      },
      { 
        path: 'mi-perfil', 
        loadComponent: () => import('./pages/my-profile/my-profile.component').then(m => m.MyProfileComponent) 
      },
      { 
        path: 'tarea/:id', 
        loadComponent: () => import('./pages/task-detail/task-detail.component').then(m => m.TaskDetailComponent) 
      }
    ]
  },
  { path: '**', redirectTo: '' }
];

// Función para inicializar sesión al arrancar la aplicación (APP_INITIALIZER)
function initializeApp(authService: AuthService) {
  return () => lastValueFrom(authService.initSession()).catch(() => false);
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [AuthService],
      multi: true
    }
  ],
};
