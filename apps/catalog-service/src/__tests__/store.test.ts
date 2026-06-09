/**
 * Unit tests for CatalogStoreService (Prisma-backed).
 * PrismaService is mocked so no real DB connection is required.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import type { Product } from '@shop/shared-types';
import { CatalogStoreService } from '../catalog-store/catalog-store.service';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function makeProduct(
  id: string,
  status: 'active' | 'inactive' | 'draft' = 'active',
  categoryId = 'cat-laptops',
): Product {
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

/** Build a Prisma-shaped row from a Product so mapProduct() can round-trip it. */
function makePrismaRow(p: Product) {
  return {
    ...p,
    primaryCategoryId: p.categoryId,
    primaryCategory: { id: p.categoryId, path: p.categoryPath, name: p.categoryId, slug: p.categoryId, parentId: null },
    attributes: p.attributes.map((a, i) => ({ id: i, productId: p.id, ...a, value: JSON.stringify(a.value) })),
    images: p.images.map((img, i) => ({ id: i, productId: p.id, ...img })),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CatalogStoreService', () => {
  let service: CatalogStoreService;
  let prismaMock: {
    product: {
      findUnique: ReturnType<typeof vi.fn>;
      findMany: ReturnType<typeof vi.fn>;
      count: ReturnType<typeof vi.fn>;
      create: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
    };
    category: { findMany: ReturnType<typeof vi.fn>; upsert: ReturnType<typeof vi.fn> };
    $transaction: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    prismaMock = {
      product: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      category: {
        findMany: vi.fn().mockResolvedValue([]),
        upsert: vi.fn().mockResolvedValue({}),
      },
      $transaction: vi.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        CatalogStoreService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get(CatalogStoreService);
  });

  describe('getProduct', () => {
    it('returns undefined when no row is found', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);
      expect(await service.getProduct('p-missing')).toBeUndefined();
    });

    it('maps Prisma row to Product shape', async () => {
      const p = makeProduct('p-1');
      prismaMock.product.findUnique.mockResolvedValue(makePrismaRow(p));
      const result = await service.getProduct('p-1');
      expect(result).toMatchObject({ id: 'p-1', name: 'Product p-1', brand: 'TestBrand' });
    });
  });

  describe('getProductsByIds', () => {
    it('returns only found products preserving order', async () => {
      const a = makeProduct('p-a');
      const b = makeProduct('p-b');
      prismaMock.product.findMany.mockResolvedValue([makePrismaRow(b), makePrismaRow(a)]);
      const result = await service.getProductsByIds(['p-a', 'p-missing', 'p-b']);
      expect(result.map((p) => p.id)).toEqual(['p-a', 'p-b']);
    });

    it('returns empty array when none exist', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      expect(await service.getProductsByIds(['nope'])).toEqual([]);
    });
  });

  describe('listProducts', () => {
    it('returns data and total from a transaction', async () => {
      const p = makeProduct('p-list');
      prismaMock.$transaction.mockResolvedValue([[makePrismaRow(p)], 42]);
      const result = await service.listProducts({ limit: 10, offset: 0 });
      expect(result.total).toBe(42);
      expect(result.data).toHaveLength(1);
    });
  });

  describe('createProduct', () => {
    it('calls prisma.create and maps the result', async () => {
      const p = makeProduct('p-new');
      prismaMock.product.create.mockResolvedValue(makePrismaRow(p));
      const result = await service.createProduct(p);
      expect(prismaMock.product.create).toHaveBeenCalledOnce();
      expect(result.id).toBe('p-new');
    });
  });

  describe('updateProduct', () => {
    it('returns undefined when product does not exist', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);
      expect(await service.updateProduct('p-ghost', { name: 'Ghost' })).toBeUndefined();
    });

    it('merges updates and returns mapped product', async () => {
      const original = makeProduct('p-upd');
      const updated = { ...makeProduct('p-upd'), name: 'New Name', brand: 'NewBrand' };
      prismaMock.product.findUnique.mockResolvedValue(makePrismaRow(original));
      prismaMock.product.update.mockResolvedValue(makePrismaRow(updated));
      const result = await service.updateProduct('p-upd', { name: 'New Name', brand: 'NewBrand' });
      expect(result?.name).toBe('New Name');
      expect(result?.brand).toBe('NewBrand');
    });
  });

  describe('deleteProduct', () => {
    it('returns true on success', async () => {
      prismaMock.product.delete.mockResolvedValue({});
      expect(await service.deleteProduct('p-del')).toBe(true);
    });

    it('returns false when Prisma throws (not found)', async () => {
      prismaMock.product.delete.mockRejectedValue(new Error('Not found'));
      expect(await service.deleteProduct('p-ghost')).toBe(false);
    });
  });

  describe('getCategories', () => {
    it('builds a tree from flat Prisma rows', async () => {
      prismaMock.category.findMany.mockResolvedValue([
        { id: 'cat-electronics', name: 'Electronics', slug: 'electronics', path: ['Electronics'], parentId: null, _count: { primaryProducts: 0 } },
        { id: 'cat-laptops', name: 'Laptops', slug: 'laptops', path: ['Electronics', 'Laptops'], parentId: 'cat-electronics', _count: { primaryProducts: 5 } },
      ]);
      const tree = await service.getCategories();
      expect(tree).toHaveLength(1);
      expect(tree[0]?.id).toBe('cat-electronics');
      expect(tree[0]?.children).toHaveLength(1);
      expect(tree[0]?.children[0]?.id).toBe('cat-laptops');
      // count rolls up
      expect(tree[0]?.productCount).toBe(5);
    });
  });
});

