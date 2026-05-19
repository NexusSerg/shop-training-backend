import type { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

export async function registerSwagger(fastify: FastifyInstance): Promise<void> {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Catalog Service API',
        description:
          'Product catalog microservice — manages products, categories, and mock data for local development.',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:3002',
          description: 'Local development server',
        },
        // CDN: In production, a CDN origin (e.g., CloudFront) would be added here.
        // The CDN sits in front of this service and caches API responses at the edge.
      ],
      tags: [
        { name: 'products', description: 'Product management endpoints' },
        { name: 'categories', description: 'Category tree endpoints' },
        { name: 'health', description: 'Service health checks' },
      ],
    },
  });

  // CDN: In production, /docs static assets would be served from CDN (e.g., CloudFront S3 origin),
  // reducing load on this service. For local dev, @fastify/swagger-ui bundles its own assets.
  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true,
    },
    staticCSP: true,
  });
}
