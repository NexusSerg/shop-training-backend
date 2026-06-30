import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { EVENT_SCHEMAS, type CatalogEvent, type KafkaTopic } from '@shop/shared-types';

/**
 * Event validator — Step 4.1
 *
 * Compiles the JSON Schemas registered in `@shop/shared-types` and exposes a
 * `validateEvent` helper. Producers validate before publishing and consumers
 * validate before processing, so malformed messages are caught at the edge.
 */

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const validators = new Map<KafkaTopic, ValidateFunction>();
for (const [topic, schema] of Object.entries(EVENT_SCHEMAS)) {
  validators.set(topic as KafkaTopic, ajv.compile(schema));
}

export class EventValidationError extends Error {
  constructor(
    public readonly topic: KafkaTopic,
    public readonly errors: string[],
  ) {
    super(`Event validation failed for topic "${topic}": ${errors.join('; ')}`);
    this.name = 'EventValidationError';
  }
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/** Validate an already-parsed event object against its topic schema. */
export function validateEvent(topic: KafkaTopic, event: unknown): ValidationResult {
  const validate = validators.get(topic);
  if (!validate) {
    return { valid: false, errors: [`No schema registered for topic "${topic}"`] };
  }
  const valid = validate(event) as boolean;
  if (valid) return { valid: true, errors: [] };
  const errors = (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? 'invalid'}`);
  return { valid: false, errors };
}

/** Validate and throw on failure. Returns the event typed as CatalogEvent. */
export function assertValidEvent(topic: KafkaTopic, event: unknown): CatalogEvent {
  const result = validateEvent(topic, event);
  if (!result.valid) {
    throw new EventValidationError(topic, result.errors);
  }
  return event as CatalogEvent;
}
