import { Logger } from '@nestjs/common';
import { TenantDatabaseService } from '../services/tenant-database.service';

/**
 * Abstract base repository for tenant-scoped database operations.
 * All operations are automatically scoped to the current tenant.
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
 * export class ProductRepository extends TenantBaseRepository<
 *   Product,
 *   CreateProductDto,
 *   UpdateProductDto
 * > {
 *   constructor(database: TenantDatabaseService) {
 *     super(database, (prisma) => prisma.product);  // ✅ Type-safe with autocomplete!
 *   }
 *
 *   // Add custom methods as needed
 *   async findBySku(sku: string): Promise<Product | null> {
 *     return this.model.findUnique({ where: { sku } });
 *   }
 * }
 *
 * // Short syntax is also supported
 * @Injectable()
 * export class OrderRepository extends TenantBaseRepository<Order> {
 *   constructor(database: TenantDatabaseService) {
 *     super(database, (p) => p.order);  // ✅ Concise!
 *   }
 * }
 *
 * // Works with complex model names
 * @Injectable()
 * export class InventoryItemRepository extends TenantBaseRepository<InventoryItem> {
 *   constructor(database: TenantDatabaseService) {
 *     super(database, (p) => p.inventoryItem);  // ✅ Matches Prisma naming
 *   }
 * }
 * ```
 */
export abstract class TenantBaseRepository<
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
   * Returns the specific model (e.g., prisma.product, prisma.order) for this repository.
   */
  protected get model(): any {
    return this.modelGetter(this.prisma);
  }

  /**
   * Create a new repository instance
   *
   * @param database - The tenant database service
   * @param getModel - Function that returns the Prisma model delegate from the client
   *
   * @example
   * ```typescript
   * // Standard usage with full parameter name
   * constructor(database: TenantDatabaseService) {
   *   super(database, (prisma) => prisma.product);
   * }
   *
   * // Short syntax
   * constructor(database: TenantDatabaseService) {
   *   super(database, (p) => p.product);
   * }
   *
   * // Complex model names
   * constructor(database: TenantDatabaseService) {
   *   super(database, (p) => p.inventoryItem);
   * }
   * ```
   */
  constructor(
    protected readonly database: TenantDatabaseService,
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
   * const product = await productRepository.create({
   *   name: 'Widget',
   *   sku: 'WDG-001',
   *   price: 9.99
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
   * const product = await productRepository.findById('product-id-123');
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
   * const product = await productRepository.findOne({ sku: 'WDG-001' });
   *
   * // With include
   * const product = await productRepository.findOne({
   *   where: { sku: 'WDG-001' },
   *   include: { category: true }
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
   * // Find all products
   * const products = await productRepository.findMany();
   *
   * // Find with filtering and pagination
   * const products = await productRepository.findMany({
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
   * const product = await productRepository.update('product-id-123', {
   *   price: 12.99
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
   * const result = await productRepository.updateMany(
   *   { status: 'PENDING' },
   *   { status: 'ACTIVE' }
   * );
   * console.log(`Updated ${result.count} products`);
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
   * const product = await productRepository.delete('product-id-123');
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
   * const result = await productRepository.deleteMany({
   *   status: 'INACTIVE',
   *   createdAt: { lt: new Date('2020-01-01') }
   * });
   * console.log(`Deleted ${result.count} products`);
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
   * // Count all products
   * const total = await productRepository.count();
   *
   * // Count active products
   * const activeCount = await productRepository.count({ status: 'ACTIVE' });
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
   * const skuExists = await productRepository.exists({
   *   sku: 'WDG-001'
   * });
   * ```
   */
  async exists(where: any): Promise<boolean> {
    const count = await this.model.count({ where });
    return count > 0;
  }
}
