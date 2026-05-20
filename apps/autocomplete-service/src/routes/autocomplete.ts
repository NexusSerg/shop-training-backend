import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { AutocompleteResponse } from '@shop/shared-types';
import { autocompleteStore } from '../mock/store.js';

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

const QuerySchema = z.object({
  q: z.string().max(200).default(''),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(MAX_LIMIT)),
  type: z.enum(['query', 'product', 'brand', 'category']).optional(),
});

export const autocompleteRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/autocomplete
  fastify.get<{ Querystring: { q?: string; limit?: string; type?: string } }>(
    '/',
    {
      schema: {
        tags: ['autocomplete'],
        summary: 'Get search suggestions',
        description:
          'Returns ranked suggestions matching the given prefix. ' +
          'Results are ordered by type (product > brand > category > query) then by popularity score. ' +
          // CDN: Responses for a given prefix are cached at the CDN edge (TTL ~60s).
          // For local dev, no CDN caching is applied.
          'Use the optional `type` filter to restrict results to a single suggestion kind.',
        querystring: {
          type: 'object',
          properties: {
            q: {
              type: 'string',
              maxLength: 200,
              description: 'Search prefix (e.g. "lap" → "laptop", "laptop gaming", …)',
            },
            limit: {
              type: 'string',
              description: `Number of suggestions to return (1–${MAX_LIMIT}, default ${DEFAULT_LIMIT})`,
            },
            type: {
              type: 'string',
              enum: ['query', 'product', 'brand', 'category'],
              description: 'Filter results by suggestion type',
            },
          },
        },
        response: {
          200: {
            description: 'Autocomplete suggestions',
            type: 'object',
            properties: {
              suggestions: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    text: { type: 'string' },
                    type: { type: 'string', enum: ['query', 'product', 'brand', 'category'] },
                    score: { type: 'number' },
                    payload: {
                      type: 'object',
                      nullable: true,
                      properties: {
                        productId: { type: 'string' },
                        slug: { type: 'string' },
                        imageUrl: { type: 'string' },
                      },
                    },
                  },
                  required: ['text', 'type', 'score'],
                },
              },
              took: { type: 'number', description: 'Time taken in milliseconds' },
            },
            required: ['suggestions', 'took'],
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: { error: { type: 'string' }, details: { type: 'object' } },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = QuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const { q, limit, type } = parsed.data;
      const start = Date.now();

      // Fetch more than requested when type filtering so we can still return `limit` results
      const fetchLimit = type ? MAX_LIMIT : limit;
      let suggestions = autocompleteStore.getSuggestions(q, fetchLimit);

      if (type) {
        suggestions = suggestions.filter((s) => s.type === type).slice(0, limit);
      }

      const response: AutocompleteResponse = {
        suggestions,
        took: Date.now() - start,
      };

      return reply.send(response);
    },
  );
};
