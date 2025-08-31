import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ApplicationHealthIndicator } from './application-health.indicator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly applicationHealth: ApplicationHealthIndicator,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Basic health check endpoint' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  check() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'SchedulePro API',
      version: '1.0.0',
    };
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Detailed application health check' })
  @ApiResponse({ status: 200, description: 'Detailed health status' })
  async checkDetailed() {
    return await this.applicationHealth.checkHealth();
  }

  @Get('info')
  @ApiOperation({ summary: 'Application information and status' })
  @ApiResponse({ status: 200, description: 'Application information' })
  async getInfo() {
    return await this.applicationHealth.getApplicationInfo();
  }

  @Get('schema')
  @ApiOperation({ summary: 'Database schema health check' })
  @ApiResponse({ status: 200, description: 'Database schema status' })
  async checkSchema() {
    return await this.applicationHealth.checkDatabaseSchema();
  }

  @Get('db')
  @ApiOperation({ summary: 'Simple database connectivity check' })
  @ApiResponse({ status: 200, description: 'Database is accessible' })
  async checkDatabase() {
    try {
      const healthResult = await this.applicationHealth.checkHealth();
      return {
        status: healthResult.status === 'ok' ? 'connected' : 'error',
        details: healthResult.details.database || 'unknown',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
