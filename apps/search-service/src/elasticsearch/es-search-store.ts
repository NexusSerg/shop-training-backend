/**
 * Elasticsearch-backed search store — Step 3.3
 *
 * Implements the same `search()` / `getFacets()` contract as the in-memory
 * SearchStore so the service layer can swap between them transparently.
 *
 * Stored document shape extends ProductDocument with:
 *  - primary_image_url / primary_image_alt  (stored, not indexed)
 *
 * Facets are computed from ES aggregations returned alongside search hits.
 */

import type { Client, estypes } from '@elastic/elasticsearch';
import type {
  SearchRequest,
  SearchResponse,
  ProductSummary,
  ProductImage,
  Facets,
  FacetBucket,
  PriceRangeFacet,
  PaginationMeta,
} from '@shop/shared-types';
import { buildEsSearchBody } from './query-builder';
import { PRODUCTS_INDEX } from './index-mapping';

// ---------------------------------------------------------------------------
// Internal stored document type (superset of ProductDocument)
// ---------------------------------------------------------------------------

export interface StoredProductDocument {
  product_id: string;
  sku: string;
  name: string;
  name_suggest: string;
  description: string;
  brand: string;

  category_id: string;
  category_path: string[];
  category_ids_hierarchy: string[];

  price_min: number;
  price_max: number;
  original_price: number;
  discount_percentage: number;

  in_stock: boolean;
  seller_count: number;

  rating_avg: number;
  review_count: number;
  sales_rank: number;
  click_through_rate: number;

  attributes: Record<string, string | string[] | number>;

  // Extra fields (stored but not in shared-types ProductDocument)
  primary_image_url: string;
  primary_image_alt: string;

  slug: string;
  meta_title: string;
  meta_description: string;

  created_at: string; // ISO string from ES
  updated_at: string;
  price_updated_at: string;
}

// ---------------------------------------------------------------------------
// Aggregation bucket shapes from ES
// ---------------------------------------------------------------------------

interface TermsBucket {
  key: string | number;
  doc_count: number;
}

interface EsAggs {
  brands?: { buckets: TermsBucket[] };
  price_min_val?: { value: number | null };
  price_max_val?: { value: number | null };
  ratings?: { buckets: TermsBucket[] };
  categories?: { buckets: TermsBucket[] };
  attr_color?: { buckets: TermsBucket[] };
  attr_size?: { buckets: TermsBucket[] };
  attr_material?: { buckets: TermsBucket[] };
}

// ---------------------------------------------------------------------------
// ElasticsearchSearchStore
// ---------------------------------------------------------------------------

export class ElasticsearchSearchStore {
  constructor(private readonly client: Client) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async search(req: SearchRequest = {}): Promise<SearchResponse> {
    const page = req.page ?? 1;
    const perPage = req.perPage ?? 24;

    const body = buildEsSearchBody(req);
    const esResponse = await this.client.search<StoredProductDocument>({
      index: PRODUCTS_INDEX,
      ...body,
    });

    const products = esResponse.hits.hits.map((hit: estypes.SearchHit<StoredProductDocument>) =>
      this.toProductSummary(hit._source as StoredProductDocument),
    );

    const total =
      typeof esResponse.hits.total === 'number'
        ? esResponse.hits.total
        : (esResponse.hits.total?.value ?? 0);

    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const pagination: PaginationMeta = {
      total,
      page,
      perPage,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    const facets = this.buildFacets(esResponse.aggregations as EsAggs | undefined, req);

    return {
      products,
      facets,
      pagination,
      took: esResponse.took,
      query: req.q ?? '',
    };
  }

  async getFacets(q = ''): Promise<Facets> {
    const result = await this.search({ q });
    return result.facets;
  }

  // ── Mapping helpers ────────────────────────────────────────────────────────

  private toProductSummary(doc: StoredProductDocument): ProductSummary {
    const primaryImage: ProductImage | null = doc.primary_image_url
      ? {
          url: doc.primary_image_url,
          altText: doc.primary_image_alt ?? doc.name,
          width: 800,
          height: 600,
          isPrimary: true,
        }
      : null;

    return {
      id: doc.product_id,
      sku: doc.sku,
      name: doc.name,
      slug: doc.slug,
      brand: doc.brand,
      categoryPath: doc.category_path ?? [],
      primaryImage,
      priceMin: doc.price_min,
      priceMax: doc.price_max,
      originalPrice: doc.original_price,
      discountPercentage: doc.discount_percentage,
      inStock: doc.in_stock,
      sellerCount: doc.seller_count,
      ratingAvg: doc.rating_avg,
      reviewCount: doc.review_count,
      attributes: doc.attributes ?? {},
      createdAt: new Date(doc.created_at),
    };
  }

  private buildFacets(aggs: EsAggs | undefined, req: SearchRequest): Facets {
    const selectedBrands = new Set((req.brands ?? []).map((b) => b.toLowerCase()));
    const selectedCategories = new Set((req.categoryPath ?? []).map((c) => c.toLowerCase()));

    // Brands
    const brands: FacetBucket[] = (aggs?.brands?.buckets ?? []).map((b) => ({
      value: String(b.key),
      count: b.doc_count,
      selected: selectedBrands.has(String(b.key).toLowerCase()),
    }));

    // Price range
    const globalMin = aggs?.price_min_val?.value ?? 0;
    const globalMax = aggs?.price_max_val?.value ?? 0;
    const priceRange: PriceRangeFacet = {
      min: globalMin,
      max: globalMax,
      selectedMin: req.priceMin ?? globalMin,
      selectedMax: req.priceMax ?? globalMax,
    };

    // Ratings — bucket key is the raw float from ES; floor to integer star rating
    const ratings: FacetBucket[] = (aggs?.ratings?.buckets ?? []).map((b) => ({
      value: String(Math.floor(Number(b.key))),
      count: b.doc_count,
      selected: req.rating !== undefined && req.rating <= Math.floor(Number(b.key)),
    }));

    // Categories
    const categories: FacetBucket[] = (aggs?.categories?.buckets ?? []).map((b) => ({
      value: String(b.key),
      count: b.doc_count,
      selected: selectedCategories.has(String(b.key).toLowerCase()),
    }));

    // Dynamic attributes
    const attributes: Record<string, FacetBucket[]> = {};
    const attrMap: Array<[string, TermsBucket[] | undefined]> = [
      ['color', aggs?.attr_color?.buckets],
      ['size', aggs?.attr_size?.buckets],
      ['material', aggs?.attr_material?.buckets],
    ];
    for (const [attrKey, buckets] of attrMap) {
      if (buckets && buckets.length > 0) {
        const selectedValues = new Set(
          (req.attributes?.[attrKey] ?? []).map((v) => v.toLowerCase()),
        );
        attributes[attrKey] = buckets.map((b) => ({
          value: String(b.key),
          count: b.doc_count,
          selected: selectedValues.has(String(b.key).toLowerCase()),
        }));
      }
    }

    return { brands, priceRange, ratings, categories, attributes };
  }
}
