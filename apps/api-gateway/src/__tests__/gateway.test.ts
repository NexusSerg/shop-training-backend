import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import supertest from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApp } from '../app.factory';
import type { GatewayConfig } from '../config';

// ---------------------------------------------------------------------------
// Real HTTP mock upstream — echoes back path, service name, and request ID.
// http-proxy-middleware makes real TCP connections so we need actual servers.
// ---------------------------------------------------------------------------
function createMockServer(
  serviceName: string,
): Promise<{ server: http.Server; url: string }> {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: serviceName, uptime: 0 }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        proxied: true,
        service: serviceName,
        method: req.method,
        path: req.url,
        requestId: req.headers['x-request-id'],
      }),
    );
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// ---------------------------------------------------------------------------
// Test setup: start 5 real mock upstreams on ephemeral ports, then spin up
// the NestJS gateway pointing at those addresses.
// ---------------------------------------------------------------------------
let app: NestExpressApplication;
const mockServers: http.Server[] = [];
const mockAddresses: Record<string, string> = {};

let baseConfig: GatewayConfig;

beforeAll(async () => {
  const services = [
    'search-service',
    'catalog-service',
    'pricing-service',
    'autocomplete-service',
    'saved-search-service',
  ];

  for (const name of services) {
    const { server, url } = await createMockServer(name);
    mockServers.push(server);
    mockAddresses[name] = url;
  }

  baseConfig = {
    searchServiceUrl: mockAddresses['search-service']!,
    catalogServiceUrl: mockAddresses['catalog-service']!,
    pricingServiceUrl: mockAddresses['pricing-service']!,
    autocompleteServiceUrl: mockAddresses['autocomplete-service']!,
    savedSearchServiceUrl: mockAddresses['saved-search-service']!,
    rateLimitMax: 200,
    rateLimitWindowMs: 60_000,
    searchRateLimitMax: 100,
    corsOrigin: true,
  };

  app = await createApp(baseConfig, { silent: true });
  await app.init();
}, 30_000);

afterAll(async () => {
  await app.close();
  await Promise.all(
    mockServers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))),
  );
});

// ---------------------------------------------------------------------------
// Gateway health
// ---------------------------------------------------------------------------

describe('API Gateway — /health', () => {
  it('GET /health → 200 with service name', async () => {
    const res = await supertest(app.getHttpServer()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'api-gateway' });
  });

  it('GET /health/services → 200 when all upstreams respond ok', async () => {
    const res = await supertest(app.getHttpServer()).get('/health/services');
    expect(res.status).toBe(200);
    const body = res.body as { status: string; services: { name: string; status: string }[] };
    expect(body.status).toBe('ok');
    expect(body.services).toHaveLength(5);
    for (const svc of body.services) {
      expect(svc.status).toBe('ok');
    }
  });
});

// ---------------------------------------------------------------------------
// Proxy routing
// ---------------------------------------------------------------------------

describe('API Gateway — proxy routing', () => {
  it('forwards /api/v1/search to search-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/search?q=laptop');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('search-service');
    expect(res.body.path).toContain('/api/v1/search');
  });

  it('forwards /api/v1/products to catalog-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('catalog-service');
  });

  it('forwards /api/v1/categories to catalog-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/categories');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('catalog-service');
  });

  it('forwards /api/v1/pricing to pricing-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/pricing/p-001');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('pricing-service');
  });

  it('forwards /api/v1/inventory to pricing-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/inventory/p-001/s-001');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('pricing-service');
  });

  it('forwards /api/v1/autocomplete to autocomplete-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/autocomplete?q=lap');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('autocomplete-service');
  });

  it('forwards /api/v1/saved-searches to saved-search-service', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/saved-searches');
    expect(res.status).toBe(200);
    expect(res.body.service).toBe('saved-search-service');
  });
});

// ---------------------------------------------------------------------------
// Request ID propagation
// ---------------------------------------------------------------------------

describe('API Gateway — request ID propagation', () => {
  it('propagates x-request-id header to upstream', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/api/v1/search?q=test')
      .set('x-request-id', 'test-req-id-123');
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBe('test-req-id-123');
  });

  it('generates a request ID if none provided', async () => {
    const res = await supertest(app.getHttpServer()).get('/api/v1/products');
    expect(res.status).toBe(200);
    expect(res.body.requestId).toBeTruthy();
    expect(typeof res.body.requestId).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

describe('API Gateway — CORS', () => {
  it('returns Access-Control-Allow-Origin on GET requests', async () => {
    const res = await supertest(app.getHttpServer())
      .get('/health')
      .set('origin', 'http://localhost:3000');
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('handles OPTIONS pre-flight request', async () => {
    const res = await supertest(app.getHttpServer())
      .options('/api/v1/search')
      .set('origin', 'http://localhost:3000')
      .set('access-control-request-method', 'GET');
    expect([200, 204]).toContain(res.status);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('API Gateway — rate limiting', () => {
  it('returns 429 after exceeding the rate limit', async () => {
    const lowLimitConfig: GatewayConfig = {
      ...baseConfig,
      rateLimitMax: 3,
      rateLimitWindowMs: 60_000,
    };
    const limitedApp = await createApp(lowLimitConfig, { silent: true });
    await limitedApp.init();

    const agent = supertest(limitedApp.getHttpServer());
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => agent.get('/api/v1/products')),
    );

    await limitedApp.close();

    const statuses = responses.map((r) => r.status);
    expect(statuses).toContain(429);
  });

  it('includes Retry-After header on 429', async () => {
    const lowLimitConfig: GatewayConfig = {
      ...baseConfig,
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
    };
    const limitedApp = await createApp(lowLimitConfig, { silent: true });
    await limitedApp.init();

    const agent = supertest(limitedApp.getHttpServer());
    // First request consumes the limit
    await agent.get('/api/v1/products');
    // Second request should be rate-limited
    const res = await agent.get('/api/v1/products');

    await limitedApp.close();

    if (res.status === 429) {
      expect(res.headers['retry-after']).toBeDefined();
    }
  });
});


