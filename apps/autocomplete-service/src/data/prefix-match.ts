import type { Suggestion } from '@shop/shared-types';

/**
 * Case-insensitive prefix match over a pre-sorted suggestion list.
 * An empty prefix returns the first `limit` entries.
 */
export function filterByPrefix(
  suggestions: Suggestion[],
  prefix: string,
  limit: number,
): Suggestion[] {
  const normalised = prefix.trim().toLowerCase();
  if (!normalised) return suggestions.slice(0, limit);

  const matches: Suggestion[] = [];
  for (const s of suggestions) {
    if (s.text.toLowerCase().startsWith(normalised)) {
      matches.push(s);
      if (matches.length === limit) break;
    }
  }
  return matches;
}
