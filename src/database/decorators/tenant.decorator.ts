import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantInfo } from '../interfaces';
import { TenantContextService } from '../services/tenant-context.service';

/**
 * Parameter decorator that injects tenant metadata into controller method
 *
 * This decorator retrieves tenant information (ID, slug, type, etc.)
 * from the REQUEST-SCOPED TenantContextService.
 *
 * Useful for:
 * - Logging tenant-specific information
 * - Implementing tenant-specific business logic
 * - Auditing and tracking
 * - Conditional feature flags
 *
 * @returns TenantInfo object with tenant metadata
 *
 * @example
 * // Access tenant metadata
 * @Get('info')
 * async getTenantInfo(@Tenant() tenant: TenantInfo) {
 *   return {
 *     tenantId: tenant.tenantId,
 *     tenantSlug: tenant.tenantSlug,
 *     tenantType: tenant.tenantType,
 *   };
 * }
 *
 * @example
 * // Use for logging
 * @Post()
 * async createUser(
 *   @Body() dto: CreateUserDto,
 *   @Tenant() tenant: TenantInfo,
 * ) {
 *   this.logger.log(`Creating user for tenant: ${tenant.tenantSlug}`);
 *   // ...
 * }
 *
 * @example
 * // Conditional business logic
 * @Get('features')
 * async getFeatures(@Tenant() tenant: TenantInfo) {
 *   if (tenant.tenantType === 'ENTERPRISE') {
 *     return ['feature-a', 'feature-b', 'feature-c'];
 *   }
 *   return ['feature-a'];
 * }
 */
export const Tenant = createParamDecorator((data: unknown, ctx: ExecutionContext): TenantInfo => {
  const request = ctx.switchToHttp().getRequest();

  // Option 1: Get from request object (set by interceptor)
  if ((request as any).tenant) {
    return (request as any).tenant;
  }

  // Option 2: Get from TenantContextService
  const tenantContext = request.app?.get?.(TenantContextService);

  if (!tenantContext) {
    throw new Error('TenantContextService not found. Did you import DatabaseModule?');
  }

  return tenantContext.getTenant();
});
