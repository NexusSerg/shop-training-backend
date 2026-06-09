import { Module } from '@nestjs/common';
import { CatalogStoreService } from './catalog-store.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [CatalogStoreService],
  exports: [CatalogStoreService],
})
export class CatalogStoreModule {}
