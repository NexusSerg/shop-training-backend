# E-commerce Product Catalog with Search shop
## This is instuction for copilot to implement the solution step by step.
### This is the back end part

Context: We are building a product catalog system for a large e-commerce marketplace that 
    hosts 10+ million products 
    across 500+ categories 
    from 50,000+ sellers. 
    The platform serves 15-20 million daily active users globally,
    with peak traffic during sales events and holiday seasons.
    The catalog receives 1-2 million product updates daily (price changes, inventory updates, new products) 
    and processes 500,000-1 million search queries per hour. During major sales events (Black Friday, Cyber Monday, Prime Day),
    traffic increases by 10-15x normal load. 
    
It should include: 

Design and implement an e-commerce product catalog system that: 
    
    1. Displays products with real-time pricing and availability from multiple sellers 
    2. Provides advanced search with auto-complete 
    3. Implements multi-faceted filtering (price, brand, ratings, attributes, availability, etc.) 
    4. Supports intelligent sorting (relevance, price, ratings, popularity, new arrivals, etc.) 
    5. Handles real-time inventory and price updates without impacting search performance 
    6. Maintains search performance under 200ms even during peak traffic (10-15x normal) 

Requirements:
    1. Product listing page with: 
        a. Pagination (with infinite scroll option) 
        b. Products per page selector (24, 48, 96, etc.) 
        c. Quick view without pagenavigation 
    2. Advanced search features with search by product name, description, SKU, brand etc. 
    3. Dynamic filtering system: 
        a. Price range slider 
        b. Multi-select brand filter 
        c. Rating filter (4+ stars, 3+ stars, etc.) 
        d. Category and subcategory navigation 
        e. Product attributes (size, color, material, etc.) 
    4. Sorting options 
    5. SEO optimization for product pages and search results 
    6. Save search and filter combinations for later use Out of

Scope: 
    1. User authentication/authorization 
    2. Shopping cart management 
    3. Checkout and payment processing 
    4. Order management system 
    5. Product reviews and Q&A system 
    6. Seller/merchant management portal 
    7. Product recommendation engine (only basic related products) 
    8. Wish list/Favorites functionality 
    9. Price tracking and alerts 
    10. Customer service integration

It should be implemented with the next primary technology:
TypeScript, Node.js for backend and React for frontend.

Architecture Overview

┌─────────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                                 │
│                                                                      │
│   ┌──────────────────┐        ┌──────────────────────────────────┐  │
│   │   Next.js (SSR)  │        │    React SPA (CSR)               │  │
│   │   Product Pages  │        │    Search/Filter UI              │  │
│   │   SEO Critical   │        │    Dynamic Interactions          │  │
│   └────────┬─────────┘        └────────────┬─────────────────────┘  │
└────────────┼──────────────────────────────┼────────────────────────┘
             │                              │
             ▼                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    CDN LAYER (CloudFront/Akamai)                     │
│         Static Assets | SSR HTML Cache | API Response Cache         │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      API GATEWAY LAYER                               │
│              (Kong / AWS API Gateway / Custom Fastify)               │
│    Rate Limiting | Request Routing | SSL Termination | Load Balancing│
└──────┬──────────────┬──────────────────┬────────────────────────────┘
       │              │                  │
       ▼              ▼                  ▼
┌────────────┐ ┌────────────┐  ┌─────────────────┐
│   Search   │ │  Catalog   │  │  Pricing &      │
│  Service   │ │  Service   │  │  Inventory Svc  │
│(Node.js/TS)│ │(Node.js/TS)│  │  (Node.js/TS)   │
└─────┬──────┘ └─────┬──────┘  └────────┬────────┘
      │              │                  │
      ▼              ▼                  ▼
┌────────────┐ ┌────────────┐  ┌─────────────────┐
│Elasticsearch│ │ PostgreSQL │  │  Redis Cluster  │
│  Cluster   │ │  (Primary  │  │  (Prices &      │
│(Search +   │ │  Catalog)  │  │   Inventory)    │
│ Faceting)  │ └────────────┘  └─────────────────┘
└────────────┘
       ▲              ▲                  ▲
       └──────────────┴──────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    EVENT STREAMING LAYER                             │
│                      Apache Kafka                                    │
│  product.updated | price.changed | inventory.updated | product.new  │
└──────────────────────────────────────────────────────────────────────┘
Services Breakdown


