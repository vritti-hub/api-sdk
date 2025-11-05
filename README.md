# @vritti/api-sdk

NestJS SDK for multi-tenant applications with automatic database routing, JWT authentication, and request-scoped tenant context management.

[![npm version](https://img.shields.io/npm/v/@vritti/api-sdk.svg)](https://www.npmjs.com/package/@vritti/api-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- 🏢 **Multi-tenant Database Management**: Automatic tenant routing with connection pooling
- 🔐 **JWT Authentication**: Built-in auth guard with refresh token validation
- 🌐 **Gateway & Microservice Support**: Optimized for both HTTP APIs and RabbitMQ workers
- 🎯 **Request-Scoped Context**: Tenant information available throughout the request lifecycle
- 🛡️ **Decorators**: `@Public()`, `@Onboarding()`, and `@Tenant()` for flexible access control
- ⚡ **Zero Configuration**: Auto-registers guards and interceptors

## Installation

```bash
# npm
npm install @vritti/api-sdk @nestjs/jwt @nestjs/config @prisma/client

# yarn
yarn add @vritti/api-sdk @nestjs/jwt @nestjs/config @prisma/client

# pnpm
pnpm add @vritti/api-sdk @nestjs/jwt @nestjs/config @prisma/client
```

## Quick Start

### Gateway Mode (HTTP API)

For REST APIs and GraphQL gateways that serve HTTP requests:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AuthConfigModule, DatabaseModule } from '@vritti/api-sdk';

@Module({
  imports: [
    // Environment configuration
    ConfigModule.forRoot({ isGlobal: true }),

    // Multi-tenant database (Gateway mode)
    DatabaseModule.forServer({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        primaryDb: {
          host: config.get('PRIMARY_DB_HOST'),
          port: config.get('PRIMARY_DB_PORT'),
          username: config.get('PRIMARY_DB_USERNAME'),
          password: config.get('PRIMARY_DB_PASSWORD'),
          database: config.get('PRIMARY_DB_DATABASE'),
        },
        prismaClientConstructor: PrismaClient,
      }),
    }),

    // JWT authentication
    AuthConfigModule.forRootAsync(),
  ],
})
export class AppModule {}
```

### Microservice Mode (RabbitMQ Workers)

For microservices that process messages from queues:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';
import { AuthConfigModule, DatabaseModule } from '@vritti/api-sdk';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // Multi-tenant database (Microservice mode)
    DatabaseModule.forMicroservice({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        prismaClientConstructor: PrismaClient,
      }),
    }),

    AuthConfigModule.forRootAsync(),
  ],
})
export class AppModule {}
```

## Environment Variables

### Required for All Modes

```bash
JWT_SECRET=your-access-token-secret-key
```

### Required for Gateway Mode

```bash
# Primary database (tenant registry)
PRIMARY_DB_HOST=localhost
PRIMARY_DB_PORT=5432
PRIMARY_DB_USERNAME=postgres
PRIMARY_DB_PASSWORD=postgres
PRIMARY_DB_DATABASE=vritti_primary
PRIMARY_DB_SCHEMA=public

# Optional
JWT_REFRESH_SECRET=your-refresh-token-secret-key
PRIMARY_DB_SSL_MODE=prefer  # Options: require, prefer, disable
```

## Usage Examples

### Public Endpoints

Use `@Public()` to bypass authentication:

```typescript
import { Controller, Post, Body } from '@nestjs/common';
import { Public } from '@vritti/api-sdk';

@Controller('auth')
export class AuthController {
  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto) {
    // No authentication required
    return this.authService.login(dto);
  }
}
```

### Onboarding Endpoints

Use `@Onboarding()` for registration/verification flows:

```typescript
import { Controller, Post, Request } from '@nestjs/common';
import { Onboarding } from '@vritti/api-sdk';

@Controller('onboarding')
export class OnboardingController {
  @Onboarding()
  @Post('verify-email')
  async verifyEmail(@Request() req) {
    const userId = req.user.id; // Available from auth guard
    return this.onboardingService.verifyEmail(userId);
  }
}
```

### Accessing Tenant Information

Use `@Tenant()` to inject tenant metadata:

```typescript
import { Controller, Get, Post, Body } from '@nestjs/common';
import { Tenant, TenantInfo } from '@vritti/api-sdk';

@Controller('users')
export class UsersController {
  @Get('info')
  async getTenantInfo(@Tenant() tenant: TenantInfo) {
    return {
      id: tenant.id,
      subdomain: tenant.subdomain,
      type: tenant.type, // STARTER, PROFESSIONAL, ENTERPRISE
    };
  }

  @Post()
  async createUser(
    @Body() dto: CreateUserDto,
    @Tenant() tenant: TenantInfo,
  ) {
    this.logger.log(`Creating user for tenant: ${tenant.subdomain}`);
    // Tenant-specific logic
    if (tenant.type === 'ENTERPRISE') {
      // Enable enterprise features
    }
    return this.usersService.create(dto);
  }
}
```

