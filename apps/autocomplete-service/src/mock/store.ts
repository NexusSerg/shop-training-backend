import type { Suggestion } from '@shop/shared-types';
import { STATIC_SUGGESTIONS } from './suggestions.js';

const TYPE_PRIORITY: Record<Suggestion['type'], number> = {
  product: 4,
  brand: 3,
  category: 2,
  query: 1,
};

/**
 * In-memory autocomplete store backed by a static suggestion list.
 *
 * Matching strategy:
 *   1. Case-insensitive prefix match on suggestion text.
 *   2. Results sorted by type priority (product > brand > category > query)
 *      then by descending score within each type.
 *
 * In Phase 3.4 this class is replaced by:
 *   - Redis Sorted Sets for popular query frequency ranking
 *   - Elasticsearch completion suggester for product-name matching
 */
export class AutocompleteStore {
  private readonly suggestions: Suggestion[];

  constructor(suggestions: Suggestion[] = STATIC_SUGGESTIONS) {
    // Pre-sort once at construction time so lookups are O(n) scan with
    // an already-ordered candidate list.
    this.suggestions = [...suggestions].sort((a, b) => {
      const typeDiff = TYPE_PRIORITY[b.type] - TYPE_PRIORITY[a.type];
      return typeDiff !== 0 ? typeDiff : b.score - a.score;
    });
  }

  /**
   * Return up to `limit` suggestions whose text starts with `prefix`.
   * An empty prefix returns the top suggestions overall.
   */
  getSuggestions(prefix: string, limit: number): Suggestion[] {
    const normalised = prefix.trim().toLowerCase();

    if (!normalised) {
      return this.suggestions.slice(0, limit);
    }

    const matches: Suggestion[] = [];
    for (const s of this.suggestions) {
      if (s.text.toLowerCase().startsWith(normalised)) {
        matches.push(s);
        if (matches.length === limit) break;
      }
    }
    return matches;
  }
}

/** Singleton used by route handlers. */
export const autocompleteStore = new AutocompleteStore();
