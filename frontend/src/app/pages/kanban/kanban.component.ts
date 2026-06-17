import { Component, signal, computed, inject, ChangeDetectionStrategy } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { Task, TaskStatus } from '../../models/types';
import { KanbanCardComponent } from '../../components/kanban-card/kanban-card.component';

@Component({
  selector: 'app-kanban',
  standalone: true,
  imports: [FormsModule, TranslatePipe, KanbanCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kanban.component.html',
  styleUrl: './kanban.component.css'
})
export class KanbanComponent {
  readonly timelineService = inject(TimelineService);
  readonly authService = inject(AuthService);
  readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  // Filtros activos
  readonly selectedProjectId = signal<string>('all');
  readonly selectedUserId = signal<string>('all');

  // Columnas de estados disponibles
  readonly statuses: TaskStatus[] = ['Created', 'In Progress', 'Completed', 'Cancelled'];

  // Columna actual sobre la que se está arrastrando (para efectos visuales)
  readonly activeDragOverColumn = signal<string | null>(null);

  // Tareas filtradas de acuerdo a los selectores de proyecto y usuario
  readonly filteredTasks = computed(() => {
    let list = this.timelineService.tasks();

    const projId = this.selectedProjectId();
    if (projId !== 'all') {
      list = list.filter(t => t.projectId === projId);
    }

    const usrId = this.selectedUserId();
    if (usrId !== 'all') {
      list = list.filter(t => t.userId === usrId);
    }

    return list;
  });

  // Tareas agrupadas por estado (un mapa/objeto para renderizar columnas)
  readonly tasksByStatus = computed(() => {
    const tasks = this.filteredTasks();
    const groups: Record<TaskStatus, Task[]> = {
      'Created': [],
      'In Progress': [],
      'Completed': [],
      'Cancelled': []
    };

    for (const task of tasks) {
      if (groups[task.status]) {
        groups[task.status].push(task);
      } else {
        // Fallback por si hay estados inesperados o diferencias de tipado
        groups['Created'].push(task);
      }
    }

    return groups;
  });



  // Navegar al detalle de la tarea
  openTaskDetail(taskId: string) {
    this.router.navigate(['/tarea', taskId]);
  }

  // Drag and Drop handlers
  onDragStart(event: DragEvent, task: Task) {
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', task.id);
      event.dataTransfer.effectAllowed = 'move';
      
      // Añadir clase visual al elemento arrastrado si es necesario
      const element = event.target as HTMLElement;
      element.classList.add('is-dragging');
    }
  }

  onDragEnd(event: DragEvent) {
    const element = event.target as HTMLElement;
    element.classList.remove('is-dragging');
    this.activeDragOverColumn.set(null);
  }

  onDragOver(event: DragEvent, status: TaskStatus) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
    
    if (this.activeDragOverColumn() !== status) {
      this.activeDragOverColumn.set(status);
    }
  }

  onDragLeave(event: DragEvent) {
    // Solo quitamos el efecto si salimos del contenedor principal de la columna
    const element = event.currentTarget as HTMLElement;
    const relatedTarget = event.relatedTarget as HTMLElement;
    
    if (!element.contains(relatedTarget)) {
      this.activeDragOverColumn.set(null);
    }
  }

  onDrop(event: DragEvent, targetStatus: TaskStatus) {
    event.preventDefault();
    this.activeDragOverColumn.set(null);

    if (event.dataTransfer) {
      const taskId = event.dataTransfer.getData('text/plain');
      const task = this.timelineService.tasks().find(t => t.id === taskId);
      
      if (task) {
        if (task.status !== targetStatus) {
          // Actualización optimista y llamada al backend a través del servicio
          this.timelineService.updateTask({
            ...task,
            status: targetStatus
          });
        }
      }
    }
  }
}
