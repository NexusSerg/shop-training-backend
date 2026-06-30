#!/usr/bin/env ts-node
/**
 * Create Kafka topics — Step 4.1
 *
 * Creates all catalog event topics (idempotent). Existing topics are left
 * untouched. Prints the resulting topic list.
 *
 * Usage:
 *   KAFKA_BROKERS=localhost:9092 ts-node src/scripts/create-topics.ts
 */

import { createKafka } from '../kafka/client';
import { TOPIC_CONFIGS, createTopics, listTopics } from '../kafka/topics';

async function main(): Promise<void> {
  const kafka = createKafka();

  console.log('[create-topics] Connecting to brokers:', process.env['KAFKA_BROKERS'] ?? 'localhost:9092');
  const created = await createTopics(kafka);

  if (created.length > 0) {
    console.log(`[create-topics] Created ${created.length} topic(s): ${created.join(', ')}`);
  } else {
    console.log('[create-topics] All topics already exist — nothing to create.');
  }

  const all = await listTopics(kafka);
  const ours = TOPIC_CONFIGS.map((c) => c.topic).filter((t) => all.includes(t));
  console.log('[create-topics] Catalog topics present on broker:');
  for (const cfg of TOPIC_CONFIGS) {
    const present = ours.includes(cfg.topic) ? '✓' : '✗';
    console.log(`  ${present} ${cfg.topic} (partitions=${cfg.numPartitions}, rf=${cfg.replicationFactor})`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[create-topics] FAILED:', err);
    process.exit(1);
  });
