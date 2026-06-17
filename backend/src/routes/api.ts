import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import * as schema from '../db/schema';
import {
  generateAccessToken,
  generateRefreshToken,
  hashPassword,
  comparePassword,
  getAuthenticatedUser,
  JWTPayload
} from '../utils/auth';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';

export const api = new OpenAPIHono<{ Bindings: any }>();

// Configuración de Seguridad en OpenAPI (Bearer Auth)
api.openAPIRegistry.registerComponent('securitySchemes', 'BearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'Introduce tu Access Token (JWT) para autenticarte.'
});

// Helper: Responder 401
const unauthorized = (c: any) => c.json({ error: 'No autorizado. Se requiere un token válido.' }, 401);
const forbidden = (c: any) => c.json({ error: 'Acceso prohibido. Permisos insuficientes.' }, 403);
const notFound = (c: any, msg = 'Recurso no encontrado') => c.json({ error: msg }, 404);

// ==========================================
// 1. ENDPOINTS DE AUTENTICACIÓN
// ==========================================

// POST /api/auth/login
const loginRoute = createRoute({
  method: 'post',
  path: '/api/auth/login',
  summary: 'Iniciar sesión',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email(),
            password: z.string()
          })
        }
      }
    }
  },
  responses: {
    200: {
      description: 'Login exitoso',
      content: {
        'application/json': {
          schema: z.object({
            accessToken: z.string(),
            user: z.object({
              id: z.string(),
              name: z.string(),
              email: z.string(),
              role: z.string(),
              jobTitle: z.string().nullable(),
              birthDate: z.string().nullable()
            })
          })
        }
      }
    },
    401: {
      description: 'Credenciales inválidas'
    }
  }
});

api.openapi(loginRoute, async (c) => {
  const { email, password } = c.req.valid('json');
  const db = getDb(c.env.DB);

  // Buscar usuario
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  if (!user) {
    return c.json({ error: 'Email o contraseña incorrectos.' }, 401);
  }
  if (user.isActive === 0) {
    return c.json({ error: 'Esta cuenta está inactiva. Contacte a un administrador.' }, 401);
  }
  if (!(await comparePassword(password, user.passwordHash))) {
    return c.json({ error: 'Email o contraseña incorrectos.' }, 401);
  }

  const jwtSecret = c.env.JWT_SECRET || 'super-secret-key-timeline-scheduler-2026';
  const accessToken = await generateAccessToken(user, jwtSecret);
  const refreshToken = await generateRefreshToken(user, jwtSecret);

  // Guardar hash del refresh token en D1
  // Para simplificar, usamos una función de hashing rápida o guardamos el token directamente (encriptado/hasheado)
  // Aquí usaremos SHA-256 web crypto para hashear el refresh token
  const msgUint8 = new TextEncoder().encode(refreshToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  await db.insert(schema.refreshTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: tokenHash,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 días
  });

  // Establecer cookie HttpOnly
  setCookie(c, 'refresh_token', refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60,
    path: '/'
  });

  return c.json({
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      jobTitle: user.jobTitle,
      birthDate: user.birthDate
    }
  });
});

// POST /api/auth/refresh
const refreshRoute = createRoute({
  method: 'post',
  path: '/api/auth/refresh',
  summary: 'Refrescar Access Token',
  responses: {
    200: {
      description: 'Token refrescado con éxito',
      content: {
        'application/json': {
          schema: z.object({
            accessToken: z.string()
          })
        }
      }
    },
    401: {
      description: 'Refresh Token inválido o expirado'
    }
  }
});

