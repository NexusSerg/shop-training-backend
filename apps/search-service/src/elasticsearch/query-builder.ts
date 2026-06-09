/**
 * Elasticsearch query builder — Step 3.3
 *
 * Translates a SearchRequest into a fully-formed ES search body including:
 *  - multi_match full-text query (BM25) with field boosting
 *  - function_score for popularity / rating boost (only when text query present)
 *  - bool.filter clauses for brands, price, rating, category, in_stock, attributes
 *  - sort options (relevance, price, rating, newest, popularity)
 *  - aggregations for all facets (brands, price range, ratings, categories, attributes)
 *  - highlighting on name and description
 */

import type { SearchRequest, SortOption } from '@shop/shared-types';

/** Sort clause definitions keyed by SortOption */
const SORT_MAP: Record<SortOption, object[]> = {
  relevance: [{ _score: { order: 'desc' } }],
  price_asc: [{ price_min: { order: 'asc' } }],
  price_desc: [{ price_min: { order: 'desc' } }],
  rating: [{ rating_avg: { order: 'desc' } }, { review_count: { order: 'desc' } }],
  newest: [{ created_at: { order: 'desc' } }],
  popularity: [{ sales_rank: { order: 'asc' } }, { review_count: { order: 'desc' } }],
};

/**
 * Build the complete ES search request body from a SearchRequest.
 * Exported for testability.
 */
export function buildEsSearchBody(req: SearchRequest): Record<string, unknown> {
  const {
    q,
    brands = [],
    priceMin,
    priceMax,
    rating,
    categoryPath = [],
    attributes = {},
    inStockOnly = false,
    sort = 'relevance',
    page = 1,
    perPage = 24,
  } = req;

  // ── Filter clauses (always applied in filter context — no score impact) ──
  const filters: object[] = [];

  if (brands.length > 0) {
    filters.push({ terms: { 'brand.keyword': brands } });
  }

  if (priceMin !== undefined || priceMax !== undefined) {
    const range: Record<string, number> = {};
    if (priceMin !== undefined) range['gte'] = priceMin;
    if (priceMax !== undefined) range['lte'] = priceMax;
    filters.push({ range: { price_min: range } });
  }

  if (rating !== undefined) {
    filters.push({ range: { rating_avg: { gte: rating } } });
  }

  if (categoryPath.length > 0) {
    // Match products whose category_path array contains the deepest requested segment
    filters.push({ term: { category_path: categoryPath[categoryPath.length - 1] } });
  }

  if (inStockOnly) {
    filters.push({ term: { in_stock: true } });
  }

  for (const [key, values] of Object.entries(attributes)) {
    if (values.length > 0) {
      filters.push({ terms: { [`attributes.${key}`]: values } });
    }
  }

  // ── Core query ────────────────────────────────────────────────────────────
  const hasText = typeof q === 'string' && q.trim().length > 0;

  let query: object;

  if (hasText) {
    const boolQuery: Record<string, object[]> = {
      must: [
        {
          multi_match: {
            query: q,
            fields: ['name^3', 'name.suggest^2', 'brand^2', 'sku^2', 'description', 'category_path'],
            type: 'best_fields',
            fuzziness: 'AUTO',
            prefix_length: 2,
          },
        },
      ],
    };
    if (filters.length > 0) boolQuery['filter'] = filters;

    // Wrap with function_score to boost by popularity + rating
    query = {
      function_score: {
        query: { bool: boolQuery },
        functions: [
          {
            field_value_factor: {
              field: 'review_count',
              factor: 0.05,
              modifier: 'log1p',
              missing: 0,
            },
          },
          {
            gauss: {
              rating_avg: { origin: 5.0, scale: 1.0, decay: 0.5 },
            },
            weight: 0.5,
          },
        ],
        score_mode: 'sum',
        boost_mode: 'multiply',
      },
    };
  } else if (filters.length > 0) {
    // No text — pure filter query
    query = { bool: { filter: filters } };
  } else {
    query = { match_all: {} };
  }

  // ── Aggregations (facets) ────────────────────────────────────────────────
  const aggs: Record<string, object> = {
    brands: {
      terms: { field: 'brand.keyword', size: 50, order: { _count: 'desc' } },
    },
    price_min_val: { min: { field: 'price_min' } },
    price_max_val: { max: { field: 'price_min' } },
    ratings: {
      terms: { field: 'rating_avg', size: 10, order: { _key: 'desc' } },
    },
    categories: {
      terms: { field: 'category_path', size: 100, order: { _count: 'desc' } },
    },
    attr_color: {
      terms: { field: 'attributes.color', size: 30, order: { _count: 'desc' } },
      aggs: {},
    },
    attr_size: {
      terms: { field: 'attributes.size', size: 20, order: { _count: 'desc' } },
      aggs: {},
    },
    attr_material: {
      terms: { field: 'attributes.material', size: 20, order: { _count: 'desc' } },
      aggs: {},
    },
  };

  return {
    query,
    sort: SORT_MAP[sort] ?? SORT_MAP.relevance,
    from: (page - 1) * perPage,
    size: perPage,
    aggs,
    highlight: {
      fields: {
        name: { number_of_fragments: 0 },
        description: { number_of_fragments: 1, fragment_size: 150 },
      },
      pre_tags: ['<mark>'],
      post_tags: ['</mark>'],
    },
    _source: true,
  };
}
