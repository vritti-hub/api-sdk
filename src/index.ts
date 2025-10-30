// Core module
export { DatabaseModule } from './database/database.module';

// Services
export { DatabaseService } from './database/services/database.service';
export { TenantConfigRegistryService } from './database/services/tenant-config-registry.service';
export { TenantContextService } from './database/services/tenant-context.service';

// Interceptors
export { MessageTenantContextInterceptor } from './database/interceptors/message-tenant-context.interceptor';
export { TenantContextInterceptor } from './database/interceptors/tenant-context.interceptor';

// Decorators
export { MessageTenant } from './database/decorators/message-tenant.decorator';
export { TenantPrisma } from './database/decorators/tenant-prisma.decorator';
export { Tenant } from './database/decorators/tenant.decorator';

// Interfaces
export * from './database/interfaces';

// Utilities
export { extractSubdomain } from './database/utils/subdomain-parser.util';
