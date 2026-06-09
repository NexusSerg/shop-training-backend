import {
  Injectable,
  Inject,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import type { Redis } from 'ioredis';
import type { ProductPricing, Inventory, PriceMap } from '@shop/shared-types';
import { REDIS_CLIENT } from '../redis/redis.module';
import { seedPricingData } from '../mock/seed';

/**
 * Redis-backed pricing and inventory store.
 *
 * Redis schema
 * ─────────────────────────────────────────────────────────────────────────
 *  pricing:{productId}               → JSON string (ProductPricing)
 *  inventory:{productId}:{sellerId}  → JSON string (Inventory)
 *  seller_offers:{productId}         → Sorted Set  score=price  member=sellerId
 *  pricing:product_ids               → Set of all known product IDs
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Write pattern: write-through — every inventory update atomically updates
 * both the inventory key and the recomputed pricing key using a pipeline.
 */
@Injectable()
export class PricingStoreService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PricingStoreService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  async onModuleInit(): Promise<void> {
    const count = await this.redis.scard('pricing:product_ids');
    if (count === 0) {
      this.logger.log('Redis empty — seeding from mock data…');
      await this.seed();
      this.logger.log('Redis seeding complete.');
    } else {
      this.logger.log(`Redis already has ${count} products — skipping seed.`);
    }
  }

  onModuleDestroy(): void {
    this.redis.disconnect();
  }

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async getPricing(productId: string): Promise<ProductPricing | undefined> {
    const data = await this.redis.get(`pricing:${productId}`);
    return data ? this.parsePricing(data) : undefined;
  }

  /**
   * Batch-fetch pricing for up to 100 products via a single MGET (O(N)).
   * Missing IDs are silently omitted from the result.
   */
  async getBulkPricing(productIds: string[]): Promise<PriceMap> {
    if (productIds.length === 0) return {};
    const keys = productIds.map((id) => `pricing:${id}`);
    const results = await this.redis.mget(...keys);
    const map: PriceMap = {};
    for (let i = 0; i < productIds.length; i++) {
      const raw = results[i];
      if (raw) map[productIds[i]!] = this.parsePricing(raw);
    }
    return map;
  }

  async getInventory(
    productId: string,
    sellerId: string,
  ): Promise<Inventory | undefined> {
    const data = await this.redis.get(`inventory:${productId}:${sellerId}`);
    return data ? this.parseInventory(data) : undefined;
  }

  async getAllProductIds(): Promise<string[]> {
    return this.redis.smembers('pricing:product_ids');
  }

  // ---------------------------------------------------------------------------
  // Writes (write-through)
  // ---------------------------------------------------------------------------

  /**
   * Update stock and/or status for a specific seller offer.
   * Atomically writes the new inventory and recomputed product-level pricing
   * to Redis in a single pipeline (best-effort — no distributed transaction).
   * Returns the updated Inventory, or undefined if the pair doesn't exist.
   */
  async updateInventory(
    productId: string,
    sellerId: string,
    updates: { stock?: number; status?: Inventory['status'] },
  ): Promise<Inventory | undefined> {
    const existing = await this.getInventory(productId, sellerId);
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

    const pipeline = this.redis.pipeline();
    pipeline.set(`inventory:${productId}:${sellerId}`, JSON.stringify(updated));

    // Recompute product-level pricing aggregates
    const pricing = await this.getPricing(productId);
    if (pricing) {
      const updatedOffers = pricing.offers.map((offer) =>
        offer.sellerId === sellerId
          ? { ...offer, stock: newStock, status: newStatus }
          : offer,
      );

      const prices = updatedOffers.map((o) => o.price.amount);
      const priceMin = Math.min(...prices);
      const priceMax = Math.max(...prices);
      const bestOffer = updatedOffers.reduce((a, b) =>
        a.price.amount <= b.price.amount ? a : b,
      );

      const updatedPricing: ProductPricing = {
        ...pricing,
        priceMin,
        priceMax,
        bestOffer,
        offers: updatedOffers,
        updatedAt: now,
      };

      pipeline.set(`pricing:${productId}`, JSON.stringify(updatedPricing));
      pipeline.zadd(`seller_offers:${productId}`, priceMin, sellerId);
    }

    await pipeline.exec();
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private deriveStatus(stock: number): Inventory['status'] {
    if (stock === 0) return 'out_of_stock';
    if (stock < 10) return 'low_stock';
    return 'in_stock';
  }

  private parsePricing(data: string): ProductPricing {
    const p = JSON.parse(data) as ProductPricing;
    return { ...p, updatedAt: new Date(p.updatedAt) };
  }

  private parseInventory(data: string): Inventory {
    const inv = JSON.parse(data) as Inventory;
    return { ...inv, updatedAt: new Date(inv.updatedAt) };
  }

  private async seed(): Promise<void> {
    const { pricings, inventories } = seedPricingData();
    const pipeline = this.redis.pipeline();

    // pricing keys + seller_offers sorted sets
    for (const pricing of pricings) {
      pipeline.set(`pricing:${pricing.productId}`, JSON.stringify(pricing));
      for (const offer of pricing.offers) {
        pipeline.zadd(
          `seller_offers:${pricing.productId}`,
          offer.price.amount,
          offer.sellerId,
        );
      }
    }

    // inventory keys
    for (const inv of inventories) {
      pipeline.set(
        `inventory:${inv.productId}:${inv.sellerId}`,
        JSON.stringify(inv),
      );
    }

    // product ID registry (used by getAllProductIds)
    const productIds = pricings.map((p) => p.productId);
    pipeline.sadd('pricing:product_ids', ...productIds);

    await pipeline.exec();
  }
}
