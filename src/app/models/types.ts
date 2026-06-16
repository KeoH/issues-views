export interface User {
  id: string;
  name: string;
  email?: string;
  jobTitle?: string;
  birthDate?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  defaultUserId?: string; // ID del usuario por defecto para nuevas tareas
}

export type TaskStatus = 'Creado' | 'En proceso' | 'Cancelado' | 'Terminado';

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string; // ISO string
}

export interface Task {
  id: string;
  title: string;
  description: string;
  userId: string;
  startDate: string;   // Fecha de inicio (formato ISO YYYY-MM-DDTHH:mm:ss)
  duration: number;    // Duración en horas (ej. 1, 2, 4.5)
  dependencies?: string[]; // IDs de tareas predecesoras
  projectId?: string; // ID del proyecto asociado
  status: TaskStatus;
  comments?: Comment[];
}
