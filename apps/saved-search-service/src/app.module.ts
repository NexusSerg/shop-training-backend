import { Module } from '@nestjs/common';
import { SavedSearchModule } from './saved-search/saved-search.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [SavedSearchModule],
  controllers: [HealthController],
})
export class AppModule {}
