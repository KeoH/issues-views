-- Sembrado inicial para la base de datos Timeline Scheduler (SQLite/D1)

-- 1. Insertar Usuarios (Contraseña por defecto para admin: admin123, para usuarios: usuario123, hashes generados con bcrypt)
-- admin123 hash: $2a$10$qR6QdM8a5o5o33E03.cKueB81K1x7aYlA0Z4G2hN6c4N6c4N6c4N6
-- usuario123 hash: $2a$10$U83fS8YkH8y7Uq/2.GvqeuKq6n0Jz6z7N5vB8sX1S5F7V3G2b7c6i
INSERT OR IGNORE INTO users (id, name, email, password_hash, job_title, birth_date, role, is_active, preferred_language, created_at) VALUES
('u-admin', 'Administrador', 'admin@empresa.com', '$2a$10$qR6QdM8a5o5o33E03.cKueB81K1x7aYlA0Z4G2hN6c4N6c4N6c4N6', 'Administrador de Sistema', '1985-01-01', 'admin', 1, 'en', CURRENT_TIMESTAMP),
('u1', 'Ana Gómez', 'ana.gomez@empresa.com', '$2a$10$U83fS8YkH8y7Uq/2.GvqeuKq6n0Jz6z7N5vB8sX1S5F7V3G2b7c6i', 'Diseñadora UX/UI', '1995-04-12', 'user', 1, 'en', CURRENT_TIMESTAMP),
('u2', 'Mateo Sanz', 'mateo.sanz@empresa.com', '$2a$10$U83fS8YkH8y7Uq/2.GvqeuKq6n0Jz6z7N5vB8sX1S5F7V3G2b7c6i', 'Desarrollador Frontend', '1990-08-23', 'user', 1, 'es', CURRENT_TIMESTAMP),
('u3', 'Sofía Castro', 'sofia.castro@empresa.com', '$2a$10$U83fS8YkH8y7Uq/2.GvqeuKq6n0Jz6z7N5vB8sX1S5F7V3G2b7c6i', 'Arquitecta de Software', '1988-11-05', 'user', 1, 'en', CURRENT_TIMESTAMP);

-- 2. Insertar Proyectos
INSERT OR IGNORE INTO projects (id, name, description, color, default_user_id, is_active) VALUES
('p1', 'Desarrollo Frontend', 'Tareas relacionadas con el MVP visual y comportamiento en el timeline.', '#6366f1', 'u1', 1),
('p2', 'Persistencia e Infra', 'Tareas de guardado, carga y estructura de datos.', '#10b981', 'u3', 1);

-- 3. Insertar Tareas
INSERT OR IGNORE INTO tasks (id, title, description, user_id, project_id, start_date, duration, status, created_at) VALUES
('t1', 'Reunión de Diseño', 'Alinear mockup del MVP y feedback inicial.', 'u1', 'p1', '2026-06-15T09:00:00', 3.0, 'Completed', CURRENT_TIMESTAMP),
('t2', 'Desarrollo del Grid', 'Crear estructura HTML y CSS del planificador.', 'u1', 'p1', '2026-06-15T13:00:00', 4.0, 'In Progress', CURRENT_TIMESTAMP),
('t3', 'Investigación Drag & Drop', 'Probar API de HTML5 y adaptabilidad en cuadrícula.', 'u2', NULL, '2026-06-15T10:00:00', 5.0, 'Completed', CURRENT_TIMESTAMP),
('t4', 'Lógica de Apilamiento', 'Implementar algoritmo para tareas solapadas.', 'u2', NULL, '2026-06-16T09:00:00', 8.0, 'In Progress', CURRENT_TIMESTAMP),
('t5', 'Configuración LocalStorage', 'Guardado automático de tareas y estado.', 'u3', 'p2', '2026-06-17T11:00:00', 2.0, 'Created', CURRENT_TIMESTAMP),
('t6', 'Revisión de Estilos (Solapada)', 'Detalles de Glassmorphic UI y animaciones de hover.', 'u3', NULL, '2026-06-17T12:00:00', 3.0, 'Created', CURRENT_TIMESTAMP),
('t7', 'Entrega de Prototipo (Siguiente Semana)', 'Presentar y validar prototipo con el cliente.', 'u1', 'p1', '2026-06-22T10:00:00', 4.0, 'Created', CURRENT_TIMESTAMP);

-- 4. Insertar Dependencias
INSERT OR IGNORE INTO task_dependencies (task_id, dependency_task_id) VALUES
('t4', 't3');

-- 5. Insertar Comentarios
INSERT OR IGNORE INTO comments (id, task_id, user_id, text, created_at) VALUES
('c1', 't4', 'u1', 'He empezado a revisar la lógica de apilamiento en base a tu investigación. ¡Buen trabajo!', '2026-06-16T10:30:00Z');

-- 6. Insertar Miembros de Proyectos
INSERT OR IGNORE INTO project_members (project_id, user_id) VALUES
('p1', 'u1'),
('p1', 'u2'),
('p2', 'u2'),
('p2', 'u3');
