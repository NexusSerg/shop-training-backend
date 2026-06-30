import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SavedSearchStoreService } from '../saved-search-store/saved-search-store.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly store: SavedSearchStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      service: 'saved-search-service',
      store: this.store.mode,
      uptime: process.uptime(),
    };
  }
}
