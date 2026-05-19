import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { SearchRequest, PerPageOption, SortOption } from '@shop/shared-types';
import { searchStore } from '../mock/store.js';

// ---------------------------------------------------------------------------
// Validation schema for raw query-string params
// ---------------------------------------------------------------------------

const VALID_PER_PAGE = [24, 48, 96] as const;
const VALID_SORT = [
  'relevance',
  'price_asc',
  'price_desc',
  'rating',
  'newest',
  'popularity',
] as const;

const RawSearchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  brands: z.string().optional(),
  price_min: z.coerce.number().nonnegative().optional(),
  price_max: z.coerce.number().nonnegative().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  category: z.string().optional(),
  in_stock: z.string().optional(),
  sort: z.enum(VALID_SORT).optional(),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().optional(),
});

type RawSearchQuery = z.infer<typeof RawSearchQuerySchema>;

/**
 * Build a SearchRequest from parsed query params.
 * Extracts `attr_<key>=value1,value2` attribute filters from the raw query object.
 */
function buildSearchRequest(
  parsed: RawSearchQuery,
  rawQuery: Record<string, string | undefined>,
): SearchRequest {
  const rawPerPage = parsed.per_page ?? 24;
  const perPage: PerPageOption = (
    VALID_PER_PAGE.includes(rawPerPage as PerPageOption) ? rawPerPage : 24
  ) as PerPageOption;

  const sort: SortOption = parsed.sort ?? 'relevance';

  const req: SearchRequest = { sort, page: parsed.page ?? 1, perPage };

  if (parsed.q) req.q = parsed.q;
  if (parsed.brands) req.brands = parsed.brands.split(',').filter(Boolean);
  if (parsed.price_min !== undefined) req.priceMin = parsed.price_min;
  if (parsed.price_max !== undefined) req.priceMax = parsed.price_max;
  if (parsed.rating !== undefined) req.rating = parsed.rating;
  if (parsed.category) req.categoryPath = parsed.category.split('/').filter(Boolean);
  if (parsed.in_stock === 'true') req.inStockOnly = true;

  // Collect dynamic attribute filters: attr_color=red,blue → { color: ['red','blue'] }
  const attributes: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawQuery)) {
    if (key.startsWith('attr_') && value) {
      const attrKey = key.slice(5);
      attributes[attrKey] = value.split(',').filter(Boolean);
    }
  }
  if (Object.keys(attributes).length > 0) req.attributes = attributes;

  return req;
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const searchRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/search
  fastify.get<{ Querystring: Record<string, string | undefined> }>(
    '/',
    {
      schema: {
        tags: ['search'],
        summary: 'Search products',
        description:
          'Full-text search with filtering, sorting, and pagination. ' +
          'Backed by an in-memory mock store (Phase 1). ' +
          'Attribute filters use the `attr_<key>=value1,value2` convention.',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', maxLength: 500, description: 'Full-text search query' },
            brands: {
              type: 'string',
              description: 'Comma-separated brand names (e.g. `Apple,Dell`)',
            },
            price_min: { type: 'number', minimum: 0, description: 'Minimum price (inclusive)' },
            price_max: { type: 'number', minimum: 0, description: 'Maximum price (inclusive)' },
            rating: {
              type: 'integer',
              minimum: 1,
              maximum: 5,
              description: 'Minimum average rating (e.g. 4 = "4 stars and above")',
            },
            category: {
              type: 'string',
              description: 'Slash-separated category path (e.g. `Electronics/Laptops`)',
            },
            in_stock: {
              type: 'string',
              enum: ['true', 'false'],
              description: 'Filter to in-stock products only',
            },
            sort: {
              type: 'string',
              enum: [...VALID_SORT],
              description: 'Sort order (default: `relevance`)',
            },
            page: { type: 'integer', minimum: 1, description: 'Page number (default: 1)' },
            per_page: {
              type: 'integer',
              enum: [...VALID_PER_PAGE],
              description: 'Results per page (default: 24)',
            },
          },
          additionalProperties: true, // allows attr_* keys
        },
        response: {
          200: {
            description: 'Search results with facets and pagination metadata',
            type: 'object',
            additionalProperties: true,
          },
          400: {
            description: 'Invalid query parameters',
            type: 'object',
            properties: {
              error: { type: 'string' },
              details: { type: 'object', additionalProperties: true },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = RawSearchQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const searchReq = buildSearchRequest(parsed.data, request.query);
      const response = searchStore.search(searchReq);
      return reply.send(response);
    },
  );

  // GET /api/v1/search/facets
  fastify.get<{ Querystring: { q?: string } }>(
    '/facets',
    {
      schema: {
        tags: ['search'],
        summary: 'Get facets for a text query',
        description:
          'Returns all available facet buckets for a given query without applying other filters. ' +
          'Useful for pre-populating filter panels before the user refines their search.',
        querystring: {
          type: 'object',
          properties: {
            q: { type: 'string', maxLength: 500, description: 'Full-text search query' },
          },
        },
        response: {
          200: {
            description: 'Facet aggregations',
            type: 'object',
            additionalProperties: true,
          },
        },
      },
    },
    async (request, reply) => {
      const start = Date.now();
      const facets = searchStore.getFacets(request.query.q ?? '');
      return reply.send({ facets, took: Date.now() - start, query: request.query.q ?? '' });
    },
  );
};
