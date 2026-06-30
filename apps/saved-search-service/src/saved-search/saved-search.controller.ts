import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiHeader } from '@nestjs/swagger';
import { z } from 'zod';
import type { SavedSearch } from '@shop/shared-types';
import { SavedSearchStoreService } from '../saved-search-store/saved-search-store.service';

const CreateBodySchema = z.object({
  name: z.string().min(1).max(200),
  urlState: z.string().min(1).max(4000),
});

/** Auth is out of scope (Step 3.5) — user identity comes from the x-user-id header stub. */
function resolveUserId(header: string | undefined): string {
  const id = header?.trim();
  return id && id.length > 0 ? id : 'anonymous';
}

/** Build a shareable, state-restoring URL from the stored query string. */
function toRedirectUrl(urlState: string): string {
  if (urlState.startsWith('http') || urlState.startsWith('/')) return urlState;
  return `/search?${urlState.replace(/^\?/, '')}`;
}

function withUrl(saved: SavedSearch): SavedSearch & { redirectUrl: string } {
  return { ...saved, redirectUrl: toRedirectUrl(saved.urlState) };
}

@ApiTags('saved-searches')
@ApiHeader({ name: 'x-user-id', required: false, description: 'User identity stub (auth out of scope)' })
@Controller('api/v1/saved-searches')
export class SavedSearchController {
  constructor(private readonly store: SavedSearchStoreService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's saved searches" })
  async list(@Headers('x-user-id') userIdHeader?: string) {
    const userId = resolveUserId(userIdHeader);
    const data = await this.store.list(userId);
    return { data: data.map(withUrl), count: data.length };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a saved search and its shareable redirect URL' })
  @ApiParam({ name: 'id', description: 'Saved search ID' })
  async findOne(@Param('id') id: string, @Headers('x-user-id') userIdHeader?: string) {
    const userId = resolveUserId(userIdHeader);
    const saved = await this.store.get(userId, id);
    if (!saved) {
      throw new NotFoundException({ error: 'Saved search not found', id });
    }
    return withUrl(saved);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Save the current search/filter URL state' })
  async create(@Body() body: unknown, @Headers('x-user-id') userIdHeader?: string) {
    const parsed = CreateBodySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }
    const userId = resolveUserId(userIdHeader);
    const saved = await this.store.create(userId, parsed.data);
    return withUrl(saved);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a saved search' })
  @ApiParam({ name: 'id', description: 'Saved search ID' })
  async remove(@Param('id') id: string, @Headers('x-user-id') userIdHeader?: string) {
    const userId = resolveUserId(userIdHeader);
    const deleted = await this.store.delete(userId, id);
    if (!deleted) {
      throw new NotFoundException({ error: 'Saved search not found', id });
    }
  }
}
