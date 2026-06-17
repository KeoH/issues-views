import { sign, verify } from 'hono/jwt';
import { Context } from 'hono';
import bcrypt from 'bcryptjs';

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  exp: number;
  [key: string]: any;
}

const DEFAULT_JWT_SECRET = 'super-secret-key-timeline-scheduler-2026';

function getJwtSecret(c: Context): string {
  return c.env.JWT_SECRET || DEFAULT_JWT_SECRET;
}

// Generar Access Token (Válido por 15 minutos)
export async function generateAccessToken(user: { id: string; email: string; role: string }, secret: string): Promise<string> {
  const payload: JWTPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + 15 * 60 // 15 minutos
  };
  return await sign(payload, secret, 'HS256');
}

// Generar Refresh Token (Válido por 7 días)
export async function generateRefreshToken(user: { id: string }, secret: string): Promise<string> {
  const payload = {
    sub: user.id,
    exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60 // 7 días
  };
  return await sign(payload, secret, 'HS256');
}

// Hash de contraseña
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

// Comparar contraseña
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

// Middleware para verificar token y retornar payload del usuario
export async function getAuthenticatedUser(c: Context): Promise<JWTPayload | null> {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  try {
    const secret = getJwtSecret(c);
    const payload = (await verify(token, secret, 'HS256')) as unknown as JWTPayload;
    return payload;
  } catch (error) {
    return null;
  }
}
