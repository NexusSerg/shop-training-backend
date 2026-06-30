import { Module } from '@nestjs/common';
import { SavedSearchController } from './saved-search.controller';
import { SavedSearchStoreModule } from '../saved-search-store/saved-search-store.module';

@Module({
  imports: [SavedSearchStoreModule],
  controllers: [SavedSearchController],
})
export class SavedSearchModule {}
