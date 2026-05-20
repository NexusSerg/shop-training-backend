import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { PricingStoreModule } from '../pricing-store/pricing-store.module';

@Module({
  imports: [PricingStoreModule],
  controllers: [InventoryController],
})
export class InventoryModule {}
