import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import proxy from '@fastify/http-proxy';
import type { GatewayConfig } from './config.js';

/**
 * Builds and returns a configured Fastify gateway instance.
 *
 * Architecture:
 *   Client → [CDN - skipped locally] → API Gateway (this) → upstream microservices
 *
 * Responsibilities handled here:
 *   - Request routing to upstream services
 *   - CORS (single enforcement point; upstream services also allow all origins)
 *   - Rate limiting per IP
 *   - Request ID propagation (x-request-id header forwarded to every upstream)
 *   - Structured JSON logging via pino (built into Fastify)
 *   - Aggregated /health endpoint + per-service /health/services fan-out
 */
export function createServer(config: GatewayConfig) {
  const server = Fastify({
    logger: {
      level: process.env['LOG_LEVEL'] ?? 'info',
    },
    // Fastify generates a unique ID per request; we propagate it downstream.
    genReqId: (req) =>
      (req.headers['x-request-id'] as string | undefined) ?? crypto.randomUUID(),
    trustProxy: true,
  });

  // ---------------------------------------------------------------------------
  // CORS
  // In production the CDN handles CORS pre-flight caching. Locally it runs here.
  // ---------------------------------------------------------------------------
  void server.register(cors, {
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // ---------------------------------------------------------------------------
  // Rate limiting
  //
  // Global limit: 100 req / min per IP (configurable via RATE_LIMIT_MAX env var).
  // In production the CDN layer (CloudFront WAF) would enforce stricter bot rules
  // before requests reach this gateway.
  // ---------------------------------------------------------------------------
  void server.register(rateLimit, {
    global: true,
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
    keyGenerator: (req) =>
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.ip,
    errorResponseBuilder: (_req, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Please retry after ${Math.ceil(context.ttl / 1000)} seconds.`,
    }),
  });

  // ---------------------------------------------------------------------------
  // Gateway health check
  // ---------------------------------------------------------------------------
  server.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: {
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              service: { type: 'string' },
              uptime: { type: 'number' },
            },
          },
        },
      },
    },
    async () => ({
      status: 'ok',
      service: 'api-gateway',
      uptime: process.uptime(),
    }),
  );

  // ---------------------------------------------------------------------------
  // Aggregated upstream health check — fans out to all services in parallel.
  // Useful for load-balancer readiness probes and Grafana dashboards.
  // ---------------------------------------------------------------------------
  server.get(
    '/health/services',
    {
      config: { rateLimit: false },
    },
    async (_req, reply) => {
      const upstreams: { name: string; url: string }[] = [
        { name: 'search-service', url: config.searchServiceUrl },
        { name: 'catalog-service', url: config.catalogServiceUrl },
        { name: 'pricing-service', url: config.pricingServiceUrl },
        { name: 'autocomplete-service', url: config.autocompleteServiceUrl },
        { name: 'saved-search-service', url: config.savedSearchServiceUrl },
      ];

      const results = await Promise.allSettled(
        upstreams.map(async ({ name, url }) => {
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3000);
          try {
            const res = await fetch(`${url}/health`, { signal: controller.signal });
            const body = (await res.json()) as Record<string, unknown>;
            return { name, status: res.ok ? 'ok' : 'degraded', ...body };
          } catch (err) {
            return {
              name,
              status: 'unreachable',
              error: err instanceof Error ? err.message : String(err),
            };
          } finally {
            clearTimeout(timeout);
          }
        }),
      );

      const services = results.map((r) =>
        r.status === 'fulfilled' ? r.value : { status: 'error' },
      );
      const allOk = services.every((s) => s.status === 'ok');

      return reply.status(allOk ? 200 : 207).send({
        status: allOk ? 'ok' : 'degraded',
        services,
      });
    },
  );

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Request ID propagation
  //
  // Inject the Fastify-generated request ID into every proxied request so that
  // upstream services can log it for distributed tracing.
  // @fastify/http-proxy forwards all incoming headers, including ones added here.
  //
  // CDN: In production, x-forwarded-for is set by CloudFront/Akamai before
  // reaching this gateway. Locally it is passed through as-is.
  // ---------------------------------------------------------------------------
  server.addHook('onRequest', async (req) => {
    // req.headers is writable at this stage; we piggyback on it so the proxy
    // automatically forwards the header to the upstream.
    (req.headers as Record<string, string>)['x-request-id'] = String(req.id);
  });

  // ---------------------------------------------------------------------------
  // Proxy routes
  //
  // Each prefix maps to one upstream service. Paths are preserved as-is so that
  // upstream Swagger docs and existing URL contracts remain intact.
  //
  // CDN caching TTLs (production only — skipped locally):
  //   /api/v1/search         → 30 s (Cache-Control: s-maxage=30, stale-while-revalidate=60)
  //   /api/v1/products       → 5 min (s-maxage=300)
  //   /api/v1/autocomplete   → 60 s  (s-maxage=60)
  //   /api/v1/pricing        → 2 s   (s-maxage=2)  — near-real-time pricing
  //   /api/v1/saved-searches → no CDN cache (user-specific data)
  // ---------------------------------------------------------------------------

  // Search Service (port 3001)
  void server.register(proxy, {
    upstream: config.searchServiceUrl,
    prefix: '/api/v1/search',
    rewritePrefix: '/api/v1/search',
    http2: false,
  });

  // Catalog Service (port 3002) — products + categories
  void server.register(proxy, {
    upstream: config.catalogServiceUrl,
    prefix: '/api/v1/products',
    rewritePrefix: '/api/v1/products',
    http2: false,
  });

  void server.register(proxy, {
    upstream: config.catalogServiceUrl,
    prefix: '/api/v1/categories',
    rewritePrefix: '/api/v1/categories',
    http2: false,
  });

  // Pricing & Inventory Service (port 3003)
  void server.register(proxy, {
    upstream: config.pricingServiceUrl,
    prefix: '/api/v1/pricing',
    rewritePrefix: '/api/v1/pricing',
    http2: false,
  });

  void server.register(proxy, {
    upstream: config.pricingServiceUrl,
    prefix: '/api/v1/inventory',
    rewritePrefix: '/api/v1/inventory',
    http2: false,
  });

  // Autocomplete Service (port 3004)
  void server.register(proxy, {
    upstream: config.autocompleteServiceUrl,
    prefix: '/api/v1/autocomplete',
    rewritePrefix: '/api/v1/autocomplete',
    http2: false,
  });

  // Saved Search Service (port 3005)
  void server.register(proxy, {
    upstream: config.savedSearchServiceUrl,
    prefix: '/api/v1/saved-searches',
    rewritePrefix: '/api/v1/saved-searches',
    http2: false,
  });

  return server;
}
