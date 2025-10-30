import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { DatabaseService } from '../services/database.service';

/**
 * Parameter decorator that injects tenant-scoped database client into controller method
 *
 * This decorator automatically:
 * 1. Retrieves DatabaseService from the application context
 * 2. Gets tenant-scoped database client based on current tenant context
 * 3. Injects it as a method parameter
 *
 * @example
 * // In a controller
 * import { PrismaClient } from '@prisma/client';
 *
 * @Get()
 * async getUsers(@TenantPrisma() dbClient: PrismaClient) {
 *   return dbClient.user.findMany();
 * }
 *
 * @example
 * // With body and other parameters
 * @Post()
 * async createUser(
 *   @Body() dto: CreateUserDto,
 *   @TenantPrisma() dbClient: PrismaClient,
 * ) {
 *   return dbClient.user.create({ data: dto });
 * }
 */
export const TenantPrisma = createParamDecorator(async (data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();

  // Get DatabaseService from application context
  const databaseService = request.app?.get?.(DatabaseService);

  if (!databaseService) {
    throw new Error('DatabaseService not found. Did you import DatabaseModule in your app module?');
  }

  // Return tenant-scoped database client
  return await databaseService.getDbClient();
});
