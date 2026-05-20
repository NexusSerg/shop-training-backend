/**
 * Upstream service configuration.
 *
 * In local dev, services run on localhost at their well-known ports.
 * In production, these would be internal service discovery URLs or k8s DNS names.
 *
 * CDN NOTE: In production a CDN layer (e.g., CloudFront / Akamai) sits in front of this
 * gateway and handles:
 *   - Edge caching of search results (TTL: 30 s) and product pages (TTL: 5 min)
 *   - SSL termination
 *   - Global load balancing / geo-routing
 * For local development the CDN layer is skipped — the gateway is the single entry point.
 */
export interface GatewayConfig {
  /** URL of the Search Service (default: http://localhost:3001) */
  searchServiceUrl: string;
  /** URL of the Catalog Service (default: http://localhost:3002) */
  catalogServiceUrl: string;
  /** URL of the Pricing & Inventory Service (default: http://localhost:3003) */
  pricingServiceUrl: string;
  /** URL of the Autocomplete Service (default: http://localhost:3004) */
  autocompleteServiceUrl: string;
  /** URL of the Saved Search Service (default: http://localhost:3005) */
  savedSearchServiceUrl: string;
  /** Global rate-limit: max requests per windowMs per IP */
  rateLimitMax: number;
  /** Rate-limit window in milliseconds */
  rateLimitWindowMs: number;
  /** Stricter limit applied to search/autocomplete endpoints */
  searchRateLimitMax: number;
  /** Allowed CORS origins. Pass `true` to reflect the request Origin (dev). */
  corsOrigin: string | boolean;
}

export function getConfig(overrides: Partial<GatewayConfig> = {}): GatewayConfig {
  return {
    searchServiceUrl:
      process.env['SEARCH_SERVICE_URL'] ?? 'http://localhost:3001',
    catalogServiceUrl:
      process.env['CATALOG_SERVICE_URL'] ?? 'http://localhost:3002',
    pricingServiceUrl:
      process.env['PRICING_SERVICE_URL'] ?? 'http://localhost:3003',
    autocompleteServiceUrl:
      process.env['AUTOCOMPLETE_SERVICE_URL'] ?? 'http://localhost:3004',
    savedSearchServiceUrl:
      process.env['SAVED_SEARCH_SERVICE_URL'] ?? 'http://localhost:3005',
    rateLimitMax: parseInt(process.env['RATE_LIMIT_MAX'] ?? '100', 10),
    rateLimitWindowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10),
    searchRateLimitMax: parseInt(process.env['SEARCH_RATE_LIMIT_MAX'] ?? '30', 10),
    corsOrigin: process.env['CORS_ORIGIN'] ?? true,
    ...overrides,
  };
}
