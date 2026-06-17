import { Component, model, inject } from '@angular/core';
import { getMonday, addDays, formatDateRange } from '../../utils/date-utils';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-week-navigation',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './week-navigation.component.html',
  styleUrl: './week-navigation.component.css'
})
export class WeekNavigationComponent {
  monday = model.required<Date>();
  readonly translationService = inject(TranslationService);

  getFormattedWeekRange() {
    return formatDateRange(this.monday());
  }

  prevWeek() {
    this.monday.update(d => addDays(d, -7));
  }

  nextWeek() {
    this.monday.update(d => addDays(d, 7));
  }

  goToCurrentWeek() {
    this.monday.set(getMonday(new Date('2026-06-16')));
  }
}
