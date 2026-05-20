import { DynamicModule, Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { HealthModule } from './health/health.module';
import { GATEWAY_CONFIG } from './config.token';
import type { GatewayConfig } from './config';

@Module({})
export class AppModule {
  static register(config: GatewayConfig): DynamicModule {
    return {
      module: AppModule,
      global: true,
      imports: [
        ThrottlerModule.forRoot([
          {
            ttl: config.rateLimitWindowMs,
            limit: config.rateLimitMax,
          },
        ]),
        HealthModule,
      ],
      providers: [
        { provide: GATEWAY_CONFIG, useValue: config },
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
      exports: [GATEWAY_CONFIG],
    };
  }
}
