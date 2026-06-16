import { Injectable, signal, effect } from '@angular/core';
import { User, Task, Project } from '../models/types';

@Injectable({
  providedIn: 'root'
})
export class TimelineService {
  readonly users = signal<User[]>([]);
  readonly tasks = signal<Task[]>([]);
  readonly projects = signal<Project[]>([]);
  readonly currentUserId = signal<string>('');

  private readonly STORAGE_USERS_KEY = 'timeline_users';
  private readonly STORAGE_TASKS_KEY = 'timeline_tasks';
  private readonly STORAGE_PROJECTS_KEY = 'timeline_projects';
  private readonly STORAGE_CURRENT_USER_KEY = 'timeline_current_user';

  constructor() {
    this.loadFromStorage();

    // Guardado automático cuando cambian los signals
    effect(() => {
      localStorage.setItem(this.STORAGE_USERS_KEY, JSON.stringify(this.users()));
    });

    effect(() => {
      localStorage.setItem(this.STORAGE_TASKS_KEY, JSON.stringify(this.tasks()));
    });

    effect(() => {
      localStorage.setItem(this.STORAGE_PROJECTS_KEY, JSON.stringify(this.projects()));
    });

    effect(() => {
      localStorage.setItem(this.STORAGE_CURRENT_USER_KEY, this.currentUserId());
    });
  }

  private loadFromStorage() {
    const storedUsers = localStorage.getItem(this.STORAGE_USERS_KEY);
    const storedTasks = localStorage.getItem(this.STORAGE_TASKS_KEY);
    const storedProjects = localStorage.getItem(this.STORAGE_PROJECTS_KEY);
    const storedCurrentUser = localStorage.getItem(this.STORAGE_CURRENT_USER_KEY);

    if (storedUsers && storedTasks && storedProjects) {
      this.users.set(JSON.parse(storedUsers));
      this.tasks.set(JSON.parse(storedTasks));
      this.projects.set(JSON.parse(storedProjects));
      if (storedCurrentUser) {
        this.currentUserId.set(storedCurrentUser);
      } else {
        this.currentUserId.set('admin');
      }
    } else {
      this.initializeSeedData();
    }
  }

  initializeSeedData() {
    const defaultUsers: User[] = [
      { 
        id: 'u1', 
        name: 'Ana Gómez', 
        email: 'ana.gomez@empresa.com', 
        jobTitle: 'Diseñadora UX/UI', 
        birthDate: '1995-04-12' 
      },
      { 
        id: 'u2', 
        name: 'Mateo Sanz', 
        email: 'mateo.sanz@empresa.com', 
        jobTitle: 'Desarrollador Frontend', 
        birthDate: '1990-08-23' 
      },
      { 
        id: 'u3', 
        name: 'Sofía Castro', 
        email: 'sofia.castro@empresa.com', 
        jobTitle: 'Arquitecta de Software', 
        birthDate: '1988-11-05' 
      }
    ];

    const defaultProjects: Project[] = [
      {
        id: 'p1',
        name: 'Desarrollo Frontend',
        description: 'Tareas relacionadas con el MVP visual y comportamiento en el timeline.',
        color: '#6366f1', // Indigo
        defaultUserId: 'u1'
      },
      {
        id: 'p2',
        name: 'Persistencia e Infra',
        description: 'Tareas de guardado, carga y estructura de datos.',
        color: '#10b981' // Emerald
      }
    ];

    const defaultTasks: Task[] = [
      {
        id: 't1',
        title: 'Reunión de Diseño',
        description: 'Alinear mockup del MVP y feedback inicial.',
        userId: 'u1',
        startDate: '2026-06-15T09:00:00',
        duration: 3,
        projectId: 'p1',
        status: 'Terminado'
      },
      {
        id: 't2',
        title: 'Desarrollo del Grid',
        description: 'Crear estructura HTML y CSS del planificador.',
        userId: 'u1',
        startDate: '2026-06-15T13:00:00',
        duration: 4,
        projectId: 'p1',
        status: 'En proceso'
      },
      {
        id: 't3',
        title: 'Investigación Drag & Drop',
        description: 'Probar API de HTML5 y adaptabilidad en cuadrícula.',
        userId: 'u2',
        startDate: '2026-06-15T10:00:00',
        duration: 5,
        status: 'Terminado'
      },
      {
        id: 't4',
        title: 'Lógica de Apilamiento',
        description: 'Implementar algoritmo para tareas solapadas.',
        userId: 'u2',
        startDate: '2026-06-16T09:00:00',
        duration: 8,
        dependencies: ['t3'],
        status: 'En proceso'
      },
      {
        id: 't5',
        title: 'Configuración LocalStorage',
        description: 'Guardado automático de tareas y estado.',
        userId: 'u3',
        startDate: '2026-06-17T11:00:00',
        duration: 2,
        projectId: 'p2',
        status: 'Creado'
      },
      {
        id: 't6',
        title: 'Revisión de Estilos (Solapada)',
        description: 'Detalles de Glassmorphic UI y animaciones de hover.',
        userId: 'u3',
        startDate: '2026-06-17T12:00:00',
        duration: 3,
        status: 'Creado'
      },
      {
        id: 't7',
        title: 'Entrega de Prototipo (Siguiente Semana)',
        description: 'Presentar y validar prototipo con el cliente.',
        userId: 'u1',
        startDate: '2026-06-22T10:00:00',
        duration: 4,
        projectId: 'p1',
        status: 'Creado'
      }
    ];

    this.users.set(defaultUsers);
    this.projects.set(defaultProjects);
    this.tasks.set(defaultTasks);
    this.currentUserId.set('admin');
  }

