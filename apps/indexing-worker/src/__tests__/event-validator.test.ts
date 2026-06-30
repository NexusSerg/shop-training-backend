import { describe, it, expect } from 'vitest';
import { KAFKA_TOPICS, type KafkaTopic } from '@shop/shared-types';
import { validateEvent, assertValidEvent, EventValidationError } from '../kafka/event-validator';
import { buildSampleEvent } from '../kafka/sample-events';

const ALL: KafkaTopic[] = Object.values(KAFKA_TOPICS);

/** Serialize a sample event to its JSON wire form (Date → ISO string). */
function wire(topic: KafkaTopic): unknown {
  return JSON.parse(JSON.stringify(buildSampleEvent(topic)));
}

describe('event-validator', () => {
  it('accepts a valid sample event for every topic', () => {
    for (const topic of ALL) {
      const result = validateEvent(topic, wire(topic));
      expect(result.valid, `${topic}: ${result.errors.join(', ')}`).toBe(true);
      expect(result.errors).toEqual([]);
    }
  });

  it('assertValidEvent returns the typed event when valid', () => {
    const event = assertValidEvent(KAFKA_TOPICS.PRODUCT_CREATED, wire(KAFKA_TOPICS.PRODUCT_CREATED));
    expect(event.type).toBe('product.created');
  });

  it('rejects an event missing required envelope fields', () => {
    const result = validateEvent(KAFKA_TOPICS.PRODUCT_DELETED, { type: 'product.deleted', payload: {} });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects an event whose type does not match the topic schema', () => {
    const event = wire(KAFKA_TOPICS.PRODUCT_CREATED) as Record<string, unknown>;
    event['type'] = 'price.changed';
    const result = validateEvent(KAFKA_TOPICS.PRODUCT_CREATED, event);
    expect(result.valid).toBe(false);
  });

  it('rejects unknown additional properties in the payload', () => {
    const event = wire(KAFKA_TOPICS.PRODUCT_DELETED) as { payload: Record<string, unknown> };
    event.payload['hacker'] = 'x';
    const result = validateEvent(KAFKA_TOPICS.PRODUCT_DELETED, event);
    expect(result.valid).toBe(false);
  });

  it('rejects an inventory event with an invalid status enum', () => {
    const event = wire(KAFKA_TOPICS.INVENTORY_UPDATED) as { payload: Record<string, unknown> };
    event.payload['status'] = 'exploded';
    const result = validateEvent(KAFKA_TOPICS.INVENTORY_UPDATED, event);
    expect(result.valid).toBe(false);
  });

  it('rejects a price event with a negative price', () => {
    const event = wire(KAFKA_TOPICS.PRICE_CHANGED) as { payload: Record<string, unknown> };
    event.payload['newPrice'] = -5;
    const result = validateEvent(KAFKA_TOPICS.PRICE_CHANGED, event);
    expect(result.valid).toBe(false);
  });

  it('assertValidEvent throws EventValidationError on invalid input', () => {
    expect(() => assertValidEvent(KAFKA_TOPICS.PRODUCT_CREATED, { foo: 'bar' })).toThrow(EventValidationError);
  });

  it('returns an error for an unregistered topic', () => {
    const result = validateEvent('not.a.topic' as KafkaTopic, {});
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('No schema registered');
  });
});
