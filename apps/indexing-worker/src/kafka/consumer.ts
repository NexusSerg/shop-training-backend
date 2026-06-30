import type { Consumer, Kafka } from 'kafkajs';
import type { CatalogEvent, KafkaTopic } from '@shop/shared-types';
import { validateEvent } from './event-validator';

/**
 * Event consumer — Step 4.1 (manual consume helper)
 *
 * Subscribes to the given topics and invokes `onEvent` for each validated
 * message. Invalid messages are passed to `onInvalid` (if provided) instead of
 * crashing the consumer — the full Step 4.3 worker will route these to a DLQ.
 */

export interface ConsumeOptions {
  groupId: string;
  topics: KafkaTopic[];
  fromBeginning?: boolean;
  onEvent: (event: CatalogEvent, topic: KafkaTopic) => Promise<void> | void;
  onInvalid?: (topic: KafkaTopic, raw: string, errors: string[]) => void;
}

export class EventConsumer {
  private consumer: Consumer;

  constructor(
    private readonly kafka: Kafka,
    private readonly groupId: string,
  ) {
    this.consumer = kafka.consumer({ groupId });
  }

  async start(options: Omit<ConsumeOptions, 'groupId'>): Promise<void> {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: options.topics,
      fromBeginning: options.fromBeginning ?? true,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }) => {
        const raw = message.value?.toString() ?? '';
        const kafkaTopic = topic as KafkaTopic;

        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch {
          options.onInvalid?.(kafkaTopic, raw, ['Message is not valid JSON']);
          return;
        }

        const result = validateEvent(kafkaTopic, parsed);
        if (!result.valid) {
          options.onInvalid?.(kafkaTopic, raw, result.errors);
          return;
        }

        await options.onEvent(parsed as CatalogEvent, kafkaTopic);
      },
    });
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }
}
