import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthController } from './health/health.controller';
import { CatalogStoreModule } from './catalog-store/catalog-store.module';

@Module({
  imports: [CatalogStoreModule, ProductsModule, CategoriesModule],
  controllers: [HealthController],
})
export class AppModule {}