api.openapi(refreshRoute, async (c) => {
  const refreshToken = getCookie(c, 'refresh_token');
  if (!refreshToken) {
    return c.json({ error: 'No se encontró el refresh token en las cookies.' }, 401);
  }

  const db = getDb(c.env.DB);
  const jwtSecret = c.env.JWT_SECRET || 'super-secret-key-timeline-scheduler-2026';

  // Verificar firma del token
  const { verify } = await import('hono/jwt');
  let payload;
  try {
    payload = await verify(refreshToken, jwtSecret, 'HS256');
  } catch (e) {
    return c.json({ error: 'Refresh token inválido o expirado.' }, 401);
  }

  const userId = payload.sub as string;

  // Hashear token para verificar en la base de datos
  const msgUint8 = new TextEncoder().encode(refreshToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Comprobar si existe en D1 y no está revocado
  const [tokenRecord] = await db
    .select()
    .from(schema.refreshTokens)
    .where(
      and(
        eq(schema.refreshTokens.tokenHash, tokenHash),
        eq(schema.refreshTokens.revoked, 0)
      )
    )
    .limit(1);

  if (!tokenRecord || tokenRecord.expiresAt < Math.floor(Date.now() / 1000)) {
    return c.json({ error: 'Refresh token revocado o expirado en el servidor.' }, 401);
  }

  // Obtener usuario
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user || user.isActive === 0) {
    return c.json({ error: 'Usuario no encontrado o inactivo.' }, 401);
  }

  // Generar nuevo Access Token y Refresh Token (Rotación)
  const newAccessToken = await generateAccessToken(user, jwtSecret);
  const newRefreshToken = await generateRefreshToken(user, jwtSecret);

  const newMsgUint8 = new TextEncoder().encode(newRefreshToken);
  const newHashBuffer = await crypto.subtle.digest('SHA-256', newMsgUint8);
  const newHashArray = Array.from(new Uint8Array(newHashBuffer));
  const newTokenHash = newHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Invalidar token anterior
  await db
    .update(schema.refreshTokens)
    .set({ revoked: 1 })
    .where(eq(schema.refreshTokens.id, tokenRecord.id));

  // Guardar nuevo refresh token
  await db.insert(schema.refreshTokens).values({
    id: crypto.randomUUID(),
    userId: user.id,
    tokenHash: newTokenHash,
    expiresAt: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60
  });

  // Establecer la nueva cookie
  setCookie(c, 'refresh_token', newRefreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'Strict',
    maxAge: 7 * 24 * 60 * 60,
    path: '/'
  });

  return c.json({ accessToken: newAccessToken });
});

// POST /api/auth/logout
const logoutRoute = createRoute({
  method: 'post',
  path: '/api/auth/logout',
  summary: 'Cerrar sesión',
  responses: {
    200: {
      description: 'Sesión cerrada con éxito'
    }
  }
});

api.openapi(logoutRoute, async (c) => {
  const refreshToken = getCookie(c, 'refresh_token');
  if (refreshToken) {
    const db = getDb(c.env.DB);
    // Hashear token
    const msgUint8 = new TextEncoder().encode(refreshToken);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Revocar en BD
    await db
      .update(schema.refreshTokens)
      .set({ revoked: 1 })
      .where(eq(schema.refreshTokens.tokenHash, tokenHash));
  }

  // Limpiar cookie
  deleteCookie(c, 'refresh_token', { path: '/' });
  return c.json({ success: true });
});

// GET /api/auth/me
const meRoute = createRoute({
  method: 'get',
  path: '/api/auth/me',
  summary: 'Obtener usuario autenticado',
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: 'Datos del usuario autenticado',
      content: {
        'application/json': {
          schema: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            role: z.string(),
            jobTitle: z.string().nullable(),
            birthDate: z.string().nullable(),
            preferredLanguage: z.string().nullable()
          })
        }
      }
    },
    401: {
      description: 'No autorizado'
    }
  }
});

api.openapi(meRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const db = getDb(c.env.DB);
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, authPayload.sub)).limit(1);
  if (!user) return unauthorized(c);

  return c.json({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    jobTitle: user.jobTitle,
    birthDate: user.birthDate,
    preferredLanguage: user.preferredLanguage
  });
});

// ==========================================
// 2. ENDPOINTS DE USUARIOS (CRUD - Admin Only para creación/borrado)
// ==========================================

