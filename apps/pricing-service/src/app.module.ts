import { Module } from '@nestjs/common';
import { PricingModule } from './pricing/pricing.module';
import { InventoryModule } from './inventory/inventory.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [PricingModule, InventoryModule],
  controllers: [HealthController],
})
export class AppModule {}
