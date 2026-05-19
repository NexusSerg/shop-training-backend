import Fastify from 'fastify';

export function createServer() {
  const server = Fastify({ logger: true });

  server.get('/health', async () => ({ status: 'ok', service: 'saved-search-service' }));

  // TODO: Step 3.5 — wire saved search routes
  server.get('/api/v1/saved-searches', async (_req, reply) => {
    await reply.code(501).send({ error: 'Not implemented yet — coming in Step 3.5' });
  });

  return server;
}
