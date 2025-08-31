import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email.service';
import { EmailSettingsController } from './email-settings.controller';
import { NodemailerProvider } from './providers/nodemailer.provider';
import { SendGridProvider } from './providers/sendgrid.provider';
import { ZeptoProvider } from './providers/zepto.provider';
import { EncryptionService } from '../calendar/encryption.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [ConfigModule, DatabaseModule],
  controllers: [EmailSettingsController],
  providers: [
    EmailService,
    EncryptionService,
    NodemailerProvider,
    SendGridProvider,
    ZeptoProvider,
  ],
  exports: [EmailService],
})
export class EmailModule {}
