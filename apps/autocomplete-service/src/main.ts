import 'reflect-metadata';
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
    methods: ['GET', 'OPTIONS'],
  });

  setupSwagger(app);

  const port = parseInt(process.env['PORT'] ?? '3004', 10);
  await app.listen(port, '0.0.0.0');
  Logger.log(`Autocomplete Service listening on port ${port}`, 'Bootstrap');
}

bootstrap();
