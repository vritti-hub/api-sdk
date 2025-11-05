import { Injectable, Logger } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { extractSubdomain } from '../database/utils/subdomain-parser.util';

/**
 * Service responsible for extracting tenant identifier from HTTP requests
 *
 * This service centralizes the logic for resolving tenant context from:
 * 1. URL subdomain (e.g., acme.vritti.com → 'acme')
 * 2. HTTP headers (x-tenant-id or x-subdomain)
 *
 * Used by both TenantContextInterceptor and VrittiAuthGuard to avoid code duplication
 *
 * @example
 * // In a guard or interceptor
 * const tenantId = this.resolver.resolveTenantIdentifier(request);
 */
@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name);

  /**
   * Resolve tenant identifier from request
   *
   * Priority order:
   * 1. Subdomain from URL (e.g., acme.vritti.com)
   * 2. x-tenant-id header
   * 3. x-subdomain header
   *
   * @param request FastifyRequest or Express Request
   * @returns Tenant identifier or null if not found
   */
  resolveTenantIdentifier(request: FastifyRequest | any): string | null {
    // Try subdomain first using api-sdk utility
    const host = request.headers?.host || request.hostname;
    let tenantIdentifier = extractSubdomain(host);

    // Fallback to headers if subdomain not found
    if (!tenantIdentifier) {
      tenantIdentifier = this.extractFromHeaders(request);
      if (tenantIdentifier) {
        this.logger.debug('Using tenant from header (subdomain not found)');
      }
    }

    return tenantIdentifier;
  }

  /**
   * Extract tenant from HTTP headers
   * Checks x-tenant-id and x-subdomain headers
   *
   * @param request FastifyRequest or Express Request
   * @returns Tenant identifier from headers or null
   */
  private extractFromHeaders(request: FastifyRequest | any): string | null {
    const getHeader = (key: string) => {
      const value = request.headers?.[key];
      return Array.isArray(value) ? value[0] : value;
    };

    return getHeader('x-tenant-id') || getHeader('x-subdomain') || null;
  }
}
