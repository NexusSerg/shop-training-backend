import { Module } from '@nestjs/common';
import { SearchModule } from './search/search.module';
import { HealthController } from './health/health.controller';
import { SearchStoreModule } from './search-store/search-store.module';

@Module({
  imports: [SearchStoreModule, SearchModule],
  controllers: [HealthController],
})
export class AppModule {}
