import type { FastifyPluginAsync } from 'fastify';
import { catalogStore } from '../mock/store.js';

export const categoryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/categories
  fastify.get(
    '/',
    {
      schema: {
        tags: ['categories'],
        summary: 'Get the full category tree',
        description:
          'Returns a nested category tree including product counts for active products.',
        response: {
          200: {
            description: 'Category tree',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (_request, reply) => {
      const categories = catalogStore.getCategories();
      return reply.send({ data: categories, count: categories.length });
    },
  );
};
