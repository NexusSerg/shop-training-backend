#!/usr/bin/env ts-node
/**
 * Bulk indexing script — Step 3.3
 *
 * Reads ALL active products from PostgreSQL (catalog-service DB) and indexes
 * them into Elasticsearch in configurable batches using the ES _bulk API.
 *
 * Usage:
 *   DATABASE_URL=postgresql://shop:shop_secret@localhost:5432/shop_catalog \
 *   ELASTICSEARCH_URL=http://localhost:9200 \
 *     ts-node src/scripts/index-products.ts [--batch 1000] [--recreate]
 *
 * Options:
 *   --batch N      ES bulk batch size (default: 1000)
 *   --recreate     Delete and recreate the index before indexing (full re-index)
 *   --limit N      Only index N products (useful for smoke tests)
 *
 * Notes:
 *   - Only products with status='active' are indexed.
 *   - Pricing data (priceMin/Max, discountPct) is generated from seller_offers rows.
 *     If a product has no offers, prices default to 0 / in_stock=false.
 *   - Progress is logged every batch.
 *   - Script exits with code 1 on any fatal error.
 */

import { Client as PgClient } from 'pg';
import { Client as EsClient } from '@elastic/elasticsearch';
import { PRODUCTS_INDEX, PRODUCTS_INDEX_CONFIG, ensureProductsIndex } from '../elasticsearch/index-mapping';
import type { StoredProductDocument } from '../elasticsearch/es-search-store';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2);

function getArgNumber(name: string, fallback: number): number {
  const idx = argv.indexOf(name);
  if (idx >= 0 && argv[idx + 1]) return parseInt(argv[idx + 1] as string, 10);
  return fallback;
}

const BATCH_SIZE = getArgNumber('--batch', 1000);
const LIMIT = argv.includes('--limit') ? getArgNumber('--limit', 10_000) : Number.MAX_SAFE_INTEGER;
const RECREATE = argv.includes('--recreate');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env['DATABASE_URL'];
const ELASTICSEARCH_URL = process.env['ELASTICSEARCH_URL'] ?? 'http://localhost:9200';

