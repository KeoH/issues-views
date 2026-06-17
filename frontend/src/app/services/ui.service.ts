import { Injectable, signal } from '@angular/core';

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}

@Injectable({
  providedIn: 'root'
})
export class UiService {
  // Estado de plegado de la barra lateral
  readonly isSidebarCollapsed = signal(false);

  // Estados de modales para creación (desacoplados)
  readonly isTaskModalOpen = signal(false);
  readonly isProjectModalOpen = signal(false);
  readonly isUserModalOpen = signal(false);

  // Lista de notificaciones activas
  readonly notifications = signal<ToastNotification[]>([]);

  toggleSidebar() {
    this.isSidebarCollapsed.update(collapsed => !collapsed);
  }

  openTaskModal() {
    this.isTaskModalOpen.set(true);
  }

  closeTaskModal() {
    this.isTaskModalOpen.set(false);
  }

  openProjectModal() {
    this.isProjectModalOpen.set(true);
  }

  closeProjectModal() {
    this.isProjectModalOpen.set(false);
  }

  openUserModal() {
    this.isUserModalOpen.set(true);
  }

  closeUserModal() {
    this.isUserModalOpen.set(false);
  }

  // Estados de modal de confirmación
  readonly confirmVisible = signal(false);
  readonly confirmTitle = signal('');
  readonly confirmMessage = signal('');
  private confirmResolver: ((value: boolean) => void) | null = null;

  confirm(title: string, message: string): Promise<boolean> {
    this.confirmTitle.set(title);
    this.confirmMessage.set(message);
    this.confirmVisible.set(true);
    return new Promise<boolean>((resolve) => {
      this.confirmResolver = resolve;
    });
  }

  resolveConfirm(value: boolean) {
    this.confirmVisible.set(false);
    if (this.confirmResolver) {
      this.confirmResolver(value);
      this.confirmResolver = null;
    }
  }

  // Notificaciones Toast
  show(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info', durationMs: number = 4000) {
    const id = crypto.randomUUID();
    this.notifications.update(list => [...list, { id, message, type }]);
    setTimeout(() => {
      this.notifications.update(list => list.filter(n => n.id !== id));
    }, durationMs);
  }

  success(message: string, durationMs?: number) {
    this.show(message, 'success', durationMs);
  }

  error(message: string, durationMs?: number) {
    this.show(message, 'error', durationMs);
  }

  warning(message: string, durationMs?: number) {
    this.show(message, 'warning', durationMs);
  }

  info(message: string, durationMs?: number) {
    this.show(message, 'info', durationMs);
  }
}
