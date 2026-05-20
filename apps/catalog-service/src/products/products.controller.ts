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

@ApiTags('products')
@Controller('api/v1/products')
export class ProductsController {
  constructor(private readonly store: CatalogStoreService) {}

  @Get()
  @ApiOperation({ summary: 'List products (or bulk-fetch by IDs)' })
  @ApiQuery({ name: 'ids', required: false, description: 'Comma-separated product IDs (max 100)' })
  list(@Query('ids') ids?: string) {
    if (!ids) {
      const all = this.store.getAllProducts();
      return { data: all, count: all.length };
    }

    const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (idList.length > 100) {
      throw new BadRequestException('Too many IDs — maximum 100 per request');
    }

    const products = this.store.getProductsByIds(idList);
    return { data: products, count: products.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  findOne(@Param('id') id: string) {
    const product = this.store.getProduct(id);
    if (!product) {
      throw new NotFoundException({ message: { error: 'Product not found', productId: id } });
    }
    return product;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new product (admin)' })
  create(@Body() body: unknown) {
    const parsed = CreateProductBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { sku, name, description, brand, categoryId, status, metaTitle, metaDescription } = parsed.data;
    const categoryPath = findCategoryPath(this.store.getCategories(), categoryId) ?? [categoryId];
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
  update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateProductBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const updated = this.store.updateProduct(id, parsed.data);
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
