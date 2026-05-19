import { faker } from '@faker-js/faker';
import { z } from 'zod';
import type { FastifyPluginAsync } from 'fastify';
import type { CategoryNode, Product } from '@shop/shared-types';
import { slugify } from '@shop/shared-utils';
import { catalogStore } from '../mock/store.js';

// ---------------------------------------------------------------------------
// Zod validation schemas
// ---------------------------------------------------------------------------

const CreateProductBodySchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(500),
  description: z.string().max(5000).default(''),
  brand: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

const UpdateProductBodySchema = z.object({
  sku: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  brand: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive', 'draft', 'deleted']).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export const productRoutes: FastifyPluginAsync = async (fastify) => {
  // GET /api/v1/products?ids=id1,id2,...  (omit ids to return all)
  fastify.get<{ Querystring: { ids?: string } }>(
    '/',
    {
      schema: {
        tags: ['products'],
        summary: 'List products (or bulk-fetch by IDs)',
        description:
          'Returns all products when `ids` is omitted. Pass a comma-separated list of IDs to fetch specific products (max 100 per request).',
        querystring: {
          type: 'object',
          properties: {
            ids: {
              type: 'string',
              description: 'Comma-separated product IDs (max 100)',
            },
          },
        },
        response: {
          200: {
            description: 'Array of products',
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
      // CDN: Search/listing responses would be cached at the CDN edge layer
      // (e.g., Cache-Control: public, s-maxage=30). Skipped for local dev.
      const { ids } = request.query;

      if (!ids) {
        const all = catalogStore.getAllProducts();
        return reply.send({ data: all, count: all.length });
      }

      const idList = ids
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      if (idList.length > 100) {
        return reply.code(400).send({ error: 'Too many IDs — maximum 100 per request' });
      }

      const products = catalogStore.getProductsByIds(idList);
      return reply.send({ data: products, count: products.length });
    },
  );

  // GET /api/v1/products/:id
  fastify.get<{ Params: { id: string } }>(
    '/:id',
    {
      schema: {
        tags: ['products'],
        summary: 'Get product by ID',
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string', description: 'Product ID' },
          },
        },
        response: {
          200: { description: 'Product', type: 'object', additionalProperties: true },
          404: {
            description: 'Not found',
            type: 'object',
            properties: { error: { type: 'string' }, productId: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      // CDN: Individual product pages cached with Cache-Control: public, s-maxage=300.
      // Skipped for local dev.
      const { id } = request.params;
      const product = catalogStore.getProduct(id);

      if (!product) {
        return reply.code(404).send({ error: 'Product not found', productId: id });
      }

      return reply.send(product);
    },
  );

  // POST /api/v1/products  (admin)
  fastify.post<{ Body: unknown }>(
    '/',
    {
      schema: {
        tags: ['products'],
        summary: 'Create a new product (admin)',
        body: {
          type: 'object',
          required: ['sku', 'name', 'brand', 'categoryId'],
          properties: {
            sku: { type: 'string', minLength: 1, maxLength: 50 },
            name: { type: 'string', minLength: 1, maxLength: 500 },
            description: { type: 'string', maxLength: 5000 },
            brand: { type: 'string', minLength: 1, maxLength: 200 },
            categoryId: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['active', 'inactive', 'draft'] },
            metaTitle: { type: 'string', maxLength: 200 },
            metaDescription: { type: 'string', maxLength: 500 },
          },
        },
        response: {
          201: { description: 'Created product', type: 'object', additionalProperties: true },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: { error: { type: 'string' }, details: { type: 'object' } },
          },
        },
      },
    },
    async (request, reply) => {
      const parsed = CreateProductBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const { sku, name, description, brand, categoryId, status, metaTitle, metaDescription } =
        parsed.data;

      const categoryPath =
        findCategoryPath(catalogStore.getCategories(), categoryId) ?? [categoryId];
      const now = new Date();

      const product: Product = {
        id: `p-${faker.string.uuid()}`,
        sku,
        name,
        description,
        brand,
        slug: `${slugify(name)}-${faker.string.alphanumeric(6).toLowerCase()}`,
        status,
        categoryId,
        categoryPath,
        attributes: [],
        images: [],
        metaTitle: metaTitle ?? `${name} — ${brand}`,
        metaDescription: metaDescription ?? `Buy ${name} from ${brand}.`,
        createdAt: now,
        updatedAt: now,
      };

      catalogStore.createProduct(product);
      return reply.code(201).send(product);
    },
  );

  // PATCH /api/v1/products/:id  (admin)
  fastify.patch<{ Params: { id: string }; Body: unknown }>(
    '/:id',
    {
      schema: {
        tags: ['products'],
        summary: 'Update product fields (admin)',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          properties: {
            sku: { type: 'string', minLength: 1, maxLength: 50 },
            name: { type: 'string', minLength: 1, maxLength: 500 },
            description: { type: 'string', maxLength: 5000 },
            brand: { type: 'string', minLength: 1, maxLength: 200 },
            categoryId: { type: 'string', minLength: 1 },
            status: { type: 'string', enum: ['active', 'inactive', 'draft', 'deleted'] },
            metaTitle: { type: 'string', maxLength: 200 },
            metaDescription: { type: 'string', maxLength: 500 },
          },
        },
        response: {
          200: { description: 'Updated product', type: 'object', additionalProperties: true },
          400: {
            description: 'Validation error',
            type: 'object',
            properties: { error: { type: 'string' }, details: { type: 'object' } },
          },
          404: {
            description: 'Not found',
            type: 'object',
            properties: { error: { type: 'string' }, productId: { type: 'string' } },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;

      const parsed = UpdateProductBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .code(400)
          .send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const updated = catalogStore.updateProduct(id, parsed.data);
      if (!updated) {
        return reply.code(404).send({ error: 'Product not found', productId: id });
      }

      return reply.send(updated);
    },
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findCategoryPath(nodes: CategoryNode[], targetId: string): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return node.path;
    if (node.children.length > 0) {
      const found = findCategoryPath(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}
