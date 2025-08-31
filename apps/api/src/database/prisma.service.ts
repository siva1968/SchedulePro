import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService 
  extends PrismaClient 
  implements OnModuleInit, OnModuleDestroy 
{
  private readonly logger = new Logger(PrismaService.name);

  constructor(private configService: ConfigService) {
    const logLevel = configService.get('NODE_ENV') === 'production' 
      ? ['error', 'warn'] // Only log errors and warnings in production
      : ['query', 'error', 'info', 'warn']; // Full logging in development

    super({
      datasources: {
        db: {
          url: configService.get<string>('DATABASE_URL'),
        },
      },
      log: logLevel.map(level => ({
        emit: 'event',
        level: level as any,
      })),
      // Connection pool configuration for production
      ...(configService.get('NODE_ENV') === 'production' && {
        datasources: {
          db: {
            url: configService.get<string>('DATABASE_URL'),
          },
        },
        // Add connection pool limits for production
        __internal: {
          engine: {
            connectionTimeout: 20000,
            queryTimeout: 60000,
          },
        },
      }),
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
    } catch (error) {
      this.logger.warn('⚠️ Database connection failed, running without database:', error.message);
      // Don't throw error to allow the application to start without database
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Database disconnected');
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database health check failed:', error);
      return false;
    }
  }

  // Soft delete helper
  async softDelete(model: string, id: string): Promise<any> {
    return this[model].update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // Find many without soft deleted records
  async findManyActive(model: string, args: any = {}): Promise<any[]> {
    return this[model].findMany({
      ...args,
      where: {
        ...args.where,
        deletedAt: null,
      },
    });
  }

  // Find unique without soft deleted records
  async findUniqueActive(model: string, args: any): Promise<any> {
    return this[model].findUnique({
      ...args,
      where: {
        ...args.where,
        deletedAt: null,
      },
    });
  }
}
