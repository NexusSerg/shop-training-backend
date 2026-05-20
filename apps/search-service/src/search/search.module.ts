import { Module } from '@nestjs/common';
import { SearchController } from './search.controller';
import { SearchStoreModule } from '../search-store/search-store.module';

@Module({
  imports: [SearchStoreModule],
  controllers: [SearchController],
})
export class SearchModule {}
