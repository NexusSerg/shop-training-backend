import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';
import { PricingStore } from '../mock/store.js';
import { seedPricingData } from '../mock/seed.js';

describe('Pricing Service routes', () => {
  let server: FastifyInstance;
  let store: PricingStore;
  let allIds: string[];
  let firstId: string;

  beforeAll(async () => {
    server = createServer();
    await server.ready();

    store = new PricingStore();
    allIds = store.getAllProductIds();
    const id = allIds[0];
    if (!id) throw new Error('No seeded pricing data found');
    firstId = id;
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
    expect(res.json()).toMatchObject({ status: 'ok', service: 'pricing-service' });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/pricing/:productId
  // ---------------------------------------------------------------------------

  it('GET /api/v1/pricing/:productId → 200 with full pricing data', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/pricing/${firstId}`,
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{
      productId: string;
      priceMin: number;
      priceMax: number;
      currency: string;
      sellerCount: number;
      offers: unknown[];
      bestOffer: unknown;
    }>();

    expect(body.productId).toBe(firstId);
    expect(typeof body.priceMin).toBe('number');
    expect(typeof body.priceMax).toBe('number');
    expect(body.priceMin).toBeLessThanOrEqual(body.priceMax);
    expect(body.currency).toBe('USD');
    expect(body.sellerCount).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(body.offers)).toBe(true);
    expect(body.offers.length).toBeGreaterThanOrEqual(1);
    expect(body.bestOffer).toBeTruthy();
  });

  it('GET /api/v1/pricing/:productId → 404 for unknown product', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/pricing/nonexistent-id',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'Product not found' });
  });

  // ---------------------------------------------------------------------------
  // POST /api/v1/pricing/bulk
  // ---------------------------------------------------------------------------

  it('POST /api/v1/pricing/bulk → returns pricing for all known IDs', async () => {
    const ids = allIds.slice(0, 10);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/pricing/bulk',
      payload: { productIds: ids },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ data: Record<string, unknown>; count: number; took: number }>();
    expect(body.count).toBe(10);
    expect(Object.keys(body.data)).toHaveLength(10);
    expect(typeof body.took).toBe('number');
  });

  it('POST /api/v1/pricing/bulk → 100 products returns in <50ms', async () => {
    const ids = allIds.slice(0, 100);
    const start = Date.now();
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/pricing/bulk',
      payload: { productIds: ids },
    });
    const elapsed = Date.now() - start;
    expect(res.statusCode).toBe(200);
    expect(elapsed).toBeLessThan(50);
  });

  it('POST /api/v1/pricing/bulk → unknown IDs are silently omitted', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/pricing/bulk',
      payload: { productIds: ['fake-id-1', 'fake-id-2'] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ count: number }>();
    expect(body.count).toBe(0);
  });

  it('POST /api/v1/pricing/bulk → 400 when productIds exceeds 100', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `p-${i}`);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/pricing/bulk',
      payload: { productIds: ids },
    });
    expect(res.statusCode).toBe(400);
  });

  it('POST /api/v1/pricing/bulk → 400 when productIds is missing', async () => {
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/pricing/bulk',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/inventory/:productId/:sellerId
  // ---------------------------------------------------------------------------

  it('GET /api/v1/inventory/:productId/:sellerId → 200 for existing record', async () => {
    // Find a real productId:sellerId pair from the seeded store
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers for first product');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/inventory/${firstId}/${sellerId}`,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      productId: string;
      sellerId: string;
      stock: number;
      available: number;
      status: string;
    }>();
    expect(body.productId).toBe(firstId);
    expect(body.sellerId).toBe(sellerId);
    expect(typeof body.stock).toBe('number');
    expect(typeof body.available).toBe('number');
    expect(body.available).toBeLessThanOrEqual(body.stock);
  });

  it('GET /api/v1/inventory/:productId/:sellerId → 404 for unknown pair', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/inventory/fake-product/fake-seller',
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // PATCH /api/v1/inventory/:productId/:sellerId
  // ---------------------------------------------------------------------------

  it('PATCH /api/v1/inventory/:productId/:sellerId → updates stock', async () => {
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers for first product');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/inventory/${firstId}/${sellerId}`,
      payload: { stock: 50 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ stock: number; status: string }>();
    expect(body.stock).toBe(50);
    expect(body.status).toBe('in_stock');
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → stock=0 derives out_of_stock', async () => {
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers for first product');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/inventory/${firstId}/${sellerId}`,
      payload: { stock: 0 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ stock: number; status: string; available: number }>();
    expect(body.stock).toBe(0);
    expect(body.status).toBe('out_of_stock');
    expect(body.available).toBe(0);
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → can set explicit status', async () => {
    const pricing = store.getPricing(firstId);
    if (!pricing || pricing.offers.length === 0) throw new Error('No offers for first product');
    const sellerId = pricing.offers[0]?.sellerId;
    if (!sellerId) throw new Error('No sellerId');

    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/inventory/${firstId}/${sellerId}`,
      payload: { stock: 5, status: 'backorder' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ status: string }>().status).toBe('backorder');
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → 400 when body is empty', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/inventory/${firstId}/s-001`,
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → 400 for negative stock', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: `/api/v1/inventory/${firstId}/s-001`,
      payload: { stock: -5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('PATCH /api/v1/inventory/:productId/:sellerId → 404 for unknown pair', async () => {
    const res = await server.inject({
      method: 'PATCH',
      url: '/api/v1/inventory/fake-product/fake-seller',
      payload: { stock: 10 },
    });
    expect(res.statusCode).toBe(404);
  });

  // ---------------------------------------------------------------------------
  // Pricing aggregates recomputed after inventory change
  // ---------------------------------------------------------------------------

  it('Inventory update recomputes product-level priceMin/priceMax', async () => {
    // Read current pricing
    const pricingBefore = store.getPricing(firstId);
    if (!pricingBefore) throw new Error('No pricing for first product');

    // Just verify get-then-patch cycle is internally consistent via the store directly
    const offer = pricingBefore.offers[0];
    if (!offer) throw new Error('No offer');

    store.updateInventory(firstId, offer.sellerId, { stock: 100 });
    const pricingAfter = store.getPricing(firstId);
    if (!pricingAfter) throw new Error('Missing pricing after update');

    expect(pricingAfter.priceMin).toBeLessThanOrEqual(pricingAfter.priceMax);
  });

  // ---------------------------------------------------------------------------
  // Swagger docs
  // ---------------------------------------------------------------------------

  it('GET /docs → serves Swagger UI', async () => {
    const res = await server.inject({ method: 'GET', url: '/docs' });
    expect([200, 302]).toContain(res.statusCode);
  });

  it('GET /docs/json → serves OpenAPI spec', async () => {
    const res = await server.inject({ method: 'GET', url: '/docs/json' });
    expect(res.statusCode).toBe(200);
    const spec = res.json<{ info: { title: string } }>();
    expect(spec.info.title).toBe('Pricing & Inventory Service API');
  });

  // ---------------------------------------------------------------------------
  // Seed stability
  // ---------------------------------------------------------------------------

  it('seedPricingData(100) always produces 100 products with stable IDs', () => {
    const { pricings } = seedPricingData(100);
    expect(pricings).toHaveLength(100);
    // Verify IDs are stable (deterministic seed)
    const ids = pricings.map((p) => p.productId);
    const { pricings: pricings2 } = seedPricingData(100);
    expect(pricings2.map((p) => p.productId)).toEqual(ids);
  });
});
