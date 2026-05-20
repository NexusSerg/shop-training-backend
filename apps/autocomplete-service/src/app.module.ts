import { Module } from '@nestjs/common';
import { AutocompleteModule } from './autocomplete/autocomplete.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AutocompleteModule],
  controllers: [HealthController],
})
export class AppModule {}
