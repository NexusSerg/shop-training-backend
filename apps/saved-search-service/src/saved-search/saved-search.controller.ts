import { Controller, Get, HttpException } from '@nestjs/common';

@Controller('api/v1/saved-searches')
export class SavedSearchController {
  @Get()
  list() {
    throw new HttpException(
      { error: 'Not implemented yet — coming in Step 3.5' },
      501,
    );
  }
}
