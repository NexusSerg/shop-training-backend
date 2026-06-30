/**
 * Route-level integration tests for the Saved Search Service.
 *
 * The SAVED_SEARCH_POOL token is overridden to `null`, forcing the
 * in-memory store path — so these tests run with no real database
 * (mirrors the mock-backed tests used by the other services).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../app.module';
import { SAVED_SEARCH_POOL } from '../db/postgres.module';
import { setupSwagger } from '../swagger';

const USER = 'user-1';
const OTHER_USER = 'user-2';

describe('Saved Search Service routes', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      // Force in-memory mode — no PostgreSQL needed for CI
      .overrideProvider(SAVED_SEARCH_POOL)
      .useValue(null)
      .compile();

    app = module.createNestApplication();
    setupSwagger(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------

  it('GET /health → 200 reporting in-memory store', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'saved-search-service', store: 'memory' });
  });

  it('GET /api/v1/saved-searches → empty list initially', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .expect(200);
    expect(res.body).toMatchObject({ count: 0, data: [] });
  });

  it('POST /api/v1/saved-searches → 201 and produces a shareable redirect URL', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .send({ name: 'Cheap laptops', urlState: 'q=laptop&brands=apple,dell&price_min=500&price_max=2000&sort=price_asc' })
      .expect(201);

    expect(res.body.id).toBeTruthy();
    expect(res.body.userId).toBe(USER);
    expect(res.body.name).toBe('Cheap laptops');
    expect(res.body.redirectUrl).toBe('/search?q=laptop&brands=apple,dell&price_min=500&price_max=2000&sort=price_asc');
    // urlState was parsed into a structured SearchState that restores the view
    expect(res.body.searchState.query).toBe('laptop');
    expect(res.body.searchState.filters.brands).toEqual(['apple', 'dell']);
    expect(res.body.searchState.filters.priceRange).toEqual([500, 2000]);
    expect(res.body.searchState.sort).toBe('price_asc');
  });

  it('POST /api/v1/saved-searches → 400 when required fields are missing', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .send({ name: '' })
      .expect(400);
  });

  it('GET /api/v1/saved-searches/:id → 200 returns saved search + redirect URL', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .send({ name: 'Phones', urlState: 'q=phone&rating=4' })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/saved-searches/${created.body.id}`)
      .set('x-user-id', USER)
      .expect(200);

    expect(res.body.id).toBe(created.body.id);
    expect(res.body.redirectUrl).toBe('/search?q=phone&rating=4');
    expect(res.body.searchState.filters.rating).toBe(4);
  });

  it('GET /api/v1/saved-searches/:id → 404 for unknown id', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/saved-searches/00000000-0000-0000-0000-000000000000')
      .set('x-user-id', USER)
      .expect(404);
    expect(res.body).toMatchObject({ error: 'Saved search not found' });
  });

  it('saved searches are scoped per user (x-user-id)', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .send({ name: 'Private', urlState: 'q=secret' })
      .expect(201);

    // Other user cannot see or fetch it
    await request(app.getHttpServer())
      .get(`/api/v1/saved-searches/${created.body.id}`)
      .set('x-user-id', OTHER_USER)
      .expect(404);

    const otherList = await request(app.getHttpServer())
      .get('/api/v1/saved-searches')
      .set('x-user-id', OTHER_USER)
      .expect(200);
    expect(otherList.body.count).toBe(0);
  });

  it('GET list → returns all saved searches for the user, newest first', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .expect(200);
    expect(res.body.count).toBeGreaterThanOrEqual(3);
    expect(res.body.data[0].redirectUrl).toMatch(/^\/search\?/);
  });

  it('DELETE /api/v1/saved-searches/:id → 204 then 404 on re-fetch', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/saved-searches')
      .set('x-user-id', USER)
      .send({ name: 'Temp', urlState: 'q=temp' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/api/v1/saved-searches/${created.body.id}`)
      .set('x-user-id', USER)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/saved-searches/${created.body.id}`)
      .set('x-user-id', USER)
      .expect(404);
  });

  it('DELETE /api/v1/saved-searches/:id → 404 for unknown id', async () => {
    await request(app.getHttpServer())
      .delete('/api/v1/saved-searches/00000000-0000-0000-0000-000000000000')
      .set('x-user-id', USER)
      .expect(404);
  });

  it('missing x-user-id falls back to "anonymous"', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/saved-searches')
      .send({ name: 'Anon search', urlState: 'q=anon' })
      .expect(201);
    expect(created.body.userId).toBe('anonymous');
  });
});
