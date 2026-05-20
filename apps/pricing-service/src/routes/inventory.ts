import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { Inventory } from '@shop/shared-types';
import { pricingStore } from '../mock/store.js';

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const UpdateInventoryBodySchema = z.object({
  stock: z.number().int().min(0).optional(),
  status: z
    .enum(['in_stock', 'out_of_stock', 'low_stock', 'backorder'])
    .optional(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const inventoryRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/inventory/:productId/:sellerId
  fastify.get<{ Params: { productId: string; sellerId: string } }>(
    '/:productId/:sellerId',
    {
      schema: {
        tags: ['inventory'],
        summary: 'Get inventory for a specific product-seller pair',
        params: {
          type: 'object',
          required: ['productId', 'sellerId'],
          properties: {
            productId: { type: 'string', description: 'Product ID' },
            sellerId: { type: 'string', description: 'Seller ID' },
          },
        },
        response: {
          200: {
            description: 'Inventory record',
            type: 'object',
            additionalProperties: true,
          },
          404: {
            description: 'Inventory record not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              productId: { type: 'string' },
              sellerId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // CDN: Inventory reads have a very short TTL (2s) in production due to real-time nature.
      // Skipped for local dev.
      const { productId, sellerId } = request.params;
      const inventory = pricingStore.getInventory(productId, sellerId);

      if (!inventory) {
        return reply.code(404).send({
          error: 'Inventory record not found',
          productId,
          sellerId,
        });
      }

      return reply.send(inventory);
    },
  );

  // PATCH /api/v1/inventory/:productId/:sellerId
  fastify.patch<{ Params: { productId: string; sellerId: string }; Body: unknown }>(
    '/:productId/:sellerId',
    {
      schema: {
        tags: ['inventory'],
        summary: 'Update stock and/or status for a seller offer',
        description:
          'Partially updates the inventory record for a product-seller pair. ' +
          'Also recomputes the product-level pricing aggregates (priceMin, priceMax, bestOffer). ' +
          'In production this write goes to Redis (write-through) and PostgreSQL asynchronously.',
        params: {
          type: 'object',
          required: ['productId', 'sellerId'],
          properties: {
            productId: { type: 'string', description: 'Product ID' },
            sellerId: { type: 'string', description: 'Seller ID' },
          },
        },
        body: {
          type: 'object',
          properties: {
            stock: {
              type: 'integer',
              minimum: 0,
              description: 'New absolute stock count',
            },
            status: {
              type: 'string',
              enum: ['in_stock', 'out_of_stock', 'low_stock', 'backorder'],
              description: 'Override stock status (auto-derived from stock if omitted)',
            },
          },
        },
        response: {
          200: {
            description: 'Updated inventory record',
            type: 'object',
            additionalProperties: true,
          },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: { error: { type: 'string' }, details: { type: 'object' } },
          },
          404: {
            description: 'Inventory record not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              productId: { type: 'string' },
              sellerId: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { productId, sellerId } = request.params;

      const parsed = UpdateInventoryBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      if (parsed.data.stock === undefined && parsed.data.status === undefined) {
        return reply
          .code(400)
          .send({ error: 'At least one of `stock` or `status` must be provided' });
      }

      // Strip undefined values so exactOptionalPropertyTypes is satisfied
      const { stock, status } = parsed.data;
      const updates: { stock?: number; status?: Inventory['status'] } = {};
      if (stock !== undefined) updates.stock = stock;
      if (status !== undefined) updates.status = status;

      const updated: Inventory | undefined = pricingStore.updateInventory(
        productId,
        sellerId,
        updates,
      );

      if (!updated) {
        return reply.code(404).send({
          error: 'Inventory record not found',
          productId,
          sellerId,
        });
      }

      return reply.send(updated);
    },
  );
};
