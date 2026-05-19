import Fastify from 'fastify';

export function createServer() {
  const server = Fastify({ logger: true });

  server.get('/health', async () => ({ status: 'ok', service: 'autocomplete-service' }));

  // TODO: Step 1.4 — wire autocomplete routes
  server.get('/api/v1/autocomplete', async (_req, reply) => {
    await reply.code(501).send({ error: 'Not implemented yet — coming in Step 1.4' });
  });

  return server;
}
