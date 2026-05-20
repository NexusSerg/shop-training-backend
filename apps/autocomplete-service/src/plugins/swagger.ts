import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Autocomplete Service API',
        description:
          'Search autocomplete microservice — returns ranked suggestions from a static mock list. ' +
          'In Phase 3.4 suggestions will be backed by Redis Sorted Sets and the Elasticsearch completion suggester.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3004',
          description: 'Local development server',
        },
        // CDN: In production a CDN origin (e.g., CloudFront) would be added here.
        // Autocomplete responses are cached at the edge with a short TTL (~1 min)
        // to reduce load on this service during peak traffic.
      ],
      tags: [
        { name: 'autocomplete', description: 'Suggestion endpoints' },
        { name: 'health', description: 'Service health checks' },
      ],
    },
  });

  // CDN: In production, /docs static assets would be served from CDN (e.g., CloudFront S3 origin).
  // For local dev, @fastify/swagger-ui bundles its own assets.
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });
}
