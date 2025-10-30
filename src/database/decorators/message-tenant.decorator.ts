import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TenantInfo } from '../interfaces';

/**
 * Parameter decorator that extracts tenant from RabbitMQ message payload
 *
 * This decorator is specifically for microservice message handlers
 * where tenant context is passed in the message payload.
 *
 * @returns TenantInfo from message payload
 *
 * @example
 * // In a microservice message handler
 * @MessagePattern('users.create')
 * async createUser(
 *   @Payload('dto') dto: CreateUserDto,
 *   @MessageTenant() tenant: TenantInfo,
 * ) {
 *   this.logger.log(`Creating user for tenant: ${tenant.tenantSlug}`);
 *
 *   // Set context manually if not using MessageTenantContextInterceptor
 *   this.tenantContext.setTenant(tenant);
 *
 *   const prisma = await this.database.getTenantClient();
 *   return prisma.user.create({ data: dto });
 * }
 *
 * @example
 * // With multiple parameters
 * @MessagePattern('orders.create')
 * async createOrder(
 *   @Payload() payload: any,
 *   @MessageTenant() tenant: TenantInfo,
 * ) {
 *   console.log(`Processing order for: ${tenant.tenantSlug}`);
 *   // ...
 * }
 */
export const MessageTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): TenantInfo | null => {
    const contextType = ctx.getType();

    // Only works with RabbitMQ/microservice contexts
    if (contextType !== 'rpc') {
      throw new Error(
        'MessageTenant decorator can only be used in RabbitMQ message handlers',
      );
    }

    const rpcContext = ctx.switchToRpc();
    const payload = rpcContext.getData();

    if (!payload || !payload.tenant) {
      throw new Error('Message payload missing tenant information');
    }

    return payload.tenant as TenantInfo;
  },
);
