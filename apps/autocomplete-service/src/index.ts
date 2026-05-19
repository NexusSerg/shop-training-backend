import { createServer } from './server.js';

const PORT = parseInt(process.env['PORT'] ?? '3004', 10);

const server = createServer();

server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
