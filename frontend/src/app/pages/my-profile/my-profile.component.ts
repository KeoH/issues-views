import { Component, computed, inject, OnInit, effect, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { UiService } from '../../services/ui.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { User, Task } from '../../models/types';
import { getMonday } from '../../utils/date-utils';

@Component({
  selector: 'app-my-profile',
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-profile.component.html',
  styleUrl: './my-profile.component.css'
})
export class MyProfileComponent implements OnInit {
  private readonly router = inject(Router);
  readonly timelineService = inject(TimelineService);
  readonly authService = inject(AuthService);
  readonly translationService = inject(TranslationService);
  readonly uiService = inject(UiService);

  // Usuario activo actual
  readonly activeUser = computed(() => {
    const activeId = this.timelineService.currentUserId();
    return this.timelineService.users().find(u => u.id === activeId);
  });

  // Tareas asignadas al usuario activo
  readonly userTasks = computed(() => {
    const u = this.activeUser();
    if (!u) return [];
    return this.timelineService.tasks().filter(t => t.userId === u.id);
  });

  // Horas totales asignadas
  readonly totalUserHours = computed(() => {
    return this.userTasks().reduce((sum, t) => sum + Number(t.duration), 0);
  });

  // Formatter local para el rango de fechas de la semana
  formatWeekLabel(monday: Date): string {
    const friday = new Date(monday);
    friday.setDate(monday.getDate() + 4);
    
    const isEn = this.translationService.currentLang() === 'en';
    const monthsEn = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthsEs = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const months = isEn ? monthsEn : monthsEs;
    
    const startDay = monday.getDate();
    const startMonth = months[monday.getMonth()];
    const endDay = friday.getDate();
    const endMonth = months[friday.getMonth()];
    const year = friday.getFullYear();
    
    const weekOf = this.translationService.translate('Semana del');
    const deWord = this.translationService.translate('de');
    
    if (isEn) {
      if (monday.getMonth() === friday.getMonth()) {
        return `Week of ${startMonth} ${startDay} - ${endDay}, ${year}`;
      } else {
        return `Week of ${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
      }
    } else {
      if (monday.getMonth() === friday.getMonth()) {
        return `${weekOf} ${startDay} - ${endDay} ${deWord} ${startMonth}, ${year}`;
      } else {
        return `${weekOf} ${startDay} ${deWord} ${startMonth} - ${endDay} ${deWord} ${endMonth}, ${year}`;
      }
    }
  }

  // Tareas agrupadas por semana
  readonly tasksByWeek = computed(() => {
    const tasks = this.userTasks();
    const groupsMap = new Map<string, { monday: Date; tasks: Task[] }>();
    
    for (const task of tasks) {
      try {
        const m = getMonday(new Date(task.startDate));
        const key = m.toISOString().split('T')[0];
        if (!groupsMap.has(key)) {
          groupsMap.set(key, { monday: m, tasks: [] });
        }
        groupsMap.get(key)!.tasks.push(task);
      } catch {}
    }

    const sortedWeeks = Array.from(groupsMap.values()).sort((a, b) => a.monday.getTime() - b.monday.getTime());
    
    return sortedWeeks.map(group => {
      const sortedGroupTasks = [...group.tasks].sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
      return {
        weekLabel: this.formatWeekLabel(group.monday),
        mondayStr: group.monday.toISOString().split('T')[0],
        tasks: sortedGroupTasks
      };
    });
  });

  // Formulario de edición
  userForm = {
    name: '',
    email: '',
    jobTitle: '',
    birthDate: '',
    preferredLanguage: 'en' as 'en' | 'es'
  };

  constructor() {
    // Redirección si se cambia a admin
    effect(() => {
      const activeId = this.timelineService.currentUserId();
      if (activeId === 'admin') {
        this.router.navigate(['/']);
      }
    });

    // Rellenar formulario reactivamente
    effect(() => {
      const u = this.activeUser();
      if (u) {
        this.userForm = {
          name: u.name,
          email: u.email || '',
          jobTitle: u.jobTitle || '',
          birthDate: u.birthDate || '',
          preferredLanguage: u.preferredLanguage || 'en'
        };
      }
    });
  }

  ngOnInit() {
    const activeId = this.timelineService.currentUserId();
    if (activeId === 'admin' || !activeId) {
      this.router.navigate(['/']);
    }
  }

  saveProfile() {
    const currentUsr = this.activeUser();
    if (!currentUsr) return;

    if (!this.userForm.name.trim()) {
      this.uiService.warning(this.translationService.translate('El nombre es obligatorio'));
      return;
    }

    this.timelineService.updateUser({
      ...currentUsr,
      name: this.userForm.name.trim(),
      email: this.userForm.email.trim() || undefined,
      jobTitle: this.userForm.jobTitle.trim() || undefined,
      birthDate: this.userForm.birthDate || undefined,
      preferredLanguage: this.userForm.preferredLanguage
    });
    
    this.uiService.success(this.translationService.translate('Tu perfil ha sido actualizado correctamente'));
  }

  // Helpers de renderizado
  getProjectName(projectId?: string): string {
    if (!projectId) return this.translationService.translate('Sin Proyecto');
    const proj = this.timelineService.projects().find(p => p.id === projectId);
    return proj ? proj.name : this.translationService.translate('Sin Proyecto');
  }

  getProjectColor(projectId?: string): string {
    if (!projectId) return '#6b7280';
    const proj = this.timelineService.projects().find(p => p.id === projectId);
    return proj ? proj.color : '#6b7280';
  }

  getFormattedTime(startDateStr: string, duration: number): string {
    try {
      const startDate = new Date(startDateStr);
      const startStr = `${String(startDate.getHours()).padStart(2, '0')}:00`;
      const endHour = startDate.getHours() + duration;
      const endStr = `${String(endHour).padStart(2, '0')}:00`;
      
      const rawDays = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
      const dayName = this.translationService.translate(rawDays[startDate.getDay() - 1] || 'Domingo');
      
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const monthName = this.translationService.translate(months[startDate.getMonth()]);
      
      const deWord = this.translationService.translate('de');
      
      if (this.translationService.currentLang() === 'en') {
        return `${dayName}, ${monthName} ${startDate.getDate()}, ${startStr} - ${endStr}`;
      }
      return `${dayName} ${startDate.getDate()} ${deWord} ${monthName}, ${startStr} - ${endStr}`;
    } catch {
      return '';
    }
  }

  getTaskTitle(taskId: string): string {
    const task = this.timelineService.tasks().find(t => t.id === taskId);
    return task ? task.title : 'Tarea eliminada';
  }

  getCompactTimelineStyle(startDateStr: string, duration: number) {
    try {
      const startDate = new Date(startDateStr);
      const startOffset = startDate.getHours() - 9;
      const left = (startOffset / 8) * 100;
      const width = (duration / 8) * 100;
      return {
        left: `${left}%`,
        width: `${width}%`
      };
    } catch {
      return { left: '0%', width: '0%' };
    }
  }
}
