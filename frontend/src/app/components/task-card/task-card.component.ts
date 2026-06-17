import { Component, input, output, inject, computed } from '@angular/core';
import { Task } from '../../models/types';
import { TimelineService } from '../../services/timeline.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

export interface TaskWithLayout extends Task {
  track: number;
  left: number;
  width: number;
  top: number;
}

@Component({
  selector: 'app-task-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './task-card.component.html',
  styleUrl: './task-card.component.css',
  host: {
    '[class.has-project]': 'task().projectId ? true : false',
    '[style.left.%]': 'task().left',
    '[style.width.%]': 'task().width',
    '[style.top.px]': 'task().top',
    '[style.borderBottomColor]': 'projectColor()'
  }
})
export class TaskCardComponent {
  task = input.required<TaskWithLayout>();
  showDelete = input<boolean>(false);

  delete = output<Event>();

  readonly timelineService = inject(TimelineService);
  readonly translationService = inject(TranslationService);

  projectColor = computed(() => {
    const projectId = this.task().projectId;
    if (!projectId) return 'transparent';
    const project = this.timelineService.projects().find(p => p.id === projectId);
    return project ? project.color : 'transparent';
  });

  onDelete(event: Event) {
    event.stopPropagation();
    this.delete.emit(event);
  }
}
