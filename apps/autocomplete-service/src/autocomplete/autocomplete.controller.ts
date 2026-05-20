import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import type { AutocompleteResponse } from '@shop/shared-types';
import { AutocompleteStoreService } from '../autocomplete-store/autocomplete-store.service';

const MAX_LIMIT = 20;
const DEFAULT_LIMIT = 10;

const QuerySchema = z.object({
  q: z.string().max(200).optional(),
  limit: z
    .string()
    .optional()
    .transform((v) => (v !== undefined ? parseInt(v, 10) : DEFAULT_LIMIT))
    .pipe(z.number().int().min(1).max(MAX_LIMIT)),
  type: z.enum(['query', 'product', 'brand', 'category']).optional(),
});

@ApiTags('autocomplete')
@Controller('api/v1/autocomplete')
export class AutocompleteController {
  constructor(private readonly store: AutocompleteStoreService) {}

  @Get()
  @ApiOperation({ summary: 'Get search suggestions' })
  @ApiQuery({ name: 'q', required: false, description: 'Search prefix' })
  @ApiQuery({ name: 'limit', required: false, description: `Number of suggestions (1-${MAX_LIMIT}, default ${DEFAULT_LIMIT})` })
  @ApiQuery({ name: 'type', required: false, enum: ['query', 'product', 'brand', 'category'], description: 'Filter by suggestion type' })
  getSuggestions(
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
  ): AutocompleteResponse {
    const parsed = QuerySchema.safeParse({ q, limit, type });
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const { q: prefix, limit: parsedLimit, type: suggestionType } = parsed.data;
    const start = Date.now();

    // Fetch more than requested when type filtering so we can still return `limit` results
    const fetchLimit = suggestionType ? MAX_LIMIT : parsedLimit;
    let suggestions = this.store.getSuggestions(prefix ?? '', fetchLimit);

    if (suggestionType) {
      suggestions = suggestions.filter((s) => s.type === suggestionType).slice(0, parsedLimit);
    }

    return { suggestions, took: Date.now() - start };
  }
}
