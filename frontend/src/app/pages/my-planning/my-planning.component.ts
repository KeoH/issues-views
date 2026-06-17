import { Component, signal, computed, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { Task, Project, User } from '../../models/types';
import { getMonday, addDays, isSameWeek, toLocalISOString } from '../../utils/date-utils';
import { ZoomControlsComponent } from '../../components/zoom-controls/zoom-controls.component';
import { WeekNavigationComponent } from '../../components/week-navigation/week-navigation.component';
import { TaskCardComponent } from '../../components/task-card/task-card.component';

interface TaskWithLayout extends Task {
  track: number;
  left: number;
  width: number;
  top: number;
}

@Component({
  selector: 'app-my-planning',
  standalone: true,
  imports: [FormsModule, TranslatePipe, ZoomControlsComponent, WeekNavigationComponent, TaskCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-planning.component.html',
  styleUrl: './my-planning.component.css'
})
export class MyPlanningComponent implements OnInit {
  readonly timelineService = inject(TimelineService);
  readonly authService = inject(AuthService);
  readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  // Escala y semana
  readonly zoomLevel = signal<number>(1);
  readonly currentWeekMonday = signal<Date>(getMonday(new Date()));

  // Usuario seleccionado para ver la planificación
  readonly selectedUserId = signal<string>('');

  // Días y horas constantes
  readonly days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  readonly hours = [9, 10, 11, 12, 13, 14, 15, 16]; // 8 horas: 9:00 a 17:00

  // Drag state
  private draggedTaskId: string | null = null;
  readonly activeDragTarget = signal<{ projectId: string; day: number; hour: number } | null>(null);

  ngOnInit() {
    // Inicializar con el ID del usuario actualmente autenticado
    const current = this.authService.currentUser();
    if (current) {
      this.selectedUserId.set(current.id);
    }
  }

  // Filtrar usuarios con rol 'admin' de los selectores de planificación
  readonly activeUsers = computed(() => {
    return this.timelineService.users().filter(u => u.role !== 'admin' && u.isActive !== 0);
  });

  // Proyectos del usuario seleccionado (los que tienen tareas asignadas)
  readonly planningProjects = computed(() => {
    const userId = this.selectedUserId();
    if (!userId) return [];
    
    // Tareas del usuario en la semana activa o en general
    const tasks = this.timelineService.tasks().filter(t => t.userId === userId);
    const projectIdsWithTasks = new Set(tasks.map(t => t.projectId).filter(Boolean));

    return this.timelineService.projects().filter(p => projectIdsWithTasks.has(p.id));
  });

  // Retorna el total de slots (5 días * 8 horas = 40)
  totalSlots() {
    return this.days.length * this.hours.length;
  }

  // Ancho en píxeles del grid del planificador
  gridWidth() {
    return 1400 * this.zoomLevel();
  }





  // Evitar scroll vertical al hacer scroll con shift+rueda
  onWheel(event: WheelEvent) {
    if (event.deltaY !== 0 && event.shiftKey) {
      event.preventDefault();
      const container = event.currentTarget as HTMLElement;
      container.scrollLeft += event.deltaY;
    }
  }

  // Obtener estado del día (Hoy, Pasado, Futuro)
  getDayStatusClass(dayIndex: number): string {
    const activeMonday = this.currentWeekMonday();
    const dayDate = addDays(activeMonday, dayIndex);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    dayDate.setHours(0, 0, 0, 0);

    if (dayDate.getTime() === today.getTime()) return 'day-current';
    if (dayDate.getTime() < today.getTime()) return 'day-past';
    return 'day-future';
  }

  // Algoritmo de distribución de pistas por proyecto (evita solapamientos)
  readonly projectLayouts = computed(() => {
    const userId = this.selectedUserId();
    const activeMonday = this.currentWeekMonday();
    const tasks = this.timelineService.tasks().filter(t => t.userId === userId);
    const projects = this.planningProjects();
    const layouts = new Map<string, { tasks: TaskWithLayout[]; height: number }>();

    // Agregar filas para proyectos asignados y una fila virtual "no-project"
    const rowIds = [...projects.map(p => p.id), 'no-project'];

    for (const rowId of rowIds) {
      // Filtrar tareas que corresponden a esta fila y están en la semana activa
      const rowTasks = tasks.filter(t => {
        const matchesRow = rowId === 'no-project' ? !t.projectId : t.projectId === rowId;
        if (!matchesRow) return false;
        try {
          return isSameWeek(new Date(t.startDate), activeMonday);
        } catch {
          return false;
        }
      });

      // Ordenar cronológicamente
      const sortedTasks = [...rowTasks].sort((a, b) => {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      });

      const trackEndSlots: number[] = [];
      const tasksWithLayout: TaskWithLayout[] = sortedTasks.map(task => {
        const taskDate = new Date(task.startDate);
        const diffDays = Math.floor((taskDate.getTime() - activeMonday.getTime()) / (1000 * 60 * 60 * 24));
        const hour = taskDate.getHours();
        const startSlot = diffDays * 8 + (hour - 9);
        const endSlot = startSlot + task.duration;

        let assignedTrack = 0;
        while (assignedTrack < trackEndSlots.length && trackEndSlots[assignedTrack] > startSlot) {
          assignedTrack++;
        }

        trackEndSlots[assignedTrack] = endSlot;

        const left = (startSlot / this.totalSlots()) * 100;
        const width = (task.duration / this.totalSlots()) * 100;
        const top = assignedTrack * 60 + 8; // 60px track + 8px gap

        return {
          ...task,
          track: assignedTrack,
          left,
          width,
          top
        };
      });

      const height = Math.max(80, trackEndSlots.length * 60 + 16);
      layouts.set(rowId, { tasks: tasksWithLayout, height });
    }

    return layouts;
  });

  // Drag & Drop
  onDragStart(event: DragEvent, task: Task) {
    this.draggedTaskId = task.id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', task.id);
      
      const target = event.target as HTMLElement;
      setTimeout(() => target.classList.add('dragging'), 0);
    }
  }

  onDragEnd(event: DragEvent) {
    this.draggedTaskId = null;
    this.activeDragTarget.set(null);
    const target = event.target as HTMLElement;
    target.classList.remove('dragging');
  }

  onDragOver(event: DragEvent, projectId: string) {
    event.preventDefault();
    if (!this.draggedTaskId) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const cellWidth = rect.width / this.totalSlots();
    const slotIndex = Math.floor(offsetX / cellWidth);

    const dayIndex = Math.floor(slotIndex / this.hours.length);
    const hourOffset = slotIndex % this.hours.length;
    const hour = this.hours[hourOffset];

    if (dayIndex >= 0 && dayIndex < this.days.length) {
      this.activeDragTarget.set({ projectId, day: dayIndex, hour });
    }
  }

  onDragLeave() {
    this.activeDragTarget.set(null);
  }

  onDrop(event: DragEvent, projectId: string) {
    event.preventDefault();
    const target = this.activeDragTarget();
    this.activeDragTarget.set(null);

    if (this.draggedTaskId && target) {
      const task = this.timelineService.tasks().find(t => t.id === this.draggedTaskId);
      if (task) {
        // Calcular la nueva fecha basada en la semana, día y hora arrastrados
        const targetMonday = this.currentWeekMonday();
        const dropDate = addDays(targetMonday, target.day);
        const newStartDateISO = toLocalISOString(dropDate, target.hour);

        // Si se arrastra a 'no-project', se desvincula el proyecto
        const targetProjId = projectId === 'no-project' ? undefined : projectId;

        this.timelineService.updateTask({
          ...task,
          startDate: newStartDateISO,
          projectId: targetProjId
        });
      }
    }
  }

  getDragIndicatorStyle() {
    const target = this.activeDragTarget();
    if (!target || !this.draggedTaskId) return { left: '0%', width: '0%' };

    const task = this.timelineService.tasks().find(t => t.id === this.draggedTaskId);
    if (!task) return { left: '0%', width: '0%' };

    const daySlots = this.hours.length;
    const totalGridSlots = this.totalSlots();
    const hourOffset = this.hours.indexOf(target.hour);

    const startSlot = target.day * daySlots + hourOffset;
    const left = (startSlot / totalGridSlots) * 100;
    const width = (task.duration / totalGridSlots) * 100;

    return {
      left: `${left}%`,
      width: `${width}%`
    };
  }

  getProjectColor(projectId?: string): string {
    if (!projectId) return '#64748b'; // Slate gray
    const project = this.timelineService.projects().find(p => p.id === projectId);
    return project ? project.color : '#64748b';
  }

  getProjectName(projectId: string): string {
    if (projectId === 'no-project') return 'Sin Proyecto';
    const project = this.timelineService.projects().find(p => p.id === projectId);
    return project ? project.name : 'Proyecto Desconocido';
  }

  getProjectStatusLabel(projectId: string): string {
    if (projectId === 'no-project') return this.translationService.translate('General');
    const project = this.timelineService.projects().find(p => p.id === projectId);
    if (!project) return '';
    return project.isActive === 0 
      ? '🔴 ' + this.translationService.translate('Inactivo') 
      : '🟢 ' + this.translationService.translate('Activo');
  }

  openTaskDetail(task: Task, event: Event) {
    event.stopPropagation();
    this.router.navigate(['/tarea', task.id]);
  }
}
