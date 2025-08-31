import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy, AzureADStrategy, GoogleOAuthStrategy } from './strategies';
import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    EmailModule,
    SystemSettingsModule,
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get('auth.jwtSecret'),
        signOptions: {
          expiresIn: configService.get('auth.jwtExpiresIn'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, AzureADStrategy, GoogleOAuthStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
