import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerSwagger } from './plugins/swagger.js';
import { productRoutes } from './routes/products.js';
import { categoryRoutes } from './routes/categories.js';

export function createServer() {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
  });

  // @fastify/swagger must be registered before routes so it can collect schemas
  server.register(registerSwagger);

  server.register(cors, {
    origin: process.env['CORS_ORIGIN'] ?? true,
  });

  server.get(
    '/health',
    {
      schema: {
        tags: ['health'],
        summary: 'Health check',
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      service: 'catalog-service',
      uptime: process.uptime(),
    }),
  );

  server.register(productRoutes, { prefix: '/api/v1/products' });
  server.register(categoryRoutes, { prefix: '/api/v1/categories' });

  return server;
}
