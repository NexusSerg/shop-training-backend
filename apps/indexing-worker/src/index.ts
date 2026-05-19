import pino from 'pino';

const logger = pino({ name: 'indexing-worker' });

// TODO: Step 4.3 — Kafka consumer connecting to Elasticsearch
logger.info('Indexing worker starting... (stub — wired in Step 4.3)');

process.on('SIGTERM', () => {
  logger.info('Shutting down indexing worker');
  process.exit(0);
});
