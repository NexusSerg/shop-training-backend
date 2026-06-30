import { Module, Logger } from '@nestjs/common';
import { Pool } from 'pg';

/**
 * Injection token for the PostgreSQL connection pool.
 *
 * The factory returns `null` when `DATABASE_URL` is not configured — in that
 * case the SavedSearchStoreService transparently falls back to an in-memory
 * store. This keeps local dev and unit tests working without a running
 * PostgreSQL instance (mirrors the ES/mock fallback used by the search service).
 */
export const SAVED_SEARCH_POOL = 'SAVED_SEARCH_POOL';

@Module({
  providers: [
    {
      provide: SAVED_SEARCH_POOL,
      useFactory: (): Pool | null => {
        const url = process.env['DATABASE_URL'];
        if (!url) {
          Logger.warn(
            'DATABASE_URL not set — using in-memory saved-search store',
            'PostgresModule',
          );
          return null;
        }
        return new Pool({ connectionString: url, max: 10 });
      },
    },
  ],
  exports: [SAVED_SEARCH_POOL],
})
export class PostgresModule {}
