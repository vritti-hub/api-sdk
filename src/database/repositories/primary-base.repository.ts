import { Logger } from '@nestjs/common';
import { PrimaryDatabaseService } from '../services/primary-database.service';

/**
 * Abstract base repository for primary database operations.
 * Provides common CRUD operations with automatic logging.
 *
 * @template TModel - The Prisma model type
 * @template TCreateDTO - DTO type for create operations
 * @template TUpdateDTO - DTO type for update operations
 *
 * @example
 * ```typescript
 * // Using the model delegate pattern (RECOMMENDED)
 * // Type-safe, IDE autocomplete, refactor-friendly
 * @Injectable()
 * export class UserRepository extends PrimaryBaseRepository<
 *   User,
 *   CreateUserDto,
 *   UpdateUserDto
 * > {
 *   constructor(database: PrimaryDatabaseService) {
 *     super(database, (prisma) => prisma.user);  // ✅ Type-safe with autocomplete!
 *   }
 *
 *   // Add custom methods as needed
 *   async findByEmail(email: string): Promise<User | null> {
 *     return this.model.findUnique({ where: { email } });
 *   }
 * }
 *
 * // Short syntax is also supported
 * @Injectable()
 * export class TenantRepository extends PrimaryBaseRepository<Tenant> {
 *   constructor(database: PrimaryDatabaseService) {
 *     super(database, (p) => p.tenant);  // ✅ Concise!
 *   }
 * }
 *
 * // Works with complex model names
 * @Injectable()
 * export class EmailVerificationRepository extends PrimaryBaseRepository<EmailVerification> {
 *   constructor(database: PrimaryDatabaseService) {
 *     super(database, (p) => p.emailVerification);  // ✅ Matches Prisma naming
 *   }
 * }
 * ```
 */
export abstract class PrimaryBaseRepository<
  TModel,
  TCreateDTO = any,
  TUpdateDTO = any,
