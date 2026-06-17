import { Component, signal, computed, inject, OnInit, effect, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { UiService } from '../../services/ui.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { Task, Project, User, TaskStatus, Comment } from '../../models/types';

@Component({
  selector: 'app-task-detail',
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-detail.component.html',
  styleUrl: './task-detail.component.css'
})
export class TaskDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly timelineService = inject(TimelineService);
  readonly authService = inject(AuthService);
  readonly translationService = inject(TranslationService);
  readonly uiService = inject(UiService);

  readonly taskId = signal<string>('');

  // Tarea actual
  readonly task = computed(() => {
    return this.timelineService.tasks().find(t => t.id === this.taskId());
  });

  // Tareas de las que depende (Predecesoras)
  readonly predecessorTasks = computed(() => {
    const current = this.task();
    if (!current || !current.dependencies) return [];
    return this.timelineService.tasks().filter(t => current.dependencies!.includes(t.id));
  });

  // Tareas que dependen de esta (Sucesoras)
  readonly successorTasks = computed(() => {
    const currentId = this.taskId();
    if (!currentId) return [];
    return this.timelineService.tasks().filter(t => t.dependencies && t.dependencies.includes(currentId));
  });

  // Usuarios a los que se puede asignar la tarea
  readonly assignableUsers = computed(() => {
    const currentTask = this.task();
    return this.timelineService.users().filter(u => 
      (u.role !== 'admin' && u.isActive !== 0) || 
      (currentTask && u.id === currentTask.userId)
    );
  });

  // Horas del día para el selector
  readonly hours = [9, 10, 11, 12, 13, 14, 15, 16];

  // Formulario de edición
  taskForm = {
    title: '',
    description: '',
    userId: '',
    startDate: '', // YYYY-MM-DD
    startHour: 9,
    duration: 2,
    projectId: '',
    status: 'Created' as TaskStatus,
    dependencies: [] as string[]
  };

  // Autocompletado de dependencias
  readonly depSearchQuery = signal('');
  readonly isDepDropdownOpen = signal(false);

  // Comentarios / Chat
  newCommentText = '';

  constructor() {
    // Rellenar formulario reactivamente cuando cargue la tarea
    effect(() => {
      const t = this.task();
      if (t) {
        const d = new Date(t.startDate);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${year}-${month}-${day}`;
        const hour = d.getHours();

        this.taskForm = {
          title: t.title,
          description: t.description || '',
          userId: t.userId,
          startDate: dateStr,
          startHour: hour,
          duration: t.duration,
          projectId: t.projectId || '',
          status: t.status,
          dependencies: t.dependencies || []
        };
      }
    });
  }

  ngOnInit() {
    this.route.paramMap.subscribe(params => {
      const id = params.get('id');
      if (id) {
        this.taskId.set(id);
        const t = this.task();
        if (!t) {
          this.router.navigate(['/']);
        }
      } else {
        this.router.navigate(['/']);
      }
    });
  }

  saveTask() {
    const current = this.task();
    if (!current) return;

    if (!this.taskForm.title.trim()) {
      this.uiService.warning(this.translationService.translate('El título es obligatorio'));
      return;
    }

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
      id: current.id,
      startDate: taskData.startDate,
      duration: taskData.duration,
      dependencies: taskData.dependencies
    });

    if (!validation.valid) {
      this.uiService.warning(validation.reason);
      return;
    }

    this.timelineService.updateTask({
      id: current.id,
      ...taskData,
      comments: current.comments
    });

    const isEn = this.translationService.currentLang() === 'en';
    this.uiService.success(isEn ? 'Task updated successfully' : 'Tarea actualizada correctamente');
  }

  deleteTask() {
    const current = this.task();
    if (!current) return;

    const confirmMsg = this.translationService.translate('¿Estás seguro de eliminar esta tarea?');
    const isEn = this.translationService.currentLang() === 'en';
    this.uiService.confirm(
      isEn ? 'Delete Task' : 'Eliminar Tarea',
      confirmMsg
    ).then(confirmed => {
      if (confirmed) {
        this.timelineService.deleteTask(current.id);
        this.router.navigate(['/']);
      }
    });
  }

  // Lógica de validación
  validateTaskTime(taskData: { id?: string; startDate: string; duration: number; dependencies?: string[] }): { valid: boolean; reason: string } {
    const taskStart = new Date(taskData.startDate).getTime();
    const taskEnd = taskStart + taskData.duration * 60 * 60 * 1000;
    const isEn = this.translationService.currentLang() === 'en';

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
              reason: isEn 
                ? `Dependency Conflict: This task must start after "${pred.title}" finishes (on ${predDate.getDate()}/${predDate.getMonth() + 1} at ${endHour}:00).`
                : `Conflicto de Dependencia: Esta tarea debe empezar después de que finalice "${pred.title}" (el ${dateStr} a las ${endHour}:00).`
            };
          }
        }
      }
    }

    if (taskData.id) {
      const successors = this.timelineService.tasks().filter(t => t.dependencies && t.dependencies.includes(taskData.id!));
      for (const succ of successors) {
        const succStart = new Date(succ.startDate).getTime();
        if (taskEnd > succStart) {
          const succDate = new Date(succ.startDate);
          const dateStr = `${succDate.getDate()}/${succDate.getMonth() + 1}`;
          return {
            valid: false,
            reason: isEn
              ? `Dependency Conflict: This task cannot end after the start of its dependent "${succ.title}" (on ${succDate.getDate()}/${succDate.getMonth() + 1} at ${succDate.getHours()}:00).`
              : `Conflicto de Dependencia: Esta tarea no puede terminar después del inicio de su dependiente "${succ.title}" (el ${dateStr} a las ${succDate.getHours()}:00).`
          };
        }
      }
    }

    return { valid: true, reason: '' };
  }

  // Dependencias autocompletado
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
    const t = this.timelineService.tasks().find(task => task.id === fromId);
    if (!t) return false;
    if (!t.dependencies) return false;
    if (t.dependencies.includes(toId)) return true;
    for (const depId of t.dependencies) {
      if (this.hasDependencyPath(depId, toId)) return true;
    }
    return false;
  }

  getEligiblePredecessors(): Task[] {
    const tasks = this.timelineService.tasks();
    const editId = this.taskId();
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
      this.getUserName(t.userId).toLowerCase().includes(query)
    );
  }

  toggleDepDropdown(open: boolean) {
    if (!open) {
      setTimeout(() => this.isDepDropdownOpen.set(false), 200);
    } else {
      this.isDepDropdownOpen.set(true);
    }
  }

  // Chat / Comentarios
  submitComment() {
    if (!this.newCommentText.trim()) return;
    const current = this.task();
    if (!current) return;

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
      ...current,
      comments: [...(current.comments || []), newComment]
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

  getUserName(userId: string): string {
    const user = this.timelineService.users().find(u => u.id === userId);
    return user ? user.name : 'Sin asignar';
  }

  getUserColorClass(userId: string): string {
    const users = this.timelineService.users();
    const idx = users.findIndex(u => u.id === userId);
    return `task-card-color-${idx >= 0 ? idx % 4 : 0}`;
  }

  getFormattedDateRange(startDateStr: string, duration: number): string {
    try {
      const startDate = new Date(startDateStr);
      const startStr = `${String(startDate.getHours()).padStart(2, '0')}:00`;
      const endHour = startDate.getHours() + duration;
      const endStr = `${String(endHour).padStart(2, '0')}:00`;
      const dateStr = `${startDate.getDate()}/${startDate.getMonth() + 1}`;
      return `${dateStr} (${startStr} - ${endStr})`;
    } catch {
      return '';
    }
  }

  getTaskTitle(taskId: string): string {
    const task = this.timelineService.tasks().find(t => t.id === taskId);
    return task ? task.title : 'Tarea eliminada';
  }

  // Métodos de archivos (R2)
  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const taskId = this.taskId();
      if (!taskId) return;
      
      const isEn = this.translationService.currentLang() === 'en';
      this.timelineService.uploadFile(taskId, file).subscribe({
        next: () => {
          this.uiService.success(isEn ? 'File uploaded successfully' : 'Archivo subido correctamente');
        },
        error: (err) => {
          this.uiService.error((isEn ? 'Error uploading file: ' : 'Error al subir el archivo: ') + (err.error?.error || err.message));
        }
      });
    }
  }

  deleteFile(fileId: string) {
    const isEn = this.translationService.currentLang() === 'en';
    const confirmMsg = isEn ? 'Are you sure you want to delete this file?' : '¿Estás seguro de que quieres eliminar este archivo?';
    this.uiService.confirm(
      isEn ? 'Delete File' : 'Eliminar Archivo',
      confirmMsg
    ).then(confirmed => {
      if (confirmed) {
        const taskId = this.taskId();
        if (!taskId) return;
        this.timelineService.deleteFile(taskId, fileId).subscribe({
          next: () => this.uiService.success(isEn ? 'File deleted successfully' : 'Archivo eliminado correctamente'),
          error: (err) => this.uiService.error((isEn ? 'Error deleting file: ' : 'Error al eliminar: ') + err.message)
        });
      }
    });
  }

  getFileIcon(type: string): string {
    if (type.startsWith('image/')) return '🖼️';
    if (type.includes('pdf')) return '📄';
    if (type.includes('word') || type.includes('officedocument')) return '📝';
    if (type.includes('zip') || type.includes('rar')) return '📦';
    return '📎';
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}
