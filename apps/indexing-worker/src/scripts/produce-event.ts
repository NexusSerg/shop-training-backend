#!/usr/bin/env ts-node
/**
 * Manually publish an event — Step 4.1
 *
 * Publishes one schema-valid sample event to its topic so you can verify the
 * producer + topic + consumer pipeline by hand.
 *
 * Usage:
 *   KAFKA_BROKERS=localhost:9092 \
 *     ts-node src/scripts/produce-event.ts [topic] [productId]
 *
 * Arguments:
 *   topic       One of: product.created | product.updated | product.deleted |
 *               price.changed | inventory.updated   (default: product.updated)
 *   productId   Partition key / payload productId (default: p-sample-001)
 */

import { KAFKA_TOPICS, type KafkaTopic } from '@shop/shared-types';
import { createKafka } from '../kafka/client';
import { EventProducer } from '../kafka/producer';
import { buildSampleEvent } from '../kafka/sample-events';

const VALID_TOPICS = Object.values(KAFKA_TOPICS) as KafkaTopic[];

async function main(): Promise<void> {
  const topicArg = (process.argv[2] ?? KAFKA_TOPICS.PRODUCT_UPDATED) as KafkaTopic;
  const productId = process.argv[3] ?? 'p-sample-001';

  if (!VALID_TOPICS.includes(topicArg)) {
    console.error(`[produce-event] Invalid topic "${topicArg}". Valid: ${VALID_TOPICS.join(', ')}`);
    process.exit(1);
  }

  const event = buildSampleEvent(topicArg, productId);
  const kafka = createKafka();
  const producer = new EventProducer(kafka);

  await producer.connect();
  try {
    await producer.publish(event);
    console.log(`[produce-event] Published to "${topicArg}":`);
    console.log(JSON.stringify(event, null, 2));
  } finally {
    await producer.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[produce-event] FAILED:', err);
    process.exit(1);
  });