### Using Tenant Database Service

Access tenant-specific database connections:

```typescript
import { Injectable } from '@nestjs/common';
import { TenantDatabaseService } from '@vritti/api-sdk';

@Injectable()
export class UsersService {
  constructor(
    private readonly tenantDb: TenantDatabaseService,
  ) {}

  async findAll() {
    // Automatically uses tenant's database
    const db = await this.tenantDb.getClient();
    return db.user.findMany();
  }

  async create(data: CreateUserDto) {
    const db = await this.tenantDb.getClient();
    return db.user.create({ data });
  }
}
```

## Architecture

### Gateway Mode (`forServer()`)

**How it works:**
1. HTTP request arrives with tenant identifier (subdomain or `x-tenant-id` header)
2. `TenantContextInterceptor` extracts tenant identifier
3. `PrimaryDatabaseService` queries tenant registry for configuration
4. `VrittiAuthGuard` validates JWT tokens and tenant status
5. Tenant context is available throughout the request via `TenantContextService`

**Tenant Resolution:**
- Primary: Subdomain (`acme.api.vritti.com` → `acme`)
- Fallback: `x-tenant-id` header

### Microservice Mode (`forMicroservice()`)

**How it works:**
1. RabbitMQ message arrives with embedded tenant information
2. `MessageTenantContextInterceptor` extracts tenant from message payload
3. Tenant context is set in `TenantContextService`
4. No primary database lookup needed (tenant info comes from gateway)

**Expected Message Format:**
```typescript
{
  dto: { /* your data */ },
  tenant: {
    id: 'tenant-uuid',
    subdomain: 'acme',
    type: 'ENTERPRISE',
    databaseHost: 'tenant-db.aws.com',
    databaseName: 'acme_db',
    // ... other config
  }
}
```

## API Reference

### Modules

#### `DatabaseModule`

- **`forServer(options)`**: Configure for Gateway/HTTP mode
- **`forMicroservice(options)`**: Configure for RabbitMQ/messaging mode

#### `AuthConfigModule`

- **`forRootAsync()`**: Register JWT authentication with global guard

### Services

#### `TenantDatabaseService`

Access tenant-specific database connections.

```typescript
class TenantDatabaseService {
  async getClient<T = any>(): Promise<T>
  clearConnection(tenantId: string): void
}
```

#### `PrimaryDatabaseService`

Access the primary/platform database (tenant registry). Use this for cloud-api operations like managing tenants, users, sessions, etc.

```typescript
class PrimaryDatabaseService {
  async getPrimaryDbClient<T = any>(): Promise<T>
  async getTenantInfo(identifier: string): Promise<TenantInfo | null>
}
```

**Example:**
```typescript
@Injectable()
export class TenantRepository {
  constructor(private readonly database: PrimaryDatabaseService) {}

  async findAll() {
    const prisma = await this.database.getPrimaryDbClient<PrismaClient>();
    return prisma.tenant.findMany();
  }
}
```

#### `TenantContextService`

Manage request-scoped tenant context.

```typescript
class TenantContextService {
  getTenant(): TenantInfo
  setTenant(tenant: TenantInfo): void
  hasTenant(): boolean
  clearTenant(): void
}
```

### Decorators

#### `@Public()`

Bypass authentication on specific endpoints.

#### `@Onboarding()`

Accept only onboarding tokens (for registration/verification flows).

#### `@Tenant()`

Inject tenant metadata into controller methods.

### Interfaces

#### `TenantInfo`

```typescript
interface TenantInfo {
  id: string;
  subdomain: string;
  type: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
  databaseHost: string;
  databasePort?: number;
  databaseName: string;
  databaseUsername: string;
  databasePassword: string;
  databaseSchema?: string;
  sslMode?: 'require' | 'prefer' | 'disable';
}
```

#### `DatabaseModuleOptions`

```typescript
interface DatabaseModuleOptions {
  // Gateway mode only
  primaryDb?: {
    host: string;
    port?: number;
    username: string;
    password: string;
    database: string;
    schema?: string;
    sslMode?: 'require' | 'prefer' | 'disable';
  };

  // Required for both modes
  prismaClientConstructor: any;

  // Optional
  connectionCacheTTL?: number;  // Default: 300000 (5 minutes)
  maxConnections?: number;      // Default: 10
}
```

## Development

### Prerequisites

