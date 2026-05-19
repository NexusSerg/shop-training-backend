// Search domain types

export type SortOption =
  | 'relevance'
  | 'price_asc'
  | 'price_desc'
  | 'rating'
  | 'newest'
  | 'popularity';

export type PerPageOption = 24 | 48 | 96;

export interface SearchFilters {
  brands: string[];
  priceRange: [number, number] | null;
  rating: number | null;
  categoryPath: string[];
  attributes: Record<string, string[]>;
  inStockOnly: boolean;
}

export interface SearchState {
  query: string;
  filters: SearchFilters;
  sort: SortOption;
  pagination: {
    page: number;
    perPage: PerPageOption;
  };
}

export interface SearchRequest {
  q?: string;
  brands?: string[];
  priceMin?: number;
  priceMax?: number;
  rating?: number;
  categoryPath?: string[];
  attributes?: Record<string, string[]>;
  inStockOnly?: boolean;
  sort?: SortOption;
  page?: number;
  perPage?: PerPageOption;
}

export interface FacetBucket {
  value: string;
  count: number;
  selected: boolean;
}

export interface PriceRangeFacet {
  min: number;
  max: number;
  selectedMin: number;
  selectedMax: number;
}

export interface Facets {
  brands: FacetBucket[];
  priceRange: PriceRangeFacet;
  ratings: FacetBucket[];
  categories: FacetBucket[];
  attributes: Record<string, FacetBucket[]>;
}

export interface PaginationMeta {
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface SearchResponse<T = import('./product.js').ProductSummary> {
  products: T[];
  facets: Facets;
  pagination: PaginationMeta;
  took: number;
  query: string;
}

export interface Suggestion {
  text: string;
  type: 'query' | 'product' | 'brand' | 'category';
  score: number;
  payload?: {
    productId?: string;
    slug?: string;
    imageUrl?: string;
  };
}

export interface AutocompleteResponse {
  suggestions: Suggestion[];
  took: number;
}
