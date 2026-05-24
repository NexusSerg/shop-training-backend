#!/usr/bin/env ts-node
/**
 * Database seeder for the Catalog Service — Step 3.1
 *
 * Seeds:
 *   - All categories from the static CATEGORY_TREE
 *   - N products (default 1_000_000) using unnest() bulk inserts for throughput
 *
 * Usage:
 *   DATABASE_URL=postgresql://shop:shop_secret@localhost:5432/shop_catalog \
 *     ts-node src/db/seed.ts [--count 1000000] [--batch 5000]
 *
 * Performance notes:
 *   - Uses unnest() array-parameter inserts — no per-row parameter limit
 *   - Each batch inserts products, attributes, and images in 3 statements
 *   - Estimated time for 1M products: ~3–8 min depending on hardware
 */

import { faker } from '@faker-js/faker';
import { Client } from 'pg';
import { CATEGORY_TREE, LEAF_CATEGORIES } from '../mock/categories';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
function getArg(name: string, fallback: number): number {
  const idx = args.indexOf(name);
  if (idx >= 0 && args[idx + 1]) return parseInt(args[idx + 1] as string, 10);
  return fallback;
}

const TOTAL_PRODUCTS = getArg('--count', 1_000_000);
const BATCH_SIZE = getArg('--batch', 5_000);

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const BRANDS = [
  'Apple', 'Samsung', 'Sony', 'Nike', 'Adidas', 'Dell', 'HP', 'LG',
  'Bose', 'Philips', 'Reebok', 'Under Armour', 'Panasonic', 'Lenovo', 'ASUS',
];
const COLORS = ['Black', 'White', 'Silver', 'Blue', 'Red', 'Green', 'Grey', 'Navy'];
const MATERIALS = ['Plastic', 'Metal', 'Leather', 'Cotton', 'Polyester', 'Aluminium', 'Wood'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
// Weighted statuses: 85% active
const STATUS_POOL = [
  ...Array(85).fill('active'),
  ...Array(10).fill('inactive'),
  ...Array(5).fill('draft'),
] as Array<'active' | 'inactive' | 'draft'>;

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
// Category seeding
// ---------------------------------------------------------------------------

async function seedCategories(client: Client): Promise<void> {
  console.log('[seed] Upserting categories…');

  async function upsertTree(nodes: typeof CATEGORY_TREE): Promise<void> {
    for (const node of nodes) {
      await client.query(
        `INSERT INTO categories (id, name, slug, path, "parentId")
         VALUES ($1, $2, $3, $4::text[], $5)
         ON CONFLICT (id) DO UPDATE
           SET name = EXCLUDED.name,
               slug = EXCLUDED.slug,
               path = EXCLUDED.path,
               "parentId" = EXCLUDED."parentId"`,
        [node.id, node.name, node.slug, node.path, node.parentId],
      );
      if (node.children.length > 0) await upsertTree(node.children);
    }
  }

  await upsertTree(CATEGORY_TREE);
  console.log('[seed] Categories done.');
}

// ---------------------------------------------------------------------------
// Batch data generation
// ---------------------------------------------------------------------------

interface BatchData {
  productIds: string[];
  skus: string[];
  names: string[];
  descriptions: string[];
  brands: string[];
  slugs: string[];
  statuses: string[];
  primaryCategoryIds: string[];
  metaTitles: string[];
  metaDescriptions: string[];
  createdAts: Date[];
  updatedAts: Date[];
  // attributes (flattened)
  attrProductIds: string[];
  attrKeys: string[];
  attrValues: string[];
  attrLabels: string[];
  attrFilterables: boolean[];
  attrSearchables: boolean[];
  // images (flattened)
  imgProductIds: string[];
  imgUrls: string[];
  imgAltTexts: string[];
  imgWidths: number[];
  imgHeights: number[];
  imgIsPrimary: boolean[];
}

function generateBatch(count: number, batchIndex: number): BatchData {
  const d: BatchData = {
    productIds: [], skus: [], names: [], descriptions: [], brands: [],
    slugs: [], statuses: [], primaryCategoryIds: [], metaTitles: [],
    metaDescriptions: [], createdAts: [], updatedAts: [],
    attrProductIds: [], attrKeys: [], attrValues: [], attrLabels: [],
    attrFilterables: [], attrSearchables: [],
    imgProductIds: [], imgUrls: [], imgAltTexts: [], imgWidths: [],
    imgHeights: [], imgIsPrimary: [],
  };

  for (let i = 0; i < count; i++) {
    const name = faker.commerce.productName();
    const brand = faker.helpers.arrayElement(BRANDS);
    const category = faker.helpers.arrayElement(LEAF_CATEGORIES);
    const status = STATUS_POOL[faker.number.int({ min: 0, max: STATUS_POOL.length - 1 })] ?? 'active';
    const createdAt = faker.date.past({ years: 3 });
    const updatedAt = faker.date.between({ from: createdAt, to: new Date() });
    const id = faker.string.uuid();
    // Ensure SKU uniqueness with batch+index suffix
    const sku = `${faker.string.alphanumeric(6).toUpperCase()}-${batchIndex}-${i}`;
    const slug = `${slugify(name)}-${faker.string.alphanumeric(8).toLowerCase()}`;

    d.productIds.push(id);
    d.skus.push(sku);
    d.names.push(name);
    d.descriptions.push(faker.commerce.productDescription());
    d.brands.push(brand);
    d.slugs.push(slug);
    d.statuses.push(status);
    d.primaryCategoryIds.push(category.id);
    d.metaTitles.push(`${name} — ${brand}`);
    d.metaDescriptions.push(`Buy ${name} from ${brand}. Best prices and fast delivery.`);
    d.createdAts.push(createdAt);
    d.updatedAts.push(updatedAt);

    // Attributes
    const pushAttr = (key: string, value: unknown, label: string, filterable: boolean, searchable: boolean) => {
      d.attrProductIds.push(id);
      d.attrKeys.push(key);
      d.attrValues.push(JSON.stringify(value));
      d.attrLabels.push(label);
      d.attrFilterables.push(filterable);
      d.attrSearchables.push(searchable);
    };

    pushAttr('color', faker.helpers.arrayElement(COLORS), 'Color', true, true);
    pushAttr('material', faker.helpers.arrayElement(MATERIALS), 'Material', true, false);
    if (faker.datatype.boolean(0.6)) {
      pushAttr('size', faker.helpers.arrayElement(SIZES), 'Size', true, false);
    }

    // Primary image
    const encoded = encodeURIComponent(name);
    d.imgProductIds.push(id);
    d.imgUrls.push(`https://placehold.co/800x600?text=${encoded}`);
    d.imgAltTexts.push(name);
    d.imgWidths.push(800);
    d.imgHeights.push(600);
    d.imgIsPrimary.push(true);
  }

  return d;
}

// ---------------------------------------------------------------------------
// unnest()-based bulk inserts
// ---------------------------------------------------------------------------

async function bulkInsertProducts(client: Client, d: BatchData): Promise<void> {
  await client.query(
    `INSERT INTO products (
       id, sku, name, description, brand, slug, status,
       "primaryCategoryId", "metaTitle", "metaDescription",
       "createdAt", "updatedAt"
     )
     SELECT
       unnest($1::uuid[]),
       unnest($2::text[]),
       unnest($3::text[]),
       unnest($4::text[]),
       unnest($5::text[]),
       unnest($6::text[]),
       unnest($7::text[])::"ProductStatus",
       unnest($8::text[]),
       unnest($9::text[]),
       unnest($10::text[]),
       unnest($11::timestamptz[]),
       unnest($12::timestamptz[])
     ON CONFLICT (sku) DO NOTHING`,
    [
      d.productIds, d.skus, d.names, d.descriptions, d.brands, d.slugs,
      d.statuses, d.primaryCategoryIds, d.metaTitles, d.metaDescriptions,
      d.createdAts, d.updatedAts,
    ],
  );
}

async function bulkInsertAttributes(client: Client, d: BatchData): Promise<void> {
  if (d.attrProductIds.length === 0) return;
  await client.query(
    `INSERT INTO product_attributes ("productId", key, value, label, filterable, searchable)
     SELECT
       unnest($1::uuid[]),
       unnest($2::text[]),
       unnest($3::text[]),
       unnest($4::text[]),
       unnest($5::boolean[]),
       unnest($6::boolean[])`,
    [
      d.attrProductIds, d.attrKeys, d.attrValues, d.attrLabels,
      d.attrFilterables, d.attrSearchables,
    ],
  );
}

async function bulkInsertImages(client: Client, d: BatchData): Promise<void> {
  if (d.imgProductIds.length === 0) return;
  await client.query(
    `INSERT INTO product_images ("productId", url, "altText", width, height, "isPrimary")
     SELECT
       unnest($1::uuid[]),
       unnest($2::text[]),
       unnest($3::text[]),
       unnest($4::int[]),
       unnest($5::int[]),
       unnest($6::boolean[])`,
    [
      d.imgProductIds, d.imgUrls, d.imgAltTexts,
      d.imgWidths, d.imgHeights, d.imgIsPrimary,
    ],
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const dbUrl = process.env['DATABASE_URL'];
  if (!dbUrl) {
    console.error('[seed] ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  faker.seed(42);

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await seedCategories(client);

    const batches = Math.ceil(TOTAL_PRODUCTS / BATCH_SIZE);
    console.log(
      `[seed] Seeding ${TOTAL_PRODUCTS.toLocaleString()} products in ${batches} batches of ${BATCH_SIZE.toLocaleString()}…`,
    );

    const startTime = Date.now();
    let inserted = 0;

    for (let b = 0; b < batches; b++) {
      const batchCount = Math.min(BATCH_SIZE, TOTAL_PRODUCTS - b * BATCH_SIZE);
      const data = generateBatch(batchCount, b);

      await bulkInsertProducts(client, data);
      await bulkInsertAttributes(client, data);
      await bulkInsertImages(client, data);

      inserted += batchCount;
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = Math.round(inserted / elapsed);
      const pct = ((inserted / TOTAL_PRODUCTS) * 100).toFixed(1);
      process.stdout.write(
        `\r[seed] ${inserted.toLocaleString()} / ${TOTAL_PRODUCTS.toLocaleString()} (${pct}%) — ${rate.toLocaleString()} rows/s — ${elapsed.toFixed(1)}s elapsed`,
      );
    }

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[seed] Done. ${inserted.toLocaleString()} products seeded in ${totalTime}s.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
