import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { z } from 'zod';
import type { SearchRequest, PerPageOption, SortOption } from '@shop/shared-types';
import { SearchStoreService } from '../search-store/search-store.service';

const VALID_PER_PAGE = [24, 48, 96] as const;
const VALID_SORT = [
  'relevance',
  'price_asc',
  'price_desc',
  'rating',
  'newest',
  'popularity',
] as const;

const RawSearchQuerySchema = z.object({
  q: z.string().max(500).optional(),
  brands: z.string().optional(),
  price_min: z.coerce.number().nonnegative().optional(),
  price_max: z.coerce.number().nonnegative().optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  category: z.string().optional(),
  in_stock: z.string().optional(),
  sort: z.enum(VALID_SORT).optional(),
  page: z.coerce.number().int().positive().optional(),
  per_page: z.coerce.number().int().optional(),
});

type RawSearchQuery = z.infer<typeof RawSearchQuerySchema>;

function buildSearchRequest(
  parsed: RawSearchQuery,
  rawQuery: Record<string, string>,
): SearchRequest {
  const rawPerPage = parsed.per_page ?? 24;
  const perPage: PerPageOption = (
    VALID_PER_PAGE.includes(rawPerPage as PerPageOption) ? rawPerPage : 24
  ) as PerPageOption;

  const sort: SortOption = parsed.sort ?? 'relevance';

  const req: SearchRequest = { sort, page: parsed.page ?? 1, perPage };

  if (parsed.q) req.q = parsed.q;
  if (parsed.brands) req.brands = parsed.brands.split(',').filter(Boolean);
  if (parsed.price_min !== undefined) req.priceMin = parsed.price_min;
  if (parsed.price_max !== undefined) req.priceMax = parsed.price_max;
  if (parsed.rating !== undefined) req.rating = parsed.rating;
  if (parsed.category) req.categoryPath = parsed.category.split('/').filter(Boolean);
  if (parsed.in_stock === 'true') req.inStockOnly = true;

  const attributes: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(rawQuery)) {
    if (key.startsWith('attr_') && value) {
      const attrKey = key.slice(5);
      attributes[attrKey] = value.split(',').filter(Boolean);
    }
  }
  if (Object.keys(attributes).length > 0) req.attributes = attributes;

  return req;
}

@ApiTags('search')
@Controller('api/v1/search')
export class SearchController {
  constructor(private readonly store: SearchStoreService) {}

  // Facets route declared BEFORE any potential /:param routes to avoid routing conflicts
  @Get('facets')
  @ApiOperation({ summary: 'Get facets for a text query' })
  @ApiQuery({ name: 'q', required: false, description: 'Full-text search query' })
  getFacets(@Query('q') q?: string) {
    const start = Date.now();
    const facets = this.store.getFacets(q ?? '');
    return { facets, took: Date.now() - start, query: q ?? '' };
  }

  @Get()
  @ApiOperation({ summary: 'Search products' })
  @ApiQuery({ name: 'q', required: false, description: 'Full-text search query' })
  @ApiQuery({ name: 'brands', required: false, description: 'Comma-separated brand names' })
  @ApiQuery({ name: 'price_min', required: false, description: 'Minimum price (inclusive)' })
  @ApiQuery({ name: 'price_max', required: false, description: 'Maximum price (inclusive)' })
  @ApiQuery({ name: 'rating', required: false, description: 'Minimum average rating (1-5)' })
  @ApiQuery({ name: 'category', required: false, description: 'Slash-separated category path' })
  @ApiQuery({ name: 'in_stock', required: false, description: 'Filter to in-stock only' })
  @ApiQuery({ name: 'sort', required: false, enum: VALID_SORT, description: 'Sort order' })
  @ApiQuery({ name: 'page', required: false, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'per_page', required: false, enum: [...VALID_PER_PAGE], description: 'Results per page' })
  search(@Query() query: Record<string, string>) {
    const parsed = RawSearchQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({ error: 'Validation failed', details: parsed.error.flatten() });
    }

    const searchReq = buildSearchRequest(parsed.data, query);
    return this.store.search(searchReq);
  }
}
