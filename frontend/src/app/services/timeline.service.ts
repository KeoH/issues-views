import { Injectable, signal, computed, inject, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { User, Task, Project, Comment } from '../models/types';
import { AuthService } from './auth.service';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class TimelineService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly users = signal<User[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly projects = signal<Project[]>([]);

  // Compatibilidad: Retornar ID del usuario autenticado
  readonly currentUserId = computed(() => this.authService.currentUser()?.id || '');

  constructor() {
    // Cargar datos automáticamente cuando el usuario inicia sesión
    effect(() => {
      if (this.authService.isLoggedIn()) {
        this.loadAllData();
      } else {
        this.clearAllLocalSignals();
      }
    });
  }

  loadAllData() {
    this.loadUsers().subscribe();
    this.loadProjects().subscribe();
    this.loadTasks().subscribe();
  }

  private clearAllLocalSignals() {
    this.users.set([]);
    this.tasks.set([]);
    this.projects.set([]);
  }

  // ==========================================
  // USUARIOS
  // ==========================================
  loadUsers(): Observable<User[]> {
    return this.http.get<User[]>('/api/users').pipe(
      tap(users => this.users.set(users))
    );
  }

  addUser(name: string): User {
    const newId = crypto.randomUUID();
    const newUser: User = {
      id: newId,
      name: name.trim(),
      email: `${name.trim().toLowerCase().replace(/\s+/g, '.')}@empresa.com`,
      jobTitle: 'Nuevo Colaborador',
      isActive: 1
    };

    // Actualización optimista de UI
    this.users.update(users => [...users, newUser]);

    // Llamada HTTP en segundo plano
    this.http.post<User>('/api/users', {
      name: newUser.name,
      email: newUser.email,
      password: 'usuario123',
      role: 'user',
      jobTitle: newUser.jobTitle,
      isActive: 1
    }).subscribe({
      next: () => this.loadUsers().subscribe(),
      error: () => this.loadUsers().subscribe()
    });

    return newUser;
  }

  createUser(user: Omit<User, 'id'> & { password?: string }): Observable<User> {
    const newId = crypto.randomUUID();
    const newUser: User = {
      ...user,
      id: newId,
      isActive: user.isActive !== undefined ? user.isActive : 1
    };

    // Actualización optimista
    this.users.update(users => [...users, newUser]);

    return this.http.post<User>('/api/users', {
      name: user.name,
      email: user.email,
      password: user.password || 'usuario123',
      role: user.role || 'user',
      jobTitle: user.jobTitle || null,
      birthDate: user.birthDate || null,
      isActive: newUser.isActive
    }).pipe(
      tap(() => this.loadUsers().subscribe())
    );
  }

  updateUser(updatedUser: User & { password?: string }) {
    // Actualización optimista
    this.users.update(users =>
      users.map(u => (u.id === updatedUser.id ? updatedUser : u))
    );

    this.http.put<User>(`/api/users/${updatedUser.id}`, updatedUser).subscribe({
      next: () => {
        this.loadUsers().subscribe();
        // Si se actualizó el perfil del usuario activo, recargar sesión
        const current = this.authService.currentUser();
        if (current && current.id === updatedUser.id) {
          this.authService.initSession().subscribe();
        }
      },
      error: () => this.loadUsers().subscribe()
    });
  }

  deleteUser(userId: string) {
    // Actualización optimista
    this.users.update(users => users.filter(u => u.id !== userId));

    this.http.delete(`/api/users/${userId}`).subscribe({
      next: () => {
        this.loadUsers().subscribe();
        this.loadTasks().subscribe();
      },
      error: () => {
        this.loadUsers().subscribe();
      }
    });
  }

  // ==========================================
  // PROYECTOS
  // ==========================================
  loadProjects(): Observable<Project[]> {
    return this.http.get<Project[]>('/api/projects').pipe(
      tap(projects => this.projects.set(projects))
    );
  }

  addProject(projectInput: Omit<Project, 'id'>): Project {
    const newId = crypto.randomUUID();
    const newProject: Project = {
      ...projectInput,
      id: newId,
      isActive: projectInput.isActive !== undefined ? projectInput.isActive : 1,
      members: projectInput.members || []
    };

    // Actualización optimista
    this.projects.update(projects => [...projects, newProject]);

    this.http.post<Project>('/api/projects', {
      name: projectInput.name,
      description: projectInput.description,
      color: projectInput.color,
      defaultUserId: projectInput.defaultUserId || null,
      isActive: newProject.isActive
    }).subscribe({
      next: () => this.loadProjects().subscribe(),
      error: () => this.loadProjects().subscribe()
    });

    return newProject;
  }

  updateProject(updatedProject: Project) {
    // Actualización optimista
    this.projects.update(projects =>
      projects.map(p => (p.id === updatedProject.id ? updatedProject : p))
    );

    this.http.put<Project>(`/api/projects/${updatedProject.id}`, {
      name: updatedProject.name,
      description: updatedProject.description,
      color: updatedProject.color,
      defaultUserId: updatedProject.defaultUserId || null,
      isActive: updatedProject.isActive
    }).subscribe({
      next: () => this.loadProjects().subscribe(),
      error: () => this.loadProjects().subscribe()
    });
  }

  deleteProject(projectId: string) {
    // Actualización optimista
    this.projects.update(projects => projects.filter(p => p.id !== projectId));

    this.http.delete(`/api/projects/${projectId}`).subscribe({
      next: () => {
        this.loadProjects().subscribe();
        this.loadTasks().subscribe();
      },
      error: () => {
        this.loadProjects().subscribe();
      }
    });
  }

  // MIEMBROS DE PROYECTO
  getProjectMembers(projectId: string): Observable<User[]> {
    return this.http.get<User[]>(`/api/projects/${projectId}/members`);
  }

  updateProjectMembers(projectId: string, userIds: string[]): Observable<any> {
    return this.http.put(`/api/projects/${projectId}/members`, { userIds }).pipe(
      tap(() => this.loadProjects().subscribe())
    );
  }

  // ==========================================
  // TAREAS
  // ==========================================
  loadTasks(): Observable<Task[]> {
    return this.http.get<Task[]>('/api/tasks').pipe(
      tap(tasks => this.tasks.set(tasks))
    );
  }

  addTask(taskInput: Omit<Task, 'id'>): Task {
    const newId = crypto.randomUUID();
    const newTask: Task = {
      ...taskInput,
      id: newId,
      comments: [],
      files: []
    };

    // Actualización optimista
    this.tasks.update(tasks => [...tasks, newTask]);

    const { dependencies, ...taskBody } = taskInput;
    this.http.post<Task>('/api/tasks', {
      ...taskBody,
      dependencies: dependencies || []
    }).subscribe({
      next: () => this.loadTasks().subscribe(),
      error: () => this.loadTasks().subscribe()
    });

    return newTask;
  }

  updateTask(updatedTask: Task) {
    // Actualización optimista
    this.tasks.update(tasks =>
      tasks.map(t => (t.id === updatedTask.id ? updatedTask : t))
    );

    const { comments, files, ...taskData } = updatedTask;
    this.http.put(`/api/tasks/${updatedTask.id}`, taskData).subscribe({
      next: () => this.loadTasks().subscribe(),
      error: () => this.loadTasks().subscribe()
    });
  }

  deleteTask(taskId: string) {
    // Actualización optimista
    this.tasks.update(tasks => tasks.filter(t => t.id !== taskId));

    this.http.delete(`/api/tasks/${taskId}`).subscribe({
      next: () => this.loadTasks().subscribe(),
      error: () => this.loadTasks().subscribe()
    });
  }

  // ==========================================
  // COMENTARIOS
  // ==========================================
  addComment(taskId: string, text: string) {
    this.http.post<Comment>(`/api/tasks/${taskId}/comments`, { text }).subscribe({
      next: () => this.loadTasks().subscribe(),
      error: () => this.loadTasks().subscribe()
    });
  }

  deleteComment(taskId: string, commentId: string) {
    this.http.delete(`/api/tasks/${taskId}/comments/${commentId}`).subscribe({
      next: () => this.loadTasks().subscribe(),
      error: () => this.loadTasks().subscribe()
    });
  }

  // ==========================================
  // ARCHIVOS (SUBIDAS R2)
  // ==========================================
  uploadFile(taskId: string, file: File): Observable<any> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post(`/api/tasks/${taskId}/files`, formData).pipe(
      tap(() => this.loadTasks().subscribe())
    );
  }

  deleteFile(taskId: string, fileId: string): Observable<any> {
    return this.http.delete(`/api/tasks/${taskId}/files/${fileId}`).pipe(
      tap(() => this.loadTasks().subscribe())
    );
  }

  initializeSeedData() {
    this.loadAllData();
  }
}
