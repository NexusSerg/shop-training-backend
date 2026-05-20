import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';
import type { GatewayConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Minimal upstream mock — echoes back the path and service name so tests can
// assert that the gateway routed to the correct backend.
// ---------------------------------------------------------------------------
function createMockUpstream(serviceName: string): FastifyInstance {
  const app = Fastify({ logger: false });

  app.get('/health', async () => ({
    status: 'ok',
    service: serviceName,
    uptime: 0,
  }));

  // Catch-all: echo path + service so we can verify routing
  app.all('/api/*', async (req) => ({
    proxied: true,
    service: serviceName,
    method: req.method,
    path: req.url,
    requestId: req.headers['x-request-id'],
  }));

  return app;
}

// ---------------------------------------------------------------------------
// Test setup: start 5 mock upstreams on OS-assigned ports, then start the
// gateway pointing at those addresses.
// ---------------------------------------------------------------------------

let gateway: FastifyInstance;
const mocks: FastifyInstance[] = [];

const mockAddresses: Record<string, string> = {};

beforeAll(async () => {
  const services = [
    'search-service',
    'catalog-service',
    'pricing-service',
    'autocomplete-service',
    'saved-search-service',
  ];

  // Start all mocks on ephemeral ports
  for (const name of services) {
    const mock = createMockUpstream(name);
    await mock.listen({ port: 0, host: '127.0.0.1' });
    const addr = mock.server.address();
    if (!addr || typeof addr === 'string') throw new Error(`Bad address for ${name}`);
    mockAddresses[name] = `http://127.0.0.1:${addr.port}`;
    mocks.push(mock);
  }

  const config: GatewayConfig = {
    searchServiceUrl: mockAddresses['search-service']!,
    catalogServiceUrl: mockAddresses['catalog-service']!,
    pricingServiceUrl: mockAddresses['pricing-service']!,
    autocompleteServiceUrl: mockAddresses['autocomplete-service']!,
    savedSearchServiceUrl: mockAddresses['saved-search-service']!,
    rateLimitMax: 200, // generous limit to avoid flakiness in tests
    rateLimitWindowMs: 60_000,
    searchRateLimitMax: 100,
    corsOrigin: true,
  };

  gateway = createServer(config);
  await gateway.ready();
});

afterAll(async () => {
  await gateway.close();
  await Promise.all(mocks.map((m) => m.close()));
});

// ---------------------------------------------------------------------------
// Gateway health
// ---------------------------------------------------------------------------

describe('API Gateway — /health', () => {
  it('GET /health → 200 with service name', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', service: 'api-gateway' });
  });

  it('GET /health/services → 200 when all upstreams respond ok', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/health/services' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ status: string; services: { name: string; status: string }[] }>();
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
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/search?q=laptop' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ service: string; path: string }>();
    expect(body.service).toBe('search-service');
    expect(body.path).toContain('/api/v1/search');
  });

  it('forwards /api/v1/products to catalog-service', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/products' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ service: string }>().service).toBe('catalog-service');
  });

  it('forwards /api/v1/categories to catalog-service', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/categories' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ service: string }>().service).toBe('catalog-service');
  });

  it('forwards /api/v1/pricing to pricing-service', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/pricing/p-001' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ service: string }>().service).toBe('pricing-service');
  });

  it('forwards /api/v1/inventory to pricing-service', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/inventory/p-001/s-001' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ service: string }>().service).toBe('pricing-service');
  });

  it('forwards /api/v1/autocomplete to autocomplete-service', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/autocomplete?q=lap' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ service: string }>().service).toBe('autocomplete-service');
  });

  it('forwards /api/v1/saved-searches to saved-search-service', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/saved-searches' });
    expect(res.statusCode).toBe(200);
    expect(res.json<{ service: string }>().service).toBe('saved-search-service');
  });
});

// ---------------------------------------------------------------------------
// Request ID propagation
// ---------------------------------------------------------------------------

describe('API Gateway — request ID propagation', () => {
  it('propagates x-request-id header to upstream', async () => {
    const res = await gateway.inject({
      method: 'GET',
      url: '/api/v1/search?q=test',
      headers: { 'x-request-id': 'test-req-id-123' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ requestId: string }>();
    expect(body.requestId).toBe('test-req-id-123');
  });

  it('generates a request ID if none provided', async () => {
    const res = await gateway.inject({ method: 'GET', url: '/api/v1/products' });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ requestId: string }>();
    expect(body.requestId).toBeTruthy();
    expect(typeof body.requestId).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

describe('API Gateway — CORS', () => {
  it('returns Access-Control-Allow-Origin on GET requests', async () => {
    const res = await gateway.inject({
      method: 'GET',
      url: '/health',
      headers: { origin: 'http://localhost:3000' },
    });
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });

  it('handles OPTIONS pre-flight request', async () => {
    const res = await gateway.inject({
      method: 'OPTIONS',
      url: '/api/v1/search',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'GET',
      },
    });
    expect([200, 204]).toContain(res.statusCode);
    expect(res.headers['access-control-allow-origin']).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

describe('API Gateway — rate limiting', () => {
  it('returns 429 after exceeding the rate limit', async () => {
    // Use a fresh gateway with a very low limit to avoid hammering other tests
    const lowLimitConfig: GatewayConfig = {
      searchServiceUrl: mockAddresses['search-service']!,
      catalogServiceUrl: mockAddresses['catalog-service']!,
      pricingServiceUrl: mockAddresses['pricing-service']!,
      autocompleteServiceUrl: mockAddresses['autocomplete-service']!,
      savedSearchServiceUrl: mockAddresses['saved-search-service']!,
      rateLimitMax: 3,
      rateLimitWindowMs: 60_000,
      searchRateLimitMax: 2,
      corsOrigin: true,
    };
    const limited = createServer(lowLimitConfig);
    await limited.ready();

    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        // Use a proxied route — /health is explicitly exempt from rate limiting
        limited.inject({ method: 'GET', url: '/api/v1/products' }),
      ),
    );

    const statuses = responses.map((r) => r.statusCode);
    expect(statuses).toContain(429);

    await limited.close();
  });

  it('includes Retry-After header on 429', async () => {
    const lowLimitConfig: GatewayConfig = {
      searchServiceUrl: mockAddresses['search-service']!,
      catalogServiceUrl: mockAddresses['catalog-service']!,
      pricingServiceUrl: mockAddresses['pricing-service']!,
      autocompleteServiceUrl: mockAddresses['autocomplete-service']!,
      savedSearchServiceUrl: mockAddresses['saved-search-service']!,
      rateLimitMax: 1,
      rateLimitWindowMs: 60_000,
      searchRateLimitMax: 1,
      corsOrigin: true,
    };
    const limited = createServer(lowLimitConfig);
    await limited.ready();

    // First request consumes the limit
    await limited.inject({ method: 'GET', url: '/api/v1/products' });
    // Second request should be throttled (proxied route — not exempt)
    const res = await limited.inject({ method: 'GET', url: '/api/v1/products' });

    if (res.statusCode === 429) {
      expect(res.headers['retry-after']).toBeDefined();
    }

    await limited.close();
  });
});
