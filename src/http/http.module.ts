import { Module } from '@nestjs/common';
import { CsrfGuard } from './guards/csrf.guard';

/**
 * HTTP Module
 *
 * Provides HTTP utilities including:
 * - CSRF Guard for request protection
 * - HTTP Exception Filter for standardized error responses
 *
 * Usage:
 * Import this module to access HTTP guards and filters.
 * Guards and filters are registered globally in the main application.
 */
@Module({
  providers: [CsrfGuard],
  exports: [CsrfGuard],
})
export class HttpModule {}