> {
  protected readonly logger: Logger;
  private readonly modelGetter: (prisma: any) => any;

  /**
   * Lazy getter for Prisma client.
   * Accesses the client from the database service only when needed,
   * avoiding initialization timing issues with NestJS lifecycle.
   */
  protected get prisma(): any {
    return this.database.prismaClient;
  }

  /**
   * Lazy getter for the Prisma model delegate.
   * Returns the specific model (e.g., prisma.user, prisma.tenant) for this repository.
   */
  protected get model(): any {
    return this.modelGetter(this.prisma);
  }

  /**
   * Create a new repository instance
   *
   * @param database - The primary database service
   * @param getModel - Function that returns the Prisma model delegate from the client
   *
   * @example
   * ```typescript
   * // Standard usage with full parameter name
   * constructor(database: PrimaryDatabaseService) {
   *   super(database, (prisma) => prisma.user);
   * }
   *
   * // Short syntax
   * constructor(database: PrimaryDatabaseService) {
   *   super(database, (p) => p.user);
   * }
   *
   * // Complex model names
   * constructor(database: PrimaryDatabaseService) {
   *   super(database, (p) => p.emailVerification);
   * }
   * ```
   */
  constructor(
    protected readonly database: PrimaryDatabaseService,
    getModel: (prisma: any) => any,
  ) {
    this.logger = new Logger(this.constructor.name);
    this.modelGetter = getModel;
    this.logger.debug(`Initialized ${this.constructor.name}`);
  }

  /**
   * Create a new record
   *
   * @param data - The data to create the record with
   * @returns Promise resolving to the created record
   *
   * @example
   * ```typescript
   * const user = await userRepository.create({
   *   email: 'user@example.com',
   *   name: 'John Doe'
   * });
   * ```
   */
  async create(data: TCreateDTO): Promise<TModel> {
    this.logger.log('Creating record');
    return await this.model.create({ data });
  }

  /**
   * Find a single record by ID
   *
   * @param id - The record ID
   * @returns Promise resolving to the record or null if not found
   *
   * @example
   * ```typescript
   * const user = await userRepository.findById('user-id-123');
   * ```
   */
  async findById(id: string): Promise<TModel | null> {
    this.logger.debug(`Finding record by ID: ${id}`);
    return await this.model.findUnique({ where: { id } });
  }

  /**
   * Find a single record with custom where clause
   *
   * @param where - The where clause or findUnique args
   * @returns Promise resolving to the record or null if not found
   *
   * @example
   * ```typescript
   * // Simple where clause
   * const user = await userRepository.findOne({ email: 'user@example.com' });
   *
   * // With include
   * const user = await userRepository.findOne({
   *   where: { email: 'user@example.com' },
   *   include: { posts: true }
   * });
   * ```
   */
  async findOne(where: any): Promise<TModel | null> {
    this.logger.debug('Finding record with custom query');
    return await this.model.findUnique(
      typeof where === 'object' && 'where' in where ? where : { where },
    );
  }

  /**
   * Find multiple records
   *
   * @param args - Prisma findMany arguments (where, orderBy, take, skip, etc.)
   * @returns Promise resolving to an array of records
   *
   * @example
   * ```typescript
   * // Find all users
   * const users = await userRepository.findMany();
   *
   * // Find with filtering and pagination
   * const users = await userRepository.findMany({
   *   where: { status: 'ACTIVE' },
   *   orderBy: { createdAt: 'desc' },
   *   take: 10,
   *   skip: 0
   * });
   * ```
   */
  async findMany(args?: any): Promise<TModel[]> {
    this.logger.debug('Finding multiple records');
    return await this.model.findMany(args);
  }

  /**
   * Update a record by ID
   *
   * @param id - The record ID
   * @param data - The data to update
   * @returns Promise resolving to the updated record
   *
   * @example
   * ```typescript
   * const user = await userRepository.update('user-id-123', {
   *   name: 'Jane Doe'
   * });
   * ```
   */
  async update(id: string, data: TUpdateDTO): Promise<TModel> {
    this.logger.log(`Updating record with ID: ${id}`);
    return await this.model.update({ where: { id }, data });
  }

  /**
   * Update multiple records
   *
   * @param where - The where clause to match records
   * @param data - The data to update
   * @returns Promise resolving to the count of updated records
   *
   * @example
   * ```typescript
   * const result = await userRepository.updateMany(
   *   { status: 'PENDING' },
   *   { status: 'ACTIVE' }
   * );
   * console.log(`Updated ${result.count} users`);
   * ```
   */
  async updateMany(where: any, data: TUpdateDTO): Promise<{ count: number }> {
    this.logger.log('Updating multiple records');
    return await this.model.updateMany({ where, data });
  }

  /**
   * Delete a record by ID
   *
   * @param id - The record ID
   * @returns Promise resolving to the deleted record
   *
   * @example
   * ```typescript
   * const user = await userRepository.delete('user-id-123');
   * ```
   */
  async delete(id: string): Promise<TModel> {
    this.logger.log(`Deleting record with ID: ${id}`);
    return await this.model.delete({ where: { id } });
  }

  /**
   * Delete multiple records
   *
   * @param where - The where clause to match records
   * @returns Promise resolving to the count of deleted records
   *
   * @example
   * ```typescript
   * const result = await userRepository.deleteMany({
   *   status: 'INACTIVE',
   *   createdAt: { lt: new Date('2020-01-01') }
   * });
   * console.log(`Deleted ${result.count} users`);
   * ```
   */
  async deleteMany(where: any): Promise<{ count: number }> {
    this.logger.log('Deleting multiple records');
    return await this.model.deleteMany({ where });
  }

  /**
   * Count records
   *
   * @param where - Optional where clause to filter records
   * @returns Promise resolving to the count of records
   *
   * @example
   * ```typescript
   * // Count all users
   * const total = await userRepository.count();
   *
   * // Count active users
   * const activeCount = await userRepository.count({ status: 'ACTIVE' });
   * ```
   */
  async count(where?: any): Promise<number> {
    this.logger.debug('Counting records');
    return await this.model.count({ where });
  }

  /**
   * Check if a record exists
   *
   * @param where - The where clause to match records
   * @returns Promise resolving to true if at least one record exists, false otherwise
   *
   * @example
   * ```typescript
   * const emailExists = await userRepository.exists({
   *   email: 'user@example.com'
   * });
   * ```
   */
  async exists(where: any): Promise<boolean> {
    const count = await this.model.count({ where });
    return count > 0;
  }
}
