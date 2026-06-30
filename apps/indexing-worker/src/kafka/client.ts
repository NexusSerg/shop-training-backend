import { Kafka, logLevel, type KafkaConfig } from 'kafkajs';

/**
 * Kafka client factory — Step 4.1
 *
 * Centralises broker configuration so producers, consumers, and the admin
 * client all share the same connection settings.
 */

export const KAFKA_CLIENT_ID = 'shop-indexing-worker';

/** Comma-separated broker list, e.g. "localhost:9092,localhost:9093". */
export function getBrokers(): string[] {
  const raw = process.env['KAFKA_BROKERS'] ?? 'localhost:9092';
  return raw
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
}

export function createKafka(overrides: Partial<KafkaConfig> = {}): Kafka {
  return new Kafka({
    clientId: KAFKA_CLIENT_ID,
    brokers: getBrokers(),
    logLevel: logLevel.ERROR,
    retry: { retries: 5, initialRetryTime: 300 },
    ...overrides,
  });
}
