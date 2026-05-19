// Kafka event schemas

export interface BaseEvent {
  eventId: string;
  occurredAt: Date;
  version: string;
}

export interface ProductCreatedEvent extends BaseEvent {
  type: 'product.created';
  payload: {
    productId: string;
    sku: string;
    name: string;
    brand: string;
    categoryId: string;
    slug: string;
    createdAt: Date;
  };
}

export interface ProductUpdatedEvent extends BaseEvent {
  type: 'product.updated';
  payload: {
    productId: string;
    changedFields: string[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    updatedAt: Date;
  };
}

export interface ProductDeletedEvent extends BaseEvent {
  type: 'product.deleted';
  payload: {
    productId: string;
    deletedAt: Date;
  };
}

export interface PriceChangedEvent extends BaseEvent {
  type: 'price.changed';
  payload: {
    productId: string;
    sellerId: string;
    oldPrice: number;
    newPrice: number;
    currency: string;
    changedAt: Date;
  };
}

export interface InventoryUpdatedEvent extends BaseEvent {
  type: 'inventory.updated';
  payload: {
    productId: string;
    sellerId: string;
    oldStock: number;
    newStock: number;
    status: 'in_stock' | 'out_of_stock' | 'low_stock' | 'backorder';
    updatedAt: Date;
  };
}

export type CatalogEvent =
  | ProductCreatedEvent
  | ProductUpdatedEvent
  | ProductDeletedEvent
  | PriceChangedEvent
  | InventoryUpdatedEvent;

export const KAFKA_TOPICS = {
  PRODUCT_CREATED: 'product.created',
  PRODUCT_UPDATED: 'product.updated',
  PRODUCT_DELETED: 'product.deleted',
  PRICE_CHANGED: 'price.changed',
  INVENTORY_UPDATED: 'inventory.updated',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
