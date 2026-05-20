import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  app.enableCors({
    origin: process.env['CORS_ORIGIN'] ?? true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  const port = parseInt(process.env['PORT'] ?? '3005', 10);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Saved Search Service listening on port ${port}`, 'Bootstrap');
}

bootstrap();
