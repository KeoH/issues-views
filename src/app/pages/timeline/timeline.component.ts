import { Component, signal, computed, inject, AfterViewInit, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TimelineService } from '../../services/timeline.service';
import { User, Task, Project, TaskStatus, Comment } from '../../models/types';
import { getMonday, addDays, getWeekNumber, formatDateRange, isSameWeek, toLocalISOString } from '../../utils/date-utils';

interface TaskWithLayout extends Task {
  track: number;
  left: number;  // Porcentaje (0 - 100)
  width: number; // Porcentaje (0 - 100)
  top: number;   // Pixels
}

interface DragTargetPreview {
  userId: string;
  startSlot: number;
  duration: number;
}

@Component({
  selector: 'app-timeline',
  imports: [FormsModule, RouterLink],
  templateUrl: './timeline.component.html',
  styleUrl: './timeline.component.css',
})
export class TimelineComponent implements AfterViewInit, OnDestroy {
  readonly timelineService = inject(TimelineService);

  // Días y horas constantes
  readonly days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  readonly hours = [9, 10, 11, 12, 13, 14, 15, 16]; // 8 horas: 9:00 a 17:00

  // Total de slots dinámico
  readonly totalSlots = computed(() => this.days.length * this.hours.length);

  // Estado de Zoom
  readonly zoomLevel = signal<number>(1.0);

  // Estado del Tooltip
  readonly hoveredTask = signal<Task | null>(null);
  readonly tooltipX = signal<number>(0);
  readonly tooltipY = signal<number>(0);

  // Ancho real del grid de planificación medido dinámicamente
  readonly gridWidth = signal<number>(1200);
  private resizeObserver: ResizeObserver | null = null;

  // Estado del Drag & Drop
  draggedTaskId: string | null = null;
  activeDragTarget = signal<DragTargetPreview | null>(null);

