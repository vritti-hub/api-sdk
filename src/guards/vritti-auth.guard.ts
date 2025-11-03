import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as jwt from 'jsonwebtoken';
import { FastifyRequest } from 'fastify';
import { PrimaryDatabaseService } from '../database/services/primary-database.service';
import { TenantResolverService } from '../services/tenant-resolver.service';

// Type for decoded JWT token
interface DecodedToken {
  sub?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Vritti Authentication Guard - Validates JWT tokens and tenant context
 *
 * This guard performs comprehensive validation and allows only authenticated users.
 * Does NOT attach anything to the request - purely for validation.
 *
 * Validation Flow:
 * 1. Checks if endpoint is marked with @Public() decorator → skip all validation
 * 2. Validates access token from Authorization header:
 *    - JWT signature verification using JWT_SECRET from env
 *    - Expiry (exp) claim validation
 *    - Not-Before (nbf) claim validation
 * 3. Validates refresh token from cloud-session-id cookie:
 *    - JWT signature verification using JWT_REFRESH_SECRET (or JWT_SECRET fallback)
 *    - Expiry (exp) claim validation
 *    - Not-Before (nbf) claim validation
 * 4. Extracts tenant identifier (subdomain or headers)
 * 5. Validates tenant exists and is ACTIVE in database
 *
 * Token Format:
 * - Access Token: "Authorization: Bearer <jwt_token>"
 * - Refresh Token: "cloud-session-id" cookie
 *
 * Environment Variables Required:
 * - JWT_SECRET: Secret key to verify access tokens (required)
 * - JWT_REFRESH_SECRET: Secret key for refresh tokens (optional, falls back to JWT_SECRET)
 *
 * Error Responses:
 * - 401: Invalid/expired access token
 * - 401: Invalid/expired refresh token
 * - 401: Tenant not found or inactive
 * - 401: Tenant identifier not found
 *
 * @example
 * // Apply globally in app.module.ts
 * {
 *   provide: APP_GUARD,
 *   useClass: VrittiAuthGuard,
 * }
 *
 * @example
 * // Bypass guard with @Public() decorator
 * @Public()
 * @Post('auth/login')
 * async login(@Body() dto: LoginDto) { ... }
 */
@Injectable()
export class VrittiAuthGuard implements CanActivate {
  private readonly logger = new Logger(VrittiAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly tenantResolver: TenantResolverService,
    private readonly primaryDatabase: PrimaryDatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Step 1: Check if endpoint is marked as @Public()
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Public endpoint detected, skipping authentication');
      return true;
    }

