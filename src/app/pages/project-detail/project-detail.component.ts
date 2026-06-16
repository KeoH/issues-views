import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { Project, Task, User, TaskStatus, Comment } from '../../models/types';
import { getMonday, addDays, getWeekNumber, formatDateRange, isSameWeek } from '../../utils/date-utils';

@Component({
  selector: 'app-project-detail',
  imports: [FormsModule, RouterLink],
  templateUrl: './project-detail.component.html',
  styleUrl: './project-detail.component.css'
})
export class ProjectDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly timelineService = inject(TimelineService);

  readonly projectId = signal<string>('');

  // Días y horas constantes
  readonly days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
  readonly hours = [9, 10, 11, 12, 13, 14, 15, 16]; // 8 horas: 9:00 a 17:00

  // Proyecto actual
  readonly project = computed(() => {
    return this.timelineService.projects().find(p => p.id === this.projectId());
  });

  // Tareas filtradas para este proyecto
  readonly projectTasks = computed(() => {
    return this.timelineService.tasks().filter(t => t.projectId === this.projectId());
  });

  // Tareas agrupadas por semana
  readonly tasksByWeek = computed(() => {
    const tasks = this.projectTasks();
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

    // Ordenar las semanas cronológicamente
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

  // Horas totales asignadas a este proyecto
  readonly totalProjectHours = computed(() => {
    return this.projectTasks().reduce((sum, t) => sum + Number(t.duration), 0);
  });

  // Formulario del proyecto
  projectForm = {
    name: '',
    description: '',
    color: '#6366f1',
    defaultUserId: ''
  };

  // Paleta de colores para proyectos
  readonly projectColors = [
    '#6366f1', // Indigo
    '#10b981', // Emerald
    '#ec4899', // Pink/Rose
    '#f97316', // Orange
    '#0ea5e9', // Sky/Blue
    '#f59e0b', // Amber/Yellow
    '#ef4444'  // Red/Crimson
  ];

  // Estado del modal de tareas
  isTaskModalOpen = signal(false);
  taskModalTitle = signal('Nueva Tarea');

  // Chat/Comentarios local input
  newCommentText = '';

  taskForm = {
    id: '',
    title: '',
    description: '',
    userId: '',
    startDate: '', // YYYY-MM-DD
    startHour: 9,
    duration: 2,
    dependencies: [] as string[],
    projectId: '',
    status: 'Creado' as TaskStatus
  };

  readonly depSearchQuery = signal('');
  readonly isDepDropdownOpen = signal(false);

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.projectId.set(id);
        const proj = this.project();
        if (proj) {
          this.projectForm = {
            name: proj.name,
            description: proj.description,
            color: proj.color,
            defaultUserId: proj.defaultUserId || ''
          };
        } else {
          this.router.navigate(['/']);
        }
      }
    });
  }

  saveProject() {
    const currentProj = this.project();
    if (!currentProj) return;

    this.timelineService.updateProject({
      ...currentProj,
      name: this.projectForm.name.trim(),
      description: this.projectForm.description.trim(),
      color: this.projectForm.color,
      defaultUserId: this.projectForm.defaultUserId || undefined
    });
    
    alert('Proyecto actualizado correctamente');
  }

  openAddTaskModal(mondayStr?: string) {
    const proj = this.project();
    this.taskModalTitle.set('Nueva Tarea');
    
    if (this.timelineService.users().length === 0) {
      alert('Debes crear un usuario en el Timeline principal antes de crear tareas.');
      return;
    }

    let initialDate = new Date();
    if (mondayStr) {
      initialDate = new Date(mondayStr);
    }
    
    const year = initialDate.getFullYear();
    const month = String(initialDate.getMonth() + 1).padStart(2, '0');
    const day = String(initialDate.getDate()).padStart(2, '0');
    const initialDateStr = `${year}-${month}-${day}`;

    this.taskForm = {
      id: '',
      title: '',
      description: '',
      userId: proj?.defaultUserId || this.timelineService.users()[0].id,
      startDate: initialDateStr,
      startHour: 9,
      duration: 2,
      dependencies: [],
      projectId: this.projectId(),
      status: 'Creado'
    };

    this.depSearchQuery.set('');
    this.isDepDropdownOpen.set(false);
    this.isTaskModalOpen.set(true);
  }

  openEditTaskModal(task: Task) {
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
      const originalTask = this.timelineService.tasks().find(t => t.id === this.taskForm.id);
      this.timelineService.updateTask({
        id: this.taskForm.id,
        ...taskData,
        comments: originalTask?.comments
      });
    } else {
      this.timelineService.addTask(taskData);
    }

    this.closeTaskModal();
  }

  deleteTask(taskId: string) {
    if (confirm('¿Estás seguro de que quieres eliminar esta tarea?')) {
      this.timelineService.deleteTask(taskId);
    }
  }

  // Helpers de renderizado
  getUserColorClass(userId: string): string {
    const users = this.timelineService.users();
    const idx = users.findIndex(u => u.id === userId);
    return `task-card-color-${idx >= 0 ? idx % 4 : 0}`;
  }

  getTaskUserName(userId: string): string {
    const user = this.timelineService.users().find(u => u.id === userId);
    return user ? user.name : 'Sin asignar';
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

  getTaskTitle(taskId: string): string {
    const task = this.timelineService.tasks().find(t => t.id === taskId);
    return task ? task.title : 'Tarea eliminada';
  }

  // Autocompletado de dependencias
  addDependency(taskId: string) {
    if (!this.taskForm.dependencies.includes(taskId)) {
      this.taskForm.dependencies = [...this.taskForm.dependencies, taskId];
    }
    this.depSearchQuery.set('');
  }

  removeDependency(taskId: string) {
    this.taskForm.dependencies = this.taskForm.dependencies.filter(id => id !== taskId);
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
    if (!editId) return tasks;
    return tasks.filter(t => t.id !== editId && !this.hasDependencyPath(t.id, editId));
  }

  getFilteredPredecessors(): Task[] {
    const query = this.depSearchQuery().toLowerCase().trim();
    const selected = this.taskForm.dependencies;
    const eligible = this.getEligiblePredecessors();
    const unselected = eligible.filter(t => !selected.includes(t.id));
    if (!query) return unselected;
    return unselected.filter(t => 
      t.title.toLowerCase().includes(query) ||
      (t.description && t.description.toLowerCase().includes(query)) ||
      this.getTaskUserName(t.userId).toLowerCase().includes(query)
    );
  }

  toggleDepDropdown(open: boolean) {
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

  // Estilo para el mini timeline
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
}
