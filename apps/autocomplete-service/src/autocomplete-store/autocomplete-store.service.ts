/**
 * AutocompleteStoreService — Step 3.4
 *
 * Hybrid autocomplete merging results from three sources:
 *
 *  • Elasticsearch  — product-name suggestions via completion suggester
 *  • Redis          — popular query suggestions via sorted set frequency ranking
 *  • Static data    — brand + category suggestions (always included; no external store needed)
 *
 * Graceful degradation:
 *  - ES unavailable  → product suggestions are omitted (no fake data served)
 *  - Redis unavailable → query suggestions are omitted (no fake data served)
 *  - Both unavailable → only brand + category static suggestions are returned
 */

import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { Redis } from 'ioredis';
import type { Suggestion } from '@shop/shared-types';
import { REDIS_CLIENT } from '../redis/redis.module';
import { RedisAutocompleteStore } from '../redis/redis-autocomplete-store';
import { EsAutocompleteStore } from '../elasticsearch/es-autocomplete-store';
import { STATIC_BRAND_CATEGORY } from '../data/brand-category.data';
import { QUERY_SEED_DATA } from '../data/query-seed.data';
import { filterByPrefix } from '../data/prefix-match';

const TYPE_PRIORITY: Record<Suggestion['type'], number> = {
  product: 4,
  brand: 3,
  category: 2,
  query: 1,
};

// Pre-sorted once at module load time
const SORTED_BRAND_CATEGORY = [...STATIC_BRAND_CATEGORY].sort(
  (a, b) => b.score - a.score,
);

@Injectable()
export class AutocompleteStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutocompleteStoreService.name);
  private redisStore: RedisAutocompleteStore | null = null;
  private esStore: EsAutocompleteStore | null = null;

  constructor(
    @Optional() @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    await this.initRedis();
    await this.initElasticsearch();
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  // ── Private init ───────────────────────────────────────────────────────────

  private async initRedis(): Promise<void> {
    if (!this.redis) {
      this.logger.log('Redis client not available — query suggestions will be omitted.');
      return;
    }

    try {
      await this.redis.ping(); // triggers lazy connection; throws if Redis is unreachable
      this.redisStore = new RedisAutocompleteStore(this.redis);

      if (await this.redisStore.isEmpty()) {
        this.logger.log('Redis autocomplete store empty — seeding popular queries…');
        await this.redisStore.seed(QUERY_SEED_DATA);
        this.logger.log(`Seeded ${QUERY_SEED_DATA.length} popular queries into Redis.`);
      } else {
        this.logger.log('Redis autocomplete store already seeded — skipping seed.');
      }

      this.logger.log('Redis autocomplete store ready.');
    } catch (err) {
      this.logger.warn(
        `Redis unavailable — query suggestions will be omitted. ` +
          `Error: ${(err as Error).message}`,
      );
      this.redisStore = null;
    }
  }

  private async initElasticsearch(): Promise<void> {
    const esUrl = process.env['ELASTICSEARCH_URL'];
    if (!esUrl) {
      this.logger.log('ELASTICSEARCH_URL not set — product suggestions will be omitted.');
      return;
    }

    try {
      const client = new Client({ node: esUrl });
      await client.ping();
      this.esStore = new EsAutocompleteStore(client);
      this.logger.log(`Connected to Elasticsearch at ${esUrl} — product suggestions use ES.`);
    } catch (err) {
      this.logger.warn(
        `Elasticsearch unavailable — product suggestions will be omitted. ` +
          `Error: ${(err as Error).message}`,
      );
      this.esStore = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Return up to `limit` suggestions for the given prefix.
   *
   * Sources (merged and deduped):
   *   1. Product names  — Elasticsearch completion suggester (omitted if ES is down)
   *   2. Popular queries — Redis sorted set by frequency (omitted if Redis is down)
   *   3. Brands/categories — static data (always present)
   *
   * Results are sorted: type priority (product > brand > category > query) then score.
   */
  async getSuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    const [products, queries] = await Promise.all([
      this.getProductSuggestions(prefix, limit),
      this.getQuerySuggestions(prefix, limit),
    ]);

    const brandCategory = filterByPrefix(SORTED_BRAND_CATEGORY, prefix, limit);
    const merged = [...products, ...queries, ...brandCategory];

    // Deduplicate by lowercased text
    const seen = new Set<string>();
    const deduped: Suggestion[] = [];
    for (const s of merged) {
      const key = s.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }

    deduped.sort((a, b) => {
      const typeDiff = TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type];
      return typeDiff !== 0 ? typeDiff : b.score - a.score;
    });

    return deduped.slice(0, limit);
  }

  /**
   * Record a completed search query to boost its popularity in Redis.
   * No-op when Redis is unavailable.
   */
  async recordQuery(query: string): Promise<void> {
    await this.redisStore?.recordQuery(query);
  }

  /** Which backends are active — used for health reporting. */
  get storeType(): 'hybrid' | 'redis' | 'elasticsearch' | 'static' {
    if (this.redisStore && this.esStore) return 'hybrid';
    if (this.redisStore) return 'redis';
    if (this.esStore) return 'elasticsearch';
    return 'static';
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getProductSuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    if (!this.esStore) return [];
    try {
      return await this.esStore.getSuggestions(prefix, limit);
    } catch (err) {
      this.logger.warn(`ES suggestion query failed: ${(err as Error).message}`);
      return [];
    }
  }

  private async getQuerySuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    if (!this.redisStore) return [];
    try {
      return await this.redisStore.getSuggestions(prefix, limit);
    } catch (err) {
      this.logger.warn(`Redis suggestion query failed: ${(err as Error).message}`);
      return [];
    }
  }
}

