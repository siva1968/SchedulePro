import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly scryptAsync = promisify(scrypt);

  constructor(private configService: ConfigService) {}

  /**
   * Get encryption key from environment or generate one
   */
  private async getEncryptionKey(): Promise<Buffer> {
    const keyString = this.configService.get<string>('CALENDAR_ENCRYPTION_KEY');
    
    if (!keyString) {
      throw new Error('CALENDAR_ENCRYPTION_KEY environment variable is required for calendar token encryption');
    }

    // Use scrypt to derive a key from the secret
    const salt = 'schedulepro-calendar-salt'; // Use a fixed salt for consistency
    const key = (await this.scryptAsync(keyString, salt, 32)) as Buffer;
    
    return key;
  }

  /**
   * Encrypt sensitive data (tokens, passwords)
   */
  async encrypt(text: string): Promise<string> {
    try {
      if (!text) return '';

      const key = await this.getEncryptionKey();
      const iv = randomBytes(16);
      const cipher = createCipheriv(this.algorithm, key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag for GCM mode
      const authTag = cipher.getAuthTag();
      
      // Combine IV, auth tag, and encrypted data
      const combined = iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
      
      return combined;
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  async decrypt(encryptedText: string): Promise<string> {
    try {
      if (!encryptedText) return '';

      const key = await this.getEncryptionKey();
      const parts = encryptedText.split(':');
      
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format - expected IV:authTag:data');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];
      
      const decipher = createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Generate a new encryption key (for setup purposes)
   * Run this once and store the result in CALENDAR_ENCRYPTION_KEY
   */
  static generateEncryptionKey(): string {
    const key = randomBytes(32); // 256 bits
    return key.toString('hex');
  }
}
