import type { Suggestion } from '@shop/shared-types';
import { STATIC_BRAND_CATEGORY } from '../data/brand-category.data';
import { QUERY_SEED_DATA } from '../data/query-seed.data';

/**
 * Combined suggestion list used by the mock store in tests.
 *
 * Brand/category data is imported from src/data/ (the production source of truth).
 * Query suggestions are derived from the Redis seed data.
 * Product entries are test-only fixtures that stand in for Elasticsearch results.
 */
export const STATIC_SUGGESTIONS: Suggestion[] = [
  // --- popular search queries (from Redis seed data) ---
  ...QUERY_SEED_DATA.map(({ text, score }) => ({
    text,
    type: 'query' as const,
    score,
  })),

  // --- brands and categories (from production data) ---
  ...STATIC_BRAND_CATEGORY,

  // --- product fixtures (test-only stand-ins for Elasticsearch results) ---

  // --- product suggestions (representative samples) ---
  {
    text: 'Apple MacBook Pro 14',
    type: 'product',
    score: 95,
    payload: { productId: 'p-mock-apple-macbook-pro', slug: 'apple-macbook-pro-14' },
  },
  {
    text: 'Apple AirPods Pro',
    type: 'product',
    score: 93,
    payload: { productId: 'p-mock-apple-airpods', slug: 'apple-airpods-pro' },
  },
  {
    text: 'Samsung Galaxy S24',
    type: 'product',
    score: 92,
    payload: { productId: 'p-mock-samsung-galaxy-s24', slug: 'samsung-galaxy-s24' },
  },
  {
    text: 'Samsung 55" 4K QLED TV',
    type: 'product',
    score: 88,
    payload: { productId: 'p-mock-samsung-tv-55', slug: 'samsung-55-4k-qled-tv' },
  },
  {
    text: 'Sony WH-1000XM5 Headphones',
    type: 'product',
    score: 91,
    payload: { productId: 'p-mock-sony-wh1000xm5', slug: 'sony-wh-1000xm5-headphones' },
  },
  {
    text: 'Nike Air Max 270',
    type: 'product',
    score: 90,
    payload: { productId: 'p-mock-nike-air-max-270', slug: 'nike-air-max-270' },
  },
  {
    text: 'Adidas Ultraboost 22',
    type: 'product',
    score: 87,
    payload: { productId: 'p-mock-adidas-ultraboost-22', slug: 'adidas-ultraboost-22' },
  },
  {
    text: 'Dell XPS 15 Laptop',
    type: 'product',
    score: 89,
    payload: { productId: 'p-mock-dell-xps-15', slug: 'dell-xps-15-laptop' },
  },
  {
    text: 'Lenovo ThinkPad X1 Carbon',
    type: 'product',
    score: 86,
    payload: { productId: 'p-mock-lenovo-thinkpad-x1', slug: 'lenovo-thinkpad-x1-carbon' },
  },
  {
    text: 'ASUS ROG Gaming Laptop',
    type: 'product',
    score: 84,
    payload: { productId: 'p-mock-asus-rog', slug: 'asus-rog-gaming-laptop' },
  },
];
