import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import * as path from 'path';
import type { Pool } from 'pg';
import type { SavedSearch, SearchState } from '@shop/shared-types';
import { parseSearchParams } from '@shop/shared-utils';
import { SAVED_SEARCH_POOL } from '../db/postgres.module';

export interface CreateSavedSearchInput {
  name: string;
  urlState: string;
  searchState?: SearchState;
}

interface SavedSearchRow {
  id: string;
  user_id: string;
  name: string;
  url_state: string;
  search_state: SearchState;
  created_at: Date;
  updated_at: Date;
}

/**
 * Persists user search/filter combinations.
 *
 * Backend selection
 * ─────────────────────────────────────────────────────────────────────────
 *  PostgreSQL (via `pg`) when DATABASE_URL is configured (SAVED_SEARCH_POOL).
 *  In-memory Map fallback otherwise — keeps local dev and unit tests working
 *  without a running database (mirrors the search service ES/mock fallback).
 * ─────────────────────────────────────────────────────────────────────────
 */
@Injectable()
export class SavedSearchStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SavedSearchStoreService.name);
  private readonly memory = new Map<string, SavedSearch>();

  constructor(@Inject(SAVED_SEARCH_POOL) private readonly pool: Pool | null) {}

  get mode(): 'postgres' | 'memory' {
    return this.pool ? 'postgres' : 'memory';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    if (!this.pool) {
      this.logger.log('Saved-search store running in in-memory mode');
      return;
    }
    // Idempotent schema bootstrap so the service is usable without a separate
    // migration step in local dev (the db:migrate script applies the same SQL).
    const schemaPath = path.resolve(
      __dirname,
      '../../migrations/001_init_saved_searches.sql',
    );
    const sql = readFileSync(schemaPath, 'utf8');
    await this.pool.query(sql);
    this.logger.log('Connected to PostgreSQL — saved_searches table ready');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pool) await this.pool.end();
  }

  // ---------------------------------------------------------------------------
  // Operations
  // ---------------------------------------------------------------------------

  async list(userId: string): Promise<SavedSearch[]> {
    if (!this.pool) {
      return [...this.memory.values()]
        .filter((s) => s.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
    const { rows } = await this.pool.query<SavedSearchRow>(
      `SELECT id, user_id, name, url_state, search_state, created_at, updated_at
         FROM saved_searches
        WHERE user_id = $1
        ORDER BY created_at DESC`,
      [userId],
    );
    return rows.map(mapRow);
  }

  async get(userId: string, id: string): Promise<SavedSearch | undefined> {
    if (!this.pool) {
      const found = this.memory.get(id);
      return found && found.userId === userId ? found : undefined;
    }
    const { rows } = await this.pool.query<SavedSearchRow>(
      `SELECT id, user_id, name, url_state, search_state, created_at, updated_at
         FROM saved_searches
        WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    const row = rows[0];
    return row ? mapRow(row) : undefined;
  }

  async create(userId: string, input: CreateSavedSearchInput): Promise<SavedSearch> {
    const searchState = input.searchState ?? deriveSearchState(input.urlState);
    const now = new Date();
    const saved: SavedSearch = {
      id: randomUUID(),
      userId,
      name: input.name,
      urlState: input.urlState,
      searchState,
      createdAt: now,
      updatedAt: now,
    };

    if (!this.pool) {
      this.memory.set(saved.id, saved);
      return saved;
    }

    const { rows } = await this.pool.query<SavedSearchRow>(
      `INSERT INTO saved_searches (id, user_id, name, url_state, search_state, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
       RETURNING id, user_id, name, url_state, search_state, created_at, updated_at`,
      [
        saved.id,
        userId,
        saved.name,
        saved.urlState,
        JSON.stringify(searchState),
        now,
        now,
      ],
    );
    return mapRow(rows[0]!);
  }

  async delete(userId: string, id: string): Promise<boolean> {
    if (!this.pool) {
      const found = this.memory.get(id);
      if (!found || found.userId !== userId) return false;
      this.memory.delete(id);
      return true;
    }
    const result = await this.pool.query(
      `DELETE FROM saved_searches WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapRow(row: SavedSearchRow): SavedSearch {
  const searchState =
    typeof row.search_state === 'string'
      ? (JSON.parse(row.search_state) as SearchState)
      : row.search_state;
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    urlState: row.url_state,
    searchState,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Derive a SearchState from a stored URL query string (e.g. "q=laptop&brands=apple"). */
function deriveSearchState(urlState: string): SearchState {
  const qs = urlState.includes('?') ? urlState.slice(urlState.indexOf('?') + 1) : urlState;
  return parseSearchParams(new URLSearchParams(qs));
}