// GET /api/users
const getUsersRoute = createRoute({
  method: 'get',
  path: '/api/users',
  summary: 'Listar todos los usuarios',
  security: [{ BearerAuth: [] }],
  responses: {
    200: {
      description: 'Lista de usuarios'
    },
    401: { description: 'No autorizado' }
  }
});

api.openapi(getUsersRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const db = getDb(c.env.DB);
  const allUsers = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    jobTitle: schema.users.jobTitle,
    birthDate: schema.users.birthDate,
    role: schema.users.role,
    isActive: schema.users.isActive,
    preferredLanguage: schema.users.preferredLanguage
  }).from(schema.users);

  return c.json(allUsers);
});

// POST /api/users
const createUserRoute = createRoute({
  method: 'post',
  path: '/api/users',
  summary: 'Crear un nuevo usuario (Solo Admin)',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            email: z.string().email(),
            password: z.string().min(6),
            jobTitle: z.string().optional(),
            birthDate: z.string().optional(),
            role: z.enum(['admin', 'user']).optional(),
            isActive: z.number().optional(),
            preferredLanguage: z.enum(['en', 'es']).optional()
          })
        }
      }
    }
  },
  responses: {
    201: { description: 'Usuario creado con éxito' },
    400: { description: 'Email ya en uso' },
    401: { description: 'No autorizado' },
    403: { description: 'Prohibido' }
  }
});

api.openapi(createUserRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);
  if (authPayload.role !== 'admin') return forbidden(c);

  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  // Comprobar si el email ya existe
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, body.email)).limit(1);
  if (existing) {
    return c.json({ error: 'El correo electrónico ya está registrado.' }, 400);
  }

  const passwordHash = await hashPassword(body.password);
  const newUser = {
    id: crypto.randomUUID(),
    name: body.name,
    email: body.email,
    passwordHash: passwordHash,
    jobTitle: body.jobTitle || null,
    birthDate: body.birthDate || null,
    role: body.role || 'user',
    isActive: body.isActive !== undefined ? body.isActive : 1,
    preferredLanguage: body.preferredLanguage || 'en'
  };

  await db.insert(schema.users).values(newUser);

  // Encolar notificación en segundo plano
  if (c.env.QUEUE) {
    await c.env.QUEUE.send({
      type: 'user_created',
      timestamp: new Date().toISOString(),
      data: { userId: newUser.id, name: newUser.name, email: newUser.email }
    });
  }

  const { passwordHash: _, ...userWithoutPassword } = newUser;
  return c.json(userWithoutPassword, 201);
});

// PUT /api/users/:id
const updateUserRoute = createRoute({
  method: 'put',
  path: '/api/users/{id}',
  summary: 'Actualizar un usuario',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().optional(),
            email: z.string().email().optional(),
            password: z.string().min(6).optional(),
            jobTitle: z.string().optional(),
            birthDate: z.string().optional(),
            role: z.enum(['admin', 'user']).optional(),
            isActive: z.number().optional(),
            preferredLanguage: z.enum(['en', 'es']).optional()
          })
        }
      }
    }
  },
  responses: {
    200: { description: 'Usuario actualizado con éxito' },
    401: { description: 'No autorizado' },
    403: { description: 'Prohibido' }
  }
});

api.openapi(updateUserRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const targetId = c.req.param('id');

  // Solo el administrador o el propio usuario pueden actualizar
  if (authPayload.role !== 'admin' && authPayload.sub !== targetId) {
    return forbidden(c);
  }

  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  // Verificar existencia
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Usuario no encontrado');

  const updateData: Partial<typeof schema.users.$inferInsert> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.email !== undefined) updateData.email = body.email;
  if (body.jobTitle !== undefined) updateData.jobTitle = body.jobTitle;
  if (body.birthDate !== undefined) updateData.birthDate = body.birthDate;
  if (body.preferredLanguage !== undefined) updateData.preferredLanguage = body.preferredLanguage;

  // Solo admin puede cambiar el rol o estado activo
  if (body.role !== undefined && authPayload.role === 'admin') {
    updateData.role = body.role;
  }
  if (body.isActive !== undefined && authPayload.role === 'admin') {
    updateData.isActive = body.isActive;
  }

  if (body.password !== undefined) {
    updateData.passwordHash = await hashPassword(body.password);
  }

  await db.update(schema.users).set(updateData).where(eq(schema.users.id, targetId));

  const [updatedUser] = await db.select().from(schema.users).where(eq(schema.users.id, targetId)).limit(1);
  const { passwordHash: _, ...userResponse } = updatedUser;

  return c.json(userResponse);
});

