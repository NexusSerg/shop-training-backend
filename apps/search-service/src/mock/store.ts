import type {
  ProductSummary,
  SearchRequest,
  SearchResponse,
  Facets,
  FacetBucket,
  PriceRangeFacet,
  PaginationMeta,
} from '@shop/shared-types';
import { seedProductSummaries } from './seed.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AppliedFilters {
  q: string;
  brands: string[];
  priceMin: number | undefined;
  priceMax: number | undefined;
  rating: number | undefined;
  categoryPath: string[];
  attributes: Record<string, string[]>;
  inStockOnly: boolean;
}

// ---------------------------------------------------------------------------
// SearchStore
// ---------------------------------------------------------------------------

/**
 * In-memory product search store.
 * Applies text search, faceted filtering, sorting, and pagination in JavaScript.
 * Replaced by Elasticsearch in Phase 3.
 */
export class SearchStore {
  private readonly products: ProductSummary[];

  constructor(initialProducts?: ProductSummary[]) {
    this.products = initialProducts ?? seedProductSummaries(100);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  search(req: SearchRequest = {}): SearchResponse {
    const start = Date.now();

    const filters: AppliedFilters = {
      q: req.q ?? '',
      brands: req.brands ?? [],
      priceMin: req.priceMin,
      priceMax: req.priceMax,
      rating: req.rating,
      categoryPath: req.categoryPath ?? [],
      attributes: req.attributes ?? {},
      inStockOnly: req.inStockOnly ?? false,
    };

    const page = req.page ?? 1;
    const perPage = req.perPage ?? 24;
    const sort = req.sort ?? 'relevance';

    // 1. Filter
    const filtered = this.products.filter((p) => this.matchesFilters(p, filters));

    // 2. Sort
    const sorted = this.sortProducts(filtered, sort, filters.q);

    // 3. Facets (computed from the full filtered set, before pagination)
    const facets = this.computeFacets(sorted, filters);

    // 4. Paginate
    const total = sorted.length;
    const totalPages = Math.max(1, Math.ceil(total / perPage));
    const offset = (page - 1) * perPage;
    const products = sorted.slice(offset, offset + perPage);

    const pagination: PaginationMeta = {
      total,
      page,
      perPage,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    };

    return {
      products,
      facets,
      pagination,
      took: Date.now() - start,
      query: filters.q,
    };
  }

  /**
   * Return facets for a text query without any other filters applied.
   * Used by `GET /api/v1/search/facets?q=...`.
   */
  getFacets(q = ''): Facets {
    const baseFilters: AppliedFilters = {
      q,
      brands: [],
      priceMin: undefined,
      priceMax: undefined,
      rating: undefined,
      categoryPath: [],
      attributes: {},
      inStockOnly: false,
    };
    const filtered = q
      ? this.products.filter((p) => this.matchesText(p, q))
      : this.products.slice();
    return this.computeFacets(filtered, baseFilters);
  }

  // ---------------------------------------------------------------------------
  // Private — filtering
  // ---------------------------------------------------------------------------

  private matchesFilters(p: ProductSummary, f: AppliedFilters): boolean {
    if (f.q && !this.matchesText(p, f.q)) return false;

    if (f.brands.length > 0) {
      const lowerBrands = f.brands.map((b) => b.toLowerCase());
      if (!lowerBrands.includes(p.brand.toLowerCase())) return false;
    }

    if (f.priceMin !== undefined && p.priceMin < f.priceMin) return false;
    if (f.priceMax !== undefined && p.priceMax > f.priceMax) return false;
    if (f.rating !== undefined && p.ratingAvg < f.rating) return false;

    if (f.categoryPath.length > 0) {
      const matches = f.categoryPath.every((cat, i) => {
        const pCat = p.categoryPath[i];
        return pCat !== undefined && pCat.toLowerCase() === cat.toLowerCase();
      });
      if (!matches) return false;
    }

    for (const [key, values] of Object.entries(f.attributes)) {
      if (values.length === 0) continue;
      const pAttr = p.attributes[key];
      if (pAttr === undefined) return false;
      const pValues = (Array.isArray(pAttr) ? pAttr : [pAttr]).map((v) =>
        String(v).toLowerCase(),
      );
      if (!values.some((v) => pValues.includes(v.toLowerCase()))) return false;
    }

    if (f.inStockOnly && !p.inStock) return false;

    return true;
  }

  private matchesText(p: ProductSummary, q: string): boolean {
    const lower = q.toLowerCase();
    return (
      p.name.toLowerCase().includes(lower) ||
      p.brand.toLowerCase().includes(lower) ||
      p.sku.toLowerCase().includes(lower) ||
      p.categoryPath.some((c) => c.toLowerCase().includes(lower))
    );
  }

  // ---------------------------------------------------------------------------
  // Private — sorting
  // ---------------------------------------------------------------------------

  private sortProducts(
    products: ProductSummary[],
    sort: string,
    q: string,
  ): ProductSummary[] {
    const result = products.slice();

    switch (sort) {
      case 'price_asc':
        result.sort((a, b) => a.priceMin - b.priceMin);
        break;
      case 'price_desc':
        result.sort((a, b) => b.priceMin - a.priceMin);
        break;
      case 'rating':
        result.sort((a, b) => b.ratingAvg - a.ratingAvg || b.reviewCount - a.reviewCount);
        break;
      case 'newest':
        result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        break;
      case 'popularity':
        result.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      case 'relevance':
      default:
        if (q) {
          const lower = q.toLowerCase();
          result.sort((a, b) => this.relevanceScore(b, lower) - this.relevanceScore(a, lower));
        }
        break;
    }

    return result;
  }

  /** Higher score = more relevant. Mirrors basic BM25-like intuition. */
  private relevanceScore(p: ProductSummary, lower: string): number {
    let score = 0;
    if (p.name.toLowerCase() === lower) score += 20;
    else if (p.name.toLowerCase().startsWith(lower)) score += 10;
    else if (p.name.toLowerCase().includes(lower)) score += 5;
    if (p.brand.toLowerCase() === lower) score += 8;
    else if (p.brand.toLowerCase().includes(lower)) score += 3;
    if (p.sku.toLowerCase() === lower) score += 6;
    // Boost popular products slightly within same relevance tier
    score += Math.min(p.reviewCount / 10_000, 1);
    return score;
  }

  // ---------------------------------------------------------------------------
  // Private — facets
  // ---------------------------------------------------------------------------

  private computeFacets(products: ProductSummary[], applied: AppliedFilters): Facets {
    const brandCounts = new Map<string, number>();
    const ratingCounts = new Map<number, number>();
    const categoryCounts = new Map<string, number>();
    const attrCounts: Record<string, Map<string, number>> = {};

    let globalMin = Infinity;
    let globalMax = -Infinity;

    for (const p of products) {
      // Brands
      brandCounts.set(p.brand, (brandCounts.get(p.brand) ?? 0) + 1);

      // Price range
      if (p.priceMin < globalMin) globalMin = p.priceMin;
      if (p.priceMax > globalMax) globalMax = p.priceMax;

      // Rating (integer bucket: floor of ratingAvg)
      const rBucket = Math.floor(p.ratingAvg);
      ratingCounts.set(rBucket, (ratingCounts.get(rBucket) ?? 0) + 1);

      // Top-level category
      const topCat = p.categoryPath[0] ?? 'Other';
      categoryCounts.set(topCat, (categoryCounts.get(topCat) ?? 0) + 1);

      // Attributes (skip numeric-only fields like weight_kg)
      for (const [key, val] of Object.entries(p.attributes)) {
        if (typeof val === 'number') continue; // skip continuous numeric attrs
        if (!attrCounts[key]) attrCounts[key] = new Map<string, number>();
        const map = attrCounts[key]!;
        const values = Array.isArray(val) ? val.map(String) : [String(val)];
        for (const v of values) {
          map.set(v, (map.get(v) ?? 0) + 1);
        }
      }
    }

    const selectedBrandsLower = applied.brands.map((b) => b.toLowerCase());
    const brands: FacetBucket[] = Array.from(brandCounts.entries())
      .map(([value, count]) => ({
        value,
        count,
        selected: selectedBrandsLower.includes(value.toLowerCase()),
      }))
      .sort((a, b) => b.count - a.count);

    const safeMin = globalMin === Infinity ? 0 : globalMin;
    const safeMax = globalMax === -Infinity ? 0 : globalMax;
    const priceRange: PriceRangeFacet = {
      min: safeMin,
      max: safeMax,
      selectedMin: applied.priceMin ?? safeMin,
      selectedMax: applied.priceMax ?? safeMax,
    };

    const ratings: FacetBucket[] = Array.from(ratingCounts.entries())
      .map(([value, count]) => ({
        value: String(value),
        count,
        selected: applied.rating === value,
      }))
      .sort((a, b) => parseInt(b.value, 10) - parseInt(a.value, 10));

    const categories: FacetBucket[] = Array.from(categoryCounts.entries())
      .map(([value, count]) => ({ value, count, selected: false }))
      .sort((a, b) => b.count - a.count);

    const attributes: Record<string, FacetBucket[]> = {};
    for (const [key, counts] of Object.entries(attrCounts)) {
      attributes[key] = Array.from(counts.entries())
        .map(([value, count]) => ({ value, count, selected: false }))
        .sort((a, b) => b.count - a.count);
    }

    return { brands, priceRange, ratings, categories, attributes };
  }
}

/** Singleton used by all route handlers. */
export const searchStore = new SearchStore();
