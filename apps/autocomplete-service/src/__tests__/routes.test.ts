import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { AutocompleteResponse } from '@shop/shared-types';
import { AppModule } from '../app.module';
import { AutocompleteStore } from '../mock/store';
import { setupSwagger } from '../swagger';

describe('Autocomplete Service routes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // Health

  it('GET /health → 200 with service name', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'autocomplete-service' });
  });

  // GET /api/v1/autocomplete

  it('GET /api/v1/autocomplete?q=lap → returns suggestions starting with "lap"', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/autocomplete?q=lap').expect(200);

    const body = res.body as AutocompleteResponse;
    expect(body.suggestions.length).toBeGreaterThan(0);
    expect(body.suggestions.length).toBeLessThanOrEqual(10);
    for (const s of body.suggestions) {
      expect(s.text.toLowerCase()).toMatch(/^lap/);
    }
  });

  it('GET /api/v1/autocomplete?q=Apple → returns Apple brand and product suggestions', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/autocomplete?q=Apple').expect(200);

    const body = res.body as AutocompleteResponse;
    expect(body.suggestions.length).toBeGreaterThan(0);
    for (const s of body.suggestions) {
      expect(s.text.toLowerCase()).toMatch(/^apple/);
    }
  });

  it('GET /api/v1/autocomplete (no query) → returns top suggestions', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/autocomplete').expect(200);

    const body = res.body as AutocompleteResponse;
    expect(body.suggestions).toHaveLength(10); // default limit
  });

  it('GET /api/v1/autocomplete?q=lap&limit=5 → honours limit param', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/autocomplete?q=lap&limit=5')
      .expect(200);

    const body = res.body as AutocompleteResponse;
    expect(body.suggestions.length).toBeLessThanOrEqual(5);
  });

  it('GET /api/v1/autocomplete?type=brand → returns only brand suggestions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/autocomplete?type=brand')
      .expect(200);

    const body = res.body as AutocompleteResponse;
    for (const s of body.suggestions) {
      expect(s.type).toBe('brand');
    }
  });

  it('GET /api/v1/autocomplete?type=product → returns only product suggestions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/autocomplete?type=product')
      .expect(200);

    const body = res.body as AutocompleteResponse;
    for (const s of body.suggestions) {
      expect(s.type).toBe('product');
    }
  });

  it('GET /api/v1/autocomplete → includes "took" field', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/autocomplete?q=head')
      .expect(200);

    const body = res.body as AutocompleteResponse;
    expect(typeof body.took).toBe('number');
    expect(body.took).toBeLessThan(20);
  });

  it('GET /api/v1/autocomplete?limit=0 → 400 validation error', async () => {
    await request(app.getHttpServer()).get('/api/v1/autocomplete?limit=0').expect(400);
  });

  it('GET /api/v1/autocomplete?limit=99 → 400 validation error (limit > 20)', async () => {
    await request(app.getHttpServer()).get('/api/v1/autocomplete?limit=99').expect(400);
  });

  it('GET /api/v1/autocomplete?type=invalid → 400 validation error', async () => {
    await request(app.getHttpServer()).get('/api/v1/autocomplete?type=invalid').expect(400);
  });

  // Swagger docs

  it('GET /docs → serves Swagger UI', async () => {
    const res = await request(app.getHttpServer()).get('/docs');
    expect([200, 302]).toContain(res.status);
  });

  it('GET /docs/json → serves OpenAPI spec', async () => {
    const res = await request(app.getHttpServer()).get('/docs/json').expect(200);
    expect(res.body).toMatchObject({ info: { title: 'Autocomplete Service API' } });
  });
});

// AutocompleteStore unit tests

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
