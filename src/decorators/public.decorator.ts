import { SetMetadata } from '@nestjs/common';

/**
 * Public Decorator - Marks endpoints that don't require authentication
 *
 * Use this decorator on controllers or route handlers to bypass VrittiAuthGuard
 * tenant validation. Useful for:
 * - Login/signup endpoints
 * - Health checks
 * - Public documentation endpoints
 * - Webhook endpoints that don't require tenant context
 *
 * @example
 * // On a controller method
 * @Public()
 * @Post('auth/login')
 * async login(@Body() dto: LoginDto) {
 *   return this.authService.login(dto);
 * }
 *
 * @example
 * // On an entire controller
 * @Public()
 * @Controller('health')
 * export class HealthController {
 *   @Get()
 *   check() {
 *     return { status: 'ok' };
 *   }
 * }
 */
export const Public = () => SetMetadata('isPublic', true);
