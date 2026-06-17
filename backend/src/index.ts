import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { api } from './routes/api';
import { getDb } from './db/client';

const app = new OpenAPIHono<{ Bindings: any }>();

// Registrar rutas de la API
app.route('/', api);

// Servir la especificación OpenAPI (Swagger JSON)
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Timeline Scheduler API',
    description: 'API REST para gestionar proyectos, tareas, comentarios y archivos utilizando Cloudflare Workers, Hono, D1, Drizzle y R2.'
  }
});

// Servir el panel de Swagger UI interactivo
app.get('/swagger-ui', swaggerUI({ url: '/doc' }));

// Redirigir la documentación base a Swagger UI
app.get('/docs', (c) => c.redirect('/swagger-ui'));

// Exportar tanto el servidor HTTP como el consumidor de la Cola (Queue)
export default {
  fetch: app.fetch,

  // Consumidor de colas asíncronas para notificaciones
  async queue(batch: any, env: any, ctx: any): Promise<void> {
    console.log(`[Queue Consumer] Lote recibido con ${batch.messages.length} mensajes.`);

    for (const message of batch.messages) {
      const payload = message.body;
      console.log(`\n========================================`);
      console.log(`[COLA NOTIFICACIÓN] Procesando ID: ${message.id}`);
      console.log(`Tipo de Evento: ${payload.type}`);
      console.log(`Fecha/Hora: ${payload.timestamp}`);
      console.log(`----------------------------------------`);
      console.log(`Simulando envío de correo electrónico...`);
      console.log(`Para: destinatarios-notificaciones@empresa.com`);
      console.log(`Detalles del Evento:`, JSON.stringify(payload.data, null, 2));
      console.log(`========================================\n`);

      // Confirmar mensaje procesado con éxito
      message.ack();
    }
  }
};
