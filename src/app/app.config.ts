import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { TimelineComponent } from './pages/timeline/timeline.component';
import { ProjectDetailComponent } from './pages/project-detail/project-detail.component';
import { UserDetailComponent } from './pages/user-detail/user-detail.component';
import { MyProfileComponent } from './pages/my-profile/my-profile.component';

const routes: Routes = [
  { path: '', component: TimelineComponent },
  { path: 'proyecto/:id', component: ProjectDetailComponent },
  { path: 'usuario/:id', component: UserDetailComponent },
  { path: 'mi-perfil', component: MyProfileComponent },
  { path: '**', redirectTo: '' }
];

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes)
  ],
};