// DELETE /api/users/:id
const deleteUserRoute = createRoute({
  method: 'delete',
  path: '/api/users/{id}',
  summary: 'Eliminar un usuario (Solo Admin)',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: { description: 'Usuario eliminado con éxito' },
    401: { description: 'No autorizado' },
    403: { description: 'Prohibido' }
  }
});

api.openapi(deleteUserRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);
  if (authPayload.role !== 'admin') return forbidden(c);

  const targetId = c.req.param('id');
  if (targetId === authPayload.sub) {
    return c.json({ error: 'No puedes eliminarte a ti mismo.' }, 400);
  }

  const db = getDb(c.env.DB);
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Usuario no encontrado');

  // Eliminar usuario (gracias a onDelete: 'cascade', limpiará relaciones)
  await db.delete(schema.users).where(eq(schema.users.id, targetId));

  return c.json({ success: true });
});

// ==========================================
// 3. ENDPOINTS DE PROYECTOS (CRUD)
// ==========================================

// GET /api/projects
const getProjectsRoute = createRoute({
  method: 'get',
  path: '/api/projects',
  summary: 'Listar proyectos',
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: 'Lista de proyectos' }
  }
});

api.openapi(getProjectsRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const db = getDb(c.env.DB);
  const projectsList = await db.select().from(schema.projects);
  const projectsWithMembers = [];

  for (const p of projectsList) {
    const membersList = await db.select({ userId: schema.projectMembers.userId })
      .from(schema.projectMembers)
      .where(eq(schema.projectMembers.projectId, p.id));
    
    projectsWithMembers.push({
      ...p,
      members: membersList.map(m => m.userId)
    });
  }

  return c.json(projectsWithMembers);
});

// POST /api/projects
const createProjectRoute = createRoute({
  method: 'post',
  path: '/api/projects',
  summary: 'Crear proyecto',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string(),
            description: z.string(),
            color: z.string(),
            defaultUserId: z.string().optional(),
            isActive: z.number().optional()
          })
        }
      }
    }
  },
  responses: {
    201: { description: 'Proyecto creado' }
  }
});

api.openapi(createProjectRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  const newProject = {
    id: crypto.randomUUID(),
    name: body.name,
    description: body.description,
    color: body.color,
    defaultUserId: body.defaultUserId || null,
    isActive: body.isActive !== undefined ? body.isActive : 1
  };

  await db.insert(schema.projects).values(newProject);
  return c.json(newProject, 201);
});

// PUT /api/projects/:id
const updateProjectRoute = createRoute({
  method: 'put',
  path: '/api/projects/{id}',
  summary: 'Actualizar proyecto',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            name: z.string().optional(),
            description: z.string().optional(),
            color: z.string().optional(),
            defaultUserId: z.string().nullable().optional(),
            isActive: z.number().optional()
          })
        }
      }
    }
  },
  responses: {
    200: { description: 'Proyecto actualizado' }
  }
});

api.openapi(updateProjectRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const targetId = c.req.param('id');
  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  const [existing] = await db.select().from(schema.projects).where(eq(schema.projects.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Proyecto no encontrado');

  const updateData: Partial<typeof schema.projects.$inferInsert> = {};
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.color !== undefined) updateData.color = body.color;
  if (body.defaultUserId !== undefined) updateData.defaultUserId = body.defaultUserId;
  if (body.isActive !== undefined) updateData.isActive = body.isActive;

  await db.update(schema.projects).set(updateData).where(eq(schema.projects.id, targetId));

  const [updated] = await db.select().from(schema.projects).where(eq(schema.projects.id, targetId)).limit(1);
  return c.json(updated);
});

