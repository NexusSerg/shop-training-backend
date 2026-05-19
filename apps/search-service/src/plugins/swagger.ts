import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Search Service API',
        description:
          'Full-text product search with faceted filtering, sorting, and pagination. ' +
          'Backed by an in-memory mock store in Phase 1; replaced by Elasticsearch in Phase 3.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3001',
          description: 'Local development server',
        },
      ],
      tags: [
        { name: 'search', description: 'Search and facet endpoints' },
        { name: 'health', description: 'Service health checks' },
      ],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });
}
