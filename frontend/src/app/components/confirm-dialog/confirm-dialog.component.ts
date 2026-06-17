import { Component, inject } from '@angular/core';
import { UiService } from '../../services/ui.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [TranslatePipe],
  template: `
    <div class="confirm-overlay" [class.active]="uiService.confirmVisible()">
      <div class="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
        <h3 id="confirm-title">{{ uiService.confirmTitle() | translate:translationService.currentLang() }}</h3>
        <p id="confirm-desc">{{ uiService.confirmMessage() | translate:translationService.currentLang() }}</p>
        <div class="confirm-actions">
          <button class="btn btn-secondary touch-target-expand" (click)="uiService.resolveConfirm(false)" [attr.aria-label]="'Cancelar' | translate:translationService.currentLang()">
            {{ 'Cancelar' | translate:translationService.currentLang() }}
          </button>
          <button class="btn btn-primary touch-target-expand" (click)="uiService.resolveConfirm(true)" [attr.aria-label]="'Confirmar' | translate:translationService.currentLang()">
            {{ 'Confirmar' | translate:translationService.currentLang() }}
          </button>
        </div>
      </div>
    </div>
  `
})
export class ConfirmDialogComponent {
  readonly uiService = inject(UiService);
  readonly translationService = inject(TranslationService);
}
