import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import * as jwt from 'jsonwebtoken';
import { PrimaryDatabaseService } from '../database/services/primary-database.service';
import { TenantResolverService } from '../services/tenant-resolver.service';

// Type for decoded JWT token
interface DecodedToken {
  userId?: string;
  type?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  [key: string]: unknown;
}

/**
 * Vritti Authentication Guard - Validates JWT tokens and tenant context
 *
 * This guard performs comprehensive validation and attaches user data to request.
 *
 * Validation Flow:
 * 1. Checks if endpoint is marked with @Public() decorator → skip all validation
 * 2. Checks if endpoint is marked with @Onboarding() decorator:
 *    - Requires token type='onboarding'
 *    - Validates JWT signature and expiry only
 *    - Skips tenant and refresh token validation
 *    - Attaches user data to request.user
 * 3. For regular endpoints (no decorator):
 *    - Rejects tokens with type='onboarding'
 *    - Validates access token (JWT signature, expiry, nbf)
 *    - Validates refresh token from cloud-session-id cookie
 *    - Validates tenant exists and is ACTIVE
 *    - Attaches user data to request.user
 *
 * Token Format:
 * - Access Token: "Authorization: Bearer <jwt_token>"
 * - Refresh Token: "cloud-session-id" cookie
 *
 * Token Types:
 * - type='onboarding': Limited access during registration flow (@Onboarding endpoints only)
 * - type='access': Full access to authenticated endpoints
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
 * - 401: Token type mismatch (onboarding token on regular endpoint or vice versa)
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
 *
 * @example
 * // Restrict to onboarding tokens with @Onboarding() decorator
 * @Onboarding()
 * @Post('onboarding/verify-email')
 * async verifyEmail(@Request() req) {
 *   const userId = req.user.id; // Available from guard
 *   ...
 * }
 */
@Injectable()
export class VrittiAuthGuard implements CanActivate {
  private readonly logger = new Logger(VrittiAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
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

    // Step 2: Check if endpoint is marked as @Onboarding()
    const isOnboarding = this.reflector.getAllAndOverride<boolean>('isOnboarding', [
      context.getHandler(),
      context.getClass(),
    ]);

    try {
      // Extract and validate access token
      const accessToken = this.extractAccessToken(request);
      if (!accessToken) {
        this.logger.warn('Access token not found in Authorization header');
        throw new UnauthorizedException('Access token not found');
      }

      // Decode token to check type (without full validation yet)
      const decodedToken = this.jwtService.decode(accessToken) as DecodedToken;
      if (!decodedToken) {
        this.logger.warn('Failed to decode access token');
        throw new UnauthorizedException('Invalid token format');
      }

      // Step 3: Handle @Onboarding endpoints
      if (isOnboarding) {
        // Only accept onboarding tokens
        if (decodedToken.type !== 'onboarding') {
          this.logger.warn('Onboarding endpoint requires onboarding token');
          throw new UnauthorizedException('This endpoint requires an onboarding token');
        }

        // Validate JWT signature and expiry only
        const validatedToken = this.validateAccessToken(accessToken);
        this.logger.debug('Onboarding token validated successfully');

        // Attach user data to request (use userId field from our tokens, fallback to sub for standard JWT)
        const userId = (validatedToken as any).userId;
        (request as any).user = { id: userId };

        return true;
      }

      // Step 4: Handle regular endpoints - reject onboarding tokens
      if (decodedToken.type === 'onboarding') {
        this.logger.warn('Regular endpoint accessed with onboarding token');
        throw new UnauthorizedException('Onboarding tokens cannot access this endpoint');
      }

      // Step 5: Validate access token
      const validatedToken = this.validateAccessToken(accessToken);
      this.logger.debug('Access token validated successfully');

      // Step 6: Validate refresh token from cloud-session-id cookie
      const refreshToken = this.extractRefreshToken(request);
      if (!refreshToken) {
        this.logger.warn('Refresh token (cloud-session-id) not found in cookies');
        throw new UnauthorizedException('Refresh token not found');
      }

      this.validateRefreshToken(refreshToken);
      this.logger.debug('Refresh token validated successfully');

      // Step 7: Attach user data to request (use userId field from our tokens, fallback to sub for standard JWT)
      const userId = (validatedToken as any).userId;
      (request as any).user = { id: userId };

      // Step 8: Extract tenant identifier using TenantResolverService
      const tenantIdentifier = this.tenantResolver.resolveTenantIdentifier(request);

      if (!tenantIdentifier) {
        this.logger.warn('Tenant identifier not found in request');
        throw new UnauthorizedException('Tenant identifier not found');
      }

      this.logger.debug(`Tenant identifier extracted: ${tenantIdentifier}`);

      // Step 9: Skip database validation for platform admin (cloud.vritti.com)
      if (tenantIdentifier === 'cloud') {
        this.logger.debug('Platform admin access detected, skipping tenant database validation');
        return true;
      }

      // Step 10: Fetch tenant details from primary database
      const tenantInfo = await this.primaryDatabase.getTenantInfo(tenantIdentifier);

      if (!tenantInfo) {
        this.logger.warn(`Invalid tenant: ${tenantIdentifier}`);
        throw new UnauthorizedException('Invalid tenant');
      }

      // Step 11: Validate tenant is ACTIVE
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
  private validateAccessToken(token: string): DecodedToken {
    try {
      const decoded = this.jwtService.verify<DecodedToken>(token);

      this.logger.debug(`Access token decoded for user: ${(decoded as any).userId}`);

      // Check expiry explicitly (JwtService already validates, but we log it)
      if (decoded.exp) {
        const expiryTime = decoded.exp * 1000; // Convert to milliseconds
        const currentTime = Date.now();

        const timeRemaining = expiryTime - currentTime;
        this.logger.debug(
          `Access token valid for ${Math.floor(timeRemaining / 1000)} more seconds`,
        );
      }

      return decoded;
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

      this.logger.debug(`Refresh token decoded for user: ${(decoded as any).userId}`);

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
