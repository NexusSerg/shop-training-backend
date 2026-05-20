import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { z } from 'zod';
import type { Inventory } from '@shop/shared-types';
import { PricingStoreService } from '../pricing-store/pricing-store.service';

const UpdateInventoryBodySchema = z.object({
  stock: z.number().int().min(0).optional(),
  status: z
    .enum(['in_stock', 'out_of_stock', 'low_stock', 'backorder'])
    .optional(),
});

@ApiTags('inventory')
@Controller('api/v1/inventory')
export class InventoryController {
  constructor(private readonly store: PricingStoreService) {}

  @Get(':productId/:sellerId')
  @ApiOperation({ summary: 'Get inventory for a specific product-seller pair' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiParam({ name: 'sellerId', description: 'Seller ID' })
  getInventory(
    @Param('productId') productId: string,
    @Param('sellerId') sellerId: string,
  ) {
    const inventory = this.store.getInventory(productId, sellerId);
    if (!inventory) {
      throw new NotFoundException({ error: 'Inventory record not found', productId, sellerId });
    }
    return inventory;
  }

  @Patch(':productId/:sellerId')
  @ApiOperation({ summary: 'Update stock and/or status for a seller offer' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  @ApiParam({ name: 'sellerId', description: 'Seller ID' })
  updateInventory(
    @Param('productId') productId: string,
    @Param('sellerId') sellerId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateInventoryBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    if (parsed.data.stock === undefined && parsed.data.status === undefined) {
      throw new BadRequestException({ error: 'At least one of `stock` or `status` must be provided' });
    }

    const { stock, status } = parsed.data;
    const updates: { stock?: number; status?: Inventory['status'] } = {};
    if (stock !== undefined) updates.stock = stock;
    if (status !== undefined) updates.status = status;

    const updated = this.store.updateInventory(productId, sellerId, updates);
    if (!updated) {
      throw new NotFoundException({ error: 'Inventory record not found', productId, sellerId });
    }
    return updated;
  }
}
