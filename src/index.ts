// Core modules
export { DatabaseModule } from './database/database.module';
export { AuthConfigModule } from './auth/auth-config.module';

// Services
export { PrimaryDatabaseService } from './database/services/primary-database.service';
export { TenantContextService } from './database/services/tenant-context.service';
export { TenantDatabaseService } from './database/services/tenant-database.service';
export { TenantResolverService } from './services/tenant-resolver.service';

// Guards
export { VrittiAuthGuard } from './guards/vritti-auth.guard';

// Interceptors
export { MessageTenantContextInterceptor } from './interceptors/message-tenant-context.interceptor';
export { TenantContextInterceptor } from './interceptors/tenant-context.interceptor';

// Decorators
export { Tenant } from './database/decorators/tenant.decorator';
export { Public } from './decorators/public.decorator';
export { Onboarding } from './decorators/onboarding.decorator';

// Interfaces
export * from './database/interfaces';

// Utilities
export { extractSubdomain } from './database/utils/subdomain-parser.util';