┌─────────────────────────────────────────────────────────────────────┐
│                        SERVICE DETAILS                               │
├─────────────────────┬───────────────────────────────────────────────┤
│ Search Service      │ Elasticsearch queries, autocomplete,          │
│                     │ faceted filtering, sorting, relevance scoring  │
├─────────────────────┼───────────────────────────────────────────────┤
│ Catalog Service     │ Product CRUD, category hierarchy,             │
│                     │ product attributes, seller data               │
├─────────────────────┼───────────────────────────────────────────────┤
│ Pricing & Inventory │ Real-time price/inventory reads from Redis,   │
│                     │ writes to PostgreSQL asynchronously           │
├─────────────────────┼───────────────────────────────────────────────┤
│ Autocomplete Svc    │ Redis-backed prefix trie, popular searches,   │
│                     │ personalized suggestions                      │
├─────────────────────┼───────────────────────────────────────────────┤
│ Indexing Service    │ Consumes Kafka events, updates ES index,      │
│                     │ manages near-real-time sync                   │
├─────────────────────┼───────────────────────────────────────────────┤
│ Saved Search Svc    │ Stores user search/filter combinations,       │
│                     │ shareable URLs, named searches                │
└─────────────────────┴───────────────────────────────────────────────┘
Data Flow for Search Query


User types query
     │
     ▼
┌─────────────────────────────────────────────┐
│  React Frontend                              │
│  1. Debounce 150ms                           │
│  2. Check browser cache (URL state)          │
│  3. Build query params from filter state     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  CDN / API Gateway                           │
│  Cache hit? → Return cached (TTL: 30s)       │
│  Cache miss? → Forward to Search Service     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Search Service (Node.js)                    │
│  1. Parse & validate query params            │
│  2. Build ES query with filters + facets     │
│  3. Apply relevance scoring (BM25 + custom)  │
│  4. Execute parallel:                        │
│     a) ES search query                       │
│     b) Redis price/inventory lookup          │
│  5. Merge results                            │
│  6. Cache response                           │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  Elasticsearch                               │
│  - Full-text search across all fields        │
│  - Facet aggregations (brands, price, etc.)  │
│  - Category tree navigation                  │
│  - Returns product IDs + basic data          │
└─────────────────────────────────────────────┘
Data Flow for Product Updates (1-2M/day)


Seller Update / Price Change
          │
          ▼
  Catalog/Pricing Service
          │
          ▼ (write)
  ┌───────────────────────────┐
  │  PostgreSQL (source of    │
  │  truth for catalog data)  │
  │  Redis (immediate cache   │
  │  for price/inventory)     │
  └──────────┬────────────────┘
             │
             ▼ (publish event)
         Kafka Topic
         product.updated
             │
             ▼ (consume)
    Indexing Worker Service
    (Node.js, 10+ consumers)
             │
             ▼ (partial update)
      Elasticsearch Index
      (near-real-time: ~1-5s)
Elasticsearch Index Design
typescript


// Product Index Mapping
interface ProductDocument {
  // Core fields
  product_id: string;
  sku: string;
  name: string;                    // analyzed for full-text
  name_suggest: string;            // for autocomplete (completion suggester)
  description: string;             // analyzed, lower boost
  brand: string;                   // keyword for filtering
  
  // Taxonomy
  category_id: string;
  category_path: string[];         // ["Electronics", "Phones", "Smartphones"]
  category_ids_hierarchy: string[];
  
  // Pricing (refreshed frequently)
  price_min: number;               // lowest price across sellers
  price_max: number;               // highest price
  original_price: number;          // for discount calc
  discount_percentage: number;
  
  // Availability
  in_stock: boolean;
  seller_count: number;            // number of sellers offering this product
  
  // Ranking signals
  rating_avg: number;
  review_count: number;
  sales_rank: number;              // computed popularity score
  click_through_rate: number;      // behavioral signal
  
  // Attributes (dynamic)
  attributes: {
    [key: string]: string | string[] | number;
    // color: ["red", "blue"], size: ["M", "L"], material: "cotton"
  };
  
  // SEO
  slug: string;
  meta_title: string;
  meta_description: string;
  
  // Timestamps
  created_at: Date;
  updated_at: Date;
  price_updated_at: Date;
}
Caching Strategy