// DELETE /api/projects/:id
const deleteProjectRoute = createRoute({
  method: 'delete',
  path: '/api/projects/{id}',
  summary: 'Eliminar proyecto',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: { description: 'Proyecto eliminado' }
  }
});

api.openapi(deleteProjectRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const targetId = c.req.param('id');
  const db = getDb(c.env.DB);

  const [existing] = await db.select().from(schema.projects).where(eq(schema.projects.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Proyecto no encontrado');

  await db.delete(schema.projects).where(eq(schema.projects.id, targetId));
  return c.json({ success: true });
});

// GET /api/projects/:id/members
const getProjectMembersRoute = createRoute({
  method: 'get',
  path: '/api/projects/{id}/members',
  summary: 'Obtener miembros de un proyecto',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: { description: 'Lista de miembros' }
  }
});

api.openapi(getProjectMembersRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const targetId = c.req.param('id');
  const db = getDb(c.env.DB);

  const members = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    email: schema.users.email,
    jobTitle: schema.users.jobTitle,
    role: schema.users.role
  })
  .from(schema.projectMembers)
  .innerJoin(schema.users, eq(schema.projectMembers.userId, schema.users.id))
  .where(eq(schema.projectMembers.projectId, targetId));

  return c.json(members);
});

// PUT /api/projects/:id/members
const updateProjectMembersRoute = createRoute({
  method: 'put',
  path: '/api/projects/{id}/members',
  summary: 'Actualizar miembros de un proyecto',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            userIds: z.array(z.string())
          })
        }
      }
    }
  },
  responses: {
    200: { description: 'Miembros actualizados' }
  }
});

api.openapi(updateProjectMembersRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const targetId = c.req.param('id');
  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  // Validar que el proyecto existe
  const [existing] = await db.select().from(schema.projects).where(eq(schema.projects.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Proyecto no encontrado');

  // Eliminar miembros antiguos
  await db.delete(schema.projectMembers).where(eq(schema.projectMembers.projectId, targetId));

  // Insertar nuevos miembros
  for (const uid of body.userIds) {
    await db.insert(schema.projectMembers).values({
      projectId: targetId,
      userId: uid
    });
  }

  return c.json({ success: true });
});

// ==========================================
// 4. ENDPOINTS DE TAREAS, COMENTARIOS Y ARCHIVOS
// ==========================================

// GET /api/tasks
const getTasksRoute = createRoute({
  method: 'get',
  path: '/api/tasks',
  summary: 'Listar todas las tareas con comentarios, dependencias y archivos',
  security: [{ BearerAuth: [] }],
  responses: {
    200: { description: 'Lista de tareas completa' }
  }
});

api.openapi(getTasksRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const db = getDb(c.env.DB);

  // Obtener tareas
  const allTasks = await db.select().from(schema.tasks);

  // Obtener comentarios con el nombre del usuario
  const allComments = await db
    .select({
      id: schema.comments.id,
      taskId: schema.comments.taskId,
      userId: schema.comments.userId,
      text: schema.comments.text,
      createdAt: schema.comments.createdAt,
      userName: schema.users.name
    })
    .from(schema.comments)
    .innerJoin(schema.users, eq(schema.comments.userId, schema.users.id));

  // Obtener dependencias
  const allDeps = await db.select().from(schema.taskDependencies);

  // Obtener archivos
  const allFiles = await db.select().from(schema.taskFiles);

  // Mapear y agrupar en memoria para el frontend
  const populatedTasks = allTasks.map((t) => {
    const comments = allComments.filter((c) => c.taskId === t.id);
    const dependencies = allDeps.filter((d) => d.taskId === t.id).map((d) => d.dependencyTaskId);
    const files = allFiles.filter((f) => f.taskId === t.id).map((f) => ({
      id: f.id,
      name: f.name,
      size: f.size,
      type: f.type,
      url: `/api/tasks/${t.id}/files/${f.id}/download`,
      createdAt: f.createdAt
    }));

    return {
      ...t,
      dependencies,
      comments,
      files
    };
  });

  return c.json(populatedTasks);
});

