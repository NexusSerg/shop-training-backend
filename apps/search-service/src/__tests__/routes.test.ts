import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SearchResponse, Facets } from '@shop/shared-types';
import { createServer } from '../server.js';

describe('Search Service routes', () => {
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
    expect(res.json()).toMatchObject({ status: 'ok', service: 'search-service' });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/search — basic (no filters)
  // ---------------------------------------------------------------------------

  it('GET /api/v1/search → 200 with products, facets, and pagination', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search' });
    expect(res.statusCode).toBe(200);

    const body = res.json<SearchResponse>();
    expect(body.products).toBeInstanceOf(Array);
    expect(body.products.length).toBeGreaterThan(0);
    expect(body.pagination.total).toBeGreaterThan(0);
    expect(body.facets.brands).toBeInstanceOf(Array);
    expect(body.facets.priceRange).toBeDefined();
    expect(body.took).toBeGreaterThanOrEqual(0);
  });

  it('default page returns at most 24 results', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search' });
    const body = res.json<SearchResponse>();
    expect(body.products.length).toBeLessThanOrEqual(24);
    expect(body.pagination.page).toBe(1);
    expect(body.pagination.perPage).toBe(24);
  });

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  it('GET /api/v1/search?per_page=48 → at most 48 products', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?per_page=48' });
    const body = res.json<SearchResponse>();
    expect(body.products.length).toBeLessThanOrEqual(48);
    expect(body.pagination.perPage).toBe(48);
  });

  it('page 2 returns a different set of products than page 1', async () => {
    const res1 = await server.inject({ method: 'GET', url: '/api/v1/search?per_page=24&page=1' });
    const res2 = await server.inject({ method: 'GET', url: '/api/v1/search?per_page=24&page=2' });

    const page1 = res1.json<SearchResponse>().products.map((p) => p.id);
    const page2 = res2.json<SearchResponse>().products.map((p) => p.id);

    // Pages must not overlap
    const overlap = page1.filter((id) => page2.includes(id));
    expect(overlap).toHaveLength(0);
  });

  it('out-of-range page returns empty products array', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?page=999' });
    const body = res.json<SearchResponse>();
    expect(body.products).toHaveLength(0);
    expect(body.pagination.hasNextPage).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Text search
  // ---------------------------------------------------------------------------

  it('search query limits results to matching products', async () => {
    // All returned products must mention the brand/name/sku in some way
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?q=Apple' });
    const body = res.json<SearchResponse>();
    if (body.products.length > 0) {
      for (const p of body.products) {
        const text = `${p.name} ${p.brand} ${p.sku}`.toLowerCase();
        expect(text).toContain('apple');
      }
    }
  });

  it('search for a non-existent query → 0 results', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/search?q=xyzzy_no_match_12345',
    });
    const body = res.json<SearchResponse>();
    expect(body.products).toHaveLength(0);
    expect(body.pagination.total).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Brand filter
  // ---------------------------------------------------------------------------

  it('brands filter returns only matching brands', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?brands=Apple' });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(p.brand.toLowerCase()).toBe('apple');
    }
  });

  it('multi-brand filter returns products from all requested brands', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/search?brands=Apple,Samsung',
    });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(['apple', 'samsung']).toContain(p.brand.toLowerCase());
    }
  });

  // ---------------------------------------------------------------------------
  // Price filter
  // ---------------------------------------------------------------------------

  it('price_min/price_max filter respects price bounds', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/search?price_min=100&price_max=500',
    });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(p.priceMin).toBeGreaterThanOrEqual(100);
      expect(p.priceMax).toBeLessThanOrEqual(500);
    }
  });

  // ---------------------------------------------------------------------------
  // Rating filter
  // ---------------------------------------------------------------------------

  it('rating filter returns products with ratingAvg >= requested value', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?rating=4' });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(p.ratingAvg).toBeGreaterThanOrEqual(4);
    }
  });

  // ---------------------------------------------------------------------------
  // Category filter
  // ---------------------------------------------------------------------------

  it('category filter narrows by category path prefix', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/search?category=Electronics',
    });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(p.categoryPath[0]?.toLowerCase()).toBe('electronics');
    }
  });

  // ---------------------------------------------------------------------------
  // In-stock filter
  // ---------------------------------------------------------------------------

  it('in_stock=true returns only in-stock products', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?in_stock=true' });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(p.inStock).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  it('sort=price_asc returns products in ascending price order', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?sort=price_asc' });
    const body = res.json<SearchResponse>();
    const prices = body.products.map((p) => p.priceMin);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1] as number);
    }
  });

  it('sort=price_desc returns products in descending price order', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?sort=price_desc' });
    const body = res.json<SearchResponse>();
    const prices = body.products.map((p) => p.priceMin);
    for (let i = 1; i < prices.length; i++) {
      expect(prices[i]).toBeLessThanOrEqual(prices[i - 1] as number);
    }
  });

  it('sort=rating returns products in descending rating order', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?sort=rating' });
    const body = res.json<SearchResponse>();
    const ratings = body.products.map((p) => p.ratingAvg);
    for (let i = 1; i < ratings.length; i++) {
      expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1] as number);
    }
  });

  // ---------------------------------------------------------------------------
  // Attribute filter (attr_* params)
  // ---------------------------------------------------------------------------

  it('attr_color filter returns only products with that color', async () => {
    // First find a color that exists in the seed data
    const allRes = await server.inject({ method: 'GET', url: '/api/v1/search?per_page=96' });
    const allBody = allRes.json<SearchResponse>();
    const firstColor = allBody.products
      .map((p) => p.attributes['color'])
      .find((c) => typeof c === 'string') as string | undefined;

    if (!firstColor) return; // no color attribute in seed — skip

    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/search?attr_color=${encodeURIComponent(firstColor)}`,
    });
    const body = res.json<SearchResponse>();
    for (const p of body.products) {
      expect(String(p.attributes['color']).toLowerCase()).toBe(firstColor.toLowerCase());
    }
  });

  // ---------------------------------------------------------------------------
  // Validation errors
  // ---------------------------------------------------------------------------

  it('invalid rating value → 400', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?rating=6' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toHaveProperty('error');
  });

  it('negative price_min → 400', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?price_min=-1' });
    expect(res.statusCode).toBe(400);
  });

  // ---------------------------------------------------------------------------
  // Facets shape
  // ---------------------------------------------------------------------------

  it('facets include brands, priceRange, ratings, categories, and attributes', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search' });
    const { facets } = res.json<SearchResponse>();

    expect(facets.brands.length).toBeGreaterThan(0);
    expect(facets.priceRange.min).toBeLessThanOrEqual(facets.priceRange.max);
    expect(facets.ratings.length).toBeGreaterThan(0);
    expect(facets.categories.length).toBeGreaterThan(0);
    expect(facets.attributes).toBeDefined();
  });

  it('brand facet counts sum to the total result count when no brand filter is applied', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search' });
    const body = res.json<SearchResponse>();
    const brandTotal = body.facets.brands.reduce((s, b) => s + b.count, 0);
    expect(brandTotal).toBe(body.pagination.total);
  });

  it('selected brand is marked in facets when brand filter is active', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search?brands=Apple' });
    const { facets } = res.json<SearchResponse>();
    const appleBucket = facets.brands.find((b) => b.value.toLowerCase() === 'apple');
    if (appleBucket) {
      expect(appleBucket.selected).toBe(true);
    }
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/search/facets
  // ---------------------------------------------------------------------------

  it('GET /api/v1/search/facets → 200 with facets and took', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/search/facets' });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ facets: Facets; took: number; query: string }>();
    expect(body.facets.brands.length).toBeGreaterThan(0);
    expect(body.took).toBeGreaterThanOrEqual(0);
    expect(body.query).toBe('');
  });

  it('GET /api/v1/search/facets?q=Electronics → facets scoped to that query', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/search/facets?q=Electronics',
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<{ facets: Facets; took: number; query: string }>();
    expect(body.query).toBe('Electronics');
  });
});
