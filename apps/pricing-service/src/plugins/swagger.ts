import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Pricing & Inventory Service API',
        description:
          'Real-time pricing and inventory microservice — manages seller offers and stock levels. ' +
          'Mock in-memory store for local development; will be backed by Redis + PostgreSQL in Phase 3.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3003',
          description: 'Local development server',
        },
        // CDN: In production, a CDN origin (e.g., CloudFront) would sit in front of this service.
        // Pricing responses use short TTLs (2–30s) so stale data is limited.
        // For local dev the CDN layer is skipped entirely.
      ],
      tags: [
        { name: 'pricing', description: 'Seller pricing and offer endpoints' },
        { name: 'inventory', description: 'Stock and availability endpoints' },
        { name: 'health', description: 'Service health checks' },
      ],
    },
  });

  // CDN: In production, /docs static assets would be served from CDN to reduce load on this service.
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