// POST /api/tasks
const createTaskRoute = createRoute({
  method: 'post',
  path: '/api/tasks',
  summary: 'Crear tarea',
  security: [{ BearerAuth: [] }],
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            title: z.string(),
            description: z.string(),
            userId: z.string(),
            projectId: z.string().optional().nullable(),
            startDate: z.string(),
            duration: z.number(),
            status: z.enum(['Created', 'In Progress', 'Cancelled', 'Completed']).optional(),
            dependencies: z.array(z.string()).optional()
          })
        }
      }
    }
  },
  responses: {
    201: { description: 'Tarea creada con éxito' }
  }
});

api.openapi(createTaskRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  const taskId = crypto.randomUUID();
  const newTask = {
    id: taskId,
    title: body.title,
    description: body.description,
    userId: body.userId,
    projectId: body.projectId || null,
    startDate: body.startDate,
    duration: body.duration,
    status: body.status || 'Created'
  };

  await db.insert(schema.tasks).values(newTask);

  // Insertar dependencias si se proporcionan
  if (body.dependencies && body.dependencies.length > 0) {
    for (const depId of body.dependencies) {
      await db.insert(schema.taskDependencies).values({
        taskId,
        dependencyTaskId: depId
      });
    }
  }

  // Encolar mensaje en Queue para la notificación asíncrona
  if (c.env.QUEUE) {
    await c.env.QUEUE.send({
      type: 'task_created',
      timestamp: new Date().toISOString(),
      data: {
        taskId: newTask.id,
        title: newTask.title,
        createdByName: authPayload.email
      }
    });
  }

  return c.json({ ...newTask, dependencies: body.dependencies || [] }, 201);
});

// PUT /api/tasks/:id
const updateTaskRoute = createRoute({
  method: 'put',
  path: '/api/tasks/{id}',
  summary: 'Actualizar tarea',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
            userId: z.string().optional(),
            projectId: z.string().nullable().optional(),
            startDate: z.string().optional(),
            duration: z.number().optional(),
            status: z.enum(['Created', 'In Progress', 'Cancelled', 'Completed']).optional(),
            dependencies: z.array(z.string()).optional()
          })
        }
      }
    }
  },
  responses: {
    200: { description: 'Tarea actualizada' }
  }
});

api.openapi(updateTaskRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const targetId = c.req.param('id');
  const body = c.req.valid('json');
  const db = getDb(c.env.DB);

  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Tarea no encontrada');

  const updateData: Partial<typeof schema.tasks.$inferInsert> = {};
  if (body.title !== undefined) updateData.title = body.title;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.userId !== undefined) updateData.userId = body.userId;
  if (body.projectId !== undefined) updateData.projectId = body.projectId;
  if (body.startDate !== undefined) updateData.startDate = body.startDate;
  if (body.duration !== undefined) updateData.duration = body.duration;
  if (body.status !== undefined) updateData.status = body.status;

  await db.update(schema.tasks).set(updateData).where(eq(schema.tasks.id, targetId));

  // Actualizar dependencias si se proporcionan
  if (body.dependencies !== undefined) {
    // Eliminar dependencias antiguas
    await db.delete(schema.taskDependencies).where(eq(schema.taskDependencies.taskId, targetId));

    // Agregar nuevas
    for (const depId of body.dependencies) {
      await db.insert(schema.taskDependencies).values({
        taskId: targetId,
        dependencyTaskId: depId
      });
    }
  }

  // Encolar mensaje en Queue
  if (c.env.QUEUE) {
    await c.env.QUEUE.send({
      type: 'task_updated',
      timestamp: new Date().toISOString(),
      data: {
        taskId: targetId,
        title: body.title || existing.title,
        updatedByName: authPayload.email
      }
    });
  }

  return c.json({ success: true });
});

