/**
 * Route-level integration tests for the Catalog Service.
 * PrismaService is replaced with a vi mock so no real DB is needed for CI.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import { setupSwagger } from '../swagger';

// ---------------------------------------------------------------------------
// Seed fixtures
// ---------------------------------------------------------------------------

const NOW = new Date('2024-01-01T00:00:00Z');

function makeRow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    description: 'A product',
    brand: 'TestBrand',
    slug: `product-${id}`,
    status: 'active',
    primaryCategoryId: 'cat-laptops',
    metaTitle: `Product ${id}`,
    metaDescription: `Desc ${id}`,
    createdAt: NOW,
    updatedAt: NOW,
    primaryCategory: {
      id: 'cat-laptops',
      name: 'Laptops',
      slug: 'laptops',
      path: ['Electronics', 'Laptops'],
      parentId: 'cat-electronics',
    },
    attributes: [],
    images: [],
    ...overrides,
  };
}

const SEED_ROWS = Array.from({ length: 5 }, (_, i) => makeRow(`p-00${i + 1}`));
const [ROW_A, ROW_B] = SEED_ROWS;

const CATEGORY_ROWS = [
  {
    id: 'cat-electronics',
    name: 'Electronics',
    slug: 'electronics',
    path: ['Electronics'],
    parentId: null,
    _count: { primaryProducts: 3 },
  },
  {
    id: 'cat-laptops',
    name: 'Laptops',
    slug: 'laptops',
    path: ['Electronics', 'Laptops'],
    parentId: 'cat-electronics',
    _count: { primaryProducts: 3 },
  },
];

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

function buildPrismaMock() {
  const store = new Map(SEED_ROWS.map((r) => [r.id, r]));

  return {
    onModuleInit: vi.fn().mockResolvedValue(undefined),
    onModuleDestroy: vi.fn().mockResolvedValue(undefined),
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
    product: {
      findUnique: vi.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(store.get(where.id) ?? null),
      ),
      findMany: vi.fn(({ where }: { where?: { id?: { in?: string[] } } } = {}) => {
        const ids = where?.id?.in;
        const rows = ids ? SEED_ROWS.filter((r) => ids.includes(r.id)) : SEED_ROWS;
        return Promise.resolve(rows);
      }),
      count: vi.fn().mockResolvedValue(SEED_ROWS.length),
      create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = makeRow(data['id'] as string, { sku: data['sku'], name: data['name'], brand: data['brand'], status: data['status'] ?? 'draft' });
        store.set(row.id, row);
        return Promise.resolve(row);
      }),
      update: vi.fn(({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const existing = store.get(where.id);
        if (!existing) return Promise.reject(new Error('Not found'));
        const updated = { ...existing, ...data };
        store.set(where.id, updated);
        return Promise.resolve(updated);
      }),
      delete: vi.fn(({ where }: { where: { id: string } }) => {
        if (!store.has(where.id)) return Promise.reject(new Error('Not found'));
        store.delete(where.id);
        return Promise.resolve({});
      }),
    },
    category: {
      findMany: vi.fn().mockResolvedValue(CATEGORY_ROWS),
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn((ops: unknown[]) => Promise.all(ops)),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Catalog Service routes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(buildPrismaMock())
      .compile();

    app = module.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---

  it('GET /health → 200 with service name', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'catalog-service' });
  });

  it('GET /api/v1/products → returns paginated products', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products').expect(200);
    expect(res.body.data).toHaveLength(SEED_ROWS.length);
    expect(res.body.total).toBe(SEED_ROWS.length);
  });

  it('GET /api/v1/products?ids=id1,id2 → returns matching products', async () => {
    const ids = [ROW_A?.id, ROW_B?.id].filter(Boolean).join(',');
    const res = await request(app.getHttpServer()).get(`/api/v1/products?ids=${ids}`).expect(200);
    expect(res.body.count).toBe(2);
  });

  it('GET /api/v1/products?ids=(>100 ids) → 400', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p-${i}`).join(',');
    await request(app.getHttpServer()).get(`/api/v1/products?ids=${ids}`).expect(400);
  });

  it('GET /api/v1/products/:id → 200 for existing product', async () => {
    const row = ROW_A;
    if (!row) throw new Error('No seed row');
    const res = await request(app.getHttpServer()).get(`/api/v1/products/${row.id}`).expect(200);
    expect(res.body).toMatchObject({ id: row.id, name: row.name });
  });

  it('GET /api/v1/products/:id → 404 for unknown ID', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products/nonexistent-id').expect(404);
    expect(res.body.message).toMatchObject({ error: 'Product not found' });
  });

  it('POST /api/v1/products → 201 with created product', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/products')
      .send({ sku: 'TEST-SKU-001', name: 'Test Product', brand: 'TestBrand', categoryId: 'cat-laptops', status: 'draft' })
      .expect(201);
    expect(res.body.sku).toBe('TEST-SKU-001');
    expect(res.body.name).toBe('Test Product');
    expect(res.body.id).toMatch(/^p-/);
  });

  it('POST /api/v1/products → 400 when required fields are missing', async () => {
    await request(app.getHttpServer()).post('/api/v1/products').send({ name: 'Missing SKU and brand' }).expect(400);
  });

  it('PATCH /api/v1/products/:id → 200 with updated fields', async () => {
    const row = ROW_A;
    if (!row) throw new Error('No seed row');
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/products/${row.id}`)
      .send({ name: 'Patched Name', status: 'inactive' })
      .expect(200);
    expect(res.body).toMatchObject({ id: row.id, name: 'Patched Name', status: 'inactive' });
  });

  it('PATCH /api/v1/products/:id → 404 for unknown product', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/products/nonexistent-id')
      .send({ name: 'Does not matter' })
      .expect(404);
  });

  it('GET /api/v1/categories → returns category tree', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/categories').expect(200);
    expect(res.body.count).toBeGreaterThan(0);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('GET /docs → serves Swagger UI', async () => {
    const res = await request(app.getHttpServer()).get('/docs');
    expect([200, 302, 301]).toContain(res.status);
  });

  it('GET /docs/json → serves OpenAPI spec', async () => {
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200);
    expect(res.body.info.title).toBe('Catalog Service API');
  });
});
