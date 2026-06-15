import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';
import type { SearchRequest, SearchResponse, Facets } from '@shop/shared-types';
import { SearchStore } from '../mock/store';
import { ElasticsearchSearchStore } from '../elasticsearch/es-search-store';
import { ensureProductsIndex } from '../elasticsearch/index-mapping';

/**
 * SearchStoreService — Step 3.3
 *
 * Uses Elasticsearch when `ELASTICSEARCH_URL` is configured and reachable.
 * Falls back to the in-memory mock store when:
 *  - ELASTICSEARCH_URL is not set (e.g. unit tests, local dev without ES)
 *  - ES ping fails on startup (graceful degradation)
 */
@Injectable()
export class SearchStoreService implements OnModuleInit {
  private readonly logger = new Logger(SearchStoreService.name);
  private readonly mockStore = new SearchStore();
  private esStore: ElasticsearchSearchStore | null = null;

  async onModuleInit(): Promise<void> {
    const esUrl = process.env['ELASTICSEARCH_URL'];
    if (!esUrl) {
      this.logger.log('ELASTICSEARCH_URL not set — using in-memory mock store.');
      return;
    }

    try {
      const client = new Client({ node: esUrl });
      await client.info();
      await ensureProductsIndex(client);
      this.esStore = new ElasticsearchSearchStore(client);
      this.logger.log(`Connected to Elasticsearch at ${esUrl} — using ES search store.`);
    } catch (err) {
      this.logger.warn(
        `Failed to connect to Elasticsearch (${esUrl}) — falling back to mock store. ` +
          `Error: ${(err as Error).message}`,
      );
    }
  }

  search(req: SearchRequest = {}): Promise<SearchResponse> | SearchResponse {
    if (this.esStore) return this.esStore.search(req);
    return this.mockStore.search(req);
  }

  getFacets(q = ''): Promise<Facets> | Facets {
    if (this.esStore) return this.esStore.getFacets(q);
    return this.mockStore.getFacets(q);
  }

  /** Indicates which backing store is active — exposed for health checks. */
  get storeType(): 'elasticsearch' | 'mock' {
    return this.esStore ? 'elasticsearch' : 'mock';
  }
}