    try {
      // Step 2: Validate access token from Authorization header
      const accessToken = this.extractAccessToken(request);
      if (!accessToken) {
        this.logger.warn('Access token not found in Authorization header');
        throw new UnauthorizedException('Access token not found');
      }

      this.validateAccessToken(accessToken);
      this.logger.debug('Access token validated successfully');

      // Step 3: Validate refresh token from cloud-session-id cookie
      const refreshToken = this.extractRefreshToken(request);
      if (!refreshToken) {
        this.logger.warn('Refresh token (cloud-session-id) not found in cookies');
        throw new UnauthorizedException('Refresh token not found');
      }

      this.validateRefreshToken(refreshToken);
      this.logger.debug('Refresh token validated successfully');

      // Step 4: Extract tenant identifier using TenantResolverService
      const tenantIdentifier = this.tenantResolver.resolveTenantIdentifier(request);

      if (!tenantIdentifier) {
        this.logger.warn('Tenant identifier not found in request');
        throw new UnauthorizedException('Tenant identifier not found');
      }

      this.logger.debug(`Tenant identifier extracted: ${tenantIdentifier}`);

      // Step 5: Skip database validation for platform admin (cloud.vritti.com)
      if (tenantIdentifier === 'cloud') {
        this.logger.debug('Platform admin access detected, skipping tenant database validation');
        return true;
      }

      // Step 6: Fetch tenant details from primary database
      const tenantInfo = await this.primaryDatabase.getTenantInfo(tenantIdentifier);

      if (!tenantInfo) {
        this.logger.warn(`Invalid tenant: ${tenantIdentifier}`);
        throw new UnauthorizedException('Invalid tenant');
      }

      // Step 7: Validate tenant is ACTIVE
      if (tenantInfo.status !== 'ACTIVE') {
        this.logger.warn(`Tenant ${tenantIdentifier} has status: ${tenantInfo.status}`);
        throw new UnauthorizedException(`Tenant is ${tenantInfo.status}`);
      }

      this.logger.debug(`Tenant validated: ${tenantInfo.subdomain} (${tenantInfo.type})`);

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error('Unexpected error in auth guard', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Validate access token with proper expiry checks
   * Throws UnauthorizedException if token is invalid or expired
   */
  private validateAccessToken(token: string): void {
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    if (!jwtSecret) {
      this.logger.error('JWT_SECRET not configured in environment');
      throw new UnauthorizedException('Server configuration error');
    }

    try {
      const decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256', 'HS512', 'RS256'],
      }) as DecodedToken;

      this.logger.debug(`Access token decoded for user: ${decoded.sub}`);

      // Check expiry explicitly
      if (decoded.exp) {
        const expiryTime = decoded.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();

        if (currentTime > expiryTime) {
          this.logger.warn('Access token has expired');
          throw new UnauthorizedException('Access token has expired');
        }

        const timeRemaining = expiryTime - currentTime;
        this.logger.debug(
          `Access token valid for ${Math.floor(timeRemaining / 1000)} more seconds`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const jwtError = error as { name?: string; message?: string; expiredAt?: string };
      if (jwtError?.name === 'TokenExpiredError') {
        this.logger.warn(`Access token expired at: ${jwtError?.expiredAt}`);
        throw new UnauthorizedException('Access token has expired');
      }

      if (jwtError?.name === 'JsonWebTokenError') {
        this.logger.warn(`Access token verification failed: ${jwtError?.message}`);
        throw new UnauthorizedException('Invalid access token');
      }

      if (jwtError?.name === 'NotBeforeError') {
        this.logger.warn('Access token used before valid (nbf claim)');
        throw new UnauthorizedException('Access token not yet valid');
      }

      this.logger.error('Unexpected error validating access token', error);
      throw new UnauthorizedException('Access token validation failed');
    }
  }

  /**
   * Validate refresh token with proper expiry checks
   * Throws UnauthorizedException if token is invalid or expired
   */
  private validateRefreshToken(token: string): void {
    const jwtSecret =
      this.configService.get<string>('JWT_REFRESH_SECRET') ||
      this.configService.get<string>('JWT_SECRET');
    this.validateRefreshTokenWithSecret(token, jwtSecret);
  }

  /**
   * Helper to validate refresh token with specific secret
   */
  private validateRefreshTokenWithSecret(token: string, secret: string | undefined): void {
    if (!secret) {
      this.logger.error('JWT secret not configured for refresh token validation');
      throw new UnauthorizedException('Server configuration error');
    }

    try {
      const decoded = jwt.verify(token, secret, {
        algorithms: ['HS256', 'HS512', 'RS256'],
      }) as DecodedToken;

      this.logger.debug(`Refresh token decoded for user: ${decoded.sub}`);

      // Check expiry explicitly
      if (decoded.exp) {
        const expiryTime = decoded.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();

        if (currentTime > expiryTime) {
          this.logger.warn('Refresh token has expired');
          throw new UnauthorizedException('Refresh token has expired. Please login again');
        }

        const timeRemaining = expiryTime - currentTime;
        this.logger.debug(
          `Refresh token valid for ${Math.floor(timeRemaining / 1000)} more seconds`,
        );
      }
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      const jwtError = error as { name?: string; message?: string; expiredAt?: string };
      if (jwtError?.name === 'TokenExpiredError') {
        this.logger.warn(`Refresh token expired at: ${jwtError?.expiredAt}`);
        throw new UnauthorizedException('Refresh token has expired. Please login again');
      }

      if (jwtError?.name === 'JsonWebTokenError') {
        this.logger.warn(`Refresh token verification failed: ${jwtError?.message}`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      if (jwtError?.name === 'NotBeforeError') {
        this.logger.warn('Refresh token used before valid (nbf claim)');
        throw new UnauthorizedException('Refresh token not yet valid');
      }

      this.logger.error('Unexpected error validating refresh token', error);
      throw new UnauthorizedException('Refresh token validation failed');
    }
  }

  /**
   * Extract access token from Authorization header
   * Expected format: "Bearer <token>"
   */
  private extractAccessToken(request: FastifyRequest): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return null;
    }

    const [type, token] = authHeader.split(' ') ?? [];
    return type === 'Bearer' && token ? token : null;
  }

  /**
   * Extract refresh token from cloud-session-id cookie
   */
  private extractRefreshToken(request: FastifyRequest): string | null {
    try {
      // Try Fastify cookies property (can be undefined until plugin is registered)
      const cookies = (request as unknown as { cookies?: Record<string, string> }).cookies;
      if (cookies && typeof cookies === 'object') {
        const cloudSessionId = cookies['cloud-session-id'];
        if (cloudSessionId) {
          return cloudSessionId;
        }
      }

      return null;
    } catch (error: unknown) {
      this.logger.error('Error extracting refresh token from cookies', error);
      return null;
    }
  }
}