- Node.js 18+
- Yarn
- PostgreSQL (for testing)

### Setup

```bash
git clone https://github.com/vritti-hub/api-sdk.git
cd api-sdk
yarn install
```

### Available Scripts

- `yarn dev` - Run in watch mode
- `yarn build` - Build for production
- `yarn type-check` - TypeScript type checking
- `yarn test` - Run tests
- `yarn test:watch` - Run tests in watch mode
- `yarn lint` - Lint source files
- `yarn format` - Format code with Prettier
- `yarn clean` - Remove build artifacts

### Project Structure

```
api-sdk/
├── src/
│   ├── auth/                    # Authentication module
│   │   ├── guards/              # VrittiAuthGuard
│   │   ├── decorators/          # @Public, @Onboarding
│   │   └── auth-config.module.ts
│   ├── database/                # Database module
│   │   ├── services/            # Database services
│   │   ├── interceptors/        # Tenant context interceptors
│   │   ├── decorators/          # @Tenant
│   │   ├── interfaces/          # TypeScript interfaces
│   │   └── database.module.ts
│   ├── request/                 # Request utilities (internal)
│   └── index.ts                 # Public API exports
├── dist/                        # Build output
└── package.json
```

## Best Practices

### 1. Environment Variables

Always use `ConfigService` and validate environment variables at startup:

```typescript
import { plainToClass } from 'class-transformer';
import { IsString, IsNumber, validateSync } from 'class-validator';

class EnvironmentVariables {
  @IsString()
  JWT_SECRET: string;

  @IsString()
  PRIMARY_DB_HOST: string;

  @IsNumber()
  PRIMARY_DB_PORT: number;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToClass(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
```

### 2. Database Connections

Let the SDK manage connection pooling. Don't create custom Prisma instances:

```typescript
// ✅ Good
@Injectable()
export class UsersService {
  constructor(private readonly tenantDb: TenantDatabaseService) {}

  async findAll() {
    const db = await this.tenantDb.getClient();
    return db.user.findMany();
  }
}

// ❌ Bad - Don't do this
@Injectable()
export class UsersService {
  private prisma = new PrismaClient();  // ❌ Breaks multi-tenancy
}
```

### 3. Tenant Context

Always use `@Tenant()` decorator instead of manually accessing `TenantContextService`:

```typescript
// ✅ Good
@Get('info')
async getInfo(@Tenant() tenant: TenantInfo) {
  return { subdomain: tenant.subdomain };
}

// ❌ Bad - Avoid manual service injection
@Get('info')
async getInfo() {
  const tenant = this.tenantContext.getTenant();  // ❌ Unnecessary
}
```

## Troubleshooting

### Issue: "TenantContextService not found"

**Cause:** DatabaseModule not imported or registered incorrectly.

**Solution:** Ensure `DatabaseModule.forServer()` or `forMicroservice()` is imported in your module.

### Issue: "JWT secret not configured"

**Cause:** Missing `JWT_SECRET` environment variable.

**Solution:** Add `JWT_SECRET` to your `.env` file.

### Issue: "Tenant identifier not found"

**Cause:** Request missing subdomain and `x-tenant-id` header.

**Solution:** Ensure requests include tenant identifier:
- Use subdomain: `https://acme.api.vritti.com`
- Or add header: `x-tenant-id: acme`

### Issue: "Connection pool exhausted"

**Cause:** Too many concurrent tenants or connections not released.

**Solution:** Increase `maxConnections` in DatabaseModule options:

```typescript
DatabaseModule.forServer({
  useFactory: () => ({
    // ...
    maxConnections: 20,  // Increase from default 10
  }),
})
```

## Migration Guide

### From Manual Setup to SDK

If you're migrating from a manual setup:

1. Remove manual interceptor registrations
2. Remove manual guard registrations
3. Replace custom tenant context with `@Tenant()` decorator
4. Update imports to use SDK exports

**Before:**
```typescript
@Module({
  imports: [RequestModule],
  providers: [
    { provide: APP_GUARD, useClass: VrittiAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
  ],
})
```

**After:**
```typescript
@Module({
  imports: [
    DatabaseModule.forServer({ /* config */ }),
    AuthConfigModule.forRootAsync(),
  ],
})
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Make your changes
4. Run tests and linting: `yarn test && yarn lint`
5. Commit your changes: `git commit -am 'Add new feature'`
6. Push to the branch: `git push origin feature/my-feature`
7. Submit a pull request

## License

MIT © [Shashank Raju](https://github.com/vritti-hub)

## Author

**Shashank Raju**
- Email: shashank@vrittiai.com
- GitHub: [@vritti-hub](https://github.com/vritti-hub)
