import Fastify from 'fastify';

export function createServer() {
  const server = Fastify({ logger: true });

  server.get('/health', async () => ({ status: 'ok', service: 'search-service' }));

  // TODO: Step 1.2 — wire search routes
  server.get('/api/v1/search', async (_req, reply) => {
    await reply.code(501).send({ error: 'Not implemented yet — coming in Step 1.2' });
  });

  return server;
}
