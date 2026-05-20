import { Module } from '@nestjs/common';
import { CatalogStoreService } from './catalog-store.service';

@Module({
  providers: [CatalogStoreService],
  exports: [CatalogStoreService],
})
export class CatalogStoreModule {}
