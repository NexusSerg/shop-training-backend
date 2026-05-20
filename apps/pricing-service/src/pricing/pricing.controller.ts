import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam } from '@nestjs/swagger';
import { z } from 'zod';
import { PricingStoreService } from '../pricing-store/pricing-store.service';

const BulkPricingBodySchema = z.object({
  productIds: z
    .array(z.string().min(1))
    .min(1)
    .max(100, 'Maximum 100 product IDs per request'),
});

@ApiTags('pricing')
@Controller('api/v1/pricing')
export class PricingController {
  constructor(private readonly store: PricingStoreService) {}

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bulk-fetch pricing for multiple products' })
  bulkPricing(@Body() body: unknown) {
    const parsed = BulkPricingBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const start = Date.now();
    const priceMap = this.store.getBulkPricing(parsed.data.productIds);
    const took = Date.now() - start;

    return { data: priceMap, count: Object.keys(priceMap).length, took };
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Get pricing and seller offers for a product' })
  @ApiParam({ name: 'productId', description: 'Product ID' })
  getPricing(@Param('productId') productId: string) {
    const pricing = this.store.getPricing(productId);
    if (!pricing) {
      throw new NotFoundException({ error: 'Product not found', productId });
    }
    return pricing;
  }
}
