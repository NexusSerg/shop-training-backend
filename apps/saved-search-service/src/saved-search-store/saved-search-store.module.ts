import { Module } from '@nestjs/common';
import { SavedSearchStoreService } from './saved-search-store.service';
import { PostgresModule } from '../db/postgres.module';

@Module({
  imports: [PostgresModule],
  providers: [SavedSearchStoreService],
  exports: [SavedSearchStoreService],
})
export class SavedSearchStoreModule {}
