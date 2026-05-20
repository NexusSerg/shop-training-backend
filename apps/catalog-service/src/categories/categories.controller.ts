import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CatalogStoreService } from '../catalog-store/catalog-store.service';

@ApiTags('categories')
@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly store: CatalogStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Get the full category tree' })
  getCategories() {
    const categories = this.store.getCategories();
    return { data: categories, count: categories.length };
  }
}
