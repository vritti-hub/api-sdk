/**
 * Tenant configuration stored in cloud database
 * This is the shape of data returned from the tenant registry
 */
export interface TenantInfo {
  /** Unique tenant identifier */
  id: string;

  /** Human-readable tenant slug */
  subdomain: string;

  /** Tenant type */
  type: 'SHARED' | 'DEDIACTED';

  /** Tenant status */
  status: string;

  /** For CLOUD tenants: schema name */
  schemaName?: string;

  /** For ENTERPRISE tenants: database configuration */
  databaseName?: string;
  databaseHost?: string;
  databasePort?: number;
  databaseUsername?: string;
  databasePassword?: string;
  databaseSslMode?: string;
  connectionPoolSize?: number;
}
