/**
 * Static brand and category suggestions.
 *
 * These are served directly by the autocomplete service — no external
 * store is required for these types. Brand/category data is stable enough
 * to live here; high-frequency updates would warrant a DB-backed source.
 */
import type { Suggestion } from '@shop/shared-types';

export const BRAND_SUGGESTIONS: Suggestion[] = [
  { text: 'Apple', type: 'brand', score: 100 },
  { text: 'Samsung', type: 'brand', score: 98 },
  { text: 'Sony', type: 'brand', score: 95 },
  { text: 'Nike', type: 'brand', score: 94 },
  { text: 'Adidas', type: 'brand', score: 92 },
  { text: 'Dell', type: 'brand', score: 91 },
  { text: 'HP', type: 'brand', score: 90 },
  { text: 'LG', type: 'brand', score: 88 },
  { text: 'Lenovo', type: 'brand', score: 88 },
  { text: 'ASUS', type: 'brand', score: 86 },
  { text: 'Bose', type: 'brand', score: 87 },
  { text: 'Philips', type: 'brand', score: 85 },
  { text: 'Reebok', type: 'brand', score: 84 },
  { text: 'Under Armour', type: 'brand', score: 82 },
  { text: 'Panasonic', type: 'brand', score: 80 },
];

export const CATEGORY_SUGGESTIONS: Suggestion[] = [
  { text: 'Electronics', type: 'category', score: 100 },
  { text: 'Laptops', type: 'category', score: 95 },
  { text: 'Smartphones', type: 'category', score: 94 },
  { text: 'Gaming', type: 'category', score: 89 },
  { text: 'Headphones', type: 'category', score: 90 },
  { text: 'Tablets', type: 'category', score: 88 },
  { text: 'Cameras', type: 'category', score: 85 },
  { text: 'Smart Watches', type: 'category', score: 84 },
  { text: 'Gaming Accessories', type: 'category', score: 83 },
  { text: 'Monitors', type: 'category', score: 82 },
  { text: 'Keyboards', type: 'category', score: 80 },
  { text: 'Clothing', type: 'category', score: 78 },
  { text: 'Footwear', type: 'category', score: 77 },
  { text: 'Sports & Outdoors', type: 'category', score: 76 },
  { text: 'Home & Garden', type: 'category', score: 75 },
];

/** All static suggestions for use in prefix-match helpers. */
export const STATIC_BRAND_CATEGORY: Suggestion[] = [
  ...BRAND_SUGGESTIONS,
  ...CATEGORY_SUGGESTIONS,
];
