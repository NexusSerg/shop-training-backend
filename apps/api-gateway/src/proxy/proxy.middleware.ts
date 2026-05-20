import { createProxyMiddleware } from 'http-proxy-middleware';
import type { GatewayConfig } from '../config';

/**
 * Returns an array of http-proxy-middleware instances — one per upstream
 * service. Each middleware is mounted at the app root and uses `pathFilter`
 * to match only its own route prefixes, so `req.url` is never stripped.
 *
 * Proxy routing table:
 *   /api/v1/search          → Search Service
 *   /api/v1/products        → Catalog Service
 *   /api/v1/categories      → Catalog Service
 *   /api/v1/pricing         → Pricing & Inventory Service
 *   /api/v1/inventory       → Pricing & Inventory Service
 *   /api/v1/autocomplete    → Autocomplete Service
 *   /api/v1/saved-searches  → Saved Search Service
 */
export function createProxyMiddlewares(config: GatewayConfig) {
  return [
    createProxyMiddleware({
      target: config.searchServiceUrl,
      pathFilter: '/api/v1/search',
      changeOrigin: true,
    }),
    createProxyMiddleware({
      target: config.catalogServiceUrl,
      pathFilter: ['/api/v1/products', '/api/v1/categories'],
      changeOrigin: true,
    }),
    createProxyMiddleware({
      target: config.pricingServiceUrl,
      pathFilter: ['/api/v1/pricing', '/api/v1/inventory'],
      changeOrigin: true,
    }),
    createProxyMiddleware({
      target: config.autocompleteServiceUrl,
      pathFilter: '/api/v1/autocomplete',
      changeOrigin: true,
    }),
    createProxyMiddleware({
      target: config.savedSearchServiceUrl,
      pathFilter: '/api/v1/saved-searches',
      changeOrigin: true,
    }),
  ];
}
