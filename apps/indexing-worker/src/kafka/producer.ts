import type { Kafka, Producer } from 'kafkajs';
import type { CatalogEvent, KafkaTopic } from '@shop/shared-types';
import { assertValidEvent } from './event-validator';

/**
 * Event producer — Step 4.1
 *
 * Thin wrapper that validates an event against its JSON Schema, then publishes
 * it to the matching topic. The event `type` field doubles as the topic name,
 * and the payload's `productId` is used as the partition key so all events for
 * a product land on the same partition (preserves per-product ordering).
 */

export class EventProducer {
  private producer: Producer;
  private connected = false;

  constructor(private readonly kafka: Kafka) {
    this.producer = kafka.producer({ allowAutoTopicCreation: false });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.producer.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.producer.disconnect();
    this.connected = false;
  }

  /** Validate and publish a single event. The topic is derived from `event.type`. */
  async publish(event: CatalogEvent): Promise<void> {
    const topic = event.type as KafkaTopic;
    assertValidEvent(topic, serialize(event));
    const key = getPartitionKey(event);
    await this.producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(event) }],
    });
  }
}

/** Serialize an event to its JSON wire form (Date → ISO string) for validation. */
function serialize(event: CatalogEvent): unknown {
  return JSON.parse(JSON.stringify(event));
}

function getPartitionKey(event: CatalogEvent): string {
  return event.payload.productId;
}
