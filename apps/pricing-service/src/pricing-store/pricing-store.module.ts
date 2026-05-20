import { Module } from '@nestjs/common';
import { PricingStoreService } from './pricing-store.service';

@Module({
  providers: [PricingStoreService],
  exports: [PricingStoreService],
})
export class PricingStoreModule {}
