import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DATABASE_MODULE_OPTIONS } from '../constants';
import type { DatabaseModuleOptions, TenantInfo } from '../interfaces';

/**
 * Service responsible for querying the primary database to resolve tenant configurations
 *
 * This service:
 * - Connects to the primary database (tenant registry)
 * - Queries tenant metadata (database location, credentials, etc.)
 * - Caches tenant configs in memory to reduce database load
 * - Only used in GATEWAY MODE (microservices receive tenant config from messages)
 *
 * @example
 * // In API Gateway
 * const config = await primaryDatabase.getTenantConfig('acme');
 * // Returns: { id, slug, type, databaseHost, databaseName, ... }
 */
@Injectable()
export class PrimaryDatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrimaryDatabaseService.name);

  /** Primary database client for querying tenant registry */
  private primaryDbClient: any;

  /** In-memory cache: Map<tenantIdentifier, TenantConfig> */
  private readonly tenantConfigCache = new Map<string, TenantInfo>();

  /** Cache TTL in milliseconds */
  private readonly cacheTTL: number;

  constructor(
    @Inject(DATABASE_MODULE_OPTIONS)
    private readonly options: DatabaseModuleOptions,
  ) {
    this.cacheTTL = options.connectionCacheTTL || 300000; // 5 minutes default
  }

  async onModuleInit() {
    // Only initialize if we have primary database config (gateway mode)
    if (this.options.primaryDb) {
      await this.initializePrimaryDbClient();
    }
  }

  /**
   * Initialize connection to primary database
   */
  private async initializePrimaryDbClient(): Promise<void> {
    try {
      const PrimaryDbClient = this.options.prismaClientConstructor;

      // Build connection URL from individual properties
      const databaseUrl = this.buildPrimaryDbUrl();

      this.primaryDbClient = new PrimaryDbClient({
        datasources: {
          db: {
            url: databaseUrl,
          },
        },
        log: ['error', 'warn'],
      });

      await this.primaryDbClient.$connect();
      this.logger.log('Connected to primary database (tenant registry)');
    } catch (error) {
      this.logger.error('Failed to connect to primary database', error);
      throw new InternalServerErrorException('Failed to initialize tenant registry');
    }
  }

  /**
   * Build connection URL from primary database properties
   */
  private buildPrimaryDbUrl(): string {
    if (!this.options.primaryDb) {
      throw new Error('Primary database configuration not provided');
    }

    const {
      host,
      port = 5432,
      username,
      password,
      database,
      schema = 'public',
      sslMode = 'require',
    } = this.options.primaryDb;

    // Build base URL
    let url = `postgresql://${username}:${password}@${host}:${port}/${database}`;

    // Add query parameters
    const params = new URLSearchParams();
    if (schema) {
      params.set('schema', schema);
    }
    params.set('sslmode', sslMode);

    const queryString = params.toString();
    if (queryString) {
      url += `?${queryString}`;
    }

    this.logger.debug(`Primary DB connection URL: ${this.maskPassword(url)}`);

    return url;
  }

  /**
   * Mask password in connection URL for logging
   */
  private maskPassword(url: string): string {
    return url.replace(/:([^@]+)@/, ':****@');
  }

  /**
   * Get tenant configuration by identifier (ID or slug)
   *
   * @param tenantIdentifier Tenant ID or slug
   * @returns Tenant configuration or null if not found
   */
  async getTenantConfig(tenantIdentifier: string): Promise<TenantInfo | null> {
    // Check cache first
    const cached = this.tenantConfigCache.get(tenantIdentifier);
    if (cached) {
      this.logger.debug(`Cache hit for tenant: ${tenantIdentifier}`);
      return cached;
    }

    // Query primary database
    try {
      if (!this.primaryDbClient) {
        throw new Error('Primary database client not initialized');
      }

      this.logger.debug(`Querying primary database for tenant: ${tenantIdentifier}`);

      const tenant = await this.primaryDbClient.tenant.findFirst({
        where: {
          OR: [{ id: tenantIdentifier }, { slug: tenantIdentifier }],
          status: 'ACTIVE',
        },
      });

      if (!tenant) {
        this.logger.warn(`Tenant not found: ${tenantIdentifier}`);
        return null;
      }

      // Build config object
      const config: TenantInfo = {
        id: tenant.id,
        slug: tenant.slug,
        type: tenant.type,
        status: tenant.status,
        schemaName: tenant.schemaName || undefined,
        databaseName: tenant.databaseName || undefined,
        databaseHost: tenant.databaseHost || undefined,
        databasePort: tenant.databasePort || undefined,
        databaseUsername: tenant.databaseUsername
          ? this.decrypt(tenant.databaseUsername)
          : undefined,
        databasePassword: tenant.databasePassword
          ? this.decrypt(tenant.databasePassword)
          : undefined,
        databaseSslMode: tenant.databaseSslMode || undefined,
        connectionPoolSize: tenant.connectionPoolSize || undefined,
      };

      // Cache by both ID and slug
      this.cacheConfig(config);

      return config;
    } catch (error) {
      this.logger.error(`Failed to fetch tenant config: ${tenantIdentifier}`, error);
      throw new InternalServerErrorException('Failed to resolve tenant');
    }
  }

  /**
   * Cache tenant configuration with TTL
   */
  private cacheConfig(config: TenantInfo): void {
    this.tenantConfigCache.set(config.id, config);
    this.tenantConfigCache.set(config.slug, config);

    // Set expiration
    setTimeout(() => {
      this.tenantConfigCache.delete(config.id);
      this.tenantConfigCache.delete(config.slug);
      this.logger.debug(`Cache expired for tenant: ${config.slug}`);
    }, this.cacheTTL);
  }

  /**
   * Clear cached tenant configuration
   *
   * Useful when tenant settings are updated and cache needs to be invalidated
   *
   * @param tenantIdentifier Tenant ID or slug
   */
  clearTenantCache(tenantIdentifier: string): void {
    const config = this.tenantConfigCache.get(tenantIdentifier);
    if (config) {
      this.tenantConfigCache.delete(config.id);
      this.tenantConfigCache.delete(config.slug);
      this.logger.log(`Cleared cache for tenant: ${tenantIdentifier}`);
    }
  }

  /**
   * Clear all cached tenant configurations
   */
  clearAllCaches(): void {
    const size = this.tenantConfigCache.size;
    this.tenantConfigCache.clear();
    this.logger.log(`Cleared ${size} cached tenant configs`);
  }

  /**
   * Get primary database client for direct database access
   *
   * This is useful for platform admin operations (creating tenants, billing, etc.)
   *
   * @returns Primary database client instance
   * @throws Error if primary database client is not initialized
   */
  getPrimaryDbClient<T = any>(): T {
    if (!this.primaryDbClient) {
      throw new Error('Primary database client not initialized. Are you in gateway mode?');
    }
    return this.primaryDbClient;
  }

  /**
   * Decrypt database credentials
   *
   * Override this method to implement your encryption strategy
   *
   * @param encrypted Encrypted value
   * @returns Decrypted value
   */
  private decrypt(encrypted: string): string {
    // TODO: Implement actual decryption using this.options.encryptionKey
    // For now, return as-is (assumes unencrypted or encryption happens elsewhere)
    return encrypted;
  }

  async onModuleDestroy() {
    if (this.primaryDbClient) {
      await this.primaryDbClient.$disconnect();
      this.logger.log('Disconnected from primary database');
    }
  }
}
