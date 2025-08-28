import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { GoogleOAuthService } from './google-oauth.service';
import { MicrosoftOAuthService } from './microsoft-oauth.service';
import { OAuthController } from './oauth.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [OAuthController],
  providers: [
    GoogleOAuthService,
    MicrosoftOAuthService,
    PrismaService,
  ],
  exports: [GoogleOAuthService, MicrosoftOAuthService],
})
export class OAuthModule {}
