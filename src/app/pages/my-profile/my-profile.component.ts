import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { User, Task } from '../../models/types';
import { getMonday, formatDateRange } from '../../utils/date-utils';

@Component({
  selector: 'app-my-profile',
  imports: [FormsModule, RouterLink],
  templateUrl: './my-profile.component.html',
  styleUrl: './my-profile.component.css'
})
export class MyProfileComponent implements OnInit {
  private readonly router = inject(Router);
  readonly timelineService = inject(TimelineService);

  readonly days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

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
        weekLabel: `Semana del ${formatDateRange(group.monday)}`,
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
    birthDate: ''
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
          birthDate: u.birthDate || ''
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
      alert('El nombre es obligatorio');
      return;
    }

    this.timelineService.updateUser({
      ...currentUsr,
      name: this.userForm.name.trim(),
      email: this.userForm.email.trim() || undefined,
      jobTitle: this.userForm.jobTitle.trim() || undefined,
      birthDate: this.userForm.birthDate || undefined
    });
    
    alert('Tu perfil ha sido actualizado correctamente');
  }

  // Helpers de renderizado
  getProjectName(projectId?: string): string {
    if (!projectId) return 'Sin Proyecto';
    const proj = this.timelineService.projects().find(p => p.id === projectId);
    return proj ? proj.name : 'Sin Proyecto';
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
      const dayName = this.days[startDate.getDay() - 1] || 'Finde';
      const dateStr = `${startDate.getDate()} de ${['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][startDate.getMonth()]}`;
      return `${dayName} ${dateStr}, ${startStr} - ${endStr}`;
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
