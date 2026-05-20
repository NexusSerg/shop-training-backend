import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Pricing & Inventory Service API')
    .setDescription('Real-time pricing, seller offers, and inventory management')
    .setVersion('1.0')
    .addTag('pricing')
    .addTag('inventory')
    .addTag('health')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/json',
  });
}
