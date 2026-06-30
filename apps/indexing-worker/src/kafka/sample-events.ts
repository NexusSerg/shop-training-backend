import { randomUUID } from 'node:crypto';
import {
  KAFKA_TOPICS,
  type CatalogEvent,
  type KafkaTopic,
} from '@shop/shared-types';

/**
 * Sample event factory — used by the manual `kafka:produce` script (Step 4.1)
 * to publish a representative, schema-valid event for any topic.
 */

const EVENT_VERSION = '1.0';

export function buildSampleEvent(topic: KafkaTopic, productId = 'p-sample-001'): CatalogEvent {
  const now = new Date();
  const base = { eventId: randomUUID(), occurredAt: now, version: EVENT_VERSION };

  switch (topic) {
    case KAFKA_TOPICS.PRODUCT_CREATED:
      return {
        ...base,
        type: 'product.created',
        payload: {
          productId,
          sku: 'SAMPLE-SKU-001',
          name: 'Sample Product',
          brand: 'Acme',
          categoryId: 'cat-laptops',
          slug: 'sample-product',
          createdAt: now,
        },
      };
    case KAFKA_TOPICS.PRODUCT_UPDATED:
      return {
        ...base,
        type: 'product.updated',
        payload: {
          productId,
          changedFields: ['name'],
          before: { name: 'Old Name' },
          after: { name: 'Sample Product' },
          updatedAt: now,
        },
      };
    case KAFKA_TOPICS.PRODUCT_DELETED:
      return {
        ...base,
        type: 'product.deleted',
        payload: { productId, deletedAt: now },
      };
    case KAFKA_TOPICS.PRICE_CHANGED:
      return {
        ...base,
        type: 'price.changed',
        payload: {
          productId,
          sellerId: 's-001',
          oldPrice: 999.99,
          newPrice: 899.99,
          currency: 'USD',
          changedAt: now,
        },
      };
    case KAFKA_TOPICS.INVENTORY_UPDATED:
      return {
        ...base,
        type: 'inventory.updated',
        payload: {
          productId,
          sellerId: 's-001',
          oldStock: 10,
          newStock: 3,
          status: 'low_stock',
          updatedAt: now,
        },
      };
    default:
      throw new Error(`Unknown topic: ${topic as string}`);
  }
}
