import { Module } from '@nestjs/common';
import { SearchStoreService } from './search-store.service';

@Module({
  providers: [SearchStoreService],
  exports: [SearchStoreService],
})
export class SearchStoreModule {}
