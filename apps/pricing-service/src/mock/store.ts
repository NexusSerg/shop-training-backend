import type { ProductPricing, Inventory, PriceMap } from '@shop/shared-types';
import { seedPricingData } from './seed.js';

/**
 * In-memory pricing and inventory store.
 * In Phase 3 this will be replaced by Redis (real-time reads) + PostgreSQL (source of truth).
 */
export class PricingStore {
  private readonly pricings = new Map<string, ProductPricing>();
  /** Key: `${productId}:${sellerId}` */
  private readonly inventories = new Map<string, Inventory>();

  constructor(data?: ReturnType<typeof seedPricingData>) {
    const { pricings, inventories } = data ?? seedPricingData();
    for (const p of pricings) this.pricings.set(p.productId, p);
    for (const inv of inventories) {
      this.inventories.set(this.invKey(inv.productId, inv.sellerId), inv);
    }
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  getPricing(productId: string): ProductPricing | undefined {
    return this.pricings.get(productId);
  }

  /** Returns only products that exist in the store (missing IDs are silently skipped). */
  getBulkPricing(productIds: string[]): PriceMap {
    const result: PriceMap = {};
    for (const id of productIds) {
      const pricing = this.pricings.get(id);
      if (pricing) result[id] = pricing;
    }
    return result;
  }

  getInventory(productId: string, sellerId: string): Inventory | undefined {
    return this.inventories.get(this.invKey(productId, sellerId));
  }

  getAllProductIds(): string[] {
    return Array.from(this.pricings.keys());
  }

  // ---------------------------------------------------------------------------
  // Writes
  // ---------------------------------------------------------------------------

  /**
   * Update stock and/or status for a specific seller's offer.
   * Automatically recomputes product-level pricing aggregates.
   * Returns the updated Inventory, or undefined if the offer doesn't exist.
   */
  updateInventory(
    productId: string,
    sellerId: string,
    updates: { stock?: number; status?: Inventory['status'] },
  ): Inventory | undefined {
    const key = this.invKey(productId, sellerId);
    const existing = this.inventories.get(key);
    if (!existing) return undefined;

    const now = new Date();
    const newStock = updates.stock ?? existing.stock;
    const newStatus = updates.status ?? this.deriveStatus(newStock);
    const newReserved = Math.min(existing.reserved, newStock);

    const updated: Inventory = {
      ...existing,
      stock: newStock,
      reserved: newReserved,
      available: newStock - newReserved,
      status: newStatus,
      updatedAt: now,
    };

    this.inventories.set(key, updated);
    this.recomputePricing(productId, now);

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private invKey(productId: string, sellerId: string): string {
    return `${productId}:${sellerId}`;
  }

  private deriveStatus(stock: number): Inventory['status'] {
    if (stock === 0) return 'out_of_stock';
    if (stock < 10) return 'low_stock';
    return 'in_stock';
  }

  /**
   * Rebuild product-level pricing aggregates after an inventory change.
   * Keeps price/discount data intact — only stock-related fields are refreshed.
   */
  private recomputePricing(productId: string, now: Date): void {
    const pricing = this.pricings.get(productId);
    if (!pricing) return;

    const updatedOffers = pricing.offers.map((offer) => {
      const inv = this.inventories.get(this.invKey(productId, offer.sellerId));
      if (!inv) return offer;
      return { ...offer, stock: inv.stock, status: inv.status };
    });

    const prices = updatedOffers.map((o) => o.price.amount);
    const priceMin = Math.min(...prices);
    const priceMax = Math.max(...prices);
    const bestOffer = updatedOffers.reduce((a, b) =>
      a.price.amount <= b.price.amount ? a : b,
    );

    this.pricings.set(productId, {
      ...pricing,
      priceMin,
      priceMax,
      bestOffer,
      offers: updatedOffers,
      updatedAt: now,
    });
  }
}

/** Singleton used by all route handlers. */
export const pricingStore = new PricingStore();
