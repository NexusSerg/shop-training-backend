import { Injectable } from '@nestjs/common';
import type { Product, ProductAttribute, ProductImage, CategoryNode } from '@shop/shared-types';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Local Prisma-shape interfaces (mirrors the generated schema)
// ---------------------------------------------------------------------------

interface PrismaAttr {
  id: number;
  productId: string;
  key: string;
  value: string;
  label: string;
  filterable: boolean;
  searchable: boolean;
}

interface PrismaImg {
  id: number;
  productId: string;
  url: string;
  altText: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

interface PrismaCategory {
  id: string;
  name: string;
  slug: string;
  path: string[];
  parentId: string | null;
}

interface PrismaProductFull {
  id: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  slug: string;
  status: 'active' | 'inactive' | 'draft' | 'deleted';
  primaryCategoryId: string | null;
  metaTitle: string;
  metaDescription: string;
  createdAt: Date;
  updatedAt: Date;
  primaryCategory: PrismaCategory | null;
  attributes: PrismaAttr[];
  images: PrismaImg[];
}

// For getCategories — includes the _count aggregate
interface PrismaCategWithCount extends PrismaCategory {
  _count: { primaryProducts: number };
}

// Prisma include constant
const PRODUCT_INCLUDE = {
  primaryCategory: true,
  attributes: true,
  images: { orderBy: { isPrimary: 'desc' as const } },
} as const;

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function mapAttributes(attrs: PrismaAttr[]): ProductAttribute[] {
  return attrs.map((a) => {
    let value: string | string[] | number;
    try {
      value = JSON.parse(a.value) as string | string[] | number;
    } catch {
      value = a.value;
    }
    return {
      key: a.key,
      value,
      label: a.label,
      filterable: a.filterable,
      searchable: a.searchable,
    };
  });
}

function mapImages(images: PrismaImg[]): ProductImage[] {
  return images.map((img) => ({
    url: img.url,
    altText: img.altText,
    width: img.width,
    height: img.height,
    isPrimary: img.isPrimary,
  }));
}

function mapProduct(p: PrismaProductFull): Product {
  const categoryId = p.primaryCategoryId ?? '';
  const categoryPath = p.primaryCategory?.path ?? (categoryId ? [categoryId] : []);

  return {
    id: p.id,
    sku: p.sku,
    name: p.name,
    description: p.description,
    brand: p.brand,
    slug: p.slug,
    status: p.status,
    categoryId,
    categoryPath,
    attributes: mapAttributes(p.attributes),
    images: mapImages(p.images),
    metaTitle: p.metaTitle,
    metaDescription: p.metaDescription,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export interface ListProductsOptions {
  limit?: number;
  offset?: number;
}

export interface ListProductsResult {
  data: Product[];
  total: number;
}

@Injectable()
export class CatalogStoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Products
  // ---------------------------------------------------------------------------

  async getProduct(id: string): Promise<Product | undefined> {
    const product = (await this.prisma.product.findUnique({
      where: { id },
      include: PRODUCT_INCLUDE,
    })) as PrismaProductFull | null;
    return product ? mapProduct(product) : undefined;
  }

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    const products = (await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: PRODUCT_INCLUDE,
    })) as PrismaProductFull[];
    // Preserve caller's order
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids
      .map((id) => byId.get(id))
      .filter((p): p is PrismaProductFull => p !== undefined)
      .map(mapProduct);
  }

  async listProducts(opts: ListProductsOptions = {}): Promise<ListProductsResult> {
    const limit = opts.limit ?? 100;
    const offset = opts.offset ?? 0;

    const [products, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        skip: offset,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: PRODUCT_INCLUDE,
      }),
      this.prisma.product.count(),
    ]);

    return { data: (products as PrismaProductFull[]).map(mapProduct), total };
  }

  async createProduct(product: Product): Promise<Product> {
    const created = (await this.prisma.product.create({
      data: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        description: product.description,
        brand: product.brand,
        slug: product.slug,
        status: product.status,
        primaryCategoryId: product.categoryId || null,
        metaTitle: product.metaTitle,
        metaDescription: product.metaDescription,
        createdAt: product.createdAt,
        attributes: {
          create: product.attributes.map((a) => ({
            key: a.key,
            value: JSON.stringify(a.value),
            label: a.label,
            filterable: a.filterable,
            searchable: a.searchable,
          })),
        },
        images: {
          create: product.images.map((img) => ({
            url: img.url,
            altText: img.altText,
            width: img.width,
            height: img.height,
            isPrimary: img.isPrimary,
          })),
        },
        ...(product.categoryId
          ? { categories: { create: { categoryId: product.categoryId } } }
          : {}),
      },
      include: PRODUCT_INCLUDE,
    })) as PrismaProductFull;

    return mapProduct(created);
  }

  async updateProduct(
    id: string,
    updates: Partial<Omit<Product, 'id' | 'createdAt'>>,
  ): Promise<Product | undefined> {
    const existing = await this.prisma.product.findUnique({ where: { id } });
    if (!existing) return undefined;

    const updated = (await this.prisma.product.update({
      where: { id },
      data: {
        ...(updates.sku !== undefined && { sku: updates.sku }),
        ...(updates.name !== undefined && { name: updates.name }),
        ...(updates.description !== undefined && { description: updates.description }),
        ...(updates.brand !== undefined && { brand: updates.brand }),
        ...(updates.slug !== undefined && { slug: updates.slug }),
        ...(updates.status !== undefined && { status: updates.status }),
        ...(updates.categoryId !== undefined && { primaryCategoryId: updates.categoryId }),
        ...(updates.metaTitle !== undefined && { metaTitle: updates.metaTitle }),
        ...(updates.metaDescription !== undefined && { metaDescription: updates.metaDescription }),
      },
      include: PRODUCT_INCLUDE,
    })) as PrismaProductFull;

    return mapProduct(updated);
  }

  async deleteProduct(id: string): Promise<boolean> {
    try {
      await this.prisma.product.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Categories
  // ---------------------------------------------------------------------------

  async getCategories(): Promise<CategoryNode[]> {
    const allCategories = (await this.prisma.category.findMany({
      include: {
        _count: { select: { primaryProducts: { where: { status: 'active' } } } },
      },
    })) as PrismaCategWithCount[];

    const nodeMap = new Map<string, CategoryNode>();

    for (const cat of allCategories) {
      nodeMap.set(cat.id, {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        path: cat.path,
        parentId: cat.parentId,
        productCount: cat._count.primaryProducts,
        children: [],
      });
    }

    const roots: CategoryNode[] = [];
    for (const cat of allCategories) {
      const node = nodeMap.get(cat.id);
      if (!node) continue;
      if (cat.parentId) {
        nodeMap.get(cat.parentId)?.children.push(node);
      } else {
        roots.push(node);
      }
    }

    rollUpCounts(roots);
    return roots;
  }

  // Used by the seeder to bootstrap categories
  async upsertCategory(cat: CategoryNode): Promise<void> {
    await this.prisma.category.upsert({
      where: { id: cat.id },
      create: {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        path: cat.path,
        parentId: cat.parentId ?? null,
      },
      update: {
        name: cat.name,
        slug: cat.slug,
        path: cat.path,
        parentId: cat.parentId ?? null,
      },
    });
    for (const child of cat.children) {
      await this.upsertCategory(child);
    }
  }
}

function rollUpCounts(nodes: CategoryNode[]): number {
  let total = 0;
  for (const node of nodes) {
    const childSum = node.children.length > 0 ? rollUpCounts(node.children) : 0;
    node.productCount = (node.productCount ?? 0) + childSum;
    total += node.productCount;
  }
  return total;
}

