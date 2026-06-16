import { Component, signal, computed, inject, OnInit, effect } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { User, Task, TaskStatus } from '../../models/types';
import { getMonday, formatDateRange } from '../../utils/date-utils';

@Component({
  selector: 'app-user-detail',
  imports: [FormsModule, RouterLink],
  templateUrl: './user-detail.component.html',
  styleUrl: './user-detail.component.css'
})
export class UserDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly timelineService = inject(TimelineService);

  readonly userId = signal<string>('');

  // Días de la semana para formatear
  readonly days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

  // Usuario actual
  readonly user = computed(() => {
    return this.timelineService.users().find(u => u.id === this.userId());
  });

  // Si el usuario activo es el Administrador
  readonly isAdmin = computed(() => {
    return this.timelineService.currentUserId() === 'admin';
  });

  // Tareas del usuario
  readonly userTasks = computed(() => {
    return this.timelineService.tasks().filter(t => t.userId === this.userId());
  });

  // Horas totales asignadas a este usuario
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

  // Formulario del usuario
  userForm = {
    name: '',
    email: '',
    jobTitle: '',
    birthDate: ''
  };

  constructor() {
    effect(() => {
      const u = this.user();
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
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.userId.set(id);
        const u = this.user();
        if (!u) {
          this.router.navigate(['/']);
        }
      } else {
        this.router.navigate(['/']);
      }
    });
  }

  saveUser() {
    const currentUsr = this.user();
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
    
    alert('Usuario actualizado correctamente');
  }

  // Helpers de renderizado
  getProjectName(projectId?: string): string {
    if (!projectId) return 'Sin Proyecto';
    const proj = this.timelineService.projects().find(p => p.id === projectId);
    return proj ? proj.name : 'Sin Proyecto';
  }

  getProjectColor(projectId?: string): string {
    if (!projectId) return '#6b7280'; // gray-500
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
