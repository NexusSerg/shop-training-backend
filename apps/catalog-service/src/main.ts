import 'reflect-metadata';
import * as path from 'path';
import * as dotenv from 'dotenv';
// Load .env from workspace root (two levels up from apps/catalog-service)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { setupSwagger } from './swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  setupSwagger(app);

  const port = parseInt(process.env['PORT'] ?? '3002', 10);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Catalog Service listening on port ${port}`, 'Bootstrap');
}

bootstrap();
