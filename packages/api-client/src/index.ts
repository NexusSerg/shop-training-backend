import type {
  SearchRequest,
  SearchResponse,
  Product,
  ProductPricing,
  PriceMap,
  AutocompleteResponse,
  SavedSearch,
  CreateSavedSearchRequest,
} from '@shop/shared-types';

export interface CatalogClientConfig {
  baseUrl: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class CatalogApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

export class CatalogClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly defaultHeaders: Record<string, string>;

  constructor(config: CatalogClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.timeout = config.timeout ?? 10_000;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.defaultHeaders, ...init?.headers },
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new CatalogApiError(res.status, body || res.statusText);
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(id);
    }
  }

  async search(params: SearchRequest): Promise<SearchResponse> {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.sort) qs.set('sort', params.sort);
    if (params.page) qs.set('page', String(params.page));
    if (params.perPage) qs.set('per_page', String(params.perPage));
    if (params.brands?.length) qs.set('brands', params.brands.join(','));
    if (params.priceMin !== undefined) qs.set('price_min', String(params.priceMin));
    if (params.priceMax !== undefined) qs.set('price_max', String(params.priceMax));
    if (params.rating !== undefined) qs.set('rating', String(params.rating));
    if (params.categoryPath?.length) qs.set('category', params.categoryPath.join('/'));
    if (params.inStockOnly) qs.set('in_stock', 'true');
    if (params.attributes) {
      for (const [key, values] of Object.entries(params.attributes)) {
        qs.set(`attr_${key}`, (values as string[]).join(','));
      }
    }
    return this.request<SearchResponse>(`/api/v1/search?${qs}`);
  }

  async getProduct(id: string): Promise<Product> {
    return this.request<Product>(`/api/v1/products/${encodeURIComponent(id)}`);
  }

  async getProducts(ids: string[]): Promise<Product[]> {
    return this.request<Product[]>(`/api/v1/products?ids=${ids.map(encodeURIComponent).join(',')}`);
  }

  async getAutocomplete(q: string, limit = 10): Promise<AutocompleteResponse> {
    return this.request<AutocompleteResponse>(
      `/api/v1/autocomplete?q=${encodeURIComponent(q)}&limit=${limit}`,
    );
  }

  async getPricing(productId: string): Promise<ProductPricing> {
    return this.request<ProductPricing>(`/api/v1/pricing/${encodeURIComponent(productId)}`);
  }

  async getBulkPricing(productIds: string[]): Promise<PriceMap> {
    return this.request<PriceMap>(`/api/v1/pricing/bulk`, {
      method: 'POST',
      body: JSON.stringify({ productIds }),
    });
  }

  async getSavedSearches(userId: string): Promise<SavedSearch[]> {
    return this.request<SavedSearch[]>(`/api/v1/saved-searches`, {
      headers: { 'x-user-id': userId },
    });
  }

  async createSavedSearch(
    userId: string,
    payload: CreateSavedSearchRequest,
  ): Promise<SavedSearch> {
    return this.request<SavedSearch>(`/api/v1/saved-searches`, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: { 'x-user-id': userId },
    });
  }

  async deleteSavedSearch(userId: string, id: string): Promise<void> {
    await this.request<void>(`/api/v1/saved-searches/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: { 'x-user-id': userId },
    });
  }
}

// Re-export all domain types so consumers only need this one package
export type {
  Product, ProductSummary, ProductAttribute, ProductImage, ProductDocument, ProductStatus,
  SearchRequest, SearchResponse, SearchFilters, SearchState, SortOption, PerPageOption,
  FacetBucket, PriceRangeFacet, Facets, PaginationMeta, Suggestion, AutocompleteResponse,
  Price, SellerOffer, ProductPricing, Inventory, PriceMap,
  FilterDefinition, FilterOption, PriceRange, RatingFilter, ActiveFilter, CategoryNode,
  BaseEvent, ProductCreatedEvent, ProductUpdatedEvent, ProductDeletedEvent,
  PriceChangedEvent, InventoryUpdatedEvent, CatalogEvent, KafkaTopic,
  SavedSearch, CreateSavedSearchRequest,
} from '@shop/shared-types';
