import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { PricingStoreModule } from '../pricing-store/pricing-store.module';

@Module({
  imports: [PricingStoreModule],
  controllers: [PricingController],
})
export class PricingModule {}
