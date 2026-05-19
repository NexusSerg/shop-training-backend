// Product domain types

export type ProductStatus = 'active' | 'inactive' | 'draft' | 'deleted';

export interface ProductAttribute {
  key: string;
  value: string | string[] | number;
  label: string;
  filterable: boolean;
  searchable: boolean;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  brand: string;
  slug: string;
  status: ProductStatus;
  categoryId: string;
  categoryPath: string[];
  attributes: ProductAttribute[];
  images: ProductImage[];
  metaTitle: string;
  metaDescription: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProductImage {
  url: string;
  altText: string;
  width: number;
  height: number;
  isPrimary: boolean;
}

export interface ProductSummary {
  id: string;
  sku: string;
  name: string;
  slug: string;
  brand: string;
  categoryPath: string[];
  primaryImage: ProductImage | null;
  priceMin: number;
  priceMax: number;
  originalPrice: number;
  discountPercentage: number;
  inStock: boolean;
  sellerCount: number;
  ratingAvg: number;
  reviewCount: number;
  attributes: Record<string, string | string[] | number>;
  createdAt: Date;
}

/**
 * Elasticsearch document shape — matches index mapping
 */
export interface ProductDocument {
  product_id: string;
  sku: string;
  name: string;
  name_suggest: string;
  description: string;
  brand: string;

  category_id: string;
  category_path: string[];
  category_ids_hierarchy: string[];

  price_min: number;
  price_max: number;
  original_price: number;
  discount_percentage: number;

  in_stock: boolean;
  seller_count: number;

  rating_avg: number;
  review_count: number;
  sales_rank: number;
  click_through_rate: number;

  attributes: Record<string, string | string[] | number>;

  slug: string;
  meta_title: string;
  meta_description: string;

  created_at: Date;
  updated_at: Date;
  price_updated_at: Date;
}
