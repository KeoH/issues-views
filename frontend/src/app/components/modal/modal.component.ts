import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [],
  template: `
    @if (isOpen()) {
      <div class="modal-overlay active" (click)="onBackdropClick($event)">
        <div class="modal-content" 
             [class.modal-wide]="size() === 'wide' || size() === 'extra-wide'" 
             [class.with-chat]="size() === 'extra-wide'" 
             [class]="customClass()">
          <div class="modal-header">
            <h2>{{ title() }}</h2>
            <button class="modal-close-btn touch-target-expand" (click)="closeModal()" aria-label="Cerrar modal">&times;</button>
          </div>
          <ng-content></ng-content>
        </div>
      </div>
    }
  `
})
export class ModalComponent {
  title = input<string>('');
  isOpen = input<boolean>(false);
  size = input<'medium' | 'wide' | 'extra-wide'>('medium');
  customClass = input<string>('');

  close = output<void>();

  closeModal() {
    this.close.emit();
  }

  onBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      this.closeModal();
    }
  }
}
