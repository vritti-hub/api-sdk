import type { ModuleMetadata, Type } from '@nestjs/common';

/**
 * Supported log levels for the logging system.
 */
export type LogLevel = 'error' | 'warn' | 'log' | 'debug' | 'verbose';

/**
 * Supported log output formats.
 */
export type LogFormat = 'json' | 'text';

/**
 * Metadata that can be attached to log entries.
 */
export interface LogMetadata {
  correlationId?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  ip?: string;
  userAgent?: string;
  [key: string]: unknown;
}

/**
 * Configuration options for the logger module.
 */
export interface LoggerModuleOptions {
  provider?: 'default' | 'winston';
  level?: LogLevel;
  format?: LogFormat;
  enableFileLogger?: boolean;
  filePath?: string;
  maxFiles?: string;
  enableCorrelationId?: boolean;
  enableHttpLogger?: boolean;
  httpLogger?: HttpLoggerOptions;
  appName?: string;
  environment?: string;
  defaultMeta?: Record<string, unknown>;
}

/**
 * Factory function for creating logger options asynchronously.
 */
export interface LoggerOptionsFactory {
  createLoggerOptions(): Promise<LoggerModuleOptions> | LoggerModuleOptions;
}

/**
 * Async configuration options for the logger module.
 */
export interface LoggerModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  useExisting?: Type<LoggerOptionsFactory>;
  useClass?: Type<LoggerOptionsFactory>;
  useFactory?: (...args: unknown[]) => Promise<LoggerModuleOptions> | LoggerModuleOptions;
  inject?: unknown[];
}

/**
 * Context object for correlation tracking across async operations.
 */
export interface CorrelationContext {
  correlationId: string;
  [key: string]: unknown;
}

/**
 * Configuration options for HTTP request/response logger interceptor.
 */
export interface HttpLoggerOptions {
  enableRequestLog?: boolean;
  enableResponseLog?: boolean;
  enableRequestBodyLog?: boolean;
  enableResponseBodyLog?: boolean;
  slowRequestThreshold?: number;
  excludedRoutes?: string[];
  maskedHeaders?: string[];
  maxBodySize?: number;
}
