import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CatalogStoreModule } from '../catalog-store/catalog-store.module';

@Module({
  imports: [CatalogStoreModule],
  controllers: [CategoriesController],
})
export class CategoriesModule {}
