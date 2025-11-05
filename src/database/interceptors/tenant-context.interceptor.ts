import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  NestInterceptor,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { DATABASE_MODULE_OPTIONS } from '../constants';
import type { DatabaseModuleOptions } from '../interfaces';
import { PrimaryDatabaseService } from '../services/primary-database.service';
import { TenantContextService } from '../services/tenant-context.service';

/**
 * Interceptor that extracts tenant context from HTTP requests (Gateway Mode)
 *
 * This interceptor runs BEFORE the controller and:
 * 1. Extracts tenant identifier from request (tries subdomain first, then falls back to header)
 * 2. Queries primary database for tenant configuration
 * 3. Stores tenant info in REQUEST-SCOPED TenantContextService
 *
 * Tenant resolution order:
 * - First: Subdomain (e.g., acme.vritti.com → 'acme')
 * - Fallback: x-tenant-id or x-tenant-slug header
 *
 * Only used in API Gateway. Microservices use MessageTenantContextInterceptor instead.
 *
 * @example
 * // Request: https://acme.vritti.com/api/users
 * // Interceptor extracts "acme" from subdomain, queries primary DB, sets context
 */
@Injectable({ scope: Scope.REQUEST })
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(
    private readonly tenantContext: TenantContextService,
    private readonly primaryDatabase: PrimaryDatabaseService,
    @Inject(DATABASE_MODULE_OPTIONS)
    private readonly options: DatabaseModuleOptions,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    this.logger.debug(`Processing request: ${request.method} ${request.url}`);

    try {
      // Extract tenant identifier from request
      const tenantIdentifier = this.extractTenantIdentifier(request);

      if (!tenantIdentifier) {
        throw new UnauthorizedException('Tenant identifier not found in request');
      }

      this.logger.debug(`Tenant identifier extracted: ${tenantIdentifier}`);

      // Special case: cloud.vritti.com (platform admin)
      if (tenantIdentifier === 'cloud') {
        this.logger.log('Cloud platform access detected, skipping tenant context setup');
        return next.handle();
      }

      // Query primary database for tenant configuration
      const tenantInfo = await this.primaryDatabase.getTenantInfo(tenantIdentifier);

      if (!tenantInfo) {
        this.logger.warn(`Invalid tenant: ${tenantIdentifier}`);
        throw new UnauthorizedException('Invalid tenant');
      }

      if (tenantInfo.status !== 'ACTIVE') {
        this.logger.warn(`Tenant ${tenantIdentifier} has status: ${tenantInfo.status}`);
        throw new UnauthorizedException(`Tenant is ${tenantInfo.status}`);
      }

      this.logger.debug(`Tenant config loaded: ${tenantInfo.subdomain} (${tenantInfo.type})`);

      // Store in REQUEST-SCOPED context
      this.tenantContext.setTenant(tenantInfo);

      // Also attach to request object for easy access
      (request as any).tenant = tenantInfo;

      this.logger.log(`Tenant context set: ${tenantInfo.subdomain}`);
    } catch (error) {
      this.logger.error('Failed to set tenant context', error);
      throw error;
    }

    return next.handle();
  }

  /**
   * Extract tenant from HTTP headers
   * Checks x-tenant-id and x-subdomain headers
   */
  private extractTenantIdentifier(request: FastifyRequest): string | null {
    const getHeader = (key: string) => {
      const value = request.headers?.[key];
      return Array.isArray(value) ? value[0] : value;
    };

    return getHeader('x-tenant-id') || getHeader('x-subdomain') || null;
  }
}
