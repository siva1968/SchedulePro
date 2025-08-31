import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';

export interface JwtPayload {
  sub: string;
  email: string;
  organizationIds: string[];
  tokenId?: string; // Unique token identifier for revocation
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenId: string;
}

// In-memory token blacklist for immediate revocation
// In production, use Redis for distributed systems
const tokenBlacklist = new Set<string>();

@Injectable()
export class SecureJwtService {
  private readonly logger = new Logger(SecureJwtService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate secure token pair with shorter access token lifetime
   */
  async generateTokenPair(
    user: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TokenPair> {
    const organizationIds = user.organizations?.map((org: any) => 
      org.organizationId || org.organization?.id
    ) || [];

    // Generate unique token ID for this session
    const tokenId = crypto.randomUUID();

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationIds,
      tokenId,
    };

    // Generate tokens with different secrets and expiration times
    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('auth.jwtSecret'),
        expiresIn: this.configService.get('auth.jwtExpiresIn'), // Should be 15m
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('auth.refreshTokenSecret'),
        expiresIn: this.configService.get('auth.refreshTokenExpiresIn'), // Should be 7d
      }),
    ]);

    // Store hashed refresh token in user record for validation
    const hashedRefreshToken = await bcrypt.hash(refreshToken, 12);
    
    try {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          refreshToken: hashedRefreshToken,
          lastLoginAt: new Date(),
        },
      });
    } catch (error) {
      // Gracefully handle database errors
      this.logger.warn(`Failed to store refresh token for user ${user.id}: ${error.message}`);
    }

    this.logger.log(`New token pair generated for user ${user.id} from ${ipAddress}`);

    return {
      accessToken,
      refreshToken,
      tokenId,
    };
  }

  /**
   * Refresh tokens with rotation (invalidate old, create new)
   */
  async refreshTokenPair(
    refreshToken: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<TokenPair> {
    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('auth.refreshTokenSecret'),
      }) as JwtPayload;

      // Check if token is blacklisted
      if (tokenBlacklist.has(payload.tokenId || refreshToken)) {
        throw new UnauthorizedException('Token has been revoked');
      }

      // Get user and validate stored refresh token
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          organizations: {
            include: {
              organization: true,
            },
          },
        },
      });

      if (!user || !user.isActive || !user.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Verify refresh token matches stored hash
      const isValidRefreshToken = await bcrypt.compare(refreshToken, user.refreshToken);
      if (!isValidRefreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Blacklist the old token
      tokenBlacklist.add(payload.tokenId || refreshToken);

      // Generate new token pair
      const newTokenPair = await this.generateTokenPair(user, ipAddress, userAgent);

      this.logger.log(`Token refreshed for user ${payload.sub} from ${ipAddress}`);

      return newTokenPair;
    } catch (error) {
      this.logger.warn(`Failed to refresh token: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Validate access token and return user payload
   */
  async validateAccessToken(accessToken: string): Promise<JwtPayload> {
    try {
      const payload = this.jwtService.verify(accessToken, {
        secret: this.configService.get('auth.jwtSecret'),
      }) as JwtPayload;

      // Check if token is blacklisted
      if (tokenBlacklist.has(payload.tokenId || accessToken)) {
        throw new UnauthorizedException('Token has been revoked');
      }

      return payload;
    } catch (error) {
      this.logger.warn(`Invalid access token: ${error.message}`);
      throw new UnauthorizedException('Invalid access token');
    }
  }

  /**
   * Revoke all tokens for a user (logout from all devices)
   */
  async revokeAllUserTokens(userId: string, reason = 'Logout from all devices'): Promise<void> {
    // Clear stored refresh token
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
      },
    });

    this.logger.log(`All tokens revoked for user ${userId}: ${reason}`);
  }

  /**
   * Revoke specific token by adding to blacklist
   */
  async revokeToken(tokenId: string, reason = 'Manual revocation'): Promise<void> {
    tokenBlacklist.add(tokenId);
    this.logger.log(`Token ${tokenId} revoked: ${reason}`);
  }

  /**
   * Clean up expired tokens from blacklist
   * Should be called periodically
   */
  async cleanupBlacklist(): Promise<void> {
    // Since we can't determine expiration from tokenId alone,
    // we'll clear the blacklist periodically (every hour)
    // In production, use Redis with TTL
    tokenBlacklist.clear();
    this.logger.log('Token blacklist cleared');
  }

  /**
   * Check if user has valid session
   */
  async hasValidSession(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { refreshToken: true, isActive: true },
    });

    return !!(user && user.isActive && user.refreshToken);
  }

  /**
   * Force logout user (clear refresh token)
   */
  async forceLogout(userId: string): Promise<void> {
    await this.revokeAllUserTokens(userId, 'Force logout');
  }
}
