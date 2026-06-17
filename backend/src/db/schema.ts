import { sqliteTable, text, integer, real, primaryKey } from 'drizzle-orm/sqlite-core';
import { relations, sql } from 'drizzle-orm';

// Tabla de Usuarios
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  jobTitle: text('job_title'),
  birthDate: text('birth_date'),
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  preferredLanguage: text('preferred_language').notNull().default('en'), // 'en' | 'es'
  isActive: integer('is_active').notNull().default(1),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
});

// Tabla de Proyectos
export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  color: text('color').notNull(),
  defaultUserId: text('default_user_id').references(() => users.id, { onDelete: 'set null' }),
  isActive: integer('is_active').notNull().default(1)
});

// Tabla de Tareas
export const tasks = sqliteTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  startDate: text('start_date').notNull(), // Formato ISO 8601
  duration: real('duration').notNull(),    // En horas (ej: 3.5)
  status: text('status').notNull().default('Created'), // 'Created' | 'In Progress' | 'Cancelled' | 'Completed'
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at')
});

// Tabla de Relación de Dependencias de Tareas (N a M)
export const taskDependencies = sqliteTable('task_dependencies', {
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  dependencyTaskId: text('dependency_task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' })
}, (table) => [
  primaryKey({ columns: [table.taskId, table.dependencyTaskId] })
]);

// Tabla de Comentarios en Tareas
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// Tabla de Archivos Subidos a Tareas (R2)
export const taskFiles = sqliteTable('task_files', {
  id: text('id').primaryKey(),
  taskId: text('task_id').notNull().references(() => tasks.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  size: integer('size').notNull(),
  type: text('type').notNull(),
  r2Key: text('r2_key').notNull(),
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// Tabla de Refresh Tokens (Sesión / Seguridad)
export const refreshTokens = sqliteTable('refresh_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at').notNull(), // Epoch timestamp
  revoked: integer('revoked').notNull().default(0), // 0 = false, 1 = true
  createdAt: text('created_at').default(sql`CURRENT_TIMESTAMP`)
});

// Tabla de Miembros del Proyecto (Muchos a Muchos)
export const projectMembers = sqliteTable('project_members', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' })
}, (table) => [
  primaryKey({ columns: [table.projectId, table.userId] })
]);

// Relaciones para facilitar consultas con Drizzle Queries API
export const usersRelations = relations(users, ({ many }) => ({
  projects: many(projects),
  projectMembers: many(projectMembers),
  tasks: many(tasks),
  comments: many(comments),
  refreshTokens: many(refreshTokens)
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  defaultUser: one(users, {
    fields: [projects.defaultUserId],
    references: [users.id]
  }),
  members: many(projectMembers),
  tasks: many(tasks)
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
  project: one(projects, {
    fields: [projectMembers.projectId],
    references: [projects.id]
  }),
  user: one(users, {
    fields: [projectMembers.userId],
    references: [users.id]
  })
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  user: one(users, {
    fields: [tasks.userId],
    references: [users.id]
  }),
  project: one(projects, {
    fields: [tasks.projectId],
    references: [projects.id]
  }),
  comments: many(comments),
  files: many(taskFiles),
  dependencies: many(taskDependencies, { relationName: 'task_dependencies' })
}));

export const taskDependenciesRelations = relations(taskDependencies, ({ one }) => ({
  task: one(tasks, {
    fields: [taskDependencies.taskId],
    references: [tasks.id],
    relationName: 'task_dependencies'
  }),
  dependency: one(tasks, {
    fields: [taskDependencies.dependencyTaskId],
    references: [tasks.id],
    relationName: 'task_dependency_target'
  })
}));

export const commentsRelations = relations(comments, ({ one }) => ({
  task: one(tasks, {
    fields: [comments.taskId],
    references: [tasks.id]
  }),
  user: one(users, {
    fields: [comments.userId],
    references: [users.id]
  })
}));

export const taskFilesRelations = relations(taskFiles, ({ one }) => ({
  task: one(tasks, {
    fields: [taskFiles.taskId],
    references: [tasks.id]
  })
}));