┌────────────────────────────────────────────────────────────────────┐
│                     MULTI-LAYER CACHING                            │
├──────────────────┬────────────────┬──────────────────┬────────────┤
│ Layer            │ Technology     │ TTL              │ What        │
├──────────────────┼────────────────┼──────────────────┼────────────┤
│ Browser Cache    │ HTTP headers   │ 5 min            │ Static      │
│                  │ Service Worker │                  │ assets      │
├──────────────────┼────────────────┼──────────────────┼────────────┤
│ CDN Cache        │ CloudFront     │ 30s (search)     │ API         │
│                  │                │ 5min (product)   │ responses   │
├──────────────────┼────────────────┼──────────────────┼────────────┤
│ API Response     │ Redis          │ 10s (search)     │ Search      │
│ Cache            │                │ 30s (product)    │ results     │
│                  │                │ 2s (price/inv)   │ Prices      │
├──────────────────┼────────────────┼──────────────────┼────────────┤
│ Autocomplete     │ Redis          │ 1 hour           │ Suggestions │
│ Cache            │ Sorted Sets    │                  │ Top queries │
├──────────────────┼────────────────┼──────────────────┼────────────┤
│ Price/Inventory  │ Redis Cluster  │ Write-through    │ Real-time   │
│ Cache            │                │ (no TTL)         │ pricing     │
└──────────────────┴────────────────┴──────────────────┴────────────┘
Frontend Architecture


src/
├── app/                          # Next.js App Router
│   ├── (catalog)/
│   │   ├── products/
│   │   │   ├── page.tsx          # SSR: Product listing (SEO)
│   │   │   └── [slug]/
│   │   │       └── page.tsx      # SSR: Product detail (SEO)
│   │   └── search/
│   │       └── page.tsx          # SSR: Search results (SEO)
│   └── layout.tsx
│
├── components/
│   ├── catalog/
│   │   ├── ProductGrid/          # Grid/list view toggle
│   │   ├── ProductCard/          # Card with quick view
│   │   ├── QuickView/            # Modal without navigation
│   │   ├── Pagination/           # Traditional + infinite scroll
│   │   └── ProductsPerPage/      # 24/48/96 selector
│   │
│   ├── search/
│   │   ├── SearchBar/            # With autocomplete dropdown
│   │   ├── AutoComplete/         # Suggestions component
│   │   └── SearchHistory/        # Recent searches
│   │
│   ├── filters/
│   │   ├── FilterPanel/          # Container, mobile drawer
│   │   ├── PriceRangeSlider/     # Dual handle price range
│   │   ├── BrandFilter/          # Multi-select with search
│   │   ├── RatingFilter/         # 4+ stars, 3+ stars etc
│   │   ├── CategoryTree/         # Hierarchical navigation
│   │   ├── AttributeFilter/      # Dynamic size/color/etc
│   │   └── ActiveFilters/        # Chips showing active filters
│   │
│   └── sorting/
│       └── SortSelect/           # Dropdown or tabs
│
├── hooks/
│   ├── useSearch.ts              # Search query management
│   ├── useFilters.ts             # Filter state management
│   ├── useInfiniteScroll.ts      # Infinite scroll logic
│   ├── useAutoComplete.ts        # Debounced autocomplete
│   └── useSavedSearches.ts       # Save/load search combos
│
├── store/
│   ├── searchSlice.ts            # Redux/Zustand search state
│   ├── filterSlice.ts            # Active filters state
│   └── catalogSlice.ts           # Product data
│
└── lib/
    ├── queryBuilder.ts           # URL ↔ filter state sync
    ├── searchAnalytics.ts        # Track search behavior
    └── seoHelpers.ts             # Meta tags, structured data
URL State Management (SEO + Shareable)
typescript


// URL reflects complete search state - shareable & SEO friendly
// /search?q=laptop&brands=apple,dell&price_min=500&price_max=2000
//         &rating=4&category=electronics/laptops&sort=relevance
//         &page=2&per_page=48&colors=silver,black

interface SearchState {
  query: string;
  filters: {
    brands: string[];
    priceRange: [number, number];
    rating: number;
    categoryPath: string[];
    attributes: Record<string, string[]>;
    inStockOnly: boolean;
  };
  sort: 'relevance' | 'price_asc' | 'price_desc' | 'rating' | 'newest' | 'popularity';
  pagination: {
    page: number;
    perPage: 24 | 48 | 96;
  };
}

