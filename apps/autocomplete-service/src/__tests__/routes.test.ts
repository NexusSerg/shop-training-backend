import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AutocompleteResponse } from '@shop/shared-types';
import { createServer } from '../server.js';
import { AutocompleteStore } from '../mock/store.js';

describe('Autocomplete Service routes', () => {
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
    expect(res.json()).toMatchObject({ status: 'ok', service: 'autocomplete-service' });
  });

  // ---------------------------------------------------------------------------
  // GET /api/v1/autocomplete
  // ---------------------------------------------------------------------------

  it('GET /api/v1/autocomplete?q=lap → returns suggestions starting with "lap"', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete?q=lap' });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeLessThanOrEqual(10);
    for (const s of body.suggestions) {
      expect(s.text.toLowerCase()).toMatch(/^lap/);
    }
  });

  it('GET /api/v1/autocomplete?q=Apple → returns Apple brand and product suggestions', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete?q=Apple' });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    expect(body.suggestions.length).toBeGreaterThan(0);
    for (const s of body.suggestions) {
      expect(s.text.toLowerCase()).toMatch(/^apple/);
    }
  });

  it('GET /api/v1/autocomplete (no query) → returns top suggestions', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete' });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    expect(body.suggestions).toHaveLength(10); // default limit
  });

  it('GET /api/v1/autocomplete?q=lap&limit=5 → honours limit param', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete?q=lap&limit=5' });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    expect(body.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/v1/autocomplete?q=sam&type=brand → returns only brand suggestions', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/autocomplete?q=sam&type=brand',
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    for (const s of body.suggestions) {
      expect(s.type).toBe('brand');
    }
  });

  it('GET /api/v1/autocomplete?q=zzznomatch → returns empty suggestions', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/autocomplete?q=zzznomatch',
    });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    expect(body.suggestions).toHaveLength(0);
  });

  it('GET /api/v1/autocomplete → includes "took" field', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete?q=head' });
    expect(res.statusCode).toBe(200);

    const body = res.json<AutocompleteResponse>();
    expect(typeof body.took).toBe('number');
    expect(body.took).toBeLessThan(20); // must respond in < 20ms
  });

  it('GET /api/v1/autocomplete?limit=0 → 400 validation error', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete?limit=0' });
    expect(res.statusCode).toBe(400);
  });

  it('GET /api/v1/autocomplete?limit=99 → 400 validation error (limit > 20)', async () => {
    const res = await server.inject({ method: 'GET', url: '/api/v1/autocomplete?limit=99' });
    expect(res.statusCode).toBe(400);
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
    expect(spec.info.title).toBe('Autocomplete Service API');
  });
});

// ---------------------------------------------------------------------------
// AutocompleteStore unit tests
// ---------------------------------------------------------------------------

describe('AutocompleteStore', () => {
  const store = new AutocompleteStore();

  it('prefix match is case-insensitive', () => {
    const lower = store.getSuggestions('lap', 20);
    const upper = store.getSuggestions('LAP', 20);
    expect(lower.map((s) => s.text)).toEqual(upper.map((s) => s.text));
  });

  it('empty prefix returns top N suggestions', () => {
    const results = store.getSuggestions('', 5);
    expect(results).toHaveLength(5);
  });

  it('respects the limit', () => {
    const results = store.getSuggestions('a', 3);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('product suggestions rank above query suggestions', () => {
    // Both "Apple MacBook Pro 14" (product) and "apple" queries should be present;
    // products should come first in the ordering for the same prefix.
    const results = store.getSuggestions('apple', 20);
    const firstProductIdx = results.findIndex((s) => s.type === 'product');
    const firstQueryIdx = results.findIndex((s) => s.type === 'query');
    if (firstProductIdx !== -1 && firstQueryIdx !== -1) {
      expect(firstProductIdx).toBeLessThan(firstQueryIdx);
    }
  });

  it('non-matching prefix returns empty array', () => {
    const results = store.getSuggestions('zzzxxx', 10);
    expect(results).toHaveLength(0);
  });
});
