import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SearchStoreService } from '../search-store/search-store.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly store: SearchStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      service: 'search-service',
      uptime: process.uptime(),
      store: this.store.storeType,
    };
  }
}
