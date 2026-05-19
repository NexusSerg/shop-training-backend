// Pricing & Inventory domain types

export interface Price {
  amount: number;
  currency: string;
  formattedAmount: string;
}

export interface SellerOffer {
  sellerId: string;
  sellerName: string;
  price: Price;
  originalPrice: Price;
  discountPercentage: number;
  stock: number;
  status: 'in_stock' | 'out_of_stock' | 'low_stock' | 'backorder';
  deliveryDays: number | null;
  isFeatured: boolean;
}

export interface ProductPricing {
  productId: string;
  priceMin: number;
  priceMax: number;
  originalPrice: number;
  discountPercentage: number;
  currency: string;
  sellerCount: number;
  bestOffer: SellerOffer | null;
  offers: SellerOffer[];
  updatedAt: Date;
}

export interface Inventory {
  productId: string;
  sellerId: string;
  stock: number;
  reserved: number;
  available: number;
  status: 'in_stock' | 'out_of_stock' | 'low_stock' | 'backorder';
  updatedAt: Date;
}

export type PriceMap = Record<string, ProductPricing>;
