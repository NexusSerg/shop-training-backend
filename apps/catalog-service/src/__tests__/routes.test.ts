import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { CatalogStoreService } from '../catalog-store/catalog-store.service';
import { setupSwagger } from '../swagger';

describe('Catalog Service routes', () => {
  let app: INestApplication;
  let store: CatalogStoreService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    setupSwagger(app);
    await app.init();
    store = module.get(CatalogStoreService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health → 200 with service name', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'catalog-service' });
  });

  it('GET /api/v1/products → returns all 100 seeded products', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/products').expect(200);
    expect(res.body.count).toBe(100);
    expect(res.body.data).toHaveLength(100);
  });

  it('GET /api/v1/products?ids=id1,id2 → returns matching products', async () => {
    const [first, second] = store.getAllProducts();
    const ids = [first?.id, second?.id].filter(Boolean).join(',');
    const res = await request(app.getHttpServer()).get(`/api/v1/products?ids=${ids}`).expect(200);
    expect(res.body.count).toBe(2);
  });

  it('GET /api/v1/products?ids=(>100 ids) → 400', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p-${i}`).join(',');
    await request(app.getHttpServer()).get(`/api/v1/products?ids=${ids}`).expect(400);
  });

  it('GET /api/v1/products/:id → 200 for existing product', async () => {
    const product = store.getAllProducts()[0];
    if (!product) throw new Error('No seeded products found');
    const res = await request(app.getHttpServer()).get(`/api/v1/products/${product.id}`).expect(200);
    expect(res.body).toMatchObject({ id: product.id, name: product.name });
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
    const product = store.getAllProducts()[0];
    if (!product) throw new Error('No seeded products found');
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/products/${product.id}`)
      .send({ name: 'Patched Name', status: 'inactive' })
      .expect(200);
    expect(res.body).toMatchObject({ id: product.id, name: 'Patched Name', status: 'inactive' });
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
