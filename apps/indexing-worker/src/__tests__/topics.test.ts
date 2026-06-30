import { describe, it, expect } from 'vitest';
import { KAFKA_TOPICS } from '@shop/shared-types';
import { TOPIC_CONFIGS, ALL_TOPICS } from '../kafka/topics';

describe('topic config', () => {
  it('declares exactly one config per Kafka topic', () => {
    const declared = TOPIC_CONFIGS.map((c) => c.topic).sort();
    const expected = Object.values(KAFKA_TOPICS).sort();
    expect(declared).toEqual(expected);
  });

  it('ALL_TOPICS matches the configured topics', () => {
    expect([...ALL_TOPICS].sort()).toEqual(TOPIC_CONFIGS.map((c) => c.topic).sort());
  });

  it('every topic has at least one partition and replication factor >= 1', () => {
    for (const cfg of TOPIC_CONFIGS) {
      expect(cfg.numPartitions).toBeGreaterThanOrEqual(1);
      expect(cfg.replicationFactor).toBeGreaterThanOrEqual(1);
    }
  });

  it('high-volume topics have 10+ partitions for consumer scaling', () => {
    const highVolume = [
      KAFKA_TOPICS.PRODUCT_CREATED,
      KAFKA_TOPICS.PRODUCT_UPDATED,
      KAFKA_TOPICS.PRICE_CHANGED,
      KAFKA_TOPICS.INVENTORY_UPDATED,
    ];
    for (const topic of highVolume) {
      const cfg = TOPIC_CONFIGS.find((c) => c.topic === topic);
      expect(cfg?.numPartitions).toBeGreaterThanOrEqual(10);
    }
  });
});
