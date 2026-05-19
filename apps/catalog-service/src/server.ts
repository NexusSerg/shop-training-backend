import Fastify from 'fastify';

export function createServer() {
  const server = Fastify({ logger: true });

  server.get('/health', async () => ({ status: 'ok', service: 'catalog-service' }));

  // TODO: Step 1.1 — wire catalog routes
  server.get('/api/v1/products/:id', async (_req, reply) => {
    await reply.code(501).send({ error: 'Not implemented yet — coming in Step 1.1' });
  });

  return server;
}
