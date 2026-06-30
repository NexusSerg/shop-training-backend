import { Module } from '@nestjs/common';
import { SavedSearchModule } from './saved-search/saved-search.module';
import { SavedSearchStoreModule } from './saved-search-store/saved-search-store.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [SavedSearchStoreModule, SavedSearchModule],
  controllers: [HealthController],
})
export class AppModule {}