  // Paleta de colores curada premium
  readonly projectColors = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#ec4899', // Pink/Rose
    '#f97316', // Orange
    '#0ea5e9', // Sky/Blue
    '#f59e0b', // Amber/Yellow
    '#ef4444'  // Red/Crimson
  ];

  // Estados de Modales
  isTaskModalOpen = signal(false);
  isUserModalOpen = signal(false);
  isProjectModalOpen = signal(false);

  // Semana activa seleccionada (iniciada en el lunes de la fecha semilla '2026-06-16')
  readonly currentWeekMonday = signal<Date>(getMonday(new Date('2026-06-16')));

  // Buscador de dependencias
  readonly depSearchQuery = signal('');
  readonly isDepDropdownOpen = signal(false);

  // Título del Modal de Tarea
  taskModalTitle = signal('Nueva Tarea');

  // Chat/Comentarios local input
  newCommentText = '';

  // Formularios
  taskForm = {
    id: '',
    title: '',
    description: '',
    userId: '',
    startDate: '', // YYYY-MM-DD
    startHour: 9,  // 9 a 16
    duration: 1,
    recurrence: 'none',
    dependencies: [] as string[],
    projectId: '',
    status: 'Creado' as TaskStatus
  };

  userForm = {
    name: ''
  };

  projectForm = {
    name: '',
    description: '',
    color: '#6366f1'
  };

  // Cálculo dinámico de tracks de tareas para evitar solapamientos
  readonly userLayouts = computed(() => {
    const tasks = this.timelineService.tasks();
    const users = this.timelineService.users();
    const activeMonday = this.currentWeekMonday();
    const layouts = new Map<string, { tasks: TaskWithLayout[]; height: number }>();

    for (const user of users) {
      // Filtrar tareas que pertenecen a la semana activa y al usuario
      const userTasks = tasks.filter(t => {
        if (t.userId !== user.id) return false;
        try {
          return isSameWeek(new Date(t.startDate), activeMonday);
        } catch {
          return false;
        }
      });

      // Ordenar las tareas
      const sortedTasks = [...userTasks].sort((a, b) => {
        const dateA = new Date(a.startDate).getTime();
        const dateB = new Date(b.startDate).getTime();
        return dateA - dateB;
      });

      const trackEndSlots: number[] = [];
      const tasksWithLayout: TaskWithLayout[] = sortedTasks.map(task => {
        const taskDate = new Date(task.startDate);
        // Diferencia de días enteros respecto al lunes
        const diffDays = Math.floor((taskDate.getTime() - activeMonday.getTime()) / (1000 * 60 * 60 * 24));
        const hour = taskDate.getHours();
        const startSlot = diffDays * 8 + (hour - 9);
        const endSlot = startSlot + task.duration;

        // Algoritmo codicioso: encontrar el primer track que no solape
        let assignedTrack = 0;
        while (assignedTrack < trackEndSlots.length && trackEndSlots[assignedTrack] > startSlot) {
          assignedTrack++;
        }

        trackEndSlots[assignedTrack] = endSlot;

        // Cálculos de posicionamiento absoluto
        const left = (startSlot / this.totalSlots()) * 100;
        const width = (task.duration / this.totalSlots()) * 100;
        const top = assignedTrack * 60 + 8; // 60px por track (52px tarjeta + 8px gap)

        return {
          ...task,
          track: assignedTrack,
          left,
          width,
          top
        };
      });

      // Altura total requerida para la fila de este usuario
      // Mínimo 80px para que se vea el grid vacío elegantemente
      const height = Math.max(80, trackEndSlots.length * 60 + 16);
      layouts.set(user.id, { tasks: tasksWithLayout, height });
    }

    return layouts;
  });

  // Cálculo de offsets acumulados por fila de usuario para posicionar líneas SVG
  readonly userRowOffsets = computed(() => {
    const users = this.timelineService.users();
    const layouts = this.userLayouts();
    const offsets = new Map<string, number>();
    let currentOffset = 0;

    for (const user of users) {
      offsets.set(user.id, currentOffset);
      const height = layouts.get(user.id)?.height || 80;
      currentOffset += height;
    }

    return {
      offsets,
      totalHeight: currentOffset
    };
  });

  // Cálculo de coordenadas y paths SVG para dibujar líneas de dependencias
  readonly dependencyLines = computed(() => {
    const tasks = this.timelineService.tasks();
    const layouts = this.userLayouts();
    const rowOffsets = this.userRowOffsets().offsets;
    const gridWidth = this.gridWidth();

    const lines: { path: string; id: string; colorClass: string }[] = [];

    // Lista plana de tareas con layout
    const allLayoutTasks: TaskWithLayout[] = [];
    for (const layout of layouts.values()) {
      allLayoutTasks.push(...layout.tasks);
    }

    for (const taskB of allLayoutTasks) {
      if (taskB.dependencies) {
        for (const predId of taskB.dependencies) {
          const taskA = allLayoutTasks.find(t => t.id === predId);
          if (taskA) {
            const offsetA = rowOffsets.get(taskA.userId) || 0;
            const offsetB = rowOffsets.get(taskB.userId) || 0;

            const x1 = ((taskA.left + taskA.width) / 100) * gridWidth;
            const y1 = offsetA + taskA.top + 26; // 26px es la mitad de la altura de la tarea (52px)

            const x2 = (taskB.left / 100) * gridWidth;
            const y2 = offsetB + taskB.top + 26;

            const dx = Math.abs(x2 - x1);
            const cpOffset = Math.max(30, dx * 0.4);
            const cp1_x = x1 + cpOffset;
            const cp1_y = y1;
            const cp2_x = x2 - cpOffset;
            const cp2_y = y2;

            const path = `M ${x1} ${y1} C ${cp1_x} ${cp1_y}, ${cp2_x} ${cp2_y}, ${x2} ${y2}`;

            lines.push({
              path,
              id: `${taskA.id}-${taskB.id}`,
              colorClass: this.getUserColorClass(taskA.userId)
            });
          }
        }
      }
    }

    return lines;
  });

  // Estadísticas rápidas
  readonly totalTasks = computed(() => this.timelineService.tasks().length);
  readonly totalUsers = computed(() => this.timelineService.users().length);
  readonly busyUsersCount = computed(() => {
    const activeUserIds = new Set(this.timelineService.tasks().map(t => t.userId));
    return activeUserIds.size;
  });

  // DRAG & DROP EVENTS
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

  onDragOver(event: DragEvent, userId: string) {
    event.preventDefault(); // Permitir el Drop
    
    if (!this.draggedTaskId) return;
    
    const task = this.timelineService.tasks().find(t => t.id === this.draggedTaskId);
    if (!task) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    const dropSlot = Math.floor(percentage * this.totalSlots());
    
    const maxStartSlot = this.totalSlots() - task.duration;
    const finalSlot = Math.max(0, Math.min(maxStartSlot, dropSlot));

    this.activeDragTarget.set({
      userId,
      startSlot: finalSlot,
      duration: task.duration
    });
  }

  onDragLeave(event: DragEvent) {
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    if (currentTarget && !currentTarget.contains(relatedTarget)) {
      this.activeDragTarget.set(null);
    }
  }

  onDrop(event: DragEvent, userId: string) {
    event.preventDefault();
    this.activeDragTarget.set(null);

    const taskId = event.dataTransfer?.getData('text/plain') || this.draggedTaskId;
    if (!taskId) return;

    const task = this.timelineService.tasks().find(t => t.id === taskId);
    if (!task) return;

    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = event.clientX - rect.left;
    const percentage = x / rect.width;
    const dropSlot = Math.floor(percentage * this.totalSlots());

    const maxStartSlot = this.totalSlots() - task.duration;
    const finalSlot = Math.max(0, Math.min(maxStartSlot, dropSlot));

    const newDay = Math.floor(finalSlot / 8);
    const newHour = 9 + (finalSlot % 8);

    const activeMonday = this.currentWeekMonday();
    const targetDate = addDays(activeMonday, newDay);
    const newStartDateStr = toLocalISOString(targetDate, newHour);

    const validation = this.validateTaskTime({
      ...task,
      userId,
      startDate: newStartDateStr
    });

    if (!validation.valid) {
      alert(validation.reason);
      this.draggedTaskId = null;
      this.activeDragTarget.set(null);
      return;
    }

    this.timelineService.updateTask({
      ...task,
      userId,
      startDate: newStartDateStr
    });

    this.draggedTaskId = null;
  }

  // ACCIONES DE MODALES Y FORMULARIOS

  // Añadir Tarea
  openAddTaskModal(userId?: string, dayIndex?: number, hour?: number) {
    this.taskModalTitle.set('Nueva Tarea');
    
    if (this.timelineService.users().length === 0) {
      this.openAddUserModal();
      return;
    }

    let initialDate = new Date();
    if (dayIndex !== undefined) {
      initialDate = addDays(this.currentWeekMonday(), dayIndex);
    }
    
    const year = initialDate.getFullYear();
    const month = String(initialDate.getMonth() + 1).padStart(2, '0');
    const day = String(initialDate.getDate()).padStart(2, '0');
    const initialDateStr = `${year}-${month}-${day}`;

    this.taskForm = {
      id: '',
      title: '',
      description: '',
      userId: userId || this.timelineService.users()[0].id,
      startDate: initialDateStr,
      startHour: hour !== undefined ? hour : 9,
      duration: 2,
      recurrence: 'none',
      dependencies: [],
      projectId: '',
      status: 'Creado'
    };

    this.depSearchQuery.set('');
    this.isDepDropdownOpen.set(false);
    this.isTaskModalOpen.set(true);
  }

  // Editar Tarea
  openEditTaskModal(task: Task, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    
    this.taskModalTitle.set('Editar Tarea');

    const taskDate = new Date(task.startDate);
    const year = taskDate.getFullYear();
    const month = String(taskDate.getMonth() + 1).padStart(2, '0');
    const day = String(taskDate.getDate()).padStart(2, '0');
    const dateStr = `${year}-${month}-${day}`;
    const hour = taskDate.getHours();

    this.taskForm = {
      id: task.id,
      title: task.title,
      description: task.description,
      userId: task.userId,
      startDate: dateStr,
      startHour: hour,
      duration: task.duration,
      recurrence: 'none',
      dependencies: task.dependencies || [],
      projectId: task.projectId || '',
      status: task.status || 'Creado'
    };

    this.newCommentText = '';
    this.depSearchQuery.set('');
    this.isDepDropdownOpen.set(false);
    this.isTaskModalOpen.set(true);
  }

  closeTaskModal() {
    this.isTaskModalOpen.set(false);
  }

  submitTaskForm() {
    if (!this.taskForm.title.trim()) return;

    const startDateStr = `${this.taskForm.startDate}T${String(this.taskForm.startHour).padStart(2, '0')}:00:00`;

    const taskData = {
      title: this.taskForm.title.trim(),
      description: this.taskForm.description.trim(),
      userId: this.taskForm.userId,
      startDate: startDateStr,
      duration: Number(this.taskForm.duration),
      dependencies: this.taskForm.dependencies,
      projectId: this.taskForm.projectId || undefined,
      status: this.taskForm.status
    };

    const validation = this.validateTaskTime({
      id: this.taskForm.id || undefined,
      startDate: taskData.startDate,
      duration: taskData.duration,
      dependencies: taskData.dependencies
    });

    if (!validation.valid) {
      alert(validation.reason);
      return;
    }

    if (this.taskForm.id) {
      // Editar
      const originalTask = this.timelineService.tasks().find(t => t.id === this.taskForm.id);
      this.timelineService.updateTask({
        id: this.taskForm.id,
        ...taskData,
        comments: originalTask?.comments
      });
    } else {
      // Crear (con soporte de periodicidad)
      if (this.taskForm.recurrence !== 'none') {
        const intervalHours = Number(this.taskForm.recurrence);
        let currentRealDate = new Date(startDateStr);

        // Crear copias para las próximas 4 semanas laborables (28 días)
        const limitDate = new Date(currentRealDate);
        limitDate.setDate(limitDate.getDate() + 28);

        while (currentRealDate.getTime() < limitDate.getTime()) {
          const dayOfWeek = currentRealDate.getDay(); // 0 is Sunday, 6 is Saturday
          const hour = currentRealDate.getHours();

          // Solo en Lunes-Viernes (1-5) de 09:00 a 16:00
          if (dayOfWeek >= 1 && dayOfWeek <= 5 && hour >= 9 && hour <= 16) {
            const year = currentRealDate.getFullYear();
            const month = String(currentRealDate.getMonth() + 1).padStart(2, '0');
            const day = String(currentRealDate.getDate()).padStart(2, '0');
            const hourStr = String(hour).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}T${hourStr}:00:00`;

            this.timelineService.addTask({
              title: taskData.title,
              description: taskData.description,
              userId: taskData.userId,
              startDate: dateStr,
              duration: taskData.duration,
              dependencies: [],
              projectId: taskData.projectId,
              status: taskData.status
            });

            currentRealDate.setHours(currentRealDate.getHours() + intervalHours);
          } else {
            // Fuera de horas laborales o en fin de semana
            // Avanzar al día siguiente a las 09:00
            currentRealDate.setHours(currentRealDate.getHours() + 1);
            if (currentRealDate.getHours() < 9 || currentRealDate.getHours() > 16 || currentRealDate.getDay() === 0 || currentRealDate.getDay() === 6) {
              currentRealDate.setDate(currentRealDate.getDate() + 1);
              currentRealDate.setHours(9, 0, 0, 0);
            }
          }
        }
      } else {
        this.timelineService.addTask(taskData);
      }
    }

    this.closeTaskModal();
  }

  deleteTask(taskId: string, event: Event) {
    event.stopPropagation();
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      this.timelineService.deleteTask(taskId);
    }
  }

  // Añadir Usuario
  openAddUserModal() {
    this.userForm.name = '';
    this.isUserModalOpen.set(true);
  }

  closeUserModal() {
    this.isUserModalOpen.set(false);
  }

  submitUserForm() {
    if (!this.userForm.name.trim()) return;

    this.timelineService.addUser(this.userForm.name.trim());
    this.closeUserModal();
  }

  deleteUser(userId: string, name: string) {
    if (confirm(`¿Estás seguro de eliminar a ${name}? También se borrarán sus tareas.`)) {
      this.timelineService.deleteUser(userId);
    }
  }

  // Añadir Proyecto
  openAddProjectModal() {
    this.projectForm = {
      name: '',
      description: '',
      color: '#6366f1'
    };
    this.isProjectModalOpen.set(true);
  }

  closeProjectModal() {
    this.isProjectModalOpen.set(false);
  }

  submitProjectForm() {
    if (!this.projectForm.name.trim()) return;

    this.timelineService.addProject({
      name: this.projectForm.name.trim(),
      description: this.projectForm.description.trim(),
      color: this.projectForm.color
    });
    this.closeProjectModal();
  }

  deleteProject(projectId: string, name: string, event: Event) {
    event.stopPropagation();
    if (confirm(`¿Estás seguro de eliminar el proyecto "${name}"? También se borrarán todas sus tareas asociadas.`)) {
      this.timelineService.deleteProject(projectId);
    }
  }

  resetToSeedData() {
    if (confirm('¿Quieres restablecer todos los datos del planificador a los valores por defecto? Se perderán tus cambios actuales.')) {
      this.timelineService.initializeSeedData();
    }
  }

  getUserColorClass(userId: string): string {
    const users = this.timelineService.users();
    const idx = users.findIndex(u => u.id === userId);
    return `task-card-color-${idx >= 0 ? idx % 4 : 0}`;
  }

  getProjectColor(projectId?: string): string {
    if (!projectId) return 'transparent';
    const project = this.timelineService.projects().find(p => p.id === projectId);
    return project ? project.color : 'transparent';
  }

  getProjectName(projectId?: string): string {
    if (!projectId) return '';
    const project = this.timelineService.projects().find(p => p.id === projectId);
    return project ? project.name : '';
  }

  getUserTotalHours(userId: string): number {
    const layout = this.userLayouts().get(userId);
    if (!layout) return 0;
    return layout.tasks.reduce((sum, t) => sum + Number(t.duration), 0);
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

  getFormattedTimeShort(startDateStr: string): string {
    try {
      const d = new Date(startDateStr);
      const dayName = this.days[d.getDay() - 1] || 'Finde';
      return `${dayName.substring(0, 3)} ${d.getHours()}:00`;
    } catch {
      return '';
    }
  }

  getDragIndicatorStyle() {
    const preview = this.activeDragTarget();
    if (!preview) return {};

    const left = (preview.startSlot / this.totalSlots()) * 100;
    const width = (preview.duration / this.totalSlots()) * 100;

    return {
      left: `${left}%`,
      width: `${width}%`
    };
  }

  onCellClick(userId: string, dayIndex: number, hourIndex: number) {
    const hour = 9 + hourIndex;
    this.openAddTaskModal(userId, dayIndex, hour);
  }

  zoomIn() {
    this.zoomLevel.update(z => Math.min(3.0, z + 0.15));
  }

  zoomOut() {
    this.zoomLevel.update(z => Math.max(0.6, z - 0.15));
  }

  resetZoom() {
    this.zoomLevel.set(1.0);
  }

  onWheel(event: WheelEvent) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      if (event.deltaY < 0) {
        this.zoomIn();
      } else {
        this.zoomOut();
      }
    }
  }

  onTaskMouseEnter(event: MouseEvent, task: Task) {
    this.hoveredTask.set(task);
    this.updateTooltipPosition(event);
  }

  onTaskMouseMove(event: MouseEvent) {
    this.updateTooltipPosition(event);
  }

  onTaskMouseLeave() {
    this.hoveredTask.set(null);
  }

  private updateTooltipPosition(event: MouseEvent) {
    this.tooltipX.set(event.clientX + 15);
    this.tooltipY.set(event.clientY + 15);
  }

  getTaskUserName(userId: string): string {
    const user = this.timelineService.users().find(u => u.id === userId);
    return user ? user.name : 'Sin asignar';
  }

  hasDependencyPath(fromId: string, toId: string): boolean {
    const task = this.timelineService.tasks().find(t => t.id === fromId);
    if (!task) return false;
    if (!task.dependencies) return false;
    if (task.dependencies.includes(toId)) return true;
    for (const depId of task.dependencies) {
      if (this.hasDependencyPath(depId, toId)) return true;
    }
    return false;
  }

  getEligiblePredecessors(): Task[] {
    const tasks = this.timelineService.tasks();
    const editId = this.taskForm.id;

    if (!editId) {
      return tasks;
    }

    return tasks.filter(t => {
      if (t.id === editId) return false;
      return !this.hasDependencyPath(t.id, editId);
    });
  }

  getFilteredPredecessors(): Task[] {
    const query = this.depSearchQuery().toLowerCase().trim();
    const selected = this.taskForm.dependencies;
    const eligible = this.getEligiblePredecessors();

    const unselected = eligible.filter(t => !selected.includes(t.id));

    if (!query) {
      return unselected;
    }

    return unselected.filter(t => 
      t.title.toLowerCase().includes(query) ||
      (t.description && t.description.toLowerCase().includes(query)) ||
      this.getTaskUserName(t.userId).toLowerCase().includes(query)
    );
  }

  addDependency(taskId: string) {
    if (!this.taskForm.dependencies.includes(taskId)) {
      this.taskForm.dependencies = [...this.taskForm.dependencies, taskId];
    }
    this.depSearchQuery.set('');
  }

  removeDependency(taskId: string) {
    this.taskForm.dependencies = this.taskForm.dependencies.filter(id => id !== taskId);
  }

  getTaskTitle(taskId: string): string {
    const task = this.timelineService.tasks().find(t => t.id === taskId);
    return task ? task.title : 'Tarea eliminada';
  }

  toggleDepDropdown(open: boolean, event?: Event) {
    if (event) {
      event.stopPropagation();
    }
    if (!open) {
      setTimeout(() => this.isDepDropdownOpen.set(false), 200);
    } else {
      this.isDepDropdownOpen.set(true);
    }
  }

  validateTaskTime(taskData: { id?: string; startDate: string; duration: number; dependencies?: string[]; [key: string]: any }): { valid: boolean; reason: string } {
    const taskStart = new Date(taskData.startDate).getTime();
    const taskEnd = taskStart + taskData.duration * 60 * 60 * 1000;

    // 1. Validar predecesores
    if (taskData.dependencies) {
      for (const predId of taskData.dependencies) {
        const pred = this.timelineService.tasks().find(t => t.id === predId);
        if (pred) {
          const predStart = new Date(pred.startDate).getTime();
          const predEnd = predStart + pred.duration * 60 * 60 * 1000;
          if (taskStart < predEnd) {
            const predDate = new Date(pred.startDate);
            const dateStr = `${predDate.getDate()}/${predDate.getMonth() + 1}`;
            const endHour = predDate.getHours() + pred.duration;
            return {
              valid: false,
              reason: `Conflicto de Dependencia: Esta tarea debe empezar después de que finalice "${pred.title}" (el ${dateStr} a las ${endHour}:00).`
            };
          }
        }
      }
    }

    // 2. Validar sucesores
    if (taskData.id) {
      const successors = this.timelineService.tasks().filter(t => t.dependencies && t.dependencies.includes(taskData.id!));
      for (const succ of successors) {
        const succStart = new Date(succ.startDate).getTime();
        if (taskEnd > succStart) {
          const succDate = new Date(succ.startDate);
          const dateStr = `${succDate.getDate()}/${succDate.getMonth() + 1}`;
          return {
            valid: false,
            reason: `Conflicto de Dependencia: Esta tarea no puede terminar después del inicio de su dependiente "${succ.title}" (el ${dateStr} a las ${succDate.getHours()}:00).`
          };
        }
      }
    }

    return { valid: true, reason: '' };
  }

  prevWeek() {
    this.currentWeekMonday.update(d => addDays(d, -7));
  }

  nextWeek() {
    this.currentWeekMonday.update(d => addDays(d, 7));
  }

  goToCurrentWeek() {
    this.currentWeekMonday.set(getMonday(new Date('2026-06-16')));
  }

  getFormattedWeekRange(): string {
    return formatDateRange(this.currentWeekMonday());
  }

  getTaskComments(): Comment[] {
    const task = this.timelineService.tasks().find(t => t.id === this.taskForm.id);
    return task?.comments || [];
  }

  submitComment() {
    if (!this.newCommentText.trim()) return;
    const task = this.timelineService.tasks().find(t => t.id === this.taskForm.id);
    if (!task) return;

    const activeId = this.timelineService.currentUserId();
    const currentUser = this.timelineService.users().find(u => u.id === activeId);
    const newComment: Comment = {
      id: crypto.randomUUID(),
      userId: activeId === 'admin' ? 'admin' : (currentUser?.id || 'anonymous'),
      userName: activeId === 'admin' ? 'Administrador' : (currentUser?.name || 'Anónimo'),
      text: this.newCommentText.trim(),
      createdAt: new Date().toISOString()
    };

    const updatedTask: Task = {
      ...task,
      comments: [...(task.comments || []), newComment]
    };
    this.timelineService.updateTask(updatedTask);
    this.newCommentText = '';
  }

  formatCommentTime(createdAt: string): string {
    try {
      const d = new Date(createdAt);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    } catch {
      return '';
    }
  }

  ngAfterViewInit() {
    const element = document.querySelector('.timeline-row-grid');
    if (element) {
      this.resizeObserver = new ResizeObserver(entries => {
        for (const entry of entries) {
          this.gridWidth.set(entry.contentRect.width);
        }
      });
      this.resizeObserver.observe(element);
    }
  }

  ngOnDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
  }
}
