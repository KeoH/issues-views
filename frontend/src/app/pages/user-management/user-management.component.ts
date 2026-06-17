import { Component, signal, computed, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TimelineService } from '../../services/timeline.service';
import { AuthService } from '../../services/auth.service';
import { TranslationService } from '../../services/translation.service';
import { TranslatePipe } from '../../pipes/translate.pipe';
import { UiService } from '../../services/ui.service';
import { User } from '../../models/types';
import { ModalComponent } from '../../components/modal/modal.component';

@Component({
  selector: 'app-user-management',
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe, ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.css'
})
export class UserManagementComponent implements OnInit {
  readonly timelineService = inject(TimelineService);
  readonly authService = inject(AuthService);
  readonly uiService = inject(UiService);
  readonly translationService = inject(TranslationService);
  private readonly router = inject(Router);

  // Filtro de búsqueda
  readonly searchQuery = signal('');

  // Control del modal
  get isModalOpen() {
    return this.uiService.isUserModalOpen;
  }

  readonly editingUser = signal<User | null>(null);

  // Formulario del usuario
  userForm = {
    id: '',
    name: '',
    email: '',
    password: '',
    jobTitle: '',
    birthDate: '',
    role: 'user' as 'admin' | 'user',
    isActive: 1
  };

  ngOnInit() {
    // Redirigir si no es administrador
    if (!this.authService.isAdmin()) {
      this.router.navigate(['/']);
    }
  }

  // Lista de usuarios filtrados
  readonly filteredUsers = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const users = this.timelineService.users();
    if (!query) return users;
    return users.filter(u => 
      u.name.toLowerCase().includes(query) || 
      (u.email && u.email.toLowerCase().includes(query))
    );
  });

  openCreateModal() {
    this.editingUser.set(null);
    this.userForm = {
      id: '',
      name: '',
      email: '',
      password: '',
      jobTitle: '',
      birthDate: '',
      role: 'user',
      isActive: 1
    };
    this.isModalOpen.set(true);
  }

  openEditModal(user: User) {
    this.editingUser.set(user);
    this.userForm = {
      id: user.id,
      name: user.name,
      email: user.email || '',
      password: '', // Vacío por defecto al editar
      jobTitle: user.jobTitle || '',
      birthDate: user.birthDate || '',
      role: (user.role || 'user') as 'admin' | 'user',
      isActive: user.isActive !== undefined ? user.isActive : 1
    };
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.editingUser.set(null);
  }

  toggleUserStatus(user: User, event: Event) {
    event.stopPropagation();
    const newStatus = user.isActive === 0 ? 1 : 0;
    this.timelineService.updateUser({
      ...user,
      isActive: newStatus
    });
  }

  onSubmit() {
    const isEn = this.translationService.currentLang() === 'en';
    if (!this.userForm.name.trim() || !this.userForm.email.trim()) {
      this.uiService.warning(isEn ? 'Name and email are required.' : 'El nombre y el correo electrónico son obligatorios.');
      return;
    }

    const isEditing = !!this.editingUser();

    if (!isEditing && !this.userForm.password.trim()) {
      this.uiService.warning(isEn ? 'Password is required for new users.' : 'La contraseña es obligatoria para nuevos usuarios.');
      return;
    }

    const userData = {
      name: this.userForm.name.trim(),
      email: this.userForm.email.trim(),
      jobTitle: this.userForm.jobTitle.trim() || undefined,
      birthDate: this.userForm.birthDate || undefined,
      role: this.userForm.role,
      isActive: this.userForm.isActive
    };

    if (isEditing) {
      const original = this.editingUser()!;
      const updateObj: User & { password?: string } = {
        ...original,
        ...userData
      };
      if (this.userForm.password.trim()) {
        updateObj.password = this.userForm.password.trim();
      }
      this.timelineService.updateUser(updateObj);
      this.uiService.success(isEn ? 'User updated successfully.' : 'Usuario actualizado correctamente.');
    } else {
      this.timelineService.createUser({
        ...userData,
        password: this.userForm.password.trim()
      }).subscribe({
        next: () => {
          this.uiService.success(isEn ? 'User created successfully.' : 'Usuario creado correctamente.');
        },
        error: (err) => {
          this.uiService.error((isEn ? 'Error creating user: ' : 'Error al crear usuario: ') + (err.error?.error || err.message));
        }
      });
    }

    this.closeModal();
  }

  deleteUser(user: User, event: Event) {
    event.stopPropagation();
    
    if (user.id === this.authService.currentUser()?.id) {
      this.uiService.error(this.translationService.translate('No puedes eliminarte a ti mismo'));
      return;
    }

    const isEn = this.translationService.currentLang() === 'en';
    const confirmMsg = isEn 
      ? `Are you sure you want to delete ${user.name}? All of their tasks will also be permanently deleted.`
      : `¿Estás seguro de eliminar a ${user.name}? También se borrarán permanentemente todas sus tareas.`;

    this.uiService.confirm(
      isEn ? 'Delete User' : 'Eliminar Usuario',
      confirmMsg
    ).then(confirmed => {
      if (confirmed) {
        this.timelineService.deleteUser(user.id);
        this.uiService.success(isEn ? 'User deleted successfully.' : 'Usuario eliminado correctamente.');
      }
    });
  }

  getUserInitials(name: string): string {
    if (!name) return 'US';
    const parts = name.split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  }
}
