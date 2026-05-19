// Filter domain types

export interface FilterDefinition {
  key: string;
  label: string;
  type: 'multiselect' | 'range' | 'rating' | 'boolean' | 'tree';
  filterable: boolean;
  options?: FilterOption[];
}

export interface FilterOption {
  value: string;
  label: string;
  count: number;
  children?: FilterOption[];
}

export interface PriceRange {
  min: number;
  max: number;
}

export interface RatingFilter {
  minRating: number;
  label: string;
}

export interface ActiveFilter {
  key: string;
  label: string;
  value: string | string[] | PriceRange;
  displayValue: string;
}

export interface CategoryNode {
  id: string;
  name: string;
  slug: string;
  path: string[];
  parentId: string | null;
  children: CategoryNode[];
  productCount: number;
}
