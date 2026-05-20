import { describe, it, expect, beforeEach } from 'vitest';
import { CatalogStore } from '../mock/store';

describe('CatalogStore', () => {
  let store: CatalogStore;

  // Use an empty store for isolated unit tests (avoids seeding 100 products each time)
  beforeEach(() => {
    store = new CatalogStore([]);
  });

  describe('getProduct', () => {
    it('returns undefined for an unknown ID', () => {
      expect(store.getProduct('nonexistent')).toBeUndefined();
    });

    it('returns the product after it has been created', () => {
      const product = makeProduct('p-test-1');
      store.createProduct(product);
      expect(store.getProduct('p-test-1')).toEqual(product);
    });
  });

  describe('getProductsByIds', () => {
    it('returns only the products that exist', () => {
      store.createProduct(makeProduct('p-a'));
      store.createProduct(makeProduct('p-b'));

      const result = store.getProductsByIds(['p-a', 'p-missing', 'p-b']);
      expect(result).toHaveLength(2);
      expect(result.map((p) => p.id)).toEqual(['p-a', 'p-b']);
    });

    it('returns empty array when none of the IDs exist', () => {
      expect(store.getProductsByIds(['nope', 'also-nope'])).toEqual([]);
    });
  });

  describe('getAllProducts', () => {
    it('returns all stored products', () => {
      store.createProduct(makeProduct('p-1'));
      store.createProduct(makeProduct('p-2'));
      expect(store.getAllProducts()).toHaveLength(2);
    });
  });

  describe('createProduct', () => {
    it('persists the new product', () => {
      const product = makeProduct('p-new');
      store.createProduct(product);
      expect(store.getProduct('p-new')).toEqual(product);
    });
  });

  describe('updateProduct', () => {
    it('returns undefined for a non-existent product', () => {
      expect(store.updateProduct('p-ghost', { name: 'Ghost' })).toBeUndefined();
    });

    it('merges the provided fields and bumps updatedAt', () => {
      const original = makeProduct('p-upd');
      store.createProduct(original);

      const before = original.updatedAt.getTime();
      const updated = store.updateProduct('p-upd', { name: 'New Name', brand: 'NewBrand' });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('New Name');
      expect(updated?.brand).toBe('NewBrand');
      expect(updated?.sku).toBe(original.sku); // unchanged field preserved
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(before);
    });
  });

  describe('deleteProduct', () => {
    it('removes the product and returns true', () => {
      store.createProduct(makeProduct('p-del'));
      expect(store.deleteProduct('p-del')).toBe(true);
      expect(store.getProduct('p-del')).toBeUndefined();
    });

    it('returns false for a non-existent product', () => {
      expect(store.deleteProduct('p-ghost')).toBe(false);
    });
  });

  describe('category product counts', () => {
    it('counts only active products in the correct leaf category', () => {
      store.createProduct(makeProduct('p-active', 'active', 'cat-laptops'));
      store.createProduct(makeProduct('p-inactive', 'inactive', 'cat-laptops'));

      const categories = store.getCategories();
      const electronics = categories.find((c) => c.id === 'cat-electronics');
      const laptopsNode = electronics?.children.find((c) => c.id === 'cat-laptops');

      expect(laptopsNode?.productCount).toBe(1);
      // Parent should roll up child counts
      expect(electronics?.productCount).toBeGreaterThanOrEqual(1);
    });
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProduct(
  id: string,
  status: 'active' | 'inactive' | 'draft' = 'active',
  categoryId = 'cat-laptops',
) {
  const now = new Date();
  return {
    id,
    sku: `SKU-${id}`,
    name: `Product ${id}`,
    description: 'A test product',
    brand: 'TestBrand',
    slug: `product-${id}`,
    status,
    categoryId,
    categoryPath: ['Electronics', 'Laptops'],
    attributes: [],
    images: [],
    metaTitle: `Product ${id}`,
    metaDescription: `Description for product ${id}`,
    createdAt: now,
    updatedAt: now,
  };
}