if (!DATABASE_URL) {
  console.error('[index-products] ERROR: DATABASE_URL environment variable is required.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------
// PostgreSQL row types
// ---------------------------------------------------------------------------

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  slug: string;
  primary_category_id: string | null;
  category_path: string[] | null;
  meta_title: string;
  meta_description: string;
  created_at: Date;
  updated_at: Date;
}

interface AttributeRow {
  product_id: string;
  key: string;
  value: string; // stored as JSON-encoded string in DB
}

interface ImageRow {
  product_id: string;
  url: string;
  alt_text: string;
  is_primary: boolean;
}

interface OfferRow {
  product_id: string;
  price: number;
  original_price: number;
  stock: number;
  status: string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('[index-products] Starting…');
  console.log(`  Database : ${DATABASE_URL?.replace(/:\/\/.*@/, '://***@')}`);
  console.log(`  ES       : ${ELASTICSEARCH_URL}`);
  console.log(`  Batch    : ${BATCH_SIZE}`);
  console.log(`  Limit    : ${LIMIT === Number.MAX_SAFE_INTEGER ? 'all' : LIMIT}`);
  console.log(`  Recreate : ${RECREATE}`);

  // ── Connect ─────────────────────────────────────────────────────────────
  const pg = new PgClient({ connectionString: DATABASE_URL });
  await pg.connect();
  console.log('[index-products] PostgreSQL connected.');

  const es = new EsClient({ node: ELASTICSEARCH_URL });
  await es.ping();
  console.log('[index-products] Elasticsearch connected.');

  // ── Index setup ──────────────────────────────────────────────────────────
  if (RECREATE) {
    const exists = await es.indices.exists({ index: PRODUCTS_INDEX });
    if (exists) {
      await es.indices.delete({ index: PRODUCTS_INDEX });
      console.log(`[index-products] Deleted index "${PRODUCTS_INDEX}".`);
    }
  }

  await ensureProductsIndex(es);
  console.log(`[index-products] Index "${PRODUCTS_INDEX}" ready.`);

  // ── Count active products ─────────────────────────────────────────────────
  const { rows: countRows } = await pg.query<{ total: string }>(
    `SELECT COUNT(*) AS total FROM products WHERE status = 'active'`,
  );
  const totalProducts = Math.min(parseInt(countRows[0]?.total ?? '0', 10), LIMIT);
  console.log(`[index-products] Active products to index: ${totalProducts}`);

  if (totalProducts === 0) {
    console.log('[index-products] Nothing to index. Run db:seed first.');
    await pg.end();
    return;
  }

  // ── Stream products in batches ────────────────────────────────────────────
  let indexed = 0;
  let offset = 0;
  let errors = 0;

  while (offset < totalProducts) {
    const batchLimit = Math.min(BATCH_SIZE, totalProducts - offset);

    // Fetch products
    const { rows: products } = await pg.query<ProductRow>(
      `SELECT
         p.id,
         p.sku,
         p.name,
         p.description,
         p.brand,
         p.slug,
         p."primaryCategoryId" AS primary_category_id,
         c.path              AS category_path,
         p."metaTitle"       AS meta_title,
         p."metaDescription" AS meta_description,
         p."createdAt"       AS created_at,
         p."updatedAt"       AS updated_at
       FROM products p
       LEFT JOIN categories c ON c.id = p."primaryCategoryId"
       WHERE p.status = 'active'
       ORDER BY p."createdAt" DESC
       LIMIT $1 OFFSET $2`,
      [batchLimit, offset],
    );

    if (products.length === 0) break;

    const productIds = products.map((p) => p.id);
    const placeholders = productIds.map((_, i) => `$${i + 1}`).join(',');

    // Fetch attributes for this batch
    const { rows: attrs } = await pg.query<AttributeRow>(
      `SELECT "productId" AS product_id, key, value FROM product_attributes WHERE "productId" IN (${placeholders})`,
      productIds,
    );

    // Fetch primary images for this batch
    const { rows: images } = await pg.query<ImageRow>(
      `SELECT "productId" AS product_id, url, "altText" AS alt_text, "isPrimary" AS is_primary
       FROM product_images WHERE "productId" IN (${placeholders}) AND "isPrimary" = true`,
      productIds,
    );

    // Fetch seller offers for this batch
    const { rows: offers } = await pg.query<OfferRow>(
      `SELECT "productId" AS product_id, price, "originalPrice" AS original_price, stock, status
       FROM seller_offers WHERE "productId" IN (${placeholders}) AND status = 'active'`,
      productIds,
    );

    // Build lookup maps
    const attrsByProduct = new Map<string, AttributeRow[]>();
    for (const attr of attrs) {
      const list = attrsByProduct.get(attr.product_id) ?? [];
      list.push(attr);
      attrsByProduct.set(attr.product_id, list);
    }

    const imageByProduct = new Map<string, ImageRow>();
    for (const img of images) {
      if (!imageByProduct.has(img.product_id)) imageByProduct.set(img.product_id, img);
    }

    const offersByProduct = new Map<string, OfferRow[]>();
    for (const offer of offers) {
      const list = offersByProduct.get(offer.product_id) ?? [];
      list.push(offer);
      offersByProduct.set(offer.product_id, list);
    }

    // Build bulk operations
    const operations: object[] = [];

    for (const product of products) {
      const productOffers = offersByProduct.get(product.id) ?? [];
      const prices = productOffers.map((o) => Number(o.price));
      const priceMin = prices.length > 0 ? Math.min(...prices) : 0;
      const priceMax = prices.length > 0 ? Math.max(...prices) : 0;
      const originalPrices = productOffers.map((o) => Number(o.original_price));
      const originalPrice = originalPrices.length > 0 ? Math.max(...originalPrices) : priceMin;
      const discountPercentage =
        originalPrice > 0 && priceMin < originalPrice
          ? Math.round(((originalPrice - priceMin) / originalPrice) * 100)
          : 0;
      const totalStock = productOffers.reduce((sum, o) => sum + Number(o.stock), 0);
      const inStock = totalStock > 0;
      const sellerCount = productOffers.length;

      const productAttrs = attrsByProduct.get(product.id) ?? [];
      const attributes: Record<string, string | string[] | number> = {};
      for (const attr of productAttrs) {
        try {
          attributes[attr.key] = JSON.parse(attr.value) as string | string[] | number;
        } catch {
          attributes[attr.key] = attr.value;
        }
      }

      const image = imageByProduct.get(product.id);
      const categoryPath: string[] = product.category_path ?? [];

      // Synthesize ranking signals (real values come from analytics in later steps)
      const salesRank = Math.floor(Math.random() * 100_000) + 1;
      const reviewCount = Math.floor(Math.random() * 5_000);
      const ratingAvg = parseFloat((1 + Math.random() * 4).toFixed(1));

      const doc: StoredProductDocument = {
        product_id: product.id,
        sku: product.sku,
        name: product.name,
        name_suggest: product.name,
        description: product.description,
        brand: product.brand,

        category_id: product.primary_category_id ?? '',
        category_path: categoryPath,
        category_ids_hierarchy: product.primary_category_id ? [product.primary_category_id] : [],

        price_min: priceMin,
        price_max: priceMax,
        original_price: originalPrice,
        discount_percentage: discountPercentage,

        in_stock: inStock,
        seller_count: sellerCount,

        rating_avg: ratingAvg,
        review_count: reviewCount,
        sales_rank: salesRank,
        click_through_rate: parseFloat((Math.random() * 0.3).toFixed(4)),

        attributes,

        primary_image_url: image?.url ?? `https://placehold.co/800x600?text=${encodeURIComponent(product.name)}`,
        primary_image_alt: image?.alt_text ?? product.name,

        slug: product.slug || slugify(product.name),
        meta_title: product.meta_title,
        meta_description: product.meta_description,

        created_at: product.created_at.toISOString(),
        updated_at: product.updated_at.toISOString(),
        price_updated_at: new Date().toISOString(),
      };

      operations.push({ index: { _index: PRODUCTS_INDEX, _id: product.id } });
      operations.push(doc);
    }

    // Execute bulk request
    const bulkResult = await es.bulk({ operations, refresh: false });

    if (bulkResult.errors) {
      const errorItems = bulkResult.items.filter((item) => item.index?.error);
      errors += errorItems.length;
      console.error(
        `[index-products] Batch had ${errorItems.length} errors. First: ${JSON.stringify(errorItems[0]?.index?.error)}`,
      );
    }

    indexed += products.length;
    offset += products.length;

    const pct = ((indexed / totalProducts) * 100).toFixed(1);
    process.stdout.write(`\r[index-products] Progress: ${indexed}/${totalProducts} (${pct}%)  `);
  }

  console.log(`\n[index-products] Done. Indexed: ${indexed}, Errors: ${errors}`);

  // Refresh index so documents are searchable immediately
  await es.indices.refresh({ index: PRODUCTS_INDEX });
  console.log('[index-products] Index refreshed.');

  await pg.end();
}

main().catch((err: unknown) => {
  console.error('[index-products] Fatal error:', err);
  process.exit(1);
});
