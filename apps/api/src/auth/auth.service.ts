import { Injectable, UnauthorizedException, BadRequestException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

import { PrismaService } from '../database/prisma.service';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface JwtPayload {
  sub: string; // user ID
  email: string;
  organizationIds: string[];
  iat?: number;
  exp?: number;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    systemRole: string;
    organizations: Array<{
      id: string;
      name: string;
      slug: string;
      role: string;
    }>;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private emailService: EmailService,
    private systemSettingsService: SystemSettingsService,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponse> {
    // Check if registration is enabled
    const registrationEnabled = await this.systemSettingsService.isRegistrationEnabled();
    if (!registrationEnabled) {
      throw new UnauthorizedException('User registration is currently disabled. Please contact an administrator.');
    }

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email: registerDto.email },
    });

    if (existingUser) {
      throw new UnauthorizedException('User with this email already exists');
    }

    // Hash password with increased security
    const saltRounds = 14; // Increased from 10 to 14 for 2025 security standards
    const passwordHash = await bcrypt.hash(registerDto.password, saltRounds);

    // Create user and organization in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email: registerDto.email,
          passwordHash,
          firstName: registerDto.firstName,
          lastName: registerDto.lastName,
          timezone: registerDto.timezone || 'UTC',
        },
      });

      let organization = null;
      
      // Create organization if provided
      if (registerDto.organizationName) {
        const slug = this.generateSlug(registerDto.organizationName);
        
        organization = await tx.organization.create({
          data: {
            name: registerDto.organizationName,
            slug,
            ownerId: user.id,
          },
        });

        // Add user as organization owner
        await tx.organizationMember.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: 'OWNER',
          },
        });
      }

      return { user, organization };
    });

    // Generate tokens
    const tokens = await this.generateTokens(result.user);

    // Return auth response
    return {
      ...tokens,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
        systemRole: result.user.systemRole,
        organizations: result.organization ? [{
          id: result.organization.id,
          name: result.organization.name,
          slug: result.organization.slug,
          role: 'OWNER',
        }] : [],
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponse> {
    // Find user with organizations
    const user = await this.prisma.user.findUnique({
      where: { email: loginDto.email },
      include: {
        organizations: {
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    // Return auth response
    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        systemRole: user.systemRole,
        organizations: user.organizations.map((org) => ({
          id: org.organization.id,
          name: org.organization.name,
          slug: org.organization.slug,
          role: org.role,
        })),
      },
    };
  }

  async validateUser(payload: JwtPayload) {
    console.log('DEBUG - validateUser called with payload:', payload);
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

    console.log('DEBUG - found user:', user ? { id: user.id, email: user.email, isActive: user.isActive } : 'null');

    if (!user || !user.isActive) {
      console.log('DEBUG - validateUser returning null (user not found or inactive)');
      return null;
    }

    const result = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      organizations: user.organizations.map((org) => ({
        id: org.organization.id,
        name: org.organization.name,
        slug: org.organization.slug,
        role: org.role,
      })),
    };
    
    console.log('DEBUG - validateUser returning:', result);
    return result;
  }

  async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      // Enhanced validation - verify refresh token with proper secret
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get('auth.refreshTokenSecret'),
      });

      // Validate payload structure
      if (!payload.sub || !payload.email) {
        this.logger.warn(`Invalid token payload structure`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Get user with organizations
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

      // Enhanced user validation with logging
      if (!user || !user.isActive) {
        this.logger.warn(`Refresh token attempt for inactive/missing user: ${payload.sub}`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      // Log successful token refresh
      this.logger.log(`Token refreshed for user: ${user.id}`);

      // Generate new tokens (implements token rotation for security)
      const tokens = await this.generateTokens(user);

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          systemRole: user.systemRole,
          organizations: user.organizations.map((org) => ({
            id: org.organization.id,
            name: org.organization.name,
            slug: org.organization.slug,
            role: org.role,
          })),
        },
      };
    } catch (error) {
      this.logger.error(`Refresh token error: ${error.message}`);
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private async generateTokens(user: any) {
    const organizationIds = user.organizations?.map((org: any) => 
      org.organizationId || org.organization?.id
    ) || [];

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationIds,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('auth.jwtSecret'),
        expiresIn: this.configService.get('auth.jwtExpiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('auth.refreshTokenSecret'),
        expiresIn: this.configService.get('auth.refreshTokenExpiresIn'),
      }),
    ]);

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        timezone: true,
        language: true,
        phoneNumber: true,
        profileImageUrl: true,
        systemRole: true,
        isEmailVerified: true,
        createdAt: true,
        organizations: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      timezone: user.timezone,
      language: user.language,
      phoneNumber: user.phoneNumber,
      profileImageUrl: user.profileImageUrl,
      systemRole: user.systemRole,
      isEmailVerified: user.isEmailVerified,
      createdAt: user.createdAt,
      organizations: user.organizations.map(om => ({
        id: om.organization.id,
        name: om.organization.name,
        slug: om.organization.slug,
        logoUrl: om.organization.logoUrl,
        role: om.role,
      })),
    };
  }

  async updateProfile(userId: string, updateData: {
    firstName?: string;
    lastName?: string;
    timezone?: string;
    language?: string;
    phoneNumber?: string;
  }) {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(updateData.firstName !== undefined && { firstName: updateData.firstName }),
        ...(updateData.lastName !== undefined && { lastName: updateData.lastName }),
        ...(updateData.timezone !== undefined && { timezone: updateData.timezone }),
        ...(updateData.language !== undefined && { language: updateData.language }),
        ...(updateData.phoneNumber !== undefined && { phoneNumber: updateData.phoneNumber }),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        timezone: true,
        language: true,
        phoneNumber: true,
        profileImageUrl: true,
        isEmailVerified: true,
        createdAt: true,
        organizations: {
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                logoUrl: true,
              },
            },
          },
        },
      },
    });

    if (!updatedUser) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: updatedUser.id,
      email: updatedUser.email,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      timezone: updatedUser.timezone,
      language: updatedUser.language,
      phoneNumber: updatedUser.phoneNumber,
      profileImageUrl: updatedUser.profileImageUrl,
      isEmailVerified: updatedUser.isEmailVerified,
      createdAt: updatedUser.createdAt,
      organizations: updatedUser.organizations.map(om => ({
        id: om.organization.id,
        name: om.organization.name,
        slug: om.organization.slug,
        logoUrl: om.organization.logoUrl,
        role: om.role,
      })),
    };
  }

  async forgotPassword(email: string): Promise<void> {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return;
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Save reset token to database
    await this.prisma.passwordReset.create({
      data: {
        token: resetToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Send password reset email
    await this.emailService.sendPasswordResetEmail(
      email,
      resetToken,
      user.firstName || user.email
    );
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    // Find valid password reset token
    const passwordReset = await this.prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!passwordReset) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    if (passwordReset.usedAt) {
      throw new BadRequestException('Reset token has already been used');
    }

    if (passwordReset.expiresAt < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash new password with increased security
    const saltRounds = 14; // Increased from 12 to 14 for 2025 security standards
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update user password and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: passwordReset.userId },
        data: { passwordHash: hashedPassword },
      }),
      this.prisma.passwordReset.update({
        where: { id: passwordReset.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // Send confirmation email
    await this.emailService.sendPasswordResetConfirmation(
      passwordReset.user.email,
      passwordReset.user.firstName || passwordReset.user.email
    );
  }

  async azureAuth(azureUser: any): Promise<AuthResponse> {
    if (!azureUser.email) {
      throw new BadRequestException('Email not provided by Azure AD');
    }

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email: azureUser.email },
      include: {
        organizations: {
          include: {
            organization: true
          }
        }
      }
    });

    if (user) {
      // Update user with Azure ID if not already set
      if (!user.azureId && azureUser.azureId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { azureId: azureUser.azureId }
        });
      }
    } else {
      // Create new user from Azure AD
      const organizationName = this.extractOrganizationFromEmail(azureUser.email);
      const organizationSlug = this.generateSlug(organizationName);

      // Create user first (without type assertion for create operation)
      const newUser = await this.prisma.user.create({
        data: {
          email: azureUser.email,
          firstName: azureUser.firstName || null,
          lastName: azureUser.lastName || null,
          azureId: azureUser.azureId,
          isActive: true,
        }
      });

      // Create organization with the user as owner
      const organization = await this.prisma.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
          ownerId: newUser.id,
          members: {
            create: {
              userId: newUser.id,
              role: 'OWNER',
            },
          },
        },
      });

      // Fetch user again with organizations
      user = await this.prisma.user.findUnique({
        where: { id: newUser.id },
        include: {
          organizations: {
            include: {
              organization: true
            }
          }
        }
      });
    }

    if (!user) {
      throw new BadRequestException('Failed to create or find user');
    }

    // Generate tokens
    const organizationIds = user.organizations.map(member => member.organizationId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationIds,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, { expiresIn: '30d' }),
    ]);

    // Store refresh token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(refreshToken, 10),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        systemRole: user.systemRole,
        organizations: user.organizations.map(member => ({
          id: member.organization.id,
          name: member.organization.name,
          slug: member.organization.slug,
          role: member.role,
        })),
      },
    };
  }

  async googleAuth(googleUser: any): Promise<AuthResponse> {
    if (!googleUser.email) {
      throw new BadRequestException('Email not provided by Google');
    }

    // Check if user exists
    let user = await this.prisma.user.findUnique({
      where: { email: googleUser.email },
      include: {
        organizations: {
          include: {
            organization: true
          }
        }
      }
    });

    if (user) {
      // Update user with Google ID if not already set
      if (!user.googleId && googleUser.googleId) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { googleId: googleUser.googleId }
        });
      }
    } else {
      // Create new user from Google
      const organizationName = this.extractOrganizationFromEmail(googleUser.email);
      const organizationSlug = this.generateSlug(organizationName);

      // Create user first
      const newUser = await this.prisma.user.create({
        data: {
          email: googleUser.email,
          firstName: googleUser.firstName || null,
          lastName: googleUser.lastName || null,
          googleId: googleUser.googleId,
          isActive: true,
          isEmailVerified: true, // Google emails are pre-verified
        }
      });

      // Create organization with the user as owner
      const organization = await this.prisma.organization.create({
        data: {
          name: organizationName,
          slug: organizationSlug,
          ownerId: newUser.id,
          members: {
            create: {
              userId: newUser.id,
              role: 'OWNER',
            },
          },
        },
      });

      // Fetch user again with organizations
      user = await this.prisma.user.findUnique({
        where: { id: newUser.id },
        include: {
          organizations: {
            include: {
              organization: true
            }
          }
        }
      });
    }

    if (!user) {
      throw new BadRequestException('Failed to create or find user');
    }

    // Generate tokens
    const organizationIds = user.organizations.map(member => member.organizationId);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      organizationIds,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(payload, { expiresIn: '30d' }),
    ]);

    // Store refresh token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        refreshToken: await bcrypt.hash(refreshToken, 10),
        lastLoginAt: new Date(),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        systemRole: user.systemRole,
        organizations: user.organizations.map(member => ({
          id: member.organization.id,
          name: member.organization.name,
          slug: member.organization.slug,
          role: member.role,
        })),
      },
    };
  }

  private extractOrganizationFromEmail(email: string): string {
    const domain = email.split('@')[1];
    const name = domain.split('.')[0];
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' ');
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 50);
  }
}