  addUser(name: string): User {
    const newUser: User = {
      id: crypto.randomUUID(),
      name: name.trim()
    };
    this.users.update(users => [...users, newUser]);
    return newUser;
  }

  updateUser(updatedUser: User) {
    this.users.update(users =>
      users.map(u => (u.id === updatedUser.id ? updatedUser : u))
    );

    // Apply cascade over comments where comment.userId matches updatedUser.id
    this.tasks.update(tasks =>
      tasks.map(t => {
        if (t.comments) {
          const updatedComments = t.comments.map(c => {
            if (c.userId === updatedUser.id) {
              return { ...c, userName: updatedUser.name };
            }
            return c;
          });
          return { ...t, comments: updatedComments };
        }
        return t;
      })
    );
  }

  deleteUser(userId: string) {
    const tasksToDelete = this.tasks().filter(t => t.userId === userId).map(t => t.id);
    
    // Reset active user if deleted
    if (this.currentUserId() === userId) {
      this.currentUserId.set('admin');
    }

    // Eliminar el usuario
    this.users.update(users => users.filter(u => u.id !== userId));
    
    // Limpiar defaultUserId en proyectos si coincidía con el usuario borrado
    this.projects.update(projects =>
      projects.map(p => p.defaultUserId === userId ? { ...p, defaultUserId: undefined } : p)
    );

    // Eliminar tareas asociadas y limpiar las dependencias en las tareas restantes
    this.tasks.update(tasks => 
      tasks
        .filter(t => t.userId !== userId)
        .map(t => {
          if (t.dependencies) {
            const cleanDeps = t.dependencies.filter(id => !tasksToDelete.includes(id));
            if (cleanDeps.length !== t.dependencies.length) {
              return { ...t, dependencies: cleanDeps };
            }
          }
          return t;
        })
    );
  }

  updateProject(updatedProject: Project) {
    this.projects.update(projects =>
      projects.map(p => (p.id === updatedProject.id ? updatedProject : p))
    );
  }

  addProject(projectInput: Omit<Project, 'id'>): Project {
    const newProject: Project = {
      ...projectInput,
      id: crypto.randomUUID()
    };
    this.projects.update(projects => [...projects, newProject]);
    return newProject;
  }

  deleteProject(projectId: string) {
    const tasksToDelete = this.tasks().filter(t => t.projectId === projectId).map(t => t.id);

    // Eliminar el proyecto
    this.projects.update(projects => projects.filter(p => p.id !== projectId));

    // Eliminar tareas asociadas y limpiar las dependencias en las tareas restantes
    this.tasks.update(tasks =>
      tasks
        .filter(t => t.projectId !== projectId)
        .map(t => {
          if (t.dependencies) {
            const cleanDeps = t.dependencies.filter(id => !tasksToDelete.includes(id));
            if (cleanDeps.length !== t.dependencies.length) {
              return { ...t, dependencies: cleanDeps };
            }
          }
          return t;
        })
    );
  }

  addTask(taskInput: Omit<Task, 'id'>): Task {
    const newTask: Task = {
      ...taskInput,
      id: crypto.randomUUID()
    };
    this.tasks.update(tasks => [...tasks, newTask]);
    return newTask;
  }

  updateTask(updatedTask: Task) {
    this.tasks.update(tasks =>
      tasks.map(t => (t.id === updatedTask.id ? updatedTask : t))
    );
  }

  deleteTask(taskId: string) {
    this.tasks.update(tasks => 
      tasks
        .filter(t => t.id !== taskId)
        .map(t => {
          if (t.dependencies && t.dependencies.includes(taskId)) {
            return {
              ...t,
              dependencies: t.dependencies.filter(id => id !== taskId)
            };
          }
          return t;
        })
    );
  }

  clearAll() {
    localStorage.removeItem(this.STORAGE_USERS_KEY);
    localStorage.removeItem(this.STORAGE_TASKS_KEY);
    localStorage.removeItem(this.STORAGE_PROJECTS_KEY);
    this.users.set([]);
    this.tasks.set([]);
    this.projects.set([]);
  }
}
