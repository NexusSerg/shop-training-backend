#!/usr/bin/env ts-node
/**
 * Manually consume events — Step 4.1
 *
 * Subscribes to all catalog topics and prints every validated event. Invalid
 * messages are logged but do not stop the consumer. Run this in one terminal,
 * then publish with `produce-event.ts` in another to verify the pipeline.
 *
 * Usage:
 *   KAFKA_BROKERS=localhost:9092 ts-node src/scripts/consume-events.ts
 *
 * Press Ctrl+C to stop.
 */

import type { CatalogEvent, KafkaTopic } from '@shop/shared-types';
import { createKafka } from '../kafka/client';
import { EventConsumer } from '../kafka/consumer';
import { ALL_TOPICS } from '../kafka/topics';

const GROUP_ID = 'manual-consume-demo';

async function main(): Promise<void> {
  const kafka = createKafka();
  const consumer = new EventConsumer(kafka, GROUP_ID);

  console.log(`[consume-events] Subscribing to: ${ALL_TOPICS.join(', ')}`);
  console.log('[consume-events] Waiting for messages… (Ctrl+C to stop)\n');

  await consumer.start({
    topics: ALL_TOPICS,
    fromBeginning: true,
    onEvent: (event: CatalogEvent, topic: KafkaTopic) => {
      console.log(`[consume-events] ✓ ${topic} eventId=${event.eventId} productId=${event.payload.productId}`);
    },
    onInvalid: (topic, raw, errors) => {
      console.warn(`[consume-events] ✗ INVALID on ${topic}: ${errors.join('; ')}\n  raw: ${raw}`);
    },
  });

  const shutdown = async (): Promise<void> => {
    console.log('\n[consume-events] Shutting down…');
    await consumer.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[consume-events] FAILED:', err);
  process.exit(1);
});