// DELETE /api/tasks/:id
const deleteTaskRoute = createRoute({
  method: 'delete',
  path: '/api/tasks/{id}',
  summary: 'Eliminar tarea',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    200: { description: 'Tarea eliminada' }
  }
});

api.openapi(deleteTaskRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const targetId = c.req.param('id');
  const db = getDb(c.env.DB);

  const [existing] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, targetId)).limit(1);
  if (!existing) return notFound(c, 'Tarea no encontrada');

  // Primero borrar dependencias de las cuales esta tarea sea destino (las de origen se borran por cascade de taskId)
  await db.delete(schema.taskDependencies).where(eq(schema.taskDependencies.dependencyTaskId, targetId));

  // Borrar archivos de R2
  const files = await db.select().from(schema.taskFiles).where(eq(schema.taskFiles.taskId, targetId));
  for (const f of files) {
    try {
      await c.env.BUCKET.delete(f.r2Key);
    } catch (e) {
      console.error(`Error eliminando archivo R2 ${f.r2Key}:`, e);
    }
  }

  // Borrar tarea de D1 (cascada borrará comentarios y archivos)
  await db.delete(schema.tasks).where(eq(schema.tasks.id, targetId));

  return c.json({ success: true });
});

// POST /api/tasks/:id/comments
const createCommentRoute = createRoute({
  method: 'post',
  path: '/api/tasks/{id}/comments',
  summary: 'Añadir un comentario a la tarea',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    }),
    body: {
      content: {
        'application/json': {
          schema: z.object({
            text: z.string()
          })
        }
      }
    }
  },
  responses: {
    201: { description: 'Comentario añadido' }
  }
});

api.openapi(createCommentRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const taskId = c.req.param('id');
  const { text } = c.req.valid('json');
  const db = getDb(c.env.DB);

  // Verificar existencia de la tarea
  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
  if (!task) return notFound(c, 'Tarea no encontrada');

  const newComment = {
    id: crypto.randomUUID(),
    taskId,
    userId: authPayload.sub,
    text,
    createdAt: new Date().toISOString()
  };

  await db.insert(schema.comments).values(newComment);

  // Encolar mensaje en Queue para notificaciones
  if (c.env.QUEUE) {
    await c.env.QUEUE.send({
      type: 'comment_created',
      timestamp: new Date().toISOString(),
      data: {
        taskId,
        taskTitle: task.title,
        commentText: text.substring(0, 50),
        commentByName: authPayload.email
      }
    });
  }

  // Retornar comentario populado
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, authPayload.sub)).limit(1);
  return c.json({
    ...newComment,
    userName: user ? user.name : 'Desconocido'
  }, 201);
});

// DELETE /api/tasks/:id/comments/:commentId
const deleteCommentRoute = createRoute({
  method: 'delete',
  path: '/api/tasks/{id}/comments/{commentId}',
  summary: 'Eliminar un comentario',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
      commentId: z.string()
    })
  },
  responses: {
    200: { description: 'Comentario eliminado' }
  }
});

api.openapi(deleteCommentRoute, async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const commentId = c.req.param('commentId');
  const db = getDb(c.env.DB);

  const [comment] = await db.select().from(schema.comments).where(eq(schema.comments.id, commentId)).limit(1);
  if (!comment) return notFound(c, 'Comentario no encontrado');

  // Solo administrador o el propio autor pueden borrar el comentario
  if (authPayload.role !== 'admin' && authPayload.sub !== comment.userId) {
    return forbidden(c);
  }

  await db.delete(schema.comments).where(eq(schema.comments.id, commentId));
  return c.json({ success: true });
});

// POST /api/tasks/:id/files (Subida de archivos a R2)
// Nota: Debido a limitaciones en OpenAPIHono para parsear multiparts de forma estricta sin middleware complejo,
// usaremos Hono normal para implementar el controlador, pero declaramos la ruta para Swagger.
const uploadFileRoute = createRoute({
  method: 'post',
  path: '/api/tasks/{id}/files',
  summary: 'Subir archivo a una tarea (R2)',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string()
    })
  },
  responses: {
    201: { description: 'Archivo subido' }
  }
});

