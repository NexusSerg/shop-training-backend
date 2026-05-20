import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { PricingStoreService } from '../pricing-store/pricing-store.service';
import { setupSwagger } from '../swagger';
import { seedPricingData } from '../mock/seed';

describe('Pricing Service routes', () => {
  let app: INestApplication;
  let store: PricingStoreService;
  let firstId: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    setupSwagger(app);
    await app.init();

    store = module.get(PricingStoreService);
    const allIds = store.getAllProductIds();
    const id = allIds[0];
    if (!id) throw new Error('No seeded pricing data found');
    firstId = id;
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  it('GET /health → 200 with service name', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'pricing-service' });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/pricing/:productId
  // ---------------------------------------------------------------------------

  it('GET /api/v1/pricing/:productId → 200 with full pricing data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/pricing/${firstId}`)
      .expect(200);

    expect(res.body.productId).toBe(firstId);
    expect(typeof res.body.priceMin).toBe('number');
    expect(typeof res.body.priceMax).toBe('number');
    expect(res.body.priceMin).toBeLessThanOrEqual(res.body.priceMax);
    expect(res.body.currency).toBe('USD');
    expect(res.body.sellerCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.offers)).toBe(true);
    expect(res.body.offers.length).toBeGreaterThanOrEqual(1);
    expect(res.body.bestOffer).toBeTruthy();
  });

  it('GET /api/v1/pricing/:productId → 404 for unknown product', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/pricing/nonexistent-id')
      .expect(404);
    expect(res.body).toMatchObject({ error: 'Product not found' });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/pricing/bulk
  // ---------------------------------------------------------------------------

  it('POST /api/v1/pricing/bulk → returns pricing for all known IDs', async () => {
    const ids = store.getAllProductIds().slice(0, 10);
    const res = await request(app.getHttpServer())
      .post('/api/v1/pricing/bulk')
      .send({ productIds: ids })
      .expect(200);
    expect(res.body.count).toBe(10);
    expect(Object.keys(res.body.data)).toHaveLength(10);
    expect(typeof res.body.took).toBe('number');
  });

  it('POST /api/v1/pricing/bulk → 400 when productIds is missing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/pricing/bulk')
      .send({})
      .expect(400);
  });

  it('POST /api/v1/pricing/bulk → 400 when productIds exceeds 100', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p-${i}`);
    await request(app.getHttpServer())
      .post('/api/v1/pricing/bulk')
      .send({ productIds: ids })
      .expect(400);
  });

  it('POST /api/v1/pricing/bulk → unknown IDs are silently omitted', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/pricing/bulk')
      .send({ productIds: ['fake-id-1', 'fake-id-2'] })
      .expect(200);
    expect(res.body.count).toBe(0);
  });

  it('POST /api/v1/pricing/bulk → 100 products returns in <50ms', async () => {
    const ids = store.getAllProductIds().slice(0, 100);
    const start = Date.now();
    const res = await request(app.getHttpServer())
      .post('/api/v1/pricing/bulk')
      .send({ productIds: ids })
      .expect(200);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(res.body.count).toBe(100);
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/inventory/:productId/:sellerId
  // ---------------------------------------------------------------------------

  it('GET /api/v1/inventory/:productId/:sellerId → 200 for existing record', async () => {
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers for first product');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await request(app.getHttpServer())
      .get(`/api/v1/inventory/${firstId}/${sellerId}`)
      .expect(200);

    expect(res.body.productId).toBe(firstId);
    expect(res.body.sellerId).toBe(sellerId);
    expect(typeof res.body.stock).toBe('number');
    expect(typeof res.body.available).toBe('number');
    expect(res.body.available).toBeLessThanOrEqual(res.body.stock);
  });

  it('GET /api/v1/inventory/:productId/:sellerId → 404 for unknown pair', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/inventory/fake-product/fake-seller')
      .expect(404);
    expect(res.body).toMatchObject({ error: 'Inventory record not found' });
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/inventory/:productId/:sellerId
  // ---------------------------------------------------------------------------

  it('PATCH /api/v1/inventory/:productId/:sellerId → updates stock', async () => {
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers for first product');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${firstId}/${sellerId}`)
      .send({ stock: 50 })
      .expect(200);
    expect(res.body.stock).toBe(50);
    expect(res.body.status).toBe('in_stock');
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → stock=0 derives out_of_stock', async () => {
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${firstId}/${sellerId}`)
      .send({ stock: 0 })
      .expect(200);
    expect(res.body.stock).toBe(0);
    expect(res.body.status).toBe('out_of_stock');
    expect(res.body.available).toBe(0);
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → 400 when body is empty', async () => {
    const pricing = store.getPricing(firstId);
    const sellerId = pricing?.offers[0]?.sellerId ?? 's-001';
    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${firstId}/${sellerId}`)
      .send({})
      .expect(400);
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → 400 for negative stock', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/inventory/${firstId}/s-001`)
      .send({ stock: -5 })
      .expect(400);
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → 404 for unknown pair', async () => {
    const res = await request(app.getHttpServer())
      .patch('/api/v1/inventory/fake-product/fake-seller')
      .send({ stock: 10 })
      .expect(404);
    expect(res.body).toMatchObject({ error: 'Inventory record not found' });
  });

  // ---------------------------------------------------------------------------
  // Swagger docs
  // ---------------------------------------------------------------------------

  it('GET /docs → 200 or 302', async () => {
    const res = await request(app.getHttpServer()).get('/docs');
    expect([200, 302]).toContain(res.status);
  });

  it('GET /docs/json → serves OpenAPI spec', async () => {
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200);
    expect(res.body.info.title).toBe('Pricing & Inventory Service API');
  });

  // ---------------------------------------------------------------------------
  // Seed stability
  // ---------------------------------------------------------------------------

  it('seedPricingData(100) always produces 100 products with stable IDs', () => {
    const { pricings } = seedPricingData(100);
    expect(pricings).toHaveLength(100);
    const ids = pricings.map((p) => p.productId);
    const { pricings: pricings2 } = seedPricingData(100);
    expect(pricings2.map((p) => p.productId)).toEqual(ids);
  });
});
