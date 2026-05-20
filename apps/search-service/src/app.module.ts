import { Module } from '@nestjs/common';
import { SearchModule } from './search/search.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [SearchModule],
  controllers: [HealthController],
})
export class AppModule {}
