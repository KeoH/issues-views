import { Component, model, inject } from '@angular/core';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';

@Component({
  selector: 'app-zoom-controls',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './zoom-controls.component.html',
  styleUrl: './zoom-controls.component.css'
})
export class ZoomControlsComponent {
  zoom = model<number>(1.0);
  readonly translationService = inject(TranslationService);

  zoomIn() {
    this.zoom.update(z => Math.min(3.0, z + 0.15));
  }

  zoomOut() {
    this.zoom.update(z => Math.max(0.6, z - 0.15));
  }

  resetZoom() {
    this.zoom.set(1.0);
  }
}
