import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { CatalogStoreModule } from '../catalog-store/catalog-store.module';

@Module({
  imports: [CatalogStoreModule],
  controllers: [ProductsController],
})
export class ProductsModule {}
