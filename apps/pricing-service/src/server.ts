import Fastify from 'fastify';

export function createServer() {
  const server = Fastify({ logger: true });

  server.get('/health', async () => ({ status: 'ok', service: 'pricing-service' }));

  // TODO: Step 1.3 — wire pricing routes
  server.get('/api/v1/pricing/:productId', async (_req, reply) => {
    await reply.code(501).send({ error: 'Not implemented yet — coming in Step 1.3' });
  });

  return server;
}
