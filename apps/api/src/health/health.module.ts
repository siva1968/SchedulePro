import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ApplicationHealthIndicator } from './application-health.indicator';
import { DatabaseModule } from '../database/database.module';
import { EnvironmentConfigModule } from '../config/environment-config.module';

@Module({
  imports: [DatabaseModule, EnvironmentConfigModule],
  controllers: [HealthController],
  providers: [ApplicationHealthIndicator],
  exports: [ApplicationHealthIndicator],
})
export class HealthModule {}
