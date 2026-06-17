import { Module } from '@nestjs/common';
import { AutocompleteModule } from './autocomplete/autocomplete.module';
import { AutocompleteStoreModule } from './autocomplete-store/autocomplete-store.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [AutocompleteModule, AutocompleteStoreModule],
  controllers: [HealthController],
})
export class AppModule {}
