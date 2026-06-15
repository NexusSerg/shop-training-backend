/**
 * AutocompleteStoreService — Step 3.4
 *
 * Hybrid autocomplete that merges results from three sources:
 *
 *  • Elasticsearch  — product-name suggestions via completion suggester
 *  • Redis          — popular query suggestions via sorted set frequency ranking
 *  • Mock store     — brand + category suggestions (static, always included)
 *                     also used as full fallback when ES and Redis are unavailable
 *
 * Falls back gracefully to the in-memory mock store when
 *  - REDIS_HOST / REDIS_PORT are not set, or Redis is unreachable
 *  - ELASTICSEARCH_URL is not set, or ES is unreachable
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
import { AutocompleteStore } from '../mock/store';
import { STATIC_SUGGESTIONS } from '../mock/suggestions';
import { RedisAutocompleteStore } from '../redis/redis-autocomplete-store';
import { EsAutocompleteStore } from '../elasticsearch/es-autocomplete-store';

const TYPE_PRIORITY: Record<Suggestion['type'], number> = {
  product: 4,
  brand: 3,
  category: 2,
  query: 1,
};

@Injectable()
export class AutocompleteStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AutocompleteStoreService.name);
  private readonly mockStore = new AutocompleteStore();
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
      this.logger.log('Redis client not available — popular-query suggestions use mock store.');
      return;
    }

    try {
      await this.redis.ping(); // triggers lazy connection; throws if Redis is unreachable
      this.redisStore = new RedisAutocompleteStore(this.redis);

      if (await this.redisStore.isEmpty()) {
        this.logger.log('Redis autocomplete store empty — seeding from static suggestions…');
        const queries = STATIC_SUGGESTIONS
          .filter((s) => s.type === 'query')
          .map((s) => ({ text: s.text, score: s.score }));
        await this.redisStore.seed(queries);
        this.logger.log(`Seeded ${queries.length} popular queries into Redis.`);
      } else {
        this.logger.log('Redis autocomplete store already seeded — skipping seed.');
      }

      this.logger.log('Redis autocomplete store ready.');
    } catch (err) {
      this.logger.warn(
        `Redis unavailable — falling back to mock for query suggestions. ` +
          `Error: ${(err as Error).message}`,
      );
      this.redisStore = null;
    }
  }

  private async initElasticsearch(): Promise<void> {
    const esUrl = process.env['ELASTICSEARCH_URL'];
    if (!esUrl) {
      this.logger.log('ELASTICSEARCH_URL not set — product suggestions use mock store.');
      return;
    }

    try {
      const client = new Client({ node: esUrl });
      await client.ping();
      this.esStore = new EsAutocompleteStore(client);
      this.logger.log(`Connected to Elasticsearch at ${esUrl} — product suggestions use ES.`);
    } catch (err) {
      this.logger.warn(
        `Elasticsearch unavailable — falling back to mock for product suggestions. ` +
          `Error: ${(err as Error).message}`,
      );
      this.esStore = null;
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Return up to `limit` suggestions for the given prefix.
   * Merges products (ES/mock), queries (Redis/mock), brands (mock), categories (mock).
   * Results are ranked by type priority then score.
   */
  async getSuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    const useMockFully = !this.redisStore && !this.esStore;
    if (useMockFully) {
      return this.mockStore.getSuggestions(prefix, limit);
    }

    // Gather from each source in parallel
    const [products, queries, staticSuggestions] = await Promise.all([
      this.getProductSuggestions(prefix, limit),
      this.getQuerySuggestions(prefix, limit),
      Promise.resolve(this.getStaticSuggestions(prefix)),
    ]);

    const merged = [...products, ...queries, ...staticSuggestions];

    // Deduplicate by lowercased text, keeping the higher-priority entry
    const seen = new Set<string>();
    const deduped: Suggestion[] = [];
    for (const s of merged) {
      const key = s.text.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(s);
      }
    }

    // Sort: type priority desc, then score desc
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
  get storeType(): 'hybrid' | 'redis' | 'elasticsearch' | 'mock' {
    if (this.redisStore && this.esStore) return 'hybrid';
    if (this.redisStore) return 'redis';
    if (this.esStore) return 'elasticsearch';
    return 'mock';
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async getProductSuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    if (this.esStore) {
      try {
        return await this.esStore.getSuggestions(prefix, limit);
      } catch (err) {
        this.logger.warn(`ES suggestion query failed: ${(err as Error).message}`);
      }
    }
    // Fallback: product suggestions from mock store
    return this.mockStore
      .getSuggestions(prefix, limit * 2)
      .filter((s) => s.type === 'product')
      .slice(0, limit);
  }

  private async getQuerySuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    if (this.redisStore) {
      try {
        return await this.redisStore.getSuggestions(prefix, limit);
      } catch (err) {
        this.logger.warn(`Redis suggestion query failed: ${(err as Error).message}`);
      }
    }
    // Fallback: query suggestions from mock store
    return this.mockStore
      .getSuggestions(prefix, limit * 2)
      .filter((s) => s.type === 'query')
      .slice(0, limit);
  }

  /** Brand + category suggestions always come from the static mock store. */
  private getStaticSuggestions(prefix: string): Suggestion[] {
    return this.mockStore
      .getSuggestions(prefix, 40)
      .filter((s) => s.type === 'brand' || s.type === 'category');
  }
}

