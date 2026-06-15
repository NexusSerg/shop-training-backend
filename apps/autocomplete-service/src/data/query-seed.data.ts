/**
 * Initial seed data for the Redis popular-query sorted set.
 *
 * These entries are written to Redis once on first startup (idempotent).
 * Scores reflect relative popularity; over time live query recording via
 * `AutocompleteStoreService.recordQuery()` will adjust the rankings.
 */
export const QUERY_SEED_DATA: Array<{ text: string; score: number }> = [
  { text: 'laptop', score: 100 },
  { text: 'iphone', score: 99 },
  { text: 'headphones', score: 97 },
  { text: 'smartwatch', score: 96 },
  { text: 'tablet', score: 94 },
  { text: 'running shoes', score: 93 },
  { text: 'monitor', score: 92 },
  { text: 'speaker bluetooth', score: 91 },
  { text: 'sneakers nike', score: 91 },
  { text: 'headphones wireless', score: 91 },
  { text: 'laptop gaming', score: 95 },
  { text: 'smartwatch apple', score: 89 },
  { text: 'tablet ipad', score: 89 },
  { text: 'tv 4k', score: 90 },
  { text: 'sneakers adidas', score: 88 },
  { text: 'keyboard mechanical', score: 88 },
  { text: 'phone samsung', score: 88 },
  { text: 'headphones bluetooth', score: 87 },
  { text: 'mouse gaming', score: 87 },
  { text: 'monitor 4k', score: 86 },
  { text: 'camera dslr', score: 85 },
  { text: 'running shoes women', score: 85 },
  { text: 'iphone case', score: 90 },
  { text: 'running shoes men', score: 83 },
  { text: 'smartwatch samsung', score: 83 },
  { text: 'laptop bag', score: 82 },
  { text: 'keyboard wireless', score: 82 },
  { text: 'tablet samsung', score: 82 },
  { text: 'tv samsung 55 inch', score: 82 },
  { text: 'mouse wireless', score: 81 },
  { text: 'camera mirrorless', score: 80 },
  { text: 'headphones noise cancelling', score: 80 },
  { text: 'monitor ultrawide', score: 79 },
  { text: 'laptop charger', score: 76 },
  { text: 'iphone screen protector', score: 75 },
  { text: 't-shirt cotton', score: 75 },
  { text: 'phone case', score: 84 },
  { text: 'iphone charger', score: 84 },
  { text: 'laptop stand', score: 88 },
  { text: 'laptop cooling pad', score: 70 },
];
