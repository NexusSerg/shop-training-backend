import { Controller, Get, Inject, Res, HttpCode } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import { GATEWAY_CONFIG } from '../config.token';
import type { GatewayConfig } from '../config';

@Controller()
@SkipThrottle()
export class HealthController {
  constructor(
    @Inject(GATEWAY_CONFIG) private readonly config: GatewayConfig,
  ) {}

  @Get('health')
  @HttpCode(200)
  check() {
    return { status: 'ok', service: 'api-gateway', uptime: process.uptime() };
  }

  @Get('health/services')
  async checkServices(@Res() res: Response) {
    const upstreams = [
      { name: 'search-service', url: this.config.searchServiceUrl },
      { name: 'catalog-service', url: this.config.catalogServiceUrl },
      { name: 'pricing-service', url: this.config.pricingServiceUrl },
      { name: 'autocomplete-service', url: this.config.autocompleteServiceUrl },
      { name: 'saved-search-service', url: this.config.savedSearchServiceUrl },
    ];

    const results = await Promise.allSettled(
      upstreams.map(async ({ name, url }) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          const response = await fetch(`${url}/health`, {
            signal: controller.signal,
          });
          const body = (await response.json()) as Record<string, unknown>;
          return { name, status: response.ok ? 'ok' : 'degraded', ...body };
        } catch (err) {
          return {
            name,
            status: 'unreachable',
            error: err instanceof Error ? err.message : String(err),
          };
        } finally {
          clearTimeout(timeout);
        }
      }),
    );

    const services = results.map((r) =>
      r.status === 'fulfilled' ? r.value : { status: 'error' },
    );
    const allOk = services.every((s) => s.status === 'ok');

    res.status(allOk ? 200 : 207).json({
      status: allOk ? 'ok' : 'degraded',
      services,
    });
  }
}

