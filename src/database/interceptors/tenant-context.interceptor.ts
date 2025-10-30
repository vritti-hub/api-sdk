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
import { Observable } from 'rxjs';
import { DATABASE_MODULE_OPTIONS } from '../constants';
import type { DatabaseModuleOptions, TenantInfo } from '../interfaces';
import { PrimaryDatabaseService } from '../services/primary-database.service';
import { TenantContextService } from '../services/tenant-context.service';
import { extractSubdomain } from '../utils/subdomain-parser.util';

/**
 * Interceptor that extracts tenant context from HTTP requests (Gateway Mode)
 *
 * This interceptor runs BEFORE the controller and:
 * 1. Extracts tenant identifier from request (subdomain, header, or JWT)
 * 2. Queries cloud database for tenant configuration
 * 3. Stores tenant info in REQUEST-SCOPED TenantContextService
 *
 * Only used in API Gateway where tenantResolver is configured.
 * Microservices use MessageTenantContextInterceptor instead.
 *
 * @example
 * // Request: https://acme.vritti.com/api/users
 * // Interceptor extracts "acme", queries cloud DB, sets context
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
    console.log(request.headers);

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
        const cloudTenantInfo: TenantInfo = {
          id: 'cloud',
          slug: 'cloud',
          type: 'SHARED',
          schemaName: 'cloud',
          status: 'ACTIVE',
        };

        this.tenantContext.setTenant(cloudTenantInfo);
        (request as any).tenant = cloudTenantInfo;

        this.logger.log('Cloud tenant context set (platform mode)');
        return next.handle();
      }

      // Query primary database for tenant configuration
      const tenantConfig = await this.primaryDatabase.getTenantConfig(tenantIdentifier);

      if (!tenantConfig) {
        this.logger.warn(`Invalid tenant: ${tenantIdentifier}`);
        throw new UnauthorizedException('Invalid tenant');
      }

      if (tenantConfig.status !== 'ACTIVE') {
        this.logger.warn(`Tenant ${tenantIdentifier} has status: ${tenantConfig.status}`);
        throw new UnauthorizedException(`Tenant is ${tenantConfig.status}`);
      }

      this.logger.debug(`Tenant config loaded: ${tenantConfig.slug} (${tenantConfig.type})`);

      // Store in REQUEST-SCOPED context
      this.tenantContext.setTenant(tenantConfig);

      // Also attach to request object for easy access
      (request as any).tenant = tenantConfig;

      this.logger.log(`Tenant context set: ${tenantConfig.slug}`);
    } catch (error) {
      this.logger.error('Failed to set tenant context', error);
      throw error;
    }

    return next.handle();
  }

  /**
   * Extract tenant identifier from request based on configured strategy
   */
  private extractTenantIdentifier(request: any): string | null {
    const strategy = this.options.tenantResolver || 'subdomain';

    switch (strategy) {
      case 'subdomain':
        return this.extractFromSubdomain(request);

      case 'header':
        return this.extractFromHeader(request);

      case 'jwt':
        return this.extractFromJWT(request);

      default:
        this.logger.warn(`Unknown tenant resolver strategy: ${strategy}`);
        return null;
    }
  }

  /**
   * Extract tenant from subdomain
   * @example acme.vritti.com → 'acme'
   */
  private extractFromSubdomain(request: any): string | null {
    // Check if middleware already extracted it
    if ((request as any).subdomain) {
      return (request as any).subdomain;
    }

    // Otherwise parse from host header
    const host = request.headers?.host || request.hostname;
    return extractSubdomain(host);
  }

  /**
   * Extract tenant from HTTP headers
   * Checks x-tenant-id and x-tenant-slug headers
   */
  private extractFromHeader(request: any): string | null {
    return request.headers?.['x-tenant-id'] || request.headers?.['x-tenant-slug'] || null;
  }

  /**
   * Extract tenant from decoded JWT token
   * Assumes JwtAuthGuard has already run and set request.user
   */
  private extractFromJWT(request: any): string | null {
    if (!request.user) {
      this.logger.warn('JWT strategy selected but request.user is not set');
      return null;
    }

    return request.user.tenantId || request.user.tenantSlug || null;
  }
}
