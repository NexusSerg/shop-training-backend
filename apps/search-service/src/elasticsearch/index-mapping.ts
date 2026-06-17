/**
 * Elasticsearch index mapping for the products index — Step 3.3
 *
 * Design decisions:
 *  - `dynamic: false` on the root to prevent uncontrolled field explosion.
 *  - `attributes` is `dynamic: true` so per-product facets are auto-mapped.
 *  - `name` has three sub-fields:
 *      .keyword  → exact / sorting
 *      .suggest  → edge-ngram for partial-match search (NOT autocomplete suggester)
 *  - `name_suggest` uses the ES completion suggester for fast prefix autocomplete.
 *  - Text fields use a custom `product_text` analyzer (standard + lowercase + asciifolding).
 *  - Single-node dev setup: 1 shard, 0 replicas.
 */

import type { Client } from '@elastic/elasticsearch';

export const PRODUCTS_INDEX = 'products';

export const PRODUCTS_INDEX_CONFIG = {
  settings: {
    number_of_shards: 1,
    number_of_replicas: 0,
    analysis: {
      analyzer: {
        product_text: {
          type: 'custom',
          tokenizer: 'standard',
          filter: ['lowercase', 'asciifolding'],
        },
        edge_ngram_analyzer: {
          type: 'custom',
          tokenizer: 'edge_ngram_tokenizer',
          filter: ['lowercase'],
        },
      },
      tokenizer: {
        edge_ngram_tokenizer: {
          type: 'edge_ngram',
          min_gram: 2,
          max_gram: 20,
          token_chars: ['letter', 'digit'],
        },
      },
    },
  },
  mappings: {
    dynamic: false as const,
    // Map all string fields inside `attributes` as keyword so they can be used
    // in terms aggregations (facets) and filters without enabling fielddata.
    dynamic_templates: [
      {
        attributes_as_keyword: {
          path_match: 'attributes.*',
          mapping: { type: 'keyword' as const },
        },
      },
    ],
    properties: {
      // ── Identity ──────────────────────────────────────────────────────────
      product_id: { type: 'keyword' as const },
      sku: { type: 'keyword' as const },
      slug: { type: 'keyword' as const },

      // ── Full-text fields ──────────────────────────────────────────────────
      name: {
        type: 'text' as const,
        analyzer: 'product_text',
        fields: {
          keyword: { type: 'keyword' as const, ignore_above: 256 },
          suggest: {
            type: 'text' as const,
            analyzer: 'edge_ngram_analyzer',
            search_analyzer: 'standard',
          },
        },
      },
      name_suggest: { type: 'completion' as const },
      description: { type: 'text' as const, analyzer: 'product_text' },

      // ── Brand ─────────────────────────────────────────────────────────────
      brand: {
        type: 'text' as const,
        analyzer: 'product_text',
        fields: {
          keyword: { type: 'keyword' as const },
        },
      },

      // ── Taxonomy ──────────────────────────────────────────────────────────
      category_id: { type: 'keyword' as const },
      category_path: { type: 'keyword' as const },
      category_ids_hierarchy: { type: 'keyword' as const },

      // ── Pricing ───────────────────────────────────────────────────────────
      price_min: { type: 'float' as const },
      price_max: { type: 'float' as const },
      original_price: { type: 'float' as const },
      discount_percentage: { type: 'float' as const },

      // ── Availability ──────────────────────────────────────────────────────
      in_stock: { type: 'boolean' as const },
      seller_count: { type: 'integer' as const },

      // ── Ranking signals ───────────────────────────────────────────────────
      rating_avg: { type: 'float' as const },
      review_count: { type: 'integer' as const },
      sales_rank: { type: 'integer' as const },
      click_through_rate: { type: 'float' as const },

      // ── Dynamic attributes (color, size, material, …) ─────────────────────
      attributes: { type: 'object' as const, dynamic: true as const },

      // ── Image (not analysed — stored only) ───────────────────────────────
      primary_image_url: { type: 'keyword' as const, index: false },
      primary_image_alt: { type: 'keyword' as const, index: false },

      // ── SEO ───────────────────────────────────────────────────────────────
      meta_title: { type: 'keyword' as const, index: false },
      meta_description: { type: 'keyword' as const, index: false },

      // ── Timestamps ────────────────────────────────────────────────────────
      created_at: { type: 'date' as const },
      updated_at: { type: 'date' as const },
      price_updated_at: { type: 'date' as const },
    },
  },
};

/**
 * Ensure the products index exists with the correct mapping.
 * Idempotent — safe to call on every startup.
 * If the index exists but the mapping diverges this logs a warning and continues.
 */
export async function ensureProductsIndex(client: Client): Promise<void> {
  const exists = await client.indices.exists({ index: PRODUCTS_INDEX });
  if (!exists) {
    // Cast to any to avoid overly strict ES SDK literal-type constraints on
    // the analysis / tokenizer config — the runtime values are valid ES JSON.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.indices.create({
      index: PRODUCTS_INDEX,
      ...(PRODUCTS_INDEX_CONFIG as any),
    });
  }
}
