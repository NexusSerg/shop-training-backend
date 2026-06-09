# Shop Training Backend

E-commerce product catalog backend — pnpm monorepo with Turborepo.

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **≥ 20.0.0** (LTS recommended: 22.x) |
| pnpm | **≥ 9.0.0** (project uses 11.x — install via `npm i -g pnpm@11` or [pnpm.io](https://pnpm.io/installation)) |
| Docker + Docker Compose | any recent version |

> **Node.js version** is enforced in `package.json` (`"engines": { "node": ">=20.0.0" }`).  
> Verify with `node --version`. Use [nvm](https://github.com/nvm-sh/nvm) or [Volta](https://volta.sh/) to manage multiple Node versions.

---

## Quick Start (local dev)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start infrastructure (Postgres, Redis, Elasticsearch, Kafka)

```bash
docker compose -f infra/docker-compose.yml up -d
```

> **Apple Silicon (M1/M2/M3):** Elasticsearch and Kibana are pinned to `platform: linux/amd64` in `docker-compose.yml`. Docker Desktop uses Rosetta 2 to emulate x86 — this is intentional and fixes a JVM `SIGILL` crash that occurs when running the ES image natively on ARM.

Wait for all services to be healthy (~60 s on first pull):

```bash
docker compose -f infra/docker-compose.yml ps
```

Optional — start Kibana for Elasticsearch debugging:

```bash
docker compose -f infra/docker-compose.yml --profile debug up -d kibana
```

### 3. Copy environment variables

```bash
cp .env.example .env
```

Edit `.env` if your local ports differ.

### 4. Build all packages

```bash
pnpm build
```

Turborepo handles dependency order automatically.  
Repeated builds use the local cache and complete in milliseconds.

### 5. Start all services in watch mode

```bash
pnpm dev
```

Each service restarts automatically on file changes.

---

## Services

| Service | Port | Package |
|---------|------|---------|
| API Gateway | 3000 | `apps/api-gateway` ✅ Step 1.5 |
| Search Service | 3001 | `apps/search-service` ✅ Step 1.2 |
| Catalog Service | 3002 | `apps/catalog-service` ✅ Step 3.1 |
| Pricing Service | 3003 | `apps/pricing-service` ✅ Step 1.3 |
| Autocomplete Service | 3004 | `apps/autocomplete-service` ✅ Step 1.4 |
| Saved Search Service | 3005 | `apps/saved-search-service` |

Infrastructure:

| Service | Port |
|---------|------|
| PostgreSQL | 5432 |
| Redis | 6379 |
| Elasticsearch | 9200 |
| Kafka | 9092 |
| Kibana _(debug profile)_ | 5601 |

---

## Common Commands

```bash
# Build all packages
pnpm build

# Run all services in watch mode
pnpm dev

# Type-check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run tests
pnpm test

# Stop infrastructure
docker compose -f infra/docker-compose.yml down

# Stop infrastructure and remove volumes (fresh start)
docker compose -f infra/docker-compose.yml down -v
```

### Work on a single service

```bash
# Build only one package
pnpm --filter @shop/catalog-service build

# Dev mode for one service
pnpm --filter @shop/search-service dev

# Run tests for one package
pnpm --filter @shop/shared-utils test
```

---

## Release Runbook: @nexusserg/api-client

This package is published by GitHub Actions using [.github/workflows/publish-api-client.yml](.github/workflows/publish-api-client.yml).

### Option A: Tag-based release (recommended)

1. Update version locally in [packages/api-client/package.json](packages/api-client/package.json) to the next semver.
2. Commit the version change.
3. Create and push a tag in the required format:

```bash
git tag api-client/v0.2.0
git push origin api-client/v0.2.0
```

4. GitHub Actions publishes to GitHub Packages: @nexusserg/api-client@0.2.0.

### Option B: Manual workflow dispatch

1. Open Actions -> Publish @nexusserg/api-client -> Run workflow.
2. Provide version (for example: 0.2.0) or leave empty to use the current package.json version.
3. Run the workflow.

### What the workflow enforces

1. Tag format must be api-client/v<version>.
2. Resolved version must be valid semver.
3. Package version is set before build.
4. Build runs for @shop/shared-types and @nexusserg/api-client.
5. Publish fails if that version already exists on GitHub Packages.
6. Publish uses GitHub Packages registry with GITHUB_TOKEN auth.

### Common failure reasons

1. Invalid tag format (not starting with api-client/v).
2. Invalid version format (not semver).
3. Version already published.
4. Build failure in shared-types or api-client.

### Verify published package

```bash
npm view @nexusserg/api-client versions --registry https://npm.pkg.github.com
```

---

## Project Structure

```
apps/
├── api-gateway/            # Single entry point: routing, CORS, rate limiting (port 3000)
├── search-service/         # Full-text search + faceted filtering (port 3001)
├── catalog-service/        # Product CRUD + category hierarchy (port 3002)
├── pricing-service/        # Real-time price & inventory (port 3003)
├── autocomplete-service/   # Search suggestions (port 3004)
├── indexing-worker/        # Kafka → Elasticsearch sync
└── saved-search-service/   # Persist search/filter combinations (port 3005)
packages/
├── shared-types/           # TypeScript domain models (Product, Search, Events…)
├── shared-utils/           # URL↔SearchState helpers, retry, slugify
├── api-client/             # Typed HTTP client SDK — published as @nexusserg/api-client
└── eslint-config/          # Shared ESLint rules
infra/
└── docker-compose.yml      # Local dev infrastructure
```

---

## Health Checks

Once services are running, verify each is up:

```bash
curl http://localhost:3000/health  # api-gateway
curl http://localhost:3001/health  # search-service
curl http://localhost:3002/health  # catalog-service
curl http://localhost:3003/health  # pricing-service
curl http://localhost:3004/health  # autocomplete-service
curl http://localhost:3005/health  # saved-search-service
```

Expected response: `{"status":"ok","service":"<name>"}`

Use the gateway's fan-out health check to verify all upstreams at once:

```bash
curl http://localhost:3000/health/services | jq '.'
```

---

## API Gateway (Step 1.5)

The API gateway runs on **port 3000** and is the single entry point for all client traffic.
It handles request routing, CORS enforcement, rate limiting, and request-ID propagation.

> **CDN note:** In production a CDN layer (CloudFront / Akamai) sits in front of this gateway
> and adds edge caching, SSL termination, and geo-routing. For local development the CDN is
> skipped — the gateway is the single entry point.

### Route table

| Prefix | Upstream | Service |
|--------|----------|---------|
| `/api/v1/search` | `localhost:3001` | Search Service |
| `/api/v1/products` | `localhost:3002` | Catalog Service |
| `/api/v1/categories` | `localhost:3002` | Catalog Service |
| `/api/v1/pricing` | `localhost:3003` | Pricing Service |
| `/api/v1/inventory` | `localhost:3003` | Pricing Service |
| `/api/v1/autocomplete` | `localhost:3004` | Autocomplete Service |
| `/api/v1/saved-searches` | `localhost:3005` | Saved Search Service |

### Features

| Feature | Details |
|---------|---------|
| **Proxy** | `@fastify/http-proxy` — preserves full URL path |
| **CORS** | Enforced at gateway; configurable via `CORS_ORIGIN` env var |
| **Rate limiting** | `@fastify/rate-limit` — 100 req/min per IP (global), configurable via env |
| **Request ID** | Fastify `genReqId` generates UUID per request; propagated to upstreams as `x-request-id` |
| **Structured logging** | Pino JSON logs with `reqId` field on every request |
| **Health endpoints** | `GET /health` — gateway status; `GET /health/services` — fan-out to all upstreams |

### Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `GATEWAY_PORT` | `3000` | Gateway listen port |
| `SEARCH_SERVICE_URL` | `http://localhost:3001` | Search Service URL |
| `CATALOG_SERVICE_URL` | `http://localhost:3002` | Catalog Service URL |
| `PRICING_SERVICE_URL` | `http://localhost:3003` | Pricing Service URL |
| `AUTOCOMPLETE_SERVICE_URL` | `http://localhost:3004` | Autocomplete Service URL |
| `SAVED_SEARCH_SERVICE_URL` | `http://localhost:3005` | Saved Search Service URL |
| `RATE_LIMIT_MAX` | `100` | Max requests per window per IP |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window in ms |
| `SEARCH_RATE_LIMIT_MAX` | `30` | Reserved for per-route stricter limit on search/autocomplete |
| `CORS_ORIGIN` | `true` (reflect origin) | Allowed CORS origin(s) |
| `LOG_LEVEL` | `info` | Pino log level |

### Quick test

```bash
# Start the gateway (all upstream services must also be running)
pnpm --filter @shop/api-gateway dev

# Gateway health
curl http://localhost:3000/health

# Fan-out health check across all upstreams
curl http://localhost:3000/health/services | jq '.services[] | {name, status}'

# Route to search service via gateway
curl "http://localhost:3000/api/v1/search?q=laptop" | jq '.pagination'

# Route to catalog service via gateway
curl http://localhost:3000/api/v1/products | jq '.count'

# Route to autocomplete via gateway
curl "http://localhost:3000/api/v1/autocomplete?q=lap" | jq '.suggestions[].text'
```

---

## Catalog Service (Step 3.1 — PostgreSQL)

The catalog service runs on **port 3002** and is backed by **PostgreSQL** via Prisma ORM.
It requires a running PostgreSQL instance (started via `docker compose`) and the `DATABASE_URL` environment variable.

> **Migration:** Prisma manages the schema — run `pnpm --filter @shop/catalog-service db:migrate` to apply migrations.
> **Seeding:** Use `pnpm --filter @shop/catalog-service db:seed` to seed 1 M products (≈2-5 min), or `db:seed:dev` for a quick 10 k-product seed.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/products` | List products (paginated) or bulk-fetch with `?ids=id1,id2` |
| `GET` | `/api/v1/products/:id` | Get single product by ID |
| `POST` | `/api/v1/products` | Create a product _(admin)_ |
| `PATCH` | `/api/v1/products/:id` | Update product fields _(admin)_ |
| `GET` | `/api/v1/categories` | Get full category tree with product counts |

### List products query parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `ids` | — | Comma-separated product IDs (max 100); returns only those IDs |
| `limit` | `100` | Page size (max 200) |
| `offset` | `0` | Pagination offset |

### Database schema

Tables created by Prisma migrations in `apps/catalog-service/prisma/migrations/`:

| Table | Purpose |
|-------|---------|
| `products` | Core product catalog — indexed on `brand`, `status`, `createdAt`, `primaryCategoryId` |
| `categories` | Hierarchical category tree (adjacency list) |
| `product_categories` | Product ↔ Category many-to-many join |
| `product_attributes` | EAV attributes (color, size, material…) — indexed on `productId`, `key` |
| `product_images` | Product images — indexed on `productId` |
| `sellers` | Seller registry |
| `seller_offers` | Per-product-seller pricing and stock |

### Seeding

```bash
# Apply migrations (idempotent)
pnpm --filter @shop/catalog-service db:migrate

# Seed 10,000 products quickly for local dev
DATABASE_URL=postgresql://shop:shop_secret@localhost:5432/shop_catalog \
  pnpm --filter @shop/catalog-service db:seed:dev

# Seed the full 1,000,000 products (~2-5 min)
DATABASE_URL=postgresql://shop:shop_secret@localhost:5432/shop_catalog \
  pnpm --filter @shop/catalog-service db:seed
```

### Swagger UI

Browse the interactive API docs at **http://localhost:3002/docs** while the service is running.

### Quick test

```bash
# Start the service (DATABASE_URL must be set)
DATABASE_URL=postgresql://shop:shop_secret@localhost:5432/shop_catalog \
  pnpm --filter @shop/catalog-service dev

# Paginated list
curl "http://localhost:3002/api/v1/products?limit=10&offset=0" | jq '.total'

# Fetch a product by ID
curl "http://localhost:3002/api/v1/products/<uuid>" | jq '{id,name,brand}'

# Bulk fetch
curl "http://localhost:3002/api/v1/products?ids=<id1>,<id2>" | jq '.count'

# Create a new product
curl -X POST http://localhost:3002/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"MY-SKU","name":"My Product","brand":"Acme","categoryId":"cat-laptops"}'

# Category tree
curl http://localhost:3002/api/v1/categories | jq '.data[0] | {id,name,productCount}'
```

---

## Search Service (Step 1.2 — Mock-First)

The search service runs on **port 3001** and uses an in-memory store seeded with **100 deterministic fake `ProductSummary` objects** (faker seed 42 — IDs are stable across restarts).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/search` | Search products with filtering, sorting, and pagination |
| `GET` | `/api/v1/search/facets` | Facet aggregations for a text query (no other filters) |

### Query Parameters — `GET /api/v1/search`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | `string` | — | Full-text search (name, brand, SKU, category) |
| `brands` | `string` | — | Comma-separated brand names (e.g. `Apple,Dell`) |
| `price_min` | `number` | — | Minimum price (inclusive) |
| `price_max` | `number` | — | Maximum price (inclusive) |
| `rating` | `1–5` | — | Minimum average rating |
| `category` | `string` | — | Slash-separated category path (e.g. `Electronics/Laptops`) |
| `in_stock` | `true\|false` | — | Restrict to in-stock products |
| `sort` | `string` | `relevance` | `relevance`, `price_asc`, `price_desc`, `rating`, `newest`, `popularity` |
| `page` | `integer` | `1` | Page number |
| `per_page` | `24\|48\|96` | `24` | Results per page |
| `attr_<key>` | `string` | — | Attribute filter (e.g. `attr_color=Black,Silver`) |

### Response Shape

```json
{
  "products": [ /* ProductSummary[] */ ],
  "facets": {
    "brands":     [{ "value": "Apple", "count": 7, "selected": false }],
    "priceRange": { "min": 12.5, "max": 1899, "selectedMin": 12.5, "selectedMax": 1899 },
    "ratings":    [{ "value": "4", "count": 31, "selected": false }],
    "categories": [{ "value": "Electronics", "count": 22, "selected": false }],
    "attributes": { "color": [{ "value": "Black", "count": 15, "selected": false }] }
  },
  "pagination": {
    "total": 100, "page": 1, "perPage": 24,
    "totalPages": 5, "hasNextPage": true, "hasPrevPage": false
  },
  "took": 2,
  "query": "laptop"
}
```

### Swagger UI

Browse the interactive API docs at **http://localhost:3001/docs** while the service is running.

### Quick test

```bash
# Start the service
pnpm --filter @shop/search-service dev

# Basic search (returns first page of 24)
curl http://localhost:3001/api/v1/search | jq '.pagination'

# Full-text search
curl "http://localhost:3001/api/v1/search?q=laptop" | jq '.pagination.total'

# Filter by brand + price range
curl "http://localhost:3001/api/v1/search?brands=Apple,Dell&price_min=100&price_max=1500" | jq '.products | length'

# Filter by category, sort by rating, page 2
curl "http://localhost:3001/api/v1/search?category=Electronics&sort=rating&page=2&per_page=24" | jq '.'

# In-stock products with 4+ stars
curl "http://localhost:3001/api/v1/search?rating=4&in_stock=true" | jq '.pagination.total'

# Dynamic attribute filter
curl "http://localhost:3001/api/v1/search?attr_color=Black,Silver" | jq '.products | length'

# Facets endpoint
curl "http://localhost:3001/api/v1/search/facets?q=phone" | jq '.facets.brands'
```

> **Note:** The in-memory store resets on restart. Elasticsearch integration is planned for Step 3.3.

---

## Pricing & Inventory Service (Step 1.3 — Mock-First)

The pricing service runs on **port 3003** and uses an in-memory store seeded with **100 deterministic mock products**, each with 1–3 seller offers (faker seed 42 — stable across restarts).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/pricing/:productId` | Get pricing + all seller offers for a product |
| `POST` | `/api/v1/pricing/bulk` | Batch-fetch pricing for up to 100 products |
| `GET` | `/api/v1/inventory/:productId/:sellerId` | Get stock details for a product-seller pair |
| `PATCH` | `/api/v1/inventory/:productId/:sellerId` | Update stock count and/or status |

### Bulk Pricing Request Body

```json
{ "productIds": ["p-mock-001", "p-mock-002", "..."] }
```

### Inventory PATCH Body

```json
{ "stock": 50, "status": "in_stock" }
```

Both fields are optional but at least one must be provided. If `status` is omitted it is derived automatically from the new `stock` value (0 → `out_of_stock`, < 10 → `low_stock`, ≥ 10 → `in_stock`). An inventory update also recomputes the product-level `priceMin`, `priceMax`, and `bestOffer`.

### Swagger UI

Browse the interactive API docs at **http://localhost:3003/docs** while the service is running.

### Quick test

```bash
# Start the service
pnpm --filter @shop/pricing-service dev

# Get pricing for a single mock product
curl http://localhost:3003/api/v1/pricing/p-mock-001 | jq '{priceMin,priceMax,sellerCount}'

# Bulk-fetch 3 products
curl -X POST http://localhost:3003/api/v1/pricing/bulk \
  -H 'Content-Type: application/json' \
  -d '{"productIds":["p-mock-001","p-mock-002","p-mock-003"]}' | jq '.count'

# Get inventory for a specific seller
curl http://localhost:3003/api/v1/inventory/p-mock-001/s-001 | jq '{stock,available,status}'

# Update stock for a seller offer
curl -X PATCH http://localhost:3003/api/v1/inventory/p-mock-001/s-001 \
  -H 'Content-Type: application/json' \
  -d '{"stock":0}' | jq '.status'
# → "out_of_stock"
```

> **Note:** The in-memory store resets on restart. Redis + PostgreSQL integration is planned for Step 3.2.

---

## Autocomplete Service (Step 1.4 — Mock-First)

The autocomplete service runs on **port 3004** and returns ranked suggestions from a static in-memory list covering queries, brands, categories, and product names.

### Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/autocomplete` | Get search suggestions for a given prefix |

### Query Parameters — `GET /api/v1/autocomplete`

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `q` | `string` | `""` | Search prefix (e.g. `"lap"` → `"laptop"`, `"laptop gaming"`, …) |
| `limit` | `1–20` | `10` | Maximum number of suggestions to return |
| `type` | `query\|product\|brand\|category` | — | Restrict results to a single suggestion type |

### Suggestion Types & Ranking

Results are ranked first by **type priority** (product > brand > category > query) then by **popularity score** within each type. A `type` query parameter restricts results to a single kind.

### Response Shape

```json
{
  "suggestions": [
    { "text": "Apple MacBook Pro 14", "type": "product", "score": 95,
      "payload": { "productId": "p-mock-apple-macbook-pro", "slug": "apple-macbook-pro-14" } },
    { "text": "Apple", "type": "brand", "score": 100 },
    { "text": "apple iphone", "type": "query", "score": 90 }
  ],
  "took": 0
}
```

### Swagger UI

Browse the interactive API docs at **http://localhost:3004/docs** while the service is running.

### Quick test

```bash
# Start the service
pnpm --filter @shop/autocomplete-service dev

# Prefix search — "lap" → laptop suggestions
curl "http://localhost:3004/api/v1/autocomplete?q=lap" | jq '.suggestions[].text'

# Brand-only suggestions for "sam"
curl "http://localhost:3004/api/v1/autocomplete?q=sam&type=brand" | jq '.'

# Top 5 suggestions with no prefix
curl "http://localhost:3004/api/v1/autocomplete?limit=5" | jq '.suggestions[].text'

# Empty prefix — returns global top suggestions
curl "http://localhost:3004/api/v1/autocomplete" | jq '.suggestions | length'
```

> **Note:** The mock suggestion list is static and resets on restart.
> In Step 3.4 suggestions will be backed by Redis Sorted Sets (popular queries) and the Elasticsearch completion suggester (product names).

---

## Frontend Integration

The typed HTTP SDK is published to GitHub Packages as **`@nexusserg/api-client`**.
It bundles all domain types — no additional peer dependencies needed.

### Publishing (maintainers)

The package is published automatically via GitHub Actions when a tag matching `api-client/v*` is pushed:

```bash
# Bump version in packages/api-client/package.json, then:
git tag api-client/v0.1.0
git push origin api-client/v0.1.0
```

Or trigger manually from the **Actions → Publish @nexusserg/api-client** workflow.

### Installing in the frontend repo

```bash
# 1. Authenticate with GitHub Packages (one-time setup)
#    Generate a token at: https://github.com/settings/tokens (scope: read:packages)
echo "@nexusserg:registry=https://npm.pkg.github.com" >> .npmrc
echo "//npm.pkg.github.com/:_authToken=YOUR_GITHUB_TOKEN" >> .npmrc

# 2. Install the SDK
npm install @nexusserg/api-client
# or
pnpm add @nexusserg/api-client
```

### Usage in Next.js

```typescript
import { CatalogClient } from '@nexusserg/api-client';

const client = new CatalogClient({
  baseUrl: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
});

// Server Component (SSR)
const results = await client.search({ q: 'laptop', page: 1, perPage: 24 });

// With filters
const filtered = await client.search({
  q: 'phone',
  brands: ['apple', 'samsung'],
  priceMin: 500,
  priceMax: 1500,
  rating: 4,
  sort: 'price_asc',
});
```

The API Gateway at `http://localhost:3000` is the single entry point — the frontend only ever talks to that one host.
