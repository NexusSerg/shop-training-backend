import { describe, it, expect, beforeEach } from 'vitest';
import { SearchStore } from '../mock/store.js';
import type { ProductSummary } from '@shop/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(overrides: Partial<ProductSummary> = {}): ProductSummary {
  const base: ProductSummary = {
    id: 'p-1',
    sku: 'SKU001',
    name: 'Test Laptop',
    slug: 'test-laptop',
    brand: 'Apple',
    categoryPath: ['Electronics', 'Laptops'],
    primaryImage: null,
    priceMin: 999,
    priceMax: 1099,
    originalPrice: 1199,
    discountPercentage: 16,
    inStock: true,
    sellerCount: 3,
    ratingAvg: 4.5,
    reviewCount: 250,
    attributes: { color: 'Silver', material: 'Metal', size: 'M' },
    createdAt: new Date('2024-01-01'),
  };
  return { ...base, ...overrides };
}

// ---------------------------------------------------------------------------
// SearchStore unit tests
// ---------------------------------------------------------------------------

describe('SearchStore', () => {
  let store: SearchStore;

  beforeEach(() => {
    store = new SearchStore([]);
  });

  // ---------------------------------------------------------------------------
  // Empty store
  // ---------------------------------------------------------------------------

  it('empty store returns zero results', () => {
    const result = store.search();
    expect(result.products).toHaveLength(0);
    expect(result.pagination.total).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Text search
  // ---------------------------------------------------------------------------

  it('matches product by name (case-insensitive)', () => {
    store = new SearchStore([makeProduct({ id: 'p-1', name: 'Gaming Laptop Pro' })]);
    const result = store.search({ q: 'gaming' });
    expect(result.products).toHaveLength(1);
  });

  it('matches product by brand', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-1', brand: 'Apple' }),
      makeProduct({ id: 'p-2', brand: 'Samsung' }),
    ]);
    const result = store.search({ q: 'apple' });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.brand).toBe('Apple');
  });

  it('matches product by SKU', () => {
    store = new SearchStore([makeProduct({ id: 'p-1', sku: 'ABCDEF12' })]);
    expect(store.search({ q: 'abcdef12' }).products).toHaveLength(1);
    expect(store.search({ q: 'zzz' }).products).toHaveLength(0);
  });

  it('returns no results for unmatched query', () => {
    store = new SearchStore([makeProduct()]);
    expect(store.search({ q: 'nonexistent_xyz' }).products).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Brand filter
  // ---------------------------------------------------------------------------

  it('brand filter is case-insensitive', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-1', brand: 'Apple' }),
      makeProduct({ id: 'p-2', brand: 'Samsung' }),
    ]);
    const result = store.search({ brands: ['apple'] });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.brand).toBe('Apple');
  });

  it('multi-brand filter returns products from all requested brands', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-1', brand: 'Apple' }),
      makeProduct({ id: 'p-2', brand: 'Samsung' }),
      makeProduct({ id: 'p-3', brand: 'Sony' }),
    ]);
    const result = store.search({ brands: ['Apple', 'Samsung'] });
    expect(result.products).toHaveLength(2);
  });

  // ---------------------------------------------------------------------------
  // Price filter
  // ---------------------------------------------------------------------------

  it('priceMin filter excludes cheaper products', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-cheap', priceMin: 50, priceMax: 60 }),
      makeProduct({ id: 'p-mid', priceMin: 200, priceMax: 250 }),
      makeProduct({ id: 'p-expensive', priceMin: 900, priceMax: 1000 }),
    ]);
    const result = store.search({ priceMin: 100 });
    expect(result.products.map((p) => p.id)).not.toContain('p-cheap');
  });

  it('priceMax filter excludes more expensive products', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-cheap', priceMin: 50, priceMax: 60 }),
      makeProduct({ id: 'p-expensive', priceMin: 900, priceMax: 1000 }),
    ]);
    const result = store.search({ priceMax: 500 });
    expect(result.products.map((p) => p.id)).toContain('p-cheap');
    expect(result.products.map((p) => p.id)).not.toContain('p-expensive');
  });

  // ---------------------------------------------------------------------------
  // Rating filter
  // ---------------------------------------------------------------------------

  it('rating filter excludes products below minimum', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-low', ratingAvg: 2.5 }),
      makeProduct({ id: 'p-high', ratingAvg: 4.5 }),
    ]);
    const result = store.search({ rating: 4 });
    expect(result.products.map((p) => p.id)).toEqual(['p-high']);
  });

  // ---------------------------------------------------------------------------
  // Category filter
  // ---------------------------------------------------------------------------

  it('category path filter matches exact path prefix', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-laptop', categoryPath: ['Electronics', 'Laptops'] }),
      makeProduct({ id: 'p-phone', categoryPath: ['Electronics', 'Phones'] }),
      makeProduct({ id: 'p-shoe', categoryPath: ['Clothing', "Men's"] }),
    ]);
    const result = store.search({ categoryPath: ['Electronics'] });
    expect(result.products).toHaveLength(2);
    expect(result.products.map((p) => p.id)).not.toContain('p-shoe');
  });

  it('category path filter matches full path', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-laptop', categoryPath: ['Electronics', 'Laptops'] }),
      makeProduct({ id: 'p-phone', categoryPath: ['Electronics', 'Phones'] }),
    ]);
    const result = store.search({ categoryPath: ['Electronics', 'Laptops'] });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.id).toBe('p-laptop');
  });

  // ---------------------------------------------------------------------------
  // In-stock filter
  // ---------------------------------------------------------------------------

  it('inStockOnly filter excludes out-of-stock products', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-in', inStock: true }),
      makeProduct({ id: 'p-out', inStock: false }),
    ]);
    const result = store.search({ inStockOnly: true });
    expect(result.products.map((p) => p.id)).toEqual(['p-in']);
  });

  // ---------------------------------------------------------------------------
  // Attribute filter
  // ---------------------------------------------------------------------------

  it('attribute filter matches exact string value (case-insensitive)', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-black', attributes: { color: 'Black' } }),
      makeProduct({ id: 'p-white', attributes: { color: 'White' } }),
    ]);
    const result = store.search({ attributes: { color: ['black'] } });
    expect(result.products.map((p) => p.id)).toEqual(['p-black']);
  });

  it('attribute filter excludes products without that attribute', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-with', attributes: { color: 'Black' } }),
      makeProduct({ id: 'p-without', attributes: {} }),
    ]);
    const result = store.search({ attributes: { color: ['Black'] } });
    expect(result.products.map((p) => p.id)).toEqual(['p-with']);
  });

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  it('sort=price_asc orders by priceMin ascending', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-3', priceMin: 300 }),
      makeProduct({ id: 'p-1', priceMin: 100 }),
      makeProduct({ id: 'p-2', priceMin: 200 }),
    ]);
    const result = store.search({ sort: 'price_asc' });
    expect(result.products.map((p) => p.id)).toEqual(['p-1', 'p-2', 'p-3']);
  });

  it('sort=price_desc orders by priceMin descending', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-1', priceMin: 100 }),
      makeProduct({ id: 'p-2', priceMin: 200 }),
    ]);
    const result = store.search({ sort: 'price_desc' });
    expect(result.products[0]?.id).toBe('p-2');
  });

  it('sort=rating orders by ratingAvg descending', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-low', ratingAvg: 2.5, reviewCount: 100 }),
      makeProduct({ id: 'p-high', ratingAvg: 4.8, reviewCount: 100 }),
    ]);
    const result = store.search({ sort: 'rating' });
    expect(result.products[0]?.id).toBe('p-high');
  });

  it('sort=newest orders by createdAt descending', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-old', createdAt: new Date('2022-01-01') }),
      makeProduct({ id: 'p-new', createdAt: new Date('2024-01-01') }),
    ]);
    const result = store.search({ sort: 'newest' });
    expect(result.products[0]?.id).toBe('p-new');
  });

  it('sort=popularity orders by reviewCount descending', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-few', reviewCount: 10 }),
      makeProduct({ id: 'p-many', reviewCount: 5000 }),
    ]);
    const result = store.search({ sort: 'popularity' });
    expect(result.products[0]?.id).toBe('p-many');
  });

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  it('pagination returns the correct page slice', () => {
    const products = Array.from({ length: 72 }, (_, i) =>
      makeProduct({ id: `p-${i + 1}` }),
    );
    store = new SearchStore(products);

    const page1 = store.search({ page: 1, perPage: 24 });
    const page2 = store.search({ page: 2, perPage: 24 });
    const page3 = store.search({ page: 3, perPage: 24 });

    expect(page1.products).toHaveLength(24);
    expect(page2.products).toHaveLength(24);
    expect(page3.products).toHaveLength(24);
    expect(page1.pagination.total).toBe(72);
    expect(page1.pagination.hasNextPage).toBe(true);
    expect(page3.pagination.hasNextPage).toBe(false);
    expect(page1.pagination.hasPrevPage).toBe(false);
    expect(page2.pagination.hasPrevPage).toBe(true);

    // No overlap between pages
    const ids1 = page1.products.map((p) => p.id);
    const ids2 = page2.products.map((p) => p.id);
    expect(ids1.filter((id) => ids2.includes(id))).toHaveLength(0);
  });

  it('out-of-range page returns empty products', () => {
    store = new SearchStore([makeProduct()]);
    const result = store.search({ page: 99, perPage: 24 });
    expect(result.products).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // Facets
  // ---------------------------------------------------------------------------

  it('facets reflect brand distribution of filtered results', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-a1', brand: 'Apple' }),
      makeProduct({ id: 'p-a2', brand: 'Apple' }),
      makeProduct({ id: 'p-s1', brand: 'Samsung' }),
    ]);
    const result = store.search();
    const appleBucket = result.facets.brands.find((b) => b.value === 'Apple');
    const samsungBucket = result.facets.brands.find((b) => b.value === 'Samsung');
    expect(appleBucket?.count).toBe(2);
    expect(samsungBucket?.count).toBe(1);
  });

  it('priceRange facet min/max spans the filtered product prices', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-cheap', priceMin: 50, priceMax: 60 }),
      makeProduct({ id: 'p-expensive', priceMin: 900, priceMax: 1000 }),
    ]);
    const result = store.search();
    expect(result.facets.priceRange.min).toBe(50);
    expect(result.facets.priceRange.max).toBe(1000);
  });

  it('selected brand is flagged in facets when brand filter applied', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-a', brand: 'Apple' }),
      makeProduct({ id: 'p-s', brand: 'Samsung' }),
    ]);
    const result = store.search({ brands: ['Apple'] });
    const appleBucket = result.facets.brands.find((b) => b.value === 'Apple');
    expect(appleBucket?.selected).toBe(true);
    const samsungBucket = result.facets.brands.find((b) => b.value === 'Samsung');
    // Samsung not in results when filtering by Apple, so may be absent or count=0
    if (samsungBucket) expect(samsungBucket.selected).toBe(false);
  });

  it('getFacets returns facets for entire store when no query given', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-1', brand: 'Apple' }),
      makeProduct({ id: 'p-2', brand: 'Samsung' }),
    ]);
    const facets = store.getFacets();
    expect(facets.brands.map((b) => b.value).sort()).toEqual(['Apple', 'Samsung'].sort());
  });

  it('getFacets scopes to text-matching products when query is given', () => {
    store = new SearchStore([
      makeProduct({ id: 'p-1', name: 'Apple Laptop', brand: 'Apple' }),
      makeProduct({ id: 'p-2', name: 'Samsung Phone', brand: 'Samsung' }),
    ]);
    const facets = store.getFacets('Apple');
    expect(facets.brands.map((b) => b.value)).toEqual(['Apple']);
  });
});
