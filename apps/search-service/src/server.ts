import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerSwagger } from './plugins/swagger.js';
import { searchRoutes } from './routes/search.js';

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
      service: 'search-service',
      uptime: process.uptime(),
    }),
  );

  server.register(searchRoutes, { prefix: '/api/v1/search' });

  return server;
}

