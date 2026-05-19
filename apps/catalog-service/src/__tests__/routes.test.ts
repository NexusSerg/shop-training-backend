import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';
import { catalogStore } from '../mock/store.js';

describe('Catalog Service routes', () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = createServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  it('GET /health → 200 with service name', async () => {
    const res = await server.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'catalog-service' });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/products
  // ---------------------------------------------------------------------------

  it('GET /api/v1/products → returns all 100 seeded products', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/products' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; count: number }>();
    expect(body.count).toBe(100);
    expect(body.data).toHaveLength(100);
  });

  it('GET /api/v1/products?ids=id1,id2 → returns matching products', async () => {
    const [first, second] = catalogStore.getAllProducts();
    const ids = [first?.id, second?.id].filter(Boolean).join(',');

    const res = await server.inject({ method: 'GET', url: `/api/v1/products?ids=${ids}` });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; count: number }>();
    expect(body.count).toBe(2);
  });

  it('GET /api/v1/products?ids=(>100 ids) → 400', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p-${i}`).join(',');
    const res = await server.inject({ method: 'GET', url: `/api/v1/products?ids=${ids}` });
    expect(res.statusCode).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/products/:id
  // ---------------------------------------------------------------------------

  it('GET /api/v1/products/:id → 200 for existing product', async () => {
    const product = catalogStore.getAllProducts()[0];
    if (!product) throw new Error('No seeded products found');

    const res = await server.inject({ method: 'GET', url: `/api/v1/products/${product.id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: product.id, name: product.name });
  });

  it('GET /api/v1/products/:id → 404 for unknown ID', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/products/nonexistent-id' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Product not found' });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/products
  // ---------------------------------------------------------------------------

  it('POST /api/v1/products → 201 with created product', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: {
        sku: 'TEST-SKU-001',
        name: 'Test Product',
        brand: 'TestBrand',
        categoryId: 'cat-laptops',
        status: 'draft',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json<{ id: string; sku: string; name: string }>();
    expect(body.sku).toBe('TEST-SKU-001');
    expect(body.name).toBe('Test Product');
    expect(body.id).toMatch(/^p-/);
  });

  it('POST /api/v1/products → 400 when required fields are missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/products',
      payload: { name: 'Missing SKU and brand' },
    });
    expect(res.statusCode).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/products/:id
  // ---------------------------------------------------------------------------

  it('PATCH /api/v1/products/:id → 200 with updated fields', async () => {
    const product = catalogStore.getAllProducts()[0];
    if (!product) throw new Error('No seeded products found');

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/products/${product.id}`,
      payload: { name: 'Patched Name', status: 'inactive' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: product.id, name: 'Patched Name', status: 'inactive' });
  });

  it('PATCH /api/v1/products/:id → 404 for unknown product', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/products/nonexistent-id',
      payload: { name: 'Does not matter' },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/categories
  // ---------------------------------------------------------------------------

  it('GET /api/v1/categories → returns category tree', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: unknown[]; count: number }>();
    expect(body.count).toBeGreaterThan(0);
    expect(Array.isArray(body.data)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Swagger docs
  // ---------------------------------------------------------------------------

  it('GET /docs → serves Swagger UI', async () => {
    const res = await server.inject({ method: 'GET', url: '/docs' });
    // swagger-ui redirects /docs to /docs/
    expect([200, 302]).toContain(res.statusCode);
  });

  it('GET /docs/json → serves OpenAPI spec', async () => {
    const res = await server.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json<{ info: { title: string } }>();
    expect(spec.info.title).toBe('Catalog Service API');
  });
});