// Bidirectional sync between URL and state
const useSearchStateSync = () => {
  const [searchState, setSearchState] = useSearchParams();
  // URL is single source of truth - enables:
  // - Browser back/forward navigation
  // - Shareable search URLs
  // - SEO indexable filter pages
  // - Saved searches (just store the URL)
};

#Plan step by step implementation of this solution
###steps can include tempory mock data or stubbing methods
###implementation should be agent friendly
E-commerce Product Catalog: Step-by-Step Implementation Plan
Implementation Philosophy
Incremental & testable: Each step produces working, verifiable output
Mock-first: Use stubs/mocks early, replace with real implementations later
Agent-friendly: Self-contained steps with clear inputs, outputs, and acceptance criteria
Vertical slices: Build end-to-end thin slices before scaling horizontally
PHASE 0: Foundation & Project Setup
Step 0.1: Monorepo Structure
Goal: Establish workspace with shared types



ecommerce-catalog/
├── apps/
│   ├── web/                    # Next.js frontend
│   ├── search-service/         # Search microservice
│   ├── catalog-service/        # Catalog microservice
│   ├── pricing-service/        # Pricing & Inventory
│   ├── autocomplete-service/   # Autocomplete
│   ├── indexing-worker/        # Kafka consumer
│   └── saved-search-service/   # Saved searches
├── packages/
│   ├── shared-types/           # TypeScript interfaces
│   ├── shared-utils/           # Common utilities
│   ├── api-client/             # Frontend SDK
│   └── eslint-config/
├── infra/
│   ├── docker-compose.yml      # Local dev: ES, Redis, Postgres, Kafka
│   └── k8s/                    # Production manifests
└── package.json (workspaces)
Tools: pnpm workspaces, TypeScript 5.x, Turborepo Acceptance: pnpm install && pnpm build succeeds across all packages

Step 0.2: Local Infrastructure (Docker Compose)
Goal: One-command local environment


services:
  - postgres:15
  - redis:7 (cluster mode)
  - elasticsearch:8.x (single node)
  - kafka + zookeeper
  - kibana (optional debugging)
Acceptance: docker-compose up brings up all services with health checks passing

Step 0.3: Shared Types Package
Goal: Single source of truth for domain models

Create packages/shared-types/src/:

product.ts — Product, ProductDocument, ProductAttribute
search.ts — SearchState, SearchRequest, SearchResponse, Facet
filter.ts — FilterDefinition, PriceRange, RatingFilter
pricing.ts — Price, Inventory, SellerOffer
events.ts — Kafka event schemas (ProductUpdatedEvent, etc.)
Acceptance: All services import from @catalog/shared-types

PHASE 1: Backend Skeleton with Mocks
Step 1.1: Catalog Service (Mock-First)
Goal: REST API returning mocked products

Tech: Fastify + TypeScript + Zod for validation

Endpoints:

GET /api/v1/products/:id → mock product
GET /api/v1/products?ids=... → bulk fetch
GET /api/v1/categories → mock category tree
POST /api/v1/products (admin)
PATCH /api/v1/products/:id
Mock Layer: In-memory Map<string, Product> seeded with 100 fake products via faker.js

Acceptance:

curl localhost:3001/api/v1/products/p1 returns JSON
OpenAPI/Swagger docs auto-generated
Step 1.2: Search Service (Mock-First)
Goal: Search API contract before ES integration

Endpoints:

GET /api/v1/search?q=...&filters=...&sort=...&page=...
GET /api/v1/search/facets?q=... (for filter UI)
Mock Layer:

Filter the in-memory product list with simple JavaScript
Compute facets via reduce/groupBy
Return shape that matches future ES response
typescript


interface SearchResponse {
  products: ProductSummary[];
  facets: {
    brands: { value: string; count: number }[];
    priceRanges: { min: number; max: number; count: number }[];
    ratings: { value: number; count: number }[];
    attributes: Record<string, { value: string; count: number }[]>;
  };
  pagination: { total: number; page: number; perPage: number };
  took: number;
}
Acceptance: Returns paginated, filtered, sorted results with facets

Step 1.3: Pricing & Inventory Service (Mock-First)
Goal: Real-time price/availability lookups

Endpoints:

GET /api/v1/pricing/:productId → seller offers
POST /api/v1/pricing/bulk → batch lookup
PATCH /api/v1/inventory/:productId/:sellerId
Mock Layer: In-memory store, simulate latency <5ms

