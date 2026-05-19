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
| API Gateway | 3000 | _(Step 1.5)_ |
| Search Service | 3001 | `apps/search-service` |
| Catalog Service | 3002 | `apps/catalog-service` ✅ Step 1.1 |
| Pricing Service | 3003 | `apps/pricing-service` |
| Autocomplete Service | 3004 | `apps/autocomplete-service` |
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

## Project Structure

```
apps/
├── search-service/         # Full-text search + faceted filtering (port 3001)
├── catalog-service/        # Product CRUD + category hierarchy (port 3002)
├── pricing-service/        # Real-time price & inventory (port 3003)
├── autocomplete-service/   # Search suggestions (port 3004)
├── indexing-worker/        # Kafka → Elasticsearch sync
└── saved-search-service/   # Persist search/filter combinations (port 3005)
packages/
├── shared-types/           # TypeScript domain models (Product, Search, Events…)
├── shared-utils/           # URL↔SearchState helpers, retry, slugify
├── api-client/             # Typed HTTP client SDK (used by frontend)
└── eslint-config/          # Shared ESLint rules
infra/
└── docker-compose.yml      # Local dev infrastructure
```

---

## Health Checks

Once services are running, verify each is up:

```bash
curl http://localhost:3001/health  # search-service
curl http://localhost:3002/health  # catalog-service
curl http://localhost:3003/health  # pricing-service
curl http://localhost:3004/health  # autocomplete-service
curl http://localhost:3005/health  # saved-search-service
```

Expected response: `{"status":"ok","service":"<name>"}`

---

## Catalog Service (Step 1.1 — Mock-First)

The catalog service runs on **port 3002** and uses an in-memory store seeded with **100 deterministic fake products** (via `@faker-js/faker` with a fixed seed, so IDs are stable across restarts).

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/products` | List all products (or bulk-fetch with `?ids=id1,id2`) |
| `GET` | `/api/v1/products/:id` | Get single product by ID |
| `POST` | `/api/v1/products` | Create a product _(admin)_ |
| `PATCH` | `/api/v1/products/:id` | Update product fields _(admin)_ |
| `GET` | `/api/v1/categories` | Get full category tree with product counts |

### Swagger UI

Browse the interactive API docs at **http://localhost:3002/docs** while the service is running.

### Quick test

```bash
# Start the service
pnpm --filter @shop/catalog-service dev

# Fetch all seeded products
curl http://localhost:3002/api/v1/products | jq '.count'

# Fetch a product by ID (grab an ID from the list above)
curl http://localhost:3002/api/v1/products/<id>

# Create a new product
curl -X POST http://localhost:3002/api/v1/products \
  -H 'Content-Type: application/json' \
  -d '{"sku":"MY-SKU","name":"My Product","brand":"Acme","categoryId":"cat-laptops"}'
```

> **Note:** The in-memory store resets on restart. PostgreSQL integration is planned for Step 3.1.

