import { Module } from '@nestjs/common';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { HealthController } from './health/health.controller';
import { CatalogStoreModule } from './catalog-store/catalog-store.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule, CatalogStoreModule, ProductsModule, CategoriesModule],
  controllers: [HealthController],
})
export class AppModule {}
