import { Component, inject, computed, OnInit } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { UiService } from './services/ui.service';
import { TimelineService } from './services/timeline.service';
import { TranslationService } from './services/translation.service';
import { TranslatePipe } from './pipes/translate.pipe';
import { ConfirmDialogComponent } from './components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, ConfirmDialogComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  readonly authService = inject(AuthService);
  readonly uiService = inject(UiService);
  readonly timelineService = inject(TimelineService);
  readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  ngOnInit() {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      this.uiService.isSidebarCollapsed.set(true);
    }
  }

  readonly sidebarProjects = computed(() => {
    const currentUser = this.authService.currentUser();
    if (!currentUser) return [];

    // Los administradores ven todos los proyectos activos o en los que están incluidos
    // Los colaboradores solo ven proyectos activos en los que están incluidos
    const currentUserId = currentUser.id;
    const isSystemAdmin = currentUser.role === 'admin';

    return this.timelineService.projects().filter(p => {
      const isProjectActive = p.isActive !== 0; // 1 por defecto (activo)
      const isUserMember = p.members?.includes(currentUserId);
      
      if (isSystemAdmin) {
        return isProjectActive; // El admin ve todos los activos
      }
      return isProjectActive && isUserMember;
    });
  });

  onCreateTask() {
    this.router.navigate(['/']).then(() => {
      this.uiService.openTaskModal();
    });
  }

  onCreateProject() {
    this.router.navigate(['/']).then(() => {
      this.uiService.openProjectModal();
    });
  }

  onCreateUser() {
    this.router.navigate(['/usuarios']).then(() => {
      this.uiService.openUserModal();
    });
  }
}
