import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './app.factory';
import { getConfig } from './config';

async function bootstrap() {
  const config = getConfig();
  const app = await createApp(config);

  const port = parseInt(
    process.env['GATEWAY_PORT'] ?? process.env['PORT'] ?? '3000',
    10,
  );
  await app.listen(port, '0.0.0.0');
  Logger.log(`API Gateway listening on port ${port}`, 'Bootstrap');
}

bootstrap();
