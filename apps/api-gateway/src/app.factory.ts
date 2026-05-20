import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import rateLimit from 'express-rate-limit';
import type { Request } from 'express';
import { AppModule } from './app.module';
import { createProxyMiddlewares } from './proxy/proxy.middleware';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import type { GatewayConfig } from './config';

export async function createApp(
  config: GatewayConfig,
  options: { silent?: boolean } = {},
): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.register(config),
    options.silent ? { logger: false } : {},
  );

  app.enableCors({
    origin: config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // express-rate-limit applies to ALL routes including proxy routes.
  // /health endpoints are exempt (they're used by load balancers and monitoring).
  app.use(
    rateLimit({
      windowMs: config.rateLimitWindowMs,
      limit: config.rateLimitMax,
      skip: (req: Request) =>
        req.path === '/health' || req.path === '/health/services',
      standardHeaders: true,
      legacyHeaders: true,
    }),
  );

  // Request ID middleware must run before proxy so the header is forwarded upstream.
  app.use(RequestIdMiddleware);

  // Proxy middlewares are mounted at root; pathFilter inside each handles routing.
  for (const middleware of createProxyMiddlewares(config)) {
    app.use(middleware);
  }

  return app;
}
