import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CatalogStoreService } from '../catalog-store/catalog-store.service';

@ApiTags('categories')
@Controller('api/v1/categories')
export class CategoriesController {
  constructor(private readonly store: CatalogStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Get the full category tree' })
  async getCategories() {
    const categories = await this.store.getCategories();
    return { data: categories, count: categories.length };
  }
}
