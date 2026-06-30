// JSON Schema (draft-07) definitions for Kafka event messages — Step 4.1
//
// These schemas describe the JSON *wire format* of each event (after
// serialization). Date fields from the TypeScript interfaces in `events.ts`
// are serialized to ISO-8601 strings, so they are validated here as
// { type: 'string', format: 'date-time' }.
//
// The schemas are the single source of truth ("schema registry") referenced
// by producers (to validate before publishing) and consumers (to validate
// before processing). They are plain data objects with no runtime
// dependencies, so this package stays dependency-free.

import { KAFKA_TOPICS, type KafkaTopic } from './events.js';

/** A minimal JSON Schema (draft-07) shape — enough for our event schemas. */
export interface JsonSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  type: string;
  properties?: Record<string, JsonSchema | Record<string, unknown>>;
  required?: string[];
  additionalProperties?: boolean;
  enum?: readonly unknown[];
  format?: string;
  items?: JsonSchema | Record<string, unknown>;
  [key: string]: unknown;
}

const DRAFT_07 = 'http://json-schema.org/draft-07/schema#';

/** Shared envelope properties present on every event. */
const baseEventProperties = {
  eventId: { type: 'string', minLength: 1 },
  occurredAt: { type: 'string', format: 'date-time' },
  version: { type: 'string', minLength: 1 },
} as const;

const baseRequired = ['eventId', 'occurredAt', 'version', 'type', 'payload'];

export const productCreatedSchema: JsonSchema = {
  $schema: DRAFT_07,
  $id: 'shop:event:product.created',
  title: 'ProductCreatedEvent',
  type: 'object',
  additionalProperties: false,
  required: baseRequired,
  properties: {
    ...baseEventProperties,
    type: { type: 'string', const: KAFKA_TOPICS.PRODUCT_CREATED },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['productId', 'sku', 'name', 'brand', 'categoryId', 'slug', 'createdAt'],
      properties: {
        productId: { type: 'string', minLength: 1 },
        sku: { type: 'string', minLength: 1 },
        name: { type: 'string' },
        brand: { type: 'string' },
        categoryId: { type: 'string' },
        slug: { type: 'string' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const productUpdatedSchema: JsonSchema = {
  $schema: DRAFT_07,
  $id: 'shop:event:product.updated',
  title: 'ProductUpdatedEvent',
  type: 'object',
  additionalProperties: false,
  required: baseRequired,
  properties: {
    ...baseEventProperties,
    type: { type: 'string', const: KAFKA_TOPICS.PRODUCT_UPDATED },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['productId', 'changedFields', 'before', 'after', 'updatedAt'],
      properties: {
        productId: { type: 'string', minLength: 1 },
        changedFields: { type: 'array', items: { type: 'string' } },
        before: { type: 'object' },
        after: { type: 'object' },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const productDeletedSchema: JsonSchema = {
  $schema: DRAFT_07,
  $id: 'shop:event:product.deleted',
  title: 'ProductDeletedEvent',
  type: 'object',
  additionalProperties: false,
  required: baseRequired,
  properties: {
    ...baseEventProperties,
    type: { type: 'string', const: KAFKA_TOPICS.PRODUCT_DELETED },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['productId', 'deletedAt'],
      properties: {
        productId: { type: 'string', minLength: 1 },
        deletedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const priceChangedSchema: JsonSchema = {
  $schema: DRAFT_07,
  $id: 'shop:event:price.changed',
  title: 'PriceChangedEvent',
  type: 'object',
  additionalProperties: false,
  required: baseRequired,
  properties: {
    ...baseEventProperties,
    type: { type: 'string', const: KAFKA_TOPICS.PRICE_CHANGED },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['productId', 'sellerId', 'oldPrice', 'newPrice', 'currency', 'changedAt'],
      properties: {
        productId: { type: 'string', minLength: 1 },
        sellerId: { type: 'string', minLength: 1 },
        oldPrice: { type: 'number', minimum: 0 },
        newPrice: { type: 'number', minimum: 0 },
        currency: { type: 'string', minLength: 3, maxLength: 3 },
        changedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

export const inventoryUpdatedSchema: JsonSchema = {
  $schema: DRAFT_07,
  $id: 'shop:event:inventory.updated',
  title: 'InventoryUpdatedEvent',
  type: 'object',
  additionalProperties: false,
  required: baseRequired,
  properties: {
    ...baseEventProperties,
    type: { type: 'string', const: KAFKA_TOPICS.INVENTORY_UPDATED },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['productId', 'sellerId', 'oldStock', 'newStock', 'status', 'updatedAt'],
      properties: {
        productId: { type: 'string', minLength: 1 },
        sellerId: { type: 'string', minLength: 1 },
        oldStock: { type: 'integer', minimum: 0 },
        newStock: { type: 'integer', minimum: 0 },
        status: {
          type: 'string',
          enum: ['in_stock', 'out_of_stock', 'low_stock', 'backorder'],
        },
        updatedAt: { type: 'string', format: 'date-time' },
      },
    },
  },
};

/**
 * Event schema registry — maps each Kafka topic to its JSON Schema.
 * Producers and consumers look up the schema by topic to validate messages.
 */
export const EVENT_SCHEMAS: Record<KafkaTopic, JsonSchema> = {
  [KAFKA_TOPICS.PRODUCT_CREATED]: productCreatedSchema,
  [KAFKA_TOPICS.PRODUCT_UPDATED]: productUpdatedSchema,
  [KAFKA_TOPICS.PRODUCT_DELETED]: productDeletedSchema,
  [KAFKA_TOPICS.PRICE_CHANGED]: priceChangedSchema,
  [KAFKA_TOPICS.INVENTORY_UPDATED]: inventoryUpdatedSchema,
};

/** Look up the JSON Schema for a given Kafka topic. */
export function getEventSchema(topic: KafkaTopic): JsonSchema {
  return EVENT_SCHEMAS[topic];
}
