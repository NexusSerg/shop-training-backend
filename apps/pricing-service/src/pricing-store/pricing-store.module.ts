import { Module } from '@nestjs/common';
import { PricingStoreService } from './pricing-store.service';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [RedisModule],
  providers: [PricingStoreService],
  exports: [PricingStoreService],
})
export class PricingStoreModule {}
