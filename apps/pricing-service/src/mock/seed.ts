import { faker } from '@faker-js/faker';
import type { Price, ProductPricing, SellerOffer, Inventory } from '@shop/shared-types';

// ---------------------------------------------------------------------------
// Seller fixtures (stable identifiers for mock data)
// ---------------------------------------------------------------------------

export const MOCK_SELLERS = [
  { id: 's-001', name: 'TechWorld' },
  { id: 's-002', name: 'MegaStore' },
  { id: 's-003', name: 'ValueShop' },
  { id: 's-004', name: 'PrimeDeal' },
  { id: 's-005', name: 'QuickBuy' },
] as const;

const CURRENCY = 'USD';

function makePrice(amount: number): Price {
  return {
    amount,
    currency: CURRENCY,
    formattedAmount: `$${amount.toFixed(2)}`,
  };
}

function deriveStockStatus(stock: number): SellerOffer['status'] {
  if (stock === 0) return 'out_of_stock';
  if (stock < 10) return 'low_stock';
  return 'in_stock';
}

function generateOffer(
  sellerId: string,
  sellerName: string,
): { offer: SellerOffer; inventory: Omit<Inventory, 'productId'> } {
  const price = parseFloat(faker.commerce.price({ min: 10, max: 2000 }));
  const hasDiscount = faker.datatype.boolean(0.4);
  const originalPrice = hasDiscount
    ? parseFloat(
        (price * (1 + faker.number.float({ min: 0.1, max: 0.5 }))).toFixed(2),
      )
    : price;
  const discountPercentage = hasDiscount
    ? Math.round(((originalPrice - price) / originalPrice) * 100)
    : 0;

  const stock = faker.number.int({ min: 0, max: 200 });
  const reserved = faker.number.int({ min: 0, max: Math.min(5, stock) });
  const available = stock - reserved;
  const status = deriveStockStatus(stock);

  const offer: SellerOffer = {
    sellerId,
    sellerName,
    price: makePrice(price),
    originalPrice: makePrice(originalPrice),
    discountPercentage,
    stock,
    status,
    deliveryDays: status === 'out_of_stock' ? null : faker.number.int({ min: 1, max: 7 }),
    isFeatured: faker.datatype.boolean(0.2),
  };

  const inventory: Omit<Inventory, 'productId'> = {
    sellerId,
    stock,
    reserved,
    available,
    status,
    updatedAt: faker.date.recent({ days: 1 }),
  };

  return { offer, inventory };
}

export interface SeedData {
  pricings: ProductPricing[];
  inventories: Inventory[];
}

/**
 * Generate deterministic mock pricing and inventory data.
 * Uses a fixed faker seed so data is stable across restarts.
 *
 * Product IDs follow the pattern `p-mock-NNN` (e.g., `p-mock-001`).
 * These will be replaced by real PostgreSQL product IDs in Phase 3.
 */
export function seedPricingData(count = 100): SeedData {
  faker.seed(42);

  const pricings: ProductPricing[] = [];
  const inventories: Inventory[] = [];

  for (let i = 1; i <= count; i++) {
    const productId = `p-mock-${String(i).padStart(3, '0')}`;

    // Each product is offered by 1–3 randomly chosen sellers
    const sellerCount = faker.number.int({ min: 1, max: 3 });
    const sellers = faker.helpers.arrayElements([...MOCK_SELLERS], sellerCount);

    const offersAndInventory = sellers.map((s) => generateOffer(s.id, s.name));
    const offers = offersAndInventory.map((x) => x.offer);

    // Derive product-level pricing aggregates
    const prices = offers.map((o) => o.price.amount);
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    const bestOffer = offers.reduce((a, b) =>
      a.price.amount <= b.price.amount ? a : b,
    );

    pricings.push({
      productId,
      priceMin,
      priceMax,
      originalPrice: bestOffer.originalPrice.amount,
      discountPercentage: bestOffer.discountPercentage,
      currency: CURRENCY,
      sellerCount: offers.length,
      bestOffer,
      offers,
      updatedAt: faker.date.recent({ days: 1 }),
    });

    for (const { inventory } of offersAndInventory) {
      inventories.push({ ...inventory, productId });
    }
  }

  return { pricings, inventories };
}
