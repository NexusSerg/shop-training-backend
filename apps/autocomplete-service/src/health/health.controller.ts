import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AutocompleteStoreService } from '../autocomplete-store/autocomplete-store.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly store: AutocompleteStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  check() {
    return {
      status: 'ok',
      service: 'autocomplete-service',
      uptime: process.uptime(),
      store: this.store.storeType,
    };
  }
}
