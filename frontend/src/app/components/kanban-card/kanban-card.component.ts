import { Component, input, inject } from '@angular/core';
import { Task } from '../../models/types';
import { TimelineService } from '../../services/timeline.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-kanban-card',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './kanban-card.component.html',
  styleUrl: './kanban-card.component.css',
  host: {
    'class': 'kanban-card'
  }
})
export class KanbanCardComponent {
  task = input.required<Task>();

  readonly timelineService = inject(TimelineService);
  readonly translationService = inject(TranslationService);

  getProjectName(projectId?: string): string {
    if (!projectId) return '';
    const proj = this.timelineService.projects().find(p => p.id === projectId);
    return proj ? proj.name : '';
  }

  getProjectColor(projectId?: string): string {
    if (!projectId) return 'transparent';
    const proj = this.timelineService.projects().find(p => p.id === projectId);
    return proj ? proj.color : 'transparent';
  }

  getUserName(userId: string): string {
    const user = this.timelineService.users().find(u => u.id === userId);
    return user ? user.name : this.translationService.translate('Sin asignar');
  }

  getUserColorClass(userId: string): string {
    const index = this.timelineService.users().findIndex(u => u.id === userId);
    if (index === -1) return 'user-color-default';
    return `user-color-${index % 10}`;
  }

  getFormattedDate(dateStr: string): string {
    try {
      const date = new Date(dateStr);
      const day = String(date.getDate()).padStart(2, '0');
      const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      const month = this.translationService.translate(months[date.getMonth()]);
      const hour = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      return `${day} ${month}, ${hour}:${min}`;
    } catch {
      return dateStr;
    }
  }
}
