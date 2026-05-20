import type { Product, CategoryNode } from '@shop/shared-types';
import { seedProducts } from './seed';
import { CATEGORY_TREE } from './categories';

/**
 * In-memory product + category store.
 * In later phases this is replaced by PostgreSQL (catalog) and Redis (pricing).
 */
export class CatalogStore {
  private readonly products = new Map<string, Product>();
  private readonly categories: CategoryNode[];

  constructor(initialProducts?: Product[]) {
    this.categories = this.deepClone(CATEGORY_TREE);

    const products = initialProducts ?? seedProducts(100);
    for (const product of products) {
      this.products.set(product.id, product);
    }

    this.recomputeCategoryProductCounts();
  }

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  getProduct(id: string): Product | undefined {
    return this.products.get(id);
  }

  getProductsByIds(ids: string[]): Product[] {
    return ids
      .map((id) => this.products.get(id))
      .filter((p): p is Product => p !== undefined);
  }

  getAllProducts(): Product[] {
    return Array.from(this.products.values());
  }

  createProduct(product: Product): Product {
    this.products.set(product.id, product);
    this.recomputeCategoryProductCounts();
    return product;
  }

  updateProduct(
    id: string,
    updates: { [K in keyof Omit<Product, 'id' | 'createdAt'>]?: Product[K] | undefined },
  ): Product | undefined {
    const existing = this.products.get(id);
    if (!existing) return undefined;

    // Strip undefined values so exactOptionalPropertyTypes is satisfied
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined),
    ) as Partial<Omit<Product, 'id' | 'createdAt'>>;

    const updated: Product = { ...existing, ...cleanUpdates, updatedAt: new Date() };
    this.products.set(id, updated);
    this.recomputeCategoryProductCounts();
    return updated;
  }

  deleteProduct(id: string): boolean {
    const deleted = this.products.delete(id);
    if (deleted) this.recomputeCategoryProductCounts();
    return deleted;
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  getCategories(): CategoryNode[] {
    return this.categories;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private recomputeCategoryProductCounts(): void {
    const countById = new Map<string, number>();
    for (const product of this.products.values()) {
      if (product.status === 'active') {
        countById.set(product.categoryId, (countById.get(product.categoryId) ?? 0) + 1);
      }
    }
    this.applyCountsToTree(this.categories, countById);
  }

  /** Recursively assign productCount, adding children's counts to parents. */
  private applyCountsToTree(nodes: CategoryNode[], counts: Map<string, number>): number {
    let total = 0;
    for (const node of nodes) {
      const own = counts.get(node.id) ?? 0;
      const childTotal = node.children.length > 0 ? this.applyCountsToTree(node.children, counts) : 0;
      node.productCount = own + childTotal;
      total += node.productCount;
    }
    return total;
  }

  /** Deep clone the category tree so the original constants are never mutated. */
  private deepClone(nodes: CategoryNode[]): CategoryNode[] {
    return nodes.map((node) => ({
      ...node,
      children: this.deepClone(node.children),
    }));
  }
}

/** Singleton used by all route handlers. */
export const catalogStore = new CatalogStore();