Acceptance: Bulk endpoint returns 100 product prices in <50ms

Step 1.4: Autocomplete Service (Mock-First)
Goal: Suggestions API

Endpoint: GET /api/v1/autocomplete?q=lap&limit=10

Mock Layer: Static suggestion list with prefix matching

Acceptance: Returns suggestions in <20ms for any prefix

Step 1.5: API Gateway Configuration
Goal: Single entry point routing

Tool: Fastify reverse proxy (simple) OR Kong (production)

Routes:

/api/v1/search/* → search-service
/api/v1/products/* → catalog-service
/api/v1/pricing/* → pricing-service
/api/v1/autocomplete/* → autocomplete-service
Add: Rate limiting (per IP), CORS, request ID propagation, structured logging (pino)

Acceptance: All services reachable through single port

PHASE 2: Frontend Vertical Slice
Step 2.1: Next.js App Setup
Goal: SSR-ready Next.js 14 app

Setup:

App Router
Tailwind CSS
shadcn/ui or MUI
Zustand for client state
TanStack Query for server state
Configure paths to @catalog/shared-types, @catalog/api-client
Acceptance: pnpm dev runs at localhost:3000

Step 2.2: API Client Package
Goal: Typed SDK consumed by frontend

typescript


// packages/api-client/src/index.ts
export class CatalogClient {
  search(params: SearchRequest): Promise<SearchResponse>;
  getProduct(id: string): Promise<Product>;
  getAutocomplete(q: string): Promise<Suggestion[]>;
  getPricing(productIds: string[]): Promise<PriceMap>;
}
Acceptance: Frontend can import and call all backend endpoints with full type safety

Step 2.3: Search Page (SSR)
Goal: /search?q=laptop renders products server-side

Components:

app/search/page.tsx (server component, fetches initial results)
<SearchResults /> (client component for interactivity)
<ProductGrid /> and <ProductCard />
Features:

Read query/filters from URL
SSR initial page for SEO
Client-side hydration for filter changes
Acceptance: View source shows rendered HTML with products

Step 2.4: URL State Management
Goal: URL is single source of truth

Create lib/queryBuilder.ts:

parseSearchParams(URLSearchParams) → SearchState
buildSearchParams(SearchState) → URLSearchParams
useSearchStateSync() hook with useSearchParams + router.push
Acceptance:

Filter changes update URL without full reload
Back/forward buttons restore previous state
Sharing URL reproduces exact view
Step 2.5: Filter Panel
Goal: All filter components functional

Build in order:

<PriceRangeSlider /> — dual-handle, debounced
<BrandFilter /> — multi-select with search & "show more"
<RatingFilter /> — radio with star icons
<CategoryTree /> — collapsible hierarchy
<AttributeFilter /> — dynamic from facet response
<ActiveFilters /> — chips with "clear all"
State: Each filter reads from URL, dispatches to update URL → triggers refetch

Acceptance: All filters compose correctly, facet counts update

Step 2.6: Search Bar with Autocomplete
Goal: Debounced autocomplete dropdown

Components:

<SearchBar /> with debounced input (150ms)
<AutoCompleteDropdown /> showing suggestions, recent searches
Keyboard navigation (arrow keys, Enter, Esc)
Acceptance: Suggestions appear within 200ms of typing

Step 2.7: Pagination & Infinite Scroll
Goal: Both pagination modes

Components:

<Pagination /> — page numbers (default for SEO)
<InfiniteScroll /> — IntersectionObserver-based
<PerPageSelector /> — 24/48/96
Toggle stored in user preference (localStorage)
Acceptance: SSR uses pagination; user can switch to infinite scroll

Step 2.8: Quick View
Goal: Modal showing product details without navigation

Component: <QuickViewModal /> triggered from <ProductCard />

Fetches additional product data on open
Closeable with Esc, backdrop click
Updates URL with ?quickview=productId for deep-link
Acceptance: Opens/closes without losing scroll position or filter state

Step 2.9: Sort Dropdown
Goal: Sorting integrated with URL

Options: relevance, price_asc, price_desc, rating, newest, popularity

Acceptance: Selection updates URL &sort=... and triggers refetch

Step 2.10: SEO Optimization
Goal: Production-ready SEO

Implement:

Dynamic <title>, <meta description> per route
JSON-LD structured data (Product, BreadcrumbList, ItemList)
Canonical URLs (avoid duplicates from filter combos — canonicalize to category page)
robots.txt: disallow deep filter combos, allow categories
Sitemap generation (separate worker, paginated)
Open Graph / Twitter card meta tags
Acceptance:

Lighthouse SEO score >95
Google Rich Results Test validates structured data
PHASE 3: Replace Mocks with Real Storage
Step 3.1: PostgreSQL Schema (Catalog)
Goal: Persistent product catalog

Tables:

sql


products (id, sku, name, description, brand, slug, status, created_at, updated_at)
categories (id, parent_id, name, slug, path)
product_categories (product_id, category_id)
product_attributes (product_id, key, value)
sellers (id, name, status)
seller_offers (id, product_id, seller_id, price, original_price, stock, status)
Tools: Prisma or Drizzle ORM, migrations via prisma migrate

Step: Replace catalog-service mock layer with Prisma queries

Acceptance: 1M seeded products, queries <50ms with proper indexes

Step 3.2: Redis for Pricing & Inventory
Goal: Sub-millisecond price reads

Schema:



pricing:{productId} → Hash { min_price, max_price, seller_count }
inventory:{productId}:{sellerId} → Hash { stock, status }
seller_offers:{productId} → Sorted Set (score=price, member=sellerId)
Pattern: Write-through (PostgreSQL + Redis in transaction)

Step: Replace pricing-service mock with Redis client (ioredis)

Acceptance: GET pricing for 100 products in <10ms

Step 3.3: Elasticsearch Index Setup
Goal: Production search index

Tasks:

Define index mapping (per ProductDocument interface)
Configure analyzers (standard, edge_ngram for autocomplete, language-specific)
Configure completion suggester field
Create index template with proper shards/replicas
Bulk index 1M test products from PostgreSQL
Step: Replace search-service mock with @elastic/elasticsearch client

Implementation Order:

Basic full-text query (multi_match)
Filter clauses (term, range)
Aggregations for facets
Function score for popularity boost
Highlighting for search snippets
Acceptance: Search latency p95 <100ms with 1M products

Step 3.4: Real Autocomplete with Redis
Goal: Replace mock with Redis-backed suggestions

Schema:



autocomplete:popular → Sorted Set (score=frequency, member=query)
autocomplete:trie → Use Redis modules OR ES completion suggester
Hybrid approach:

Use ES completion suggester for product name matches
Use Redis sorted set for popular queries
Merge results in service
Acceptance: <30ms response time, ranked by popularity

Step 3.5: Saved Search Service
Goal: Persist user search combinations

PostgreSQL Table:

sql


saved_searches (id, user_id, name, url_state JSONB, created_at)
Endpoints:

POST /api/v1/saved-searches — save current URL state
GET /api/v1/saved-searches — list user's saved
DELETE /api/v1/saved-searches/:id
GET /api/v1/saved-searches/:id — returns URL to redirect
Note: Auth is out of scope; use a header x-user-id stub for now

Acceptance: Saved search produces shareable URL that restores state

PHASE 4: Event-Driven Updates
Step 4.1: Kafka Setup & Topics
Topics:

product.created
product.updated
product.deleted
price.changed
inventory.updated
Message Schemas: Use Avro or JSON Schema, register in shared-types

Acceptance: Topics created, can publish/consume manually

Step 4.2: Producers
Goal: Services emit events on writes

In catalog-service: After PostgreSQL write, publish to product.updated In pricing-service: After Redis write, publish to price.changed

Pattern: Outbox pattern (write event to DB transactionally, separate publisher polls)

Acceptance: Every write produces a consumable Kafka event

Step 4.3: Indexing Worker
Goal: Sync changes to Elasticsearch

Implementation:

KafkaJS consumer group with 10+ partitions
Consume product.*, price.*, inventory.*
Batch updates (100 messages or 1s window)
Use ES _bulk API with partial updates (update ops with doc)
Handle retry with exponential backoff
Dead letter queue for poison messages
Acceptance:

Product update visible in search within 5 seconds
Sustained throughput of 50k events/min
Step 4.4: Reconciliation Job
Goal: Handle missed events / drift

Implementation:

Nightly cron comparing PostgreSQL updated_at to ES updated_at
Re-index drift items
Metrics on drift count
Acceptance: Drift count stays near zero in steady state

PHASE 5: Caching & Performance
Step 5.1: Redis Search Result Caching
Goal: Cache hot queries

Implementation in search-service:

Cache key = hash(normalized query + filters + sort + page)
TTL: 10s for search, 30s for product detail
Cache stampede protection (lock with SETNX)
Acceptance: Cache hit ratio >60% during normal traffic

Step 5.2: CDN Configuration
Goal: Edge caching for API + SSR

Setup:

CloudFront in front of Next.js
Cache headers from API: Cache-Control: public, s-maxage=30, stale-while-revalidate=60
Vary on relevant headers
Purge endpoint for product updates
Acceptance: Repeated requests served from edge in <30ms

Step 5.3: Frontend Performance
Goal: Optimal client experience

Tasks:

Image optimization (Next.js <Image> with proper sizes)
Code splitting per route
Prefetch product detail on card hover
Service Worker for offline browsing of viewed products
React Suspense for data fetching boundaries
Acceptance:

LCP <2.5s
CLS <0.1
TTI <3s on 4G
Step 5.4: Database Query Optimization
Tasks:

Add proper PostgreSQL indexes (B-tree on slug, GIN on JSONB attributes)
Connection pooling (PgBouncer)
Read replicas for catalog queries
ES query profiling and slow query log
Acceptance: All p99 query times within SLA

PHASE 6: Resilience & Observability
Step 6.1: Observability Stack
Components:

Metrics: Prometheus + Grafana
Logging: Pino → Loki / ELK
Tracing: OpenTelemetry → Jaeger
Errors: Sentry
Per-service instrumentation:

HTTP request metrics (rate, latency, errors)
Custom: cache hit ratio, ES query latency, Kafka lag
Distributed traces correlating gateway → service → DB
Acceptance: Dashboards showing all golden signals

Step 6.2: Circuit Breakers & Fallbacks
Goal: Graceful degradation

Implementations:

Use opossum library for circuit breakers
ES down → fall back to PostgreSQL search (degraded mode)
Pricing service down → show "Price unavailable" instead of failing
Autocomplete down → return empty (search still works)
Acceptance: Chaos test (kill ES) → site still serves products

Step 6.3: Rate Limiting & Bot Protection
Tasks:

Per-IP and per-user limits in API Gateway
Stricter limits on search endpoint
Bot detection (User-Agent, behavioral)
Captcha on suspicious patterns
Acceptance: Load test with bot patterns gets throttled

PHASE 7: Scale Testing & Sale-Event Readiness
Step 7.1: Load Testing
Tool: k6 or Gatling

Scenarios:

1k → 15k RPS ramp on search
Mixed read/write (95/5)
Realistic filter distribution
Targets:

p95 search latency <200ms at 15x baseline
Error rate <0.1%
Step 7.2: Auto-Scaling Configuration
Tasks:

Kubernetes HPA on services (CPU + custom metric: req/s)
ES warm tier for hot indices
Pre-warming Redis cache before sales events
Read-replica scaling for PostgreSQL
Acceptance: System handles 15x traffic with auto-scale within 2 minutes

Step 7.3: Sale-Event Mode
Goal: Special config for high-traffic events

Features:

Feature flag enabling aggressive caching (longer TTLs)
Static fallback pages for popular categories
Disable expensive features (e.g., personalized autocomplete) under load
Read-only mode toggle for catastrophic situations
Acceptance: Documented runbook with toggles

PHASE 8: Production Hardening
Step 8.1: CI/CD Pipeline
GitHub Actions: lint, test, build per PR
Docker images per service
Deploy to staging → smoke tests → production
Blue-green deployments
Step 8.2: Security
Input validation everywhere (Zod)
ES query injection protection (parameterized)
Secrets in vault (not env vars)
Dependency scanning (Snyk/Dependabot)
Step 8.3: Documentation
Architecture decision records (ADRs)
Runbooks (incident response, scaling)
API docs (OpenAPI per service)
Onboarding guide

Key Principles for Agent Execution
Each step is a PR: Small, reviewable, independently deployable
Tests at every step: Unit tests for logic, integration tests for endpoints, E2E for flows
Stub before integrate: Get the contract right before connecting real systems
Feature flags: Wrap risky changes; rollback without deploy
Observable from day 1: Every endpoint logged, every action measured
Document as you go: README per service, OpenAPI auto-generated, ADRs for decisions