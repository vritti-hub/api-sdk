/**
 * Logger Module
 *
 * Provides a comprehensive logging infrastructure for NestJS applications with:
 * - Environment presets (development, staging, production, test)
 * - Correlation ID tracking across async operations
 * - HTTP request/response logging
 * - Winston integration with file and console logging
 *
 * @module logger
 */

// ============================================================================
// Main Module (Import this in your AppModule)
// ============================================================================
export { LoggerModule, LOGGER_MODULE_OPTIONS } from './logger.module';

// ============================================================================
// Main Service (Inject this in your services)
// ============================================================================
export { LoggerService } from './services/logger.service';

// ============================================================================
// Middleware & Interceptors
// ============================================================================
export { CorrelationIdMiddleware } from './middleware/correlation-id.middleware';
export { HttpLoggerInterceptor } from './interceptors/http-logger.interceptor';

// ============================================================================
// Type Definitions
// ============================================================================
export type {
  LogLevel,
  LogFormat,
  LogMetadata,
  LoggerModuleOptions,
  LoggerOptionsFactory,
  LoggerModuleAsyncOptions,
  CorrelationContext,
  HttpLoggerOptions,
} from './types';

// ============================================================================
// Utility Functions
// ============================================================================
export {
  // AsyncLocalStorage management
  correlationStorage,
  getCorrelationContext,
  runWithCorrelationContext,
  updateCorrelationContext,

  // Correlation ID helpers
  DEFAULT_CORRELATION_HEADER,
  generateCorrelationId,
  addCorrelationIdToResponse,
} from './utils';
