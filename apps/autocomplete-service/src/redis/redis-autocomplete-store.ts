/**
 * Redis-backed store for popular query autocomplete suggestions — Step 3.4
 *
 * Redis schema
 * ─────────────────────────────────────────────────────────────────────────
 *  autocomplete:popular  → Sorted Set  score=frequency  member=query_text
 *  autocomplete:queries  → Sorted Set  score=0          member=query_text
 *                          (lex set — enables ZRANGEBYLEX prefix matching)
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Prefix matching strategy:
 *  1. ZRANGEBYLEX on autocomplete:queries  → up to limit*5 lex matches
 *  2. ZMSCORE on autocomplete:popular      → fetch their popularity scores
 *  3. Sort by score descending, return top `limit`
 *
 * Empty-prefix: ZREVRANGE on autocomplete:popular returns top-N by score.
 */

import type { Redis } from 'ioredis';
import type { Suggestion } from '@shop/shared-types';

export class RedisAutocompleteStore {
  constructor(private readonly redis: Redis) {}

  // ── Public API ─────────────────────────────────────────────────────────────

  async getSuggestions(prefix: string, limit: number): Promise<Suggestion[]> {
    const normalised = prefix.trim().toLowerCase();
    let members: string[];

    if (!normalised) {
      // Return top by popularity when no prefix
      members = await this.redis.zrevrange('autocomplete:popular', 0, limit - 1);
    } else {
      // Lex-range prefix match, then rank by popularity score
      const candidates = await (this.redis as Redis).zrangebylex(
        'autocomplete:queries',
        `[${normalised}`,
        `[${normalised}\xff`,
        'LIMIT',
        0,
        limit * 5,
      );
      if (candidates.length === 0) return [];

      const rawScores = await this.redis.zmscore('autocomplete:popular', ...candidates);
      const withScores = candidates.map((member, i) => ({
        member,
        score: parseFloat(rawScores[i] ?? '0'),
      }));
      withScores.sort((a, b) => b.score - a.score);
      members = withScores.slice(0, limit).map((x) => x.member);
    }

    if (members.length === 0) return [];

    // Fetch popularity scores for the final member list
    const scores = await this.redis.zmscore('autocomplete:popular', ...members);
    return members.map((text, i) => ({
      text,
      type: 'query' as const,
      score: parseFloat(scores[i] ?? '0'),
    }));
  }

  /**
   * Increment the frequency of a recorded query by 1.
   * Adds the query to both sets if it doesn't exist yet.
   */
  async recordQuery(query: string): Promise<void> {
    const normalised = query.trim().toLowerCase();
    if (!normalised) return;
    const pipeline = this.redis.pipeline();
    pipeline.zincrby('autocomplete:popular', 1, normalised);
    pipeline.zadd('autocomplete:queries', 'NX', 0, normalised);
    await pipeline.exec();
  }

  /**
   * Seed the store with an initial set of popular queries.
   * Uses NX so existing entries are not overwritten.
   */
  async seed(queries: Array<{ text: string; score: number }>): Promise<void> {
    if (queries.length === 0) return;
    const pipeline = this.redis.pipeline();
    for (const { text, score } of queries) {
      const member = text.toLowerCase();
      pipeline.zadd('autocomplete:popular', 'NX', score, member);
      pipeline.zadd('autocomplete:queries', 'NX', 0, member);
    }
    await pipeline.exec();
  }

  async isEmpty(): Promise<boolean> {
    const count = await this.redis.zcard('autocomplete:popular');
    return count === 0;
  }
}
