import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { DATABASE_MODULE_OPTIONS } from './constants';

import type { DatabaseModuleOptions } from './interfaces';
import { DatabaseService } from './services/database.service';
import { TenantConfigRegistryService } from './services/tenant-config-registry.service';
import { TenantContextService } from './services/tenant-context.service';

/**
 * Dynamic module for multi-tenant database management
 *
 * This module provides:
 * - Tenant context management (request-scoped)
 * - Database connection pooling
 * - Dynamic schema/cluster routing
 * - Support for both gateway and microservice modes
 *
 * ## Gateway Mode (API Gateway)
 * - Set tenantResolver: 'subdomain' | 'header' | 'jwt'
 * - Provide databaseUrl and primaryDbConstructor
 * - Automatically queries primary DB for tenant config
 * - Attaches TenantContextInterceptor globally
 *
 * ## Microservice Mode
 * - Don't set tenantResolver
 * - Only provide prismaClientConstructor
 * - Tenant context comes from RabbitMQ messages
 * - Use MessageTenantContextInterceptor manually
 *
 * @example
 * // Gateway configuration
 * DatabaseModule.forRootAsync({
 *   imports: [ConfigModule],
 *   useFactory: (config: ConfigService) => ({
 *     databaseUrl: config.get('DATABASE_URL'),
 *     primaryDbClientConstructor: PrismaClient,
 *     tenantResolver: 'subdomain',
 *   }),
 *   inject: [ConfigService],
 * })
 *
 * @example
 * // Microservice configuration
 * DatabaseModule.forRoot({
 *   prismaClientConstructor: PrismaClient,
 * })
 */
@Global()
@Module({})
export class DatabaseModule {
  /**
   * Synchronous configuration
   *
   * @param options Module configuration options
   * @returns Dynamic module configuration
   */
  static forRoot(options: DatabaseModuleOptions): DynamicModule {
    const providers: Provider[] = [
      {
        provide: DATABASE_MODULE_OPTIONS,
        useValue: options,
      },
      DatabaseService,
      TenantContextService,
      TenantConfigRegistryService,
    ];

    return {
      module: DatabaseModule,
      providers,
      exports: [DatabaseService, TenantContextService, TenantConfigRegistryService],
    };
  }

  /**
   * Asynchronous configuration (recommended)
   *
   * Allows injecting ConfigService or other dependencies
   *
   * @param options Async configuration options
   * @returns Dynamic module configuration
   *
   * @example
   * DatabaseModule.forRootAsync({
   *   imports: [ConfigModule],
   *   useFactory: async (config: ConfigService) => ({
   *     cloudDatabaseUrl: config.get('CLOUD_DATABASE_URL'),
   *     prismaClientConstructor: PrismaClient,
   *     tenantResolver: 'subdomain',
   *   }),
   *   inject: [ConfigService],
   * })
   */
  static forRootAsync(options: {
    imports?: any[];
    modules?: any[];
    useFactory: (...args: any[]) => Promise<DatabaseModuleOptions> | DatabaseModuleOptions;
    inject?: any[];
  }): DynamicModule {
    const asyncProvider: Provider = {
      provide: DATABASE_MODULE_OPTIONS,
      useFactory: options.useFactory,
      inject: options.inject || [],
    };
    return {
      module: DatabaseModule,
      imports: [...(options.imports || []), ...(options.modules || [])],
      providers: [
        asyncProvider,
        TenantContextService,
        TenantConfigRegistryService,
        DatabaseService,
      ],
      exports: [DatabaseService, TenantContextService, TenantConfigRegistryService],
    };
  }
}
