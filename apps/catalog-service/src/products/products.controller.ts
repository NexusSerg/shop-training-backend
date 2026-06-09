import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiParam } from '@nestjs/swagger';
import { faker } from '@faker-js/faker';
import { z } from 'zod';
import type { Product, CategoryNode } from '@shop/shared-types';
import { slugify } from '@shop/shared-utils';
import { CatalogStoreService } from '../catalog-store/catalog-store.service';

const CreateProductBodySchema = z.object({
  sku: z.string().min(1).max(50),
  name: z.string().min(1).max(500),
  description: z.string().max(5000).default(''),
  brand: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  status: z.enum(['active', 'inactive', 'draft']).default('draft'),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

const UpdateProductBodySchema = z.object({
  sku: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(500).optional(),
  description: z.string().max(5000).optional(),
  brand: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).optional(),
  status: z.enum(['active', 'inactive', 'draft', 'deleted']).optional(),
  metaTitle: z.string().max(200).optional(),
  metaDescription: z.string().max(500).optional(),
});

const ListQuerySchema = z.object({
  ids: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

@ApiTags('products')
@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly store: CatalogStoreService) {}

  @Get()
  @ApiOperation({ summary: 'List products (paginated) or bulk-fetch by IDs' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated product IDs (max 100)' })
  @ApiQuery({ name: 'limit', required: false, description: 'Page size (default 100, max 200)' })
  @ApiQuery({ name: 'offset', required: false, description: 'Pagination offset' })
  async list(@Query() rawQuery: unknown) {
    const query = ListQuerySchema.safeParse(rawQuery);
    if (!query.success) {
      throw new BadRequestException({ error: 'Invalid query', details: query.error.flatten() });
    }
    const { ids, limit, offset } = query.data;

    if (ids) {
      const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length > 100) {
        throw new BadRequestException('Too many IDs — maximum 100 per request');
      }
      const products = await this.store.getProductsByIds(idList);
      return { data: products, count: products.length };
    }

    const result = await this.store.listProducts({ limit, offset });
    return { data: result.data, count: result.data.length, total: result.total, limit, offset };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async findOne(@Param('id') id: string) {
    const product = await this.store.getProduct(id);
    if (!product) {
      throw new NotFoundException({ message: { error: 'Product not found', productId: id } });
    }
    return product;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product (admin)' })
  async create(@Body() body: unknown) {
    const parsed = CreateProductBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { sku, name, description, brand, categoryId, status, metaTitle, metaDescription } = parsed.data;
    const categories = await this.store.getCategories();
    const categoryPath = findCategoryPath(categories, categoryId) ?? [categoryId];
    const now = new Date();

    const product: Product = {
      id: `p-${faker.string.uuid()}`,
      sku,
      name,
      description,
      brand,
      slug: `${slugify(name)}-${faker.string.alphanumeric(6).toLowerCase()}`,
      status,
      categoryId,
      categoryPath,
      attributes: [],
      images: [],
      metaTitle: metaTitle ?? `${name} — ${brand}`,
      metaDescription: metaDescription ?? `Buy ${name} from ${brand}.`,
      createdAt: now,
      updatedAt: now,
    };

    return this.store.createProduct(product);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product fields (admin)' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  async update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateProductBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    // Strip undefined entries so exactOptionalPropertyTypes is satisfied
    const cleanUpdates = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => v !== undefined),
    ) as Parameters<CatalogStoreService['updateProduct']>[1];

    const updated = await this.store.updateProduct(id, cleanUpdates);
    if (!updated) {
      throw new NotFoundException({ message: { error: 'Product not found', productId: id } });
    }
    return updated;
  }
}

function findCategoryPath(nodes: CategoryNode[], targetId: string): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) return node.path;
    if (node.children.length > 0) {
      const found = findCategoryPath(node.children, targetId);
      if (found) return found;
    }
  }
  return null;
}

