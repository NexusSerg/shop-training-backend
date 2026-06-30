import type { Kafka, ITopicConfig } from 'kafkajs';
import { KAFKA_TOPICS, type KafkaTopic } from '@shop/shared-types';

/**
 * Topic configuration — Step 4.1
 *
 * Declares every catalog event topic with its partition count. High-volume
 * topics (product/price/inventory updates) get 10 partitions so the Step 4.3
 * consumer group can scale to 10+ consumers. Replication factor is 1 for the
 * single-broker local dev cluster.
 */

const DEFAULT_REPLICATION_FACTOR = 1;
const HIGH_VOLUME_PARTITIONS = 10;
const LOW_VOLUME_PARTITIONS = 3;

export interface TopicConfig {
  topic: KafkaTopic;
  numPartitions: number;
  replicationFactor: number;
}

export const TOPIC_CONFIGS: TopicConfig[] = [
  { topic: KAFKA_TOPICS.PRODUCT_CREATED, numPartitions: HIGH_VOLUME_PARTITIONS, replicationFactor: DEFAULT_REPLICATION_FACTOR },
  { topic: KAFKA_TOPICS.PRODUCT_UPDATED, numPartitions: HIGH_VOLUME_PARTITIONS, replicationFactor: DEFAULT_REPLICATION_FACTOR },
  { topic: KAFKA_TOPICS.PRODUCT_DELETED, numPartitions: LOW_VOLUME_PARTITIONS, replicationFactor: DEFAULT_REPLICATION_FACTOR },
  { topic: KAFKA_TOPICS.PRICE_CHANGED, numPartitions: HIGH_VOLUME_PARTITIONS, replicationFactor: DEFAULT_REPLICATION_FACTOR },
  { topic: KAFKA_TOPICS.INVENTORY_UPDATED, numPartitions: HIGH_VOLUME_PARTITIONS, replicationFactor: DEFAULT_REPLICATION_FACTOR },
];

export const ALL_TOPICS: KafkaTopic[] = TOPIC_CONFIGS.map((c) => c.topic);

/**
 * Create any missing topics. Idempotent — existing topics are left untouched
 * (kafkajs `createTopics` returns false when a topic already exists).
 *
 * @returns the list of topics that were newly created.
 */
export async function createTopics(kafka: Kafka): Promise<string[]> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    const existing = new Set(await admin.listTopics());
    const toCreate: ITopicConfig[] = TOPIC_CONFIGS.filter((c) => !existing.has(c.topic)).map((c) => ({
      topic: c.topic,
      numPartitions: c.numPartitions,
      replicationFactor: c.replicationFactor,
    }));

    if (toCreate.length === 0) return [];

    await admin.createTopics({ topics: toCreate, waitForLeaders: true });
    return toCreate.map((t) => t.topic);
  } finally {
    await admin.disconnect();
  }
}

/** List all topics currently present on the broker. */
export async function listTopics(kafka: Kafka): Promise<string[]> {
  const admin = kafka.admin();
  await admin.connect();
  try {
    return await admin.listTopics();
  } finally {
    await admin.disconnect();
  }
}
