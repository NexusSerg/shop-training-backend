import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import { pricingStore } from '../mock/store.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const BulkPricingBodySchema = z.object({
  productIds: z
    .array(z.string().min(1))
    .min(1)
    .max(100, 'Maximum 100 product IDs per request'),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const pricingRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/pricing/:productId
  fastify.get<{ Params: { productId: string } }>(
    '/:productId',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Get pricing and seller offers for a product',
        description:
          'Returns the full pricing breakdown including all active seller offers, best price, ' +
          'discount info, and availability. In production this is served from Redis (TTL: 2s).',
        params: {
          type: 'object',
          required: ['productId'],
          properties: {
            productId: { type: 'string', description: 'Product ID' },
          },
        },
        response: {
          200: {
            description: 'Product pricing and seller offers',
            type: 'object',
            additionalProperties: true,
          },
          404: {
            description: 'Product not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              productId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // CDN: In production, individual pricing responses would be cached at the CDN edge
      // with Cache-Control: public, s-maxage=2, stale-while-revalidate=5.
      // Skipped for local dev.
      const { productId } = request.params;
      const pricing = pricingStore.getPricing(productId);

      if (!pricing) {
        return reply.code(404).send({ error: 'Product not found', productId });
      }

      return reply.send(pricing);
    },
  );

  // POST /api/v1/pricing/bulk
  fastify.post<{ Body: unknown }>(
    '/bulk',
    {
      schema: {
        tags: ['pricing'],
        summary: 'Bulk-fetch pricing for multiple products',
        description:
          'Accepts up to 100 product IDs and returns a map of `productId → pricing`. ' +
          'Missing product IDs are silently omitted from the response. ' +
          'Target latency: <50 ms for 100 products (from Redis in production).',
        body: {
          type: 'object',
          required: ['productIds'],
          properties: {
            productIds: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              maxItems: 100,
              description: 'Array of product IDs (max 100)',
            },
          },
        },
        response: {
          200: {
            description: 'Map of productId → pricing (missing IDs are omitted)',
            type: 'object',
            additionalProperties: true,
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
      // CDN: Bulk pricing responses are not cached at the CDN layer because they carry
      // POST bodies. In production, results are cached per-product in Redis.
      // Skipped for local dev.
      const parsed = BulkPricingBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const start = Date.now();
      const priceMap = pricingStore.getBulkPricing(parsed.data.productIds);
      const took = Date.now() - start;

      return reply.send({ data: priceMap, count: Object.keys(priceMap).length, took });
    },
  );
};
