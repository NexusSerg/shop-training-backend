import type { SearchState, SearchRequest, SortOption, PerPageOption } from '@shop/shared-types';

/**
 * Parse URLSearchParams into a SearchState object
 */
export function parseSearchParams(params: URLSearchParams): SearchState {
  const query = params.get('q') ?? '';
  const sort = (params.get('sort') as SortOption) ?? 'relevance';
  const page = Math.max(1, parseInt(params.get('page') ?? '1', 10));
  const perPage = (parseInt(params.get('per_page') ?? '24', 10) as PerPageOption) ?? 24;

  const brands = params.get('brands')
    ? (params.get('brands') as string).split(',').filter(Boolean)
    : [];

  const priceMin = params.has('price_min') ? parseFloat(params.get('price_min') as string) : null;
  const priceMax = params.has('price_max') ? parseFloat(params.get('price_max') as string) : null;
  const priceRange: [number, number] | null =
    priceMin !== null && priceMax !== null ? [priceMin, priceMax] : null;

  const rating = params.has('rating') ? parseInt(params.get('rating') as string, 10) : null;

  const categoryPath = params.get('category')
    ? (params.get('category') as string).split('/')
    : [];

  const inStockOnly = params.get('in_stock') === 'true';

  const attributes: Record<string, string[]> = {};
  for (const [key, value] of params.entries()) {
    if (key.startsWith('attr_')) {
      const attrKey = key.slice(5);
      attributes[attrKey] = value.split(',').filter(Boolean);
    }
  }

  return {
    query,
    filters: { brands, priceRange, rating, categoryPath, attributes, inStockOnly },
    sort: sort as SortOption,
    pagination: { page, perPage: perPage as PerPageOption },
  };
}

/**
 * Build URLSearchParams from a SearchState object
 */
export function buildSearchParams(state: SearchState): URLSearchParams {
  const params = new URLSearchParams();

  if (state.query) params.set('q', state.query);
  if (state.sort !== 'relevance') params.set('sort', state.sort);
  if (state.pagination.page > 1) params.set('page', String(state.pagination.page));
  if (state.pagination.perPage !== 24) params.set('per_page', String(state.pagination.perPage));

  if (state.filters.brands.length > 0) params.set('brands', state.filters.brands.join(','));
  if (state.filters.priceRange) {
    params.set('price_min', String(state.filters.priceRange[0]));
    params.set('price_max', String(state.filters.priceRange[1]));
  }
  if (state.filters.rating !== null) params.set('rating', String(state.filters.rating));
  if (state.filters.categoryPath.length > 0)
    params.set('category', state.filters.categoryPath.join('/'));
  if (state.filters.inStockOnly) params.set('in_stock', 'true');

  for (const [key, values] of Object.entries(state.filters.attributes)) {
    if (values.length > 0) params.set(`attr_${key}`, values.join(','));
  }

  return params;
}

/**
 * Convert SearchState into a SearchRequest (for API calls)
 */
export function searchStateToRequest(state: SearchState): SearchRequest {
  const req: SearchRequest = {
    sort: state.sort,
    page: state.pagination.page,
    perPage: state.pagination.perPage,
  };
  if (state.query) req.q = state.query;
  if (state.filters.brands.length > 0) req.brands = state.filters.brands;
  if (state.filters.priceRange) {
    req.priceMin = state.filters.priceRange[0];
    req.priceMax = state.filters.priceRange[1];
  }
  if (state.filters.rating !== null) req.rating = state.filters.rating;
  if (state.filters.categoryPath.length > 0) req.categoryPath = state.filters.categoryPath;
  if (Object.keys(state.filters.attributes).length > 0) req.attributes = state.filters.attributes;
  if (state.filters.inStockOnly) req.inStockOnly = true;
  return req;
}