// Implementación manual de subida a R2 en OpenAPIHono (que soporta endpoints estándar)
api.post('/api/tasks/:id/files', async (c) => {
  const authPayload = await getAuthenticatedUser(c);
  if (!authPayload) return unauthorized(c);

  const taskId = c.req.param('id');
  const db = getDb(c.env.DB);

  const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, taskId)).limit(1);
  if (!task) return notFound(c, 'Tarea no encontrada');

  try {
    const formData = await c.req.formData();
    const file = formData.get('file');
    if (!file) {
      return c.json({ error: 'No se incluyó ningún archivo en la petición.' }, 400);
    }
    const fileObject = file as unknown as File;

    const fileId = crypto.randomUUID();
    const r2Key = `tasks/${taskId}/${fileId}-${fileObject.name}`;

    // Subir a Cloudflare R2 utilizando streams
    await c.env.BUCKET.put(r2Key, fileObject.stream(), {
      httpMetadata: { contentType: fileObject.type }
    });

    const fileRecord = {
      id: fileId,
      taskId,
      name: fileObject.name,
      size: fileObject.size,
      type: fileObject.type,
      r2Key,
      createdAt: new Date().toISOString()
    };

    await db.insert(schema.taskFiles).values(fileRecord);

    return c.json({
      id: fileRecord.id,
      name: fileRecord.name,
      size: fileRecord.size,
      type: fileRecord.type,
      url: `/api/tasks/${taskId}/files/${fileRecord.id}/download`,
      createdAt: fileRecord.createdAt
    }, 201);
  } catch (err: any) {
    return c.json({ error: `Fallo al procesar el archivo: ${err.message}` }, 500);
  }
});

// GET /api/tasks/:id/files/:fileId/download (Descarga directa desde R2)
api.get('/api/tasks/:id/files/:fileId/download', async (c) => {
  const fileId = c.req.param('fileId');
  const db = getDb(c.env.DB);

  const [fileRecord] = await db.select().from(schema.taskFiles).where(eq(schema.taskFiles.id, fileId)).limit(1);
  if (!fileRecord) {
    return c.json({ error: 'Archivo no encontrado en la base de datos.' }, 404);
  }

  // Obtener el objeto de R2
  const object = await c.env.BUCKET.get(fileRecord.r2Key);
  if (!object) {
    return c.json({ error: 'Archivo no encontrado en R2.' }, 404);
  }

  // Configurar las cabeceras de respuesta y transmitir el stream
  c.header('Content-Type', fileRecord.type);
  c.header('Content-Disposition', `inline; filename="${encodeURIComponent(fileRecord.name)}"`);
  return c.body(object.body);
});

// DELETE /api/tasks/:id/files/:fileId (Eliminar archivo)
const deleteFileRoute = createRoute({
  method: 'delete',
  path: '/api/tasks/{id}/files/{fileId}',
  summary: 'Eliminar un archivo subido',
  security: [{ BearerAuth: [] }],
  request: {
    params: z.object({
      id: z.string(),
      fileId: z.string()
    })
  },
  responses: {
    200: { description: 'Archivo eliminado' }
  }
});

api.openapi(deleteFileRoute, async (c) => {
  if (!(await getAuthenticatedUser(c))) return unauthorized(c);

  const fileId = c.req.param('fileId');
  const db = getDb(c.env.DB);

  const [fileRecord] = await db.select().from(schema.taskFiles).where(eq(schema.taskFiles.id, fileId)).limit(1);
  if (!fileRecord) return notFound(c, 'Archivo no encontrado');

  // Borrar de R2
  try {
    await c.env.BUCKET.delete(fileRecord.r2Key);
  } catch (e) {
    console.error(`Error borrando en R2: ${fileRecord.r2Key}`, e);
  }

  // Borrar de D1
  await db.delete(schema.taskFiles).where(eq(schema.taskFiles.id, fileId));

  return c.json({ success: true });
});
