import { createServer } from './server.js';
import { getConfig } from './config.js';

const PORT = parseInt(process.env['GATEWAY_PORT'] ?? process.env['PORT'] ?? '3000', 10);

const server = createServer(getConfig());

server.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
  if (err) {
    server.log.error(err);
    process.exit(1);
  }
});
