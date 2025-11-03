/**
 * Tenant configuration stored in cloud database
 * This is the shape of data returned from the tenant registry
 *
 * Note: Database configuration is now stored in a separate TenantDatabaseConfig table
 * but is flattened into this interface for convenience.
 */
export interface TenantInfo {
  /** Unique tenant identifier */
  id: string;

  /** Human-readable tenant slug */
  subdomain: string;

  /** Tenant type - SHARED or DEDICATED */
  type: 'SHARED' | 'DEDICATED';

  /** Tenant status */
  status: string;

  /** For SHARED tenants: schema name within the shared database */
  schemaName?: string;

  /** For DEDICATED tenants: database configuration (from TenantDatabaseConfig table) */
  databaseName?: string;
  databaseHost?: string;
  databasePort?: number;
  databaseUsername?: string;
  databasePassword?: string;
  databaseSslMode?: string;
  connectionPoolSize?: number;
}
